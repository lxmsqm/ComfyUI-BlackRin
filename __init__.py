try:
    from . import path_compat
    path_compat.install()
except Exception as _e:
    print("[BlackRin] path_compat failed:", _e)

# ROCm/MIOpen：Conv3d 退化形状（stride==kernel）在 A 卡上慢 7 万倍，先挂全局 matmul 补丁。
# 覆盖 comfy.ops 全部 Conv3d（含 mixed_precision/fp8）与 torch.nn.Conv3d，
# 所有 Qwen-VL 系编码器（H3 / Qwen-Image-Edit / Krea2 / Flux3 / HiDream o1 …）一起受益。
from . import conv3d_linear  # noqa: E402
conv3d_linear.apply()

from .nodes import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS
from .minimax.integration import (
    BlackRin_MiniMaxH3Integration,
    BlackRin_MiniMaxH3Adapter,
    BlackRin_MultiSegmentSampler,
    BlackRin_H3Migration,
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

from .minimax.conditioning_vision_scale import MiniMaxH3ImageConditioningVS

# 视觉短边可调的 H3 图像编码节点（抄写官方 MiniMaxH3ImageConditioning，只把视觉塔短边
# 从写死的 1024 开放成 1024/720/512 下拉）。同为 V3 节点，按上面 SOL 的方式并入同一张映射表。
_vs_schema = MiniMaxH3ImageConditioningVS.GET_SCHEMA()
NODE_CLASS_MAPPINGS[_vs_schema.node_id] = MiniMaxH3ImageConditioningVS
if _vs_schema.display_name is not None:
    NODE_DISPLAY_NAME_MAPPINGS[_vs_schema.node_id] = _vs_schema.display_name

from .minimax.image_integration import BlackRin_H3ImageIntegration, BlackRin_H3ImageAdapter

# H3-Image 图片一体化（文生图 / 图生图）：官方 1 帧图像 latent 链路封装，
# 参考图短边可下拉（480/736/1024），避免走画布面积缩放导致编码巨慢。
_ii_schema = BlackRin_H3ImageIntegration.GET_SCHEMA()
NODE_CLASS_MAPPINGS[_ii_schema.node_id] = BlackRin_H3ImageIntegration
if _ii_schema.display_name is not None:
    NODE_DISPLAY_NAME_MAPPINGS[_ii_schema.node_id] = _ii_schema.display_name

# 图片适配器：把图片一体化的 bundle 拆成 主模型 / 正向条件 / 负条件 / 图像 latent / 图像 VAE
_ia_schema = BlackRin_H3ImageAdapter.GET_SCHEMA()
NODE_CLASS_MAPPINGS[_ia_schema.node_id] = BlackRin_H3ImageAdapter
if _ia_schema.display_name is not None:
    NODE_DISPLAY_NAME_MAPPINGS[_ia_schema.node_id] = _ia_schema.display_name

NODE_CLASS_MAPPINGS.update({
    "BlackRin_MiniMaxH3Integration": BlackRin_MiniMaxH3Integration,
    "BlackRin_MiniMaxH3Adapter": BlackRin_MiniMaxH3Adapter,
    "BlackRin_MultiSegmentSampler": BlackRin_MultiSegmentSampler,
    "BlackRin_H3Migration": BlackRin_H3Migration,
})
NODE_DISPLAY_NAME_MAPPINGS.update({
    "BlackRin_MiniMaxH3Integration": "✨ BlackRin H3智能一体化",
    "BlackRin_MiniMaxH3Adapter": "✨ BlackRin H3适配器",
    "BlackRin_MultiSegmentSampler": "✨ BlackRin 多段采样",
    "BlackRin_H3Migration": "✨ 迁移一体化",
})

# 首次使用时从提示词小助手迁移一份配置；已有自己的配置则原样不动
_seed = blackrin_config.ensure_seeded()
if _seed.get("migrated"):
    print(f"🖤 BlackRin: 已从提示词小助手迁移配置"
          f"（{_seed['services']} 服务 / {_seed['rules_image']} 图片规则 / {_seed['rules_text']} 文本规则）"
          f" → {_seed['path']}")

# ── 多 LoRA 加载器（原独立包 ComfyUI-MultiLora 并入）──────────────────────────
# 节点 id 保持 "MultiLoraLoader"，旧工作流零重连；前端在 web/js/multi_lora_003056.js，
# HTTP 接口挂在 /blackrin/multi_lora/*（见 multilora/nodes.py）。
from .multilora import MultiLoraLoader as _MultiLoraLoader  # noqa: E402

NODE_CLASS_MAPPINGS["MultiLoraLoader"] = _MultiLoraLoader
NODE_DISPLAY_NAME_MAPPINGS["MultiLoraLoader"] = "Multi LoRA Loader"

# ── VOSR 2.0 图片/视频超分（原独立包 ComfyUI-VOSR2 并入，Apache-2.0，见 vosr2/UPSTREAM.md）──
# 上游是 V3（comfy_entrypoint）节点；本包走传统 NODE_CLASS_MAPPINGS 分支后 ComfyUI 不会再走 V3，
# 所以按 SOL 的写法手动 GET_SCHEMA() 并表。节点 id 与显示名保持上游原名，旧工作流零重连。
from .vosr2.nodes_vosr import VOSR2ModelLoader as _VOSR2ModelLoader  # noqa: E402
from .vosr2.nodes_vosr import VOSR2Upscale as _VOSR2Upscale  # noqa: E402

for _vosr_cls in (_VOSR2ModelLoader, _VOSR2Upscale):
    _vosr_schema = _vosr_cls.GET_SCHEMA()
    NODE_CLASS_MAPPINGS[_vosr_schema.node_id] = _vosr_cls
    NODE_DISPLAY_NAME_MAPPINGS[_vosr_schema.node_id] = _vosr_schema.display_name or _vosr_schema.node_id

WEB_DIRECTORY = "./web"
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]

print("🖤 BlackRin: Custom nodes loaded.")
