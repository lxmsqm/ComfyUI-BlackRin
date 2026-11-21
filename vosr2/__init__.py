"""VOSR 2.0 (one-step 1.4B super-resolution) —— vendored into ComfyUI-BlackRin.

上游：https://github.com/ylchen333/ComfyUI-VOSR2 （Apache-2.0，commit 6a21810）
改动与版权信息见同目录 UPSTREAM.md / NOTICE。

注意：本子包**不导出 comfy_entrypoint**。BlackRin 主包走传统 NODE_CLASS_MAPPINGS
分支，一旦根包暴露 comfy_entrypoint，ComfyUI 就会切到 V3 分支、忽略本包其余节点。
两个节点在 BlackRin/__init__.py 里用 GET_SCHEMA() 手动并表注册。
"""
import logging

_MIN_TORCH = (2, 1)


def _check_dependencies() -> None:
    try:
        import torch
    except ImportError as exc:
        msg = "VOSR2 (BlackRin) requires PyTorch, which ships with ComfyUI."
        logging.error("[VOSR2] %s", msg)
        raise ImportError(msg) from exc
    version = tuple(int(p) for p in torch.__version__.split("+")[0].split(".")[:2])
    if version < _MIN_TORCH:
        msg = (
            f"VOSR2 (BlackRin) requires PyTorch >= {'.'.join(map(str, _MIN_TORCH))} "
            f"(uses torch.compiler and scaled_dot_product_attention), found {torch.__version__}."
        )
        logging.error("[VOSR2] %s", msg)
        raise ImportError(msg)
    for pkg in ("einops", "safetensors"):
        try:
            __import__(pkg)
        except ImportError as exc:
            msg = f"VOSR2 (BlackRin) requires '{pkg}', normally shipped with ComfyUI."
            logging.error("[VOSR2] %s", msg)
            raise ImportError(msg) from exc


_check_dependencies()

from .nodes_vosr import VOSR2ModelLoader, VOSR2Upscale  # noqa: E402

__all__ = ["VOSR2ModelLoader", "VOSR2Upscale"]
