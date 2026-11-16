"""BlackRin — Conv3d 退化形状 → matmul 全局补丁（ROCm/MIOpen 提速，N 卡同样受益）

现象（本机 RX 9070 XT / ROCm 7.16 / torch 2.14 / ComfyUI 0.45.0 实测）
    Qwen3-VL 视觉塔的 patch_embed 用 Conv3d(kernel_stride=(2,16,16)) 切图块，
    输入被摊成 batch = patch 数（两张 8MP 参考图是 6 万级），每个样本只输出 1 个体素。
    cuDNN 会把这种退化卷积折叠成一个大 GEMM；MIOpen 不会，实测：
        Conv3d 28 695 ms  →  F.linear 0.401 ms      （约 7 万倍）
    整个视觉塔 29.5 s → 0.15 s（其中 27 层 transformer 本来就只要 0.13 s）。

修法
    stride == kernel_size、无 padding / dilation、groups == 1 的 Conv3d，与
        F.linear(x.reshape(N, -1), w.reshape(K, -1), bias)
    数学上完全等价；实测 bf16 / fp32 两种精度下 max|conv - matmul| = 0.0（位级一致）。
    命中退化形状走 matmul，其余卷积（VAE 那些 stride≠kernel 的）原样走老路。
    输出保持 [N, K, 1, 1, 1]，调用方一行都不用改。

覆盖范围（不是只给 H3）
    改的是 comfy.ops 里 Conv3d 的 _conv_forward，而 disable_weight_init / manual_cast /
    fp8_ops / 运行时生成的 mixed_precision 类全都继承同一份实现；再递归收一遍子类，
    外加 torch.nn.Conv3d 本体（同一道形状守卫，非退化形状不会被动）。
    因此 Qwen2-VL / Qwen2.5-VL / Qwen3-VL / Qwen3.5-VL、MiniMax H3 / H3-Image、
    HiDream o1、Krea2、Flux3 这类共用同一个 patch-embed 的编码器一并生效。

参考
    ComfyUI #15895（H3 在 ROCm 上崩在这个 conv）
    ComfyUI PR #14215（同思路的上游补丁，按 fp16/bf16 门控，而 H3 视觉塔是 fp32，故不会触发）
    pytorch #165141 / #169857（AMD 官方承认 MIOpen/CK 对 Radeon 的 implicit GEMM 支持不全）

开关
    环境变量 BLACKRIN_CONV3D_LINEAR=0 整体关闭；命中一次会打一条 debug 日志。
"""

import logging
import os

import torch
import torch.nn.functional as F

_ENABLED = os.environ.get("BLACKRIN_CONV3D_LINEAR", "1").strip().lower() not in ("0", "false", "off", "no")
_ORIG_ATTR = "_blackrin_conv3d_original"
_HIT_LOGGED = False


def _is_degenerate(module, x, autopad):
    """只有"每样本一个输出体素"的退化卷积才走 matmul，其余原样返回 False。"""
    if autopad is not None:
        return False
    if not isinstance(x, torch.Tensor) or x.dim() != 5:
        return False
    try:
        return (
            module.groups == 1
            and tuple(module.padding) == (0, 0, 0)
            and tuple(module.dilation) == (1, 1, 1)
            and tuple(module.stride) == tuple(module.kernel_size)
        )
    except Exception:
        return False


def _wrap(original):
    def _conv_forward(self, input, weight, bias, *args, **kwargs):
        global _HIT_LOGGED
        autopad = kwargs.get("autopad", args[0] if args else None)
        if _ENABLED and _is_degenerate(self, input, autopad):
            try:
                n = input.shape[0]
                out_ch = weight.shape[0]
                flat = input.reshape(n, -1)
                w = weight.reshape(out_ch, -1)
                if flat.dtype != w.dtype:
                    flat = flat.to(w.dtype)
                if bias is not None and bias.dtype != w.dtype:
                    bias = bias.to(w.dtype)
                out = F.linear(flat, w, bias)
                if not _HIT_LOGGED:
                    _HIT_LOGGED = True
                    logging.debug(
                        "[BlackRin Conv3d] 退化卷积走 matmul：batch=%d  in=%d  out=%d  dtype=%s",
                        n, flat.shape[1], out_ch, w.dtype,
                    )
                return out.reshape(n, out_ch, 1, 1, 1)
            except Exception as exc:  # 量化/特殊 layout 的权重：安静退回原实现，绝不改变结果
                logging.debug("[BlackRin Conv3d] matmul 路径不可用，回退原卷积：%s", exc)
        return original(self, input, weight, bias, *args, **kwargs)

    return _conv_forward


def _targets():
    classes = {torch.nn.Conv3d}
    try:
        import comfy.ops as ops

        for owner_name in ("disable_weight_init", "manual_cast", "fp8_ops", "float32_ops"):
            owner = getattr(ops, owner_name, None)
            cls = getattr(owner, "Conv3d", None) if owner is not None else None
            if isinstance(cls, type):
                classes.add(cls)
    except Exception as exc:
        logging.warning("[BlackRin Conv3d] 读取 comfy.ops 失败，只补 torch.nn.Conv3d：%s", exc)

    # 运行时会动态生成 mixed_precision / quant 之类的子类，递归全部收进来
    stack = list(classes)
    while stack:
        cls = stack.pop()
        for sub in cls.__subclasses__():
            if sub not in classes:
                classes.add(sub)
                stack.append(sub)
    return [c for c in classes if hasattr(c, "_conv_forward")]


def apply():
    """在所有能找到的 Conv3d 类上挂一层形状守卫。可重复调用（幂等）。"""
    if not _ENABLED:
        logging.info("[BlackRin Conv3d] 已被 BLACKRIN_CONV3D_LINEAR=0 关闭")
        return []
    patched = []
    for cls in _targets():
        if _ORIG_ATTR in cls.__dict__:
            patched.append(cls.__qualname__)
            continue
        original = cls.__dict__.get("_conv_forward")
        if original is None:  # 只继承、没自己实现：挂到本类上没有额外意义
            continue
        setattr(cls, _ORIG_ATTR, original)
        cls._conv_forward = _wrap(original)
        patched.append(cls.__qualname__)
    logging.info("[BlackRin Conv3d] 退化形状走 matmul 补丁已挂上：%s", ", ".join(patched) or "无")
    return patched
