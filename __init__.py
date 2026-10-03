from .nodes import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS
from .minimax.integration import (
    BlackRin_MiniMaxH3Integration,
    BlackRin_MiniMaxH3Adapter,
    BlackRin_MultiSegmentSampler,
)
from . import blackrin_config
from .sol_attn import SolAttnMiniMax  # SOL 稳定注意力（Apache-2.0，V3 节点）

# SOL 是 V3 扩展（comfy_entrypoint 机制）。本包走传统 NODE_CLASS_MAPPINGS
# 分支后 ComfyUI 不会再走 V3 分支，所以这里手动按 V3 的注册方式把它并进
# 同一张映射表——节点 id 与 display_name 保持原名，旧工作流零重连。
_sol_schema = SolAttnMiniMax.GET_SCHEMA()
NODE_CLASS_MAPPINGS[_sol_schema.node_id] = SolAttnMiniMax
if _sol_schema.display_name is not None:
    NODE_DISPLAY_NAME_MAPPINGS[_sol_schema.display_name] = _sol_schema.display_name

NODE_CLASS_MAPPINGS.update({
    "BlackRin_MiniMaxH3Integration": BlackRin_MiniMaxH3Integration,
    "BlackRin_MiniMaxH3Adapter": BlackRin_MiniMaxH3Adapter,
    "BlackRin_MultiSegmentSampler": BlackRin_MultiSegmentSampler,
})
NODE_DISPLAY_NAME_MAPPINGS.update({
    "BlackRin_MiniMaxH3Integration": "✨ BlackRin H3智能一体化",
    "BlackRin_MiniMaxH3Adapter": "✨ BlackRin H3适配器",
    "BlackRin_MultiSegmentSampler": "✨ BlackRin 多段采样",
})

# 首次使用时从提示词小助手迁移一份配置；已有自己的配置则原样不动
_seed = blackrin_config.ensure_seeded()
if _seed.get("migrated"):
    print(f"🖤 BlackRin: 已从提示词小助手迁移配置"
          f"（{_seed['services']} 服务 / {_seed['rules_image']} 图片规则 / {_seed['rules_text']} 文本规则）"
          f" → {_seed['path']}")

WEB_DIRECTORY = "./web"
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]

print("🖤 BlackRin: Custom nodes loaded.")
