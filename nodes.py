"""
BlackRin - 自动缩放 & 图片反推
==============================
"""
import base64
import hashlib
import math
import json
import urllib.request
import urllib.error
from io import BytesIO

import torch
import numpy as np
from PIL import Image
import httpx

import comfy.model_management as mm
import comfy.utils

from . import blackrin_config

# 本地 API 调用一律绕过系统代理（避免 127.0.0.1 请求被代理拦截）
_NO_PROXY_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))

# ROCm 全局补丁
if not hasattr(torch.backends.cuda, "matmul"):
    class _FM: allow_fp16_accumulation = False
    torch.backends.cuda.matmul = _FM()
elif not hasattr(torch.backends.cuda.matmul, "allow_fp16_accumulation"):
    torch.backends.cuda.matmul.allow_fp16_accumulation = False
if not hasattr(torch.cuda, "get_device_capability"):
    torch.cuda.get_device_capability = lambda d=None: (9, 0)
if not hasattr(torch.cuda, "reset_peak_memory_stats"):
    torch.cuda.reset_peak_memory_stats = lambda d=None: None

# ============================================================
# 节点: 智能分辨率计算
# ============================================================
class BlackRin_ImageResolutionCalc:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "目标百万像素": ("FLOAT", {"default": 1.0, "min": 0.1, "max": 10.0, "step": 0.1}),
                "对齐倍数": ([8, 16, 32], {"default": 32}),
                "采样方法": (["lanczos", "bilinear", "nearest", "area"], {"default": "lanczos"}),
            },
            "optional": {
                "图像": ("IMAGE",),
            },
        }
    RETURN_TYPES = ("IMAGE", "INT", "INT")
    RETURN_NAMES = ("图像", "输出宽度", "输出高度")
    FUNCTION = "go"
    CATEGORY = "BlackRin/Utils"

    def go(self, 目标百万像素, 对齐倍数, 采样方法, 图像=None):
        if 图像 is None:
            print("[BlackRin 自动缩放] 无输入图像，直通")
            return (None, 0, 0)
        _, height, width, _ = 图像.shape
        a = min(width, height)
        b = max(width, height)
        ratio = a / b
        target_px = max(0.05, float(目标百万像素)) * 1024 * 1024
        n = int(对齐倍数)
        long_side = max(n, math.floor(math.sqrt(target_px / ratio) / n) * n)
        short_side = max(n, math.floor(long_side * ratio / n) * n)
        if width < height:
            output_width, output_height = short_side, long_side
        else:
            output_width, output_height = long_side, short_side
        图像 = 图像.movedim(-1, 1)
        图像 = comfy.utils.common_upscale(图像, output_width, output_height, 采样方法, "center")
        图像 = 图像.movedim(1, -1)
        print(f"[BlackRin 自动缩放] {width}×{height} → {output_width}×{output_height}")
        return (图像, output_width, output_height)


# ============================================================
# 节点: 图片反推（融合 CS1 功能）
# ============================================================

# ── 配置读取：BlackRin 自有配置（user/default/BlackRin/config.json）──
# 与提示词小助手共存：两边合并，同名以 BlackRin 自己的为准（见 blackrin_config.py）

def _get_model_services():
    """服务列表（含 vlm_models / llm_models），供下拉与调用。"""
    return blackrin_config.merged_services()


def _get_system_prompts():
    """图片规则 → 节点下拉需要的 vision_prompts 结构。"""
    prompts = {}
    for index, rule in enumerate(blackrin_config.merged_rules("image"), 1):
        prompts[str(rule.get("id") or f"image_{index}")] = {
            "name": rule.get("name") or f"规则 {index}",
            "category": "",
            "role": "system",
            "content": rule.get("content") or "",
            "showIn": ["frontend", "node"],
        }
    return {
        "vision_prompts": prompts,
        "active_name": blackrin_config.active_image_name(),
    }


def _get_vlm_options(services):
    """生成 VLM 服务/模型下拉选项"""
    options = []
    for s in services:
        sn = s.get("name", "")
        st = s.get("type", "")
        if st == "baidu":
            continue
        for m in s.get("vlm_models", []):
            mn = m.get("name", "")
            if mn:
                options.append(f"{sn}/{mn}")
    return options if options else ["LM Studio"]


def _parse_svc(opt, services):
    """解析 '服务名/模型名' → (service_id, model_name)"""
    if "/" in opt:
        sn, mn = opt.split("/", 1)
    else:
        sn, mn = opt, None
    for s in services:
        if s.get("name") == sn:
            return s.get("id"), mn
    return None, None


def _find_model(service, model_name):
    """在 service 的 vlm_models 中查找目标模型"""
    models = service.get("vlm_models", [])
    if not models:
        return None
    if model_name:
        t = next((m for m in models if m.get("name") == model_name), None)
        if t:
            return t
    t = next((m for m in models if m.get("is_default")), None)
    return t or models[0]


class FlexibleOptionalInputType(dict):
    """动态可选输入（抄 XB_ToolBox / rgthree-comfy 模式）：
    前端可无限添加「图片N」接口，所有图片可选，mute/空输入自动忽略。"""

    def __init__(self, type_, data=None):
        self.type_ = type_
        self.data = data
        if self.data is not None:
            for k, v in self.data.items():
                self[k] = v

    def __getitem__(self, key):
        if self.data is not None and key in self.data:
            return self.data[key]
        return (self.type_,)

    def __contains__(self, key):
        return True


class BlackRin_ImageCaption:
    """
    图片反推节点
    图像 + 规则预设 + 外部文本 → VLM 服务 → 反推提示词
    支持 batch 逐帧处理、seed 控制、推理后自动卸载 LM Studio 模型。
    """

    @classmethod
    def INPUT_TYPES(cls):
        services = _get_model_services()
        svc_opts = _get_vlm_options(services)
        default_svc = svc_opts[0] if svc_opts else "LM Studio"

        sp = _get_system_prompts()
        vp = sp.get("vision_prompts", {}) or {}
        active_name = sp.get("active_name") or ""

        rule_opts, id2name = [], {}
        for k, v in vp.items():
            si = v.get("showIn", ["frontend", "node"])
            if "node" not in si:
                continue
            nm = v.get("name", k)
            cat = v.get("category", "")
            disp = f"{cat}/{nm}" if cat else nm
            id2name[k] = disp
            rule_opts.append(disp)

        default_rule = rule_opts[0] if rule_opts else "反推-自然语言"
        if active_name and active_name in rule_opts:
            default_rule = active_name
        if not rule_opts:
            rule_opts = ["反推-自然语言"]

        return {
            "required": {
                "input_text": ("STRING", {
                    "multiline": True, "default": "", "forceInput": True,
                    "tooltip": "仅接受外部连线输入，附加到规则预设后一起发给 VLM",
                }),
                "rule": (rule_opts, {
                    "default": default_rule,
                    "tooltip": "选择分析规则预设",
                }),
                "custom_rule": ("BOOLEAN", {
                    "default": False, "label_on": "启用", "label_off": "禁用",
                    "tooltip": "启用时 input_text 追加到规则预设后面一起发送",
                }),
                "vlm_service": (svc_opts, {
                    "default": default_svc,
                    "tooltip": "选择 VLM 服务/模型",
                }),
                "seed": ("INT", {
                    "default": 0, "min": 0, "max": 0xffffffffffffffff,
                    "control_after_generate": True,
                    "tooltip": "随机种子，支持随机/固定/递增/递减",
                }),
                "unload_after": ("BOOLEAN", {
                    "default": False, "label_on": "卸载", "label_off": "不卸载",
                    "tooltip": "推理完成后自动卸载 LM Studio 模型释放显存",
                }),
            },
            "optional": FlexibleOptionalInputType("IMAGE", {
                "图片1": ("IMAGE", {"optional": True, "tooltip": "第 1 张图片（可选，可继续添加图片2/3/…）"}),
            }),
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("反推文本", "反推列表")
    OUTPUT_NODE = False
    FUNCTION = "execute"
    CATEGORY = "BlackRin/Utils"

    @classmethod
    def IS_CHANGED(cls, input_text="", rule=None, custom_rule=False,
                   vlm_service="", seed=0, unload_after=False, **kwargs):
        ih = hashlib.md5((input_text or "").encode("utf-8")).hexdigest()
        imgs = tuple(kwargs.values())
        return hash((
            cls._imgs_hash(imgs), rule, bool(custom_rule), ih, vlm_service, seed, bool(unload_after)
        ))

    @staticmethod
    def _imgs_hash(imgs):
        h = hashlib.md5()
        for img in imgs:
            if img is None:
                h.update(b"0")
            else:
                try:
                    d = img[0].cpu().numpy().tobytes() if len(img.shape) == 4 else img.cpu().numpy().tobytes()
                    h.update(d)
                except:
                    h.update(b"0")
        return h.hexdigest()

    @staticmethod
    def _to_b64(t, q=95):
        if len(t.shape) == 4:
            t = t[0]
        b = BytesIO()
        Image.fromarray((t.cpu().numpy() * 255).astype(np.uint8)).save(b, format="JPEG", quality=q)
        return f"data:image/jpeg;base64,{base64.b64encode(b.getvalue()).decode('utf-8')}"

    def execute(self, input_text="", rule=None, custom_rule=False,
                vlm_service="", seed=0, unload_after=False, **kwargs):
        try:
            # ── 收集所有动态图片（跳过 None/mute，可无限添加）──────────────
            images = [v for v in kwargs.values() if v is not None and isinstance(v, torch.Tensor)]
            # 无图时仍可运行（纯文本推理），不再强制要求图片输入

            # ── 1. 构建提示词 ────────────────────────────────────────────
            sp = _get_system_prompts()
            vp = sp.get("vision_prompts", {}) if sp else {}
            sys_msg = None
            for k, v in vp.items():
                nm = v.get("name", k)
                cat = v.get("category", "")
                disp = f"{cat}/{nm}" if cat else nm
                if disp == rule or v.get("name") == rule or k == rule:
                    sys_msg = {"role": v.get("role", "system"), "content": v.get("content", "")}
                    break

            base_text = (sys_msg.get("content", "") if sys_msg else "") or "请详细描述这张图片的内容"
            prompt = f"{base_text}\n\n{input_text}".strip() if (custom_rule and input_text) else base_text

            # ── 2. 解析服务 ──────────────────────────────────────────────
            services = _get_model_services()
            sid, mn = _parse_svc(vlm_service, services)
            if not sid:
                raise ValueError(f"无效的服务: {vlm_service}")
            svc = next((s for s in services if s.get("id") == sid), None)
            if not svc:
                raise ValueError(f"未找到服务: {vlm_service}")
            tm = _find_model(svc, mn)
            if not tm:
                raise ValueError(f"服务 {vlm_service} 无可用视觉模型")

            bu = svc.get("base_url", "").rstrip("/")
            ak = svc.get("api_key", "")
            au = bu + "/chat/completions" if not bu.endswith("/chat/completions") else bu

            # ── 3. 一次调用 API，所有图片一起发 ─────────────────────────
            def _call_all(image_b64_list):
                n = len(image_b64_list)
                content = [{"type": "text", "text": prompt}]
                for i, b64 in enumerate(image_b64_list):
                    content.append({"type": "image_url", "image_url": {"url": b64}})
                print(f"[图片反推] {n}张图→{tm.get('name','')}")
                payload = {
                    "model": tm.get("name", ""),
                    "messages": [{"role": "user", "content": content}],
                    "temperature": tm.get("temperature", 0.7),
                    "max_tokens": tm.get("max_tokens", 1000),
                    "top_p": tm.get("top_p", 0.9),
                }
                hdrs = {"Authorization": f"Bearer {ak}"} if ak else {}
                with httpx.Client(timeout=300.0, trust_env=False) as c:
                    r = c.post(au, json=payload, headers=hdrs)
                    r.raise_for_status()
                    j = r.json()
                ct = j.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
                if not ct:
                    raise RuntimeError("API 返回空结果")
                print(f"[图片反推] {ct[:80]}...")
                return ct

            # 只取第一张图的 batch 帧（多图时不支持每张图都 batch，太复杂）
            # 思路：image_1 的 batch 帧 → 多次调用，每帧 + 其他所有固定图
            # 但用户需求是"多张图一起丢给 llm 运行一次"，所以直接全部一次性发
            all_b64 = []
            for img in images:
                if len(img.shape) == 4 and img.shape[0] > 1:
                    # batch 多帧 → 把每一帧都当作独立图片加入列表
                    for fi in range(img.shape[0]):
                        all_b64.append(BlackRin_ImageCaption._to_b64(img[fi:fi+1]))
                else:
                    all_b64.append(BlackRin_ImageCaption._to_b64(img))

            description = _call_all(all_b64)
            out = (description, [description])

            # ── 4. 可选卸载 ──────────────────────────────────────────────
            if unload_after and bu:
                ul = bu + "/api/v1/models/unload"
                for s in _get_model_services():
                    if s.get("id") == "service_896":
                        models = set()
                        for m in s.get("vlm_models", []) + s.get("llm_models", []):
                            if m.get("name"):
                                models.add(m["name"])
                        ok = 0
                        for mid in sorted(models):
                            try:
                                req = urllib.request.Request(
                                    ul,
                                    data=json.dumps({"instance_id": mid}).encode("utf-8"),
                                    headers={"Content-Type": "application/json"},
                                    method="POST",
                                )
                                with _NO_PROXY_OPENER.open(req, timeout=10):
                                    print(f"[BlackRin 图片反推] ✅ 卸载: {mid}")
                                    ok += 1
                            except:
                                print(f"[BlackRin 图片反推] ⚠️ 卸载失败: {mid}")
                        print(f"[BlackRin 图片反推] 📊 卸载 {ok}/{len(models)}")
                        break
            return out

        except mm.InterruptProcessingException:
            raise
        except Exception as e:
            raise RuntimeError(f"图片反推错误: {e}")


# ============================================================
# 注册
# ============================================================
class BlackRin_GroupMaster:
    """分组总控开关：纯前端控制器，通过面板按组切换 启用/屏蔽/静音。"""

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}}

    RETURN_TYPES = ()
    FUNCTION = "noop"
    CATEGORY = "BlackRin/Utils"


class BlackRin_GroupAnchor:
    """分组锚点：放进任意分组，向总控注册该分组。"""

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}}

    RETURN_TYPES = ()
    FUNCTION = "noop"
    CATEGORY = "BlackRin/Utils"


NODE_CLASS_MAPPINGS = {
    "BlackRin_ImageResolutionCalc": BlackRin_ImageResolutionCalc,
    "BlackRin_ImageCaption": BlackRin_ImageCaption,
    "BlackRin_GroupMaster": BlackRin_GroupMaster,
    "BlackRin_GroupAnchor": BlackRin_GroupAnchor,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "BlackRin_ImageResolutionCalc": "✨ BlackRin 自动缩放",
    "BlackRin_ImageCaption": "✨ 图文优化推理",
    "BlackRin_GroupMaster": "✨ BlackRin 分组总控",
    "BlackRin_GroupAnchor": "✨ BlackRin 分组锚点",
}