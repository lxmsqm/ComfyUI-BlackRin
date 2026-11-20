"""BlackRin · 多 LoRA 加载器（原 ComfyUI-MultiLora，已并入 BlackRin 包）

节点 id 保持 "MultiLoraLoader"，旧工作流不用重连；
HTTP 接口统一挂在 /blackrin/multi_lora/* 下。
"""
import os
import sys

_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
if _THIS_DIR not in sys.path:
    sys.path.insert(0, _THIS_DIR)

# 导入即注册 HTTP 路由（/blackrin/multi_lora/...）
from .nodes import (  # noqa: E402
    MultiLoraLoader,
    NODE_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS,
)

__all__ = [
    "MultiLoraLoader",
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
]
