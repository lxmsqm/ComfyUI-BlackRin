"""BlackRin MiniMax H3 图片一体化节点（MiniMax-H3-Image）。

和视频一体化节点同一套面板思路，但走官方图像编码链路，一次出一张图：

    主模型(image DiT) + CLIP(qwen3vl) + 图像 VAE + prompt + 参考图
      → MiniMax H3 Image Conditioning（latent 时间维 = 1 帧）
    本节点只输出「主模型 / 正向条件 / 空 latent / 图像 VAE」四个端口，
    采样（6 步 euler+simple、cfg=1）与解码都由画布上的采样/解码节点完成。

官方链路实测自 Comfy-Org 模板 templates/image_minimax_h3_image_t2i.json：
    UNETLoader → CLIPLoader(type=minimax) → VAELoader(image vae)
    → MiniMaxH3ImageConditioning → ConditioningZeroOut → KSampler(6, cfg 1, euler, simple)
    → VAEDecode → SaveImage
注意：图像链**没有** ModelSamplingSigmaShift（视频那套 shift 不适用）。

与视频一体化节点的关键差异：
- latent 是 [1, 24, 1, H/16, W/16]，时间维只有 1 帧，不带 audio token
- 不加载音频 VAE、不分段、没有接续、没有二采
- 参考图缩放不走 match（按画布面积放大 → 视觉 token 暴涨、编码巨慢），
  改成 match / 1024 / 736 / 480 下拉（match = 官方 ref_image_size="match"，按画布像素面积等比缩参考图）；
  VAE 参考 latent 仍按官方 [1024, 2048] 策略
"""
from __future__ import annotations

import json
import logging

import comfy.model_management as model_management
import comfy.utils
import folder_paths
import node_helpers
import nodes
import torch
from comfy_api.latest import io

from .integration import (
    ASPECTS,
    DEFAULT_CLIP,
    NODE_CATEGORY,
    _default_model,
    _load_image_file,
    _load_main_unet,
    _normalize_model_name,
    _release_text_encoder,
    _unet_options,
    _uploaded_media,
    calculate_canvas,
)

CANVAS_MULTIPLE = 32
# 官方写死的两个参考图尺寸策略（与 comfy_extras/nodes_minimax_h3.py 一致）
IMAGE_REF_SHORT_EDGE = 1024          # 视觉塔（Qwen）短边
IMAGE_REF_VAE_MAX_SHORT_EDGE = 2048  # VAE 参考 latent 短边上限

DEFAULT_IMAGE_VAE = "minimax_h3_image_vae_fp16.safetensors"
IMAGE_UNET_HINTS = ("minimax_h3_image", "minimax-h3_image", "h3_image")
MATCH_CHOICE = "match"          # 官方 ref_image_size="match"：按画布像素面积等比缩（只缩不放）
LEGACY_NATIVE_CHOICE = "原图"    # 旧工作流里存下来的值，按 match 处理
REF_SHORT_EDGE_CHOICES = [MATCH_CHOICE, "1024", "736", "480"]
IMAGE_SLOT_COUNT = 16


def _resize(image, width, height, crop):
    # image [B, H, W, C] -> [B, height, width, 3]
    samples = image[..., :3].movedim(-1, 1)
    samples = comfy.utils.common_upscale(samples, width, height, "lanczos", crop)
    return samples.movedim(1, -1)


def _size_within_area(width, height, pixels):
    """官方 match：等比缩放到 pixels 像素面积，只缩不放，对齐 32 网格。"""
    area = float(width) * float(height)
    scale = min(1.0, (pixels / area) ** 0.5) if area > 0 else 1.0
    return tuple(
        max(CANVAS_MULTIPLE, round(side * scale / CANVAS_MULTIPLE) * CANVAS_MULTIPLE) for side in (width, height)
    )


def _vision_size_policy(choice, canvas_pixels):
    """下拉档位 -> (日志标签, 把 (w, h) 映射成视觉塔输入尺寸的函数)。"""
    choice = str(choice)
    if choice in (MATCH_CHOICE, LEGACY_NATIVE_CHOICE):
        return MATCH_CHOICE, (lambda w, h: _size_within_area(w, h, canvas_pixels))
    edge = int(choice)
    return choice, (lambda w, h: _size_short_edge(w, h, edge, edge))


def _size_short_edge(width, height, low, high):
    """等比缩放，让短边落在 [low, high] 内，并对齐 32 网格。"""
    scale = min(max(min(width, height), low), high) / min(width, height)
    return tuple(
        max(CANVAS_MULTIPLE, round(side * scale / CANVAS_MULTIPLE) * CANVAS_MULTIPLE)
        for side in (width, height)
    )


# ---------------------------------------------------------------------------
# 文本编码器缓存
#   实测（RX 9070 XT / 13.93GiB int4 32B 编码器）：编码器常驻 host RAM、按层流到
#   GPU 算，所以「每次 execute 都新建一个 CLIP」会让权重布局和页缓存每次重建，
#   encode 落在 30~120s；复用同一个 CLIP 对象时只在 13~30s 档。
#   这里只缓存「文件已解析好的 CLIP 对象」，显存仍由 _release_text_encoder 释放，
#   不影响底模装显存。
# ---------------------------------------------------------------------------
_TEXT_ENCODER_CACHE = {}


def _cached_clip(clip_name):
    key = _normalize_model_name(clip_name)
    cached = _TEXT_ENCODER_CACHE.get(key)
    if cached is not None:
        logging.info("BlackRin 文本编码器复用缓存：%s", key)
        return cached
    for stale in list(_TEXT_ENCODER_CACHE):
        _TEXT_ENCODER_CACHE.pop(stale, None)      # 换模型：只留一份，其余放掉
    clip = nodes.CLIPLoader().load_clip(key, "minimax")[0]
    _TEXT_ENCODER_CACHE[key] = clip
    return clip


def _resize_to(image, size):
    # lanczos 会过一遍 8bit：本来就等于目标尺寸的图原样返回，不做任何重采样
    if (image.shape[2], image.shape[1]) == size:
        return image[..., :3]
    return _resize(image, size[0], size[1], "disabled")


def _default_image_unet(options):
    """默认挑图像底模（minimax_h3_image_*），优先 int8_convrot 再退 w4a8。"""
    if not options:
        return ""
    candidates = [opt for opt in options if any(h in str(opt).lower() for h in IMAGE_UNET_HINTS)]
    for want in ("int8_convrot", "w4a8", "pruned"):
        for opt in candidates:
            if want in str(opt).lower():
                return opt
    if candidates:
        return candidates[0]
    return options[0]


def _entry_name(value):
    """面板把素材存成 {name, kind, ...} 条目；这里统一取出文件名，兼容裸字符串。"""
    if isinstance(value, dict):
        value = value.get("name") or value.get("filename") or ""
    if not isinstance(value, str):
        return ""
    value = value.strip()
    if not value or value.lower() in ("(none)", "none"):
        return ""
    return value


def _restore_panel_state(gh_state_json, prompt, media):
    """面板把 prompt / 素材槽烤进 gh_state_json；缺失或坏数据时保持原样。"""
    if not gh_state_json:
        return prompt, media
    try:
        state = json.loads(gh_state_json)
    except (TypeError, ValueError):
        logging.info("BlackRin 图片一体化：gh_state_json 解析失败，忽略面板状态")
        return prompt, media
    if not isinstance(state, dict):
        return prompt, media
    # 面板写进来的 media 是 [[slot, {name, kind, ...}], ...]；
    # 控件里的值才是权威（面板会同步），状态只作兜底，绝不让 dict 漏进文件名。
    entries = state.get("media")
    pairs = []
    if isinstance(entries, list):
        pairs = [entry for entry in entries if isinstance(entry, (list, tuple)) and len(entry) == 2]
    elif isinstance(entries, dict):
        pairs = list(entries.items())
    for key, value in pairs:
        if key not in media:
            continue
        if _entry_name(media.get(key)):
            continue  # 控件里已有文件名：控件是唯一权威，状态只做兜底
        name = _entry_name(value)
        if name:
            media[key] = name
            logging.info("BlackRin 图片一体化：%s 从面板状态补出文件名 %s", key, name)
    prompt_value = state.get("prompt")
    if isinstance(prompt_value, str) and prompt_value.strip():
        prompt = prompt_value
    return prompt, media


class BlackRin_H3ImageIntegration(io.ComfyNode):
    """图片一体化：只做 H3-Image 的条件/模型准备，采样与解码留给画布上的采样节点。"""

    @classmethod
    def define_schema(cls):
        unet_options = _unet_options()
        vae_options = folder_paths.get_filename_list("vae")
        inputs = [
            io.Combo.Input(
                "unet_name",
                display_name="主模型",
                options=unet_options,
                default=_default_image_unet(unet_options),
            ),
            io.Combo.Input(
                "clip_name",
                display_name="CLIP 模型",
                options=folder_paths.get_filename_list("text_encoders"),
                default=_default_model(folder_paths.get_filename_list("text_encoders"), DEFAULT_CLIP),
            ),
            io.Combo.Input(
                "vae_name",
                display_name="图像 VAE",
                options=vae_options,
                # 图像模型必须配 minimax_h3_image_vae，套视频 VAE 会直接出噪点
                default=_default_model(vae_options, DEFAULT_IMAGE_VAE),
            ),
            io.Combo.Input("aspect", display_name="宽高比", options=list(ASPECTS), default="adaptive"),
            io.Float.Input(
                "megapixels",
                display_name="百万像素",
                default=4.0,
                min=0.9,
                max=16.0,
                step=0.1,
                round=0.1,
                tooltip="官方原生约 16MP，低显存从 4MP 起步。每边都是 32 的倍数。",
            ),
            io.Combo.Input(
                "ref_short_edge",
                display_name="参考图短边",
                options=REF_SHORT_EDGE_CHOICES,
                default="1024",
                tooltip=(
                    "参考图送进 Qwen 视觉塔时的短边。官方写死 1024。\n"
                    "match = 按你设的百万像素画布面积等比缩放参考图（只缩不放，官方 ref_image_size=\"match\"）；"
                    "1024 = 官方原值；736 / 480 大幅减少视觉 token（编码耗时约按短边²下降）。\n"
                    "VAE 参考 latent 仍按官方 [1024, 2048] 策略，不受此档位影响。"
                ),
            ),
            io.String.Input("prompt", multiline=True, dynamic_prompts=True, default="", extra_dict={"hidden": True}),
        ]
        # image_1 是被编辑的原图（参考图顺序 = 标签顺序），其余全是参考
        for index in range(1, IMAGE_SLOT_COUNT + 1):
            inputs.append(_uploaded_media(f"ref_image_{index}", hidden=True))
        inputs.append(io.String.Input("gh_state_json", default="", optional=True, extra_dict={"hidden": True}))

        return io.Schema(
            node_id="BlackRin_H3ImageIntegration",
            display_name="✨ 图片一体化",
            category=NODE_CATEGORY,
            description=(
                "MiniMax-H3-Image 一体化输入：主模型 / CLIP / 图像 VAE / 画布 / 参考图 → 单张图。\n"
                "不上参考图就是文生图；上了参考图就是图生图（image_1 是被编辑的原图）。\n"
                "6 步 euler/simple、cfg=1 是官方蒸馏档位。"
            ),
            inputs=inputs,
            # 私有 socket：只让「✨ H3图片适配器」能接，和视频一体化同一套做法
            outputs=[io.Custom("MiniMax").Output(display_name=">")],
        )

    @classmethod
    def execute(
        cls,
        unet_name,
        clip_name,
        vae_name,
        aspect,
        megapixels,
        ref_short_edge,
        prompt,
        ref_image_1=None,
        ref_image_2=None,
        ref_image_3=None,
        ref_image_4=None,
        ref_image_5=None,
        ref_image_6=None,
        ref_image_7=None,
        ref_image_8=None,
        ref_image_9=None,
        ref_image_10=None,
        ref_image_11=None,
        ref_image_12=None,
        ref_image_13=None,
        ref_image_14=None,
        ref_image_15=None,
        ref_image_16=None,
        gh_state_json="",
    ) -> io.NodeOutput:
        slots = (
            ref_image_1,
            ref_image_2,
            ref_image_3,
            ref_image_4,
            ref_image_5,
            ref_image_6,
            ref_image_7,
            ref_image_8,
            ref_image_9,
            ref_image_10,
            ref_image_11,
            ref_image_12,
            ref_image_13,
            ref_image_14,
            ref_image_15,
            ref_image_16,
        )
        media = {f"ref_image_{i + 1}": value for i, value in enumerate(slots)}
        prompt, media = _restore_panel_state(gh_state_json, prompt, media)
        prompt = (prompt or "").strip()
        if not prompt:
            raise ValueError("BlackRin 图片一体化：提示词为空，请先在面板里写提示词。")

        images = []
        for index in range(1, IMAGE_SLOT_COUNT + 1):
            image = _load_image_file(_entry_name(media.get(f"ref_image_{index}")))
            if image is not None:
                images.append(image)

        # match 档要按画布像素面积缩放，所以先算画布（只用尺寸计算，不 encode）
        _vae_size = lambda w, h: _size_short_edge(w, h, IMAGE_REF_SHORT_EDGE, IMAGE_REF_VAE_MAX_SHORT_EDGE)
        if images:
            _src_w, _src_h = _vae_size(images[0].shape[2], images[0].shape[1])
        else:
            _src_w = _src_h = None
        _canvas_w, _canvas_h = calculate_canvas(aspect, megapixels, _src_w, _src_h)

        edge_label, vision_size = _vision_size_policy(ref_short_edge, _canvas_w * _canvas_h)
        vision_images = [
            _resize_to(image, vision_size(image.shape[2], image.shape[1]))
            for image in images
        ]

        clip = _cached_clip(clip_name)
        vae = nodes.VAELoader().load_vae(_normalize_model_name(vae_name))[0]

        refs = []
        vae_images = []
        for image in images:
            resized = _resize_to(
                image,
                _size_short_edge(
                    image.shape[2], image.shape[1], IMAGE_REF_SHORT_EDGE, IMAGE_REF_VAE_MAX_SHORT_EDGE
                ),
            )
            vae_images.append(resized)
            latent_ref = vae.encode(resized)
            refs.append(
                {
                    "kind": "image",
                    "latent_h": latent_ref.shape[-2],
                    "latent_w": latent_ref.shape[-1],
                    "latent": latent_ref,
                }
            )

        # 画布：adaptive 跟随 image_1（已经被 VAE 侧缩放过的尺寸），无图回退 16:9
        if vae_images:
            source_width, source_height = vae_images[0].shape[2], vae_images[0].shape[1]
        else:
            source_width = source_height = None
        width, height = calculate_canvas(aspect, megapixels, source_width, source_height)
        if (width, height) != (_canvas_w, _canvas_h):   # 理论上一致；不一致就以这里为准并告警
            logging.warning("[BlackRin] 画布预估值 %s 与实际 %s 不一致",
                            (_canvas_w, _canvas_h), (width, height))

        cond = clip.encode_from_tokens_scheduled(
            clip.tokenize(prompt, images=vision_images, picture_label="Picture %d: ")
        )
        if refs:
            cond = node_helpers.conditioning_set_values(cond, {"minimax_refs": refs})
        latent = {
            "samples": torch.zeros(
                [1, 24, 1, height // 16, width // 16],
                device=model_management.intermediate_device(),
            )
        }

        if vision_images:
            sizes = ", ".join("%dx%d" % (v.shape[2], v.shape[1]) for v in vision_images)
            logging.info(
                "BlackRin 图片一体化：参考图 %d 张 · 视觉短边 %s（%s）· 画布 %dx%d",
                len(images), edge_label, sizes, width, height,
            )

        # 21GB 的 33B 底模不能和文本编码器同时待命：编完立刻放掉 CLIP，再加载底模
        _release_text_encoder(clip)   # 只放显存；CLIP 对象留在缓存里，下次提示词不用重读 13.9GB
        model = _load_main_unet(unet_name)
        logging.info(
            "BlackRin 图片一体化：画布 %dx%d · 参考图 %d 张 · 视觉短边 %s · 主模型已就绪（采样在画布上的采样节点里做）",
            width, height, len(images), edge_label,
        )
        bundle = {
            "image": True,
            "model": model,
            "positive": cond,
            "latent": latent,
            "vae": vae,
            "width": width,
            "height": height,
            "ref_count": len(images),
            # 首图 = 决定画布长宽比的那张（vae_images[0]，与 calculate_canvas 的 source 同源）。
            # 供「✨ H3图片适配器」导出，做生成结果对比与后期校色。
            "ref_image": vae_images[0] if vae_images else None,
        }
        return io.NodeOutput(bundle)


class BlackRin_H3ImageAdapter(io.ComfyNode):
    """把图片一体化的 bundle 拆成画布上可直连的端口。"""

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="BlackRin_H3ImageAdapter",
            display_name="✨ H3图片适配器",
            category=NODE_CATEGORY,
            description=(
                "接 ✨ 图片一体化 的私有输出，展开成 主模型 / 正向条件 / 图像 latent / 图像 VAE。\n"
                "没有负条件出口：图像模型 CFG=1 不需要，普通 KSampler 的 negative 用 ConditioningZeroOut 自己接。"
            ),
            inputs=[io.Custom("MiniMax").Input("integration", display_name="<")],
            outputs=[
                io.Model.Output("model", display_name="主模型"),
                io.Conditioning.Output("positive", display_name="正向条件"),
                io.Latent.Output("latent", display_name="图像 latent"),
                io.Vae.Output("vae", display_name="图像 VAE"),
                io.Image.Output(
                    "first_image",
                    display_name="首图·参考",
                    tooltip=(
                        "第一张参考图（决定画布长宽比的那张），已按 VAE 参考侧尺寸缩放。\n"
                        "用途：与生成结果做对比、以及后期的校色/色调匹配。\n"
                        "纯文生图（没有参考图）时此口为空。"
                    ),
                ),
            ],
        )

    @classmethod
    def execute(cls, integration) -> io.NodeOutput:
        if not isinstance(integration, dict) or not integration.get("image"):
            raise ValueError(
                "H3图片适配器只接 ✨ 图片一体化 的输出；视频那套请用 ✨ BlackRin H3适配器。"
            )
        return io.NodeOutput(
            integration["model"],
            integration["positive"],
            integration["latent"],
            integration["vae"],
            integration.get("ref_image"),
        )


__all__ = ["BlackRin_H3ImageIntegration", "BlackRin_H3ImageAdapter"]
