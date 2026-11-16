"""BlackRin — MiniMax H3 图像编码（视觉短边可调）

抄写自 ComfyUI 0.45.0 官方节点 comfy_extras/nodes_minimax_h3.py::MiniMaxH3ImageConditioning。

与官方的唯一差异：
    官方把送进 Qwen3-VL 视觉塔的参考图短边写死为 IMAGE_REF_SHORT_EDGE = 1024；
    本节点把它变成一个下拉框（1024 / 720 / 512），其余逻辑逐行照抄。

其余一切（VAE 参考 latent 的尺寸策略 [1024, 2048]、宽高推断、输出 latent、
提示词的 <Picture n> 标签、conditioning 的 minimax_refs 挂载）与官方完全一致。

实测（本机 RX 9070 XT / 2 张参考图）：
    短边 1024 → 视觉 token 2752 → 编码 174 s
    短边 720  → 视觉 token 1320 → 编码  63 s
    短边 512  → 视觉 token  672 → 编码  38 s

节点 id 保持 "MiniMaxH3ImageConditioningVS" 不变，已搭好的工作流无需重连。
"""

import logging

import torch

import comfy.model_management
import comfy.utils
import node_helpers
import nodes
from comfy_api.latest import io

# ---------------------------------------------------------------------------
# 以下常量与工具函数抄自 comfy_extras/nodes_minimax_h3.py（保持与官方一致）
# ---------------------------------------------------------------------------
CANVAS_MULTIPLE = 32
IMAGE_SIZE = 2048
IMAGE_REF_SHORT_EDGE = 1024
IMAGE_REF_VAE_MAX_SHORT_EDGE = 2048

MATCH_CHOICE = "match"          # 官方 ref_image_size="match"：按画布像素面积等比缩（只缩不放）
LEGACY_NATIVE_CHOICE = "原图"    # 旧工作流里存下来的值，按 match 处理
VISION_SHORT_EDGE_CHOICES = [MATCH_CHOICE, "1024", "720", "512"]


def _resize(image, width, height, crop):
    # image [B, H, W, C] -> [B, height, width, 3]
    samples = image[..., :3].movedim(-1, 1)
    samples = comfy.utils.common_upscale(samples, width, height, "lanczos", crop)
    return samples.movedim(1, -1)


def _size_short_edge(width, height, low, high):
    """Aspect-preserving scale putting the short edge inside [low, high], rounded to the canvas grid."""
    scale = min(max(min(width, height), low), high) / min(width, height)
    return tuple(max(CANVAS_MULTIPLE, round(side * scale / CANVAS_MULTIPLE) * CANVAS_MULTIPLE) for side in (width, height))


def _size_within_area(width, height, pixels):
    """官方 match：等比缩放到 pixels 像素面积，只缩不放，对齐 32 网格。"""
    area = float(width) * float(height)
    scale = min(1.0, (pixels / area) ** 0.5) if area > 0 else 1.0
    return tuple(max(CANVAS_MULTIPLE, round(side * scale / CANVAS_MULTIPLE) * CANVAS_MULTIPLE) for side in (width, height))


def _vision_size_policy(choice, canvas_pixels):
    """下拉档位 -> (日志标签, 把 (w, h) 映射成视觉塔输入尺寸的函数)。"""
    choice = str(choice)
    if choice in (MATCH_CHOICE, LEGACY_NATIVE_CHOICE):
        return MATCH_CHOICE, (lambda w, h: _size_within_area(w, h, canvas_pixels))
    edge = int(choice)
    return choice, (lambda w, h: _size_short_edge(w, h, edge, edge))


def _resize_to(image, size):
    # lanczos round-trips through 8 bit: an image already at its size stays untouched
    if (image.shape[2], image.shape[1]) == size:
        return image[..., :3]
    return _resize(image, size[0], size[1], "disabled")


def _image_refs(images, vae, vision_size, vae_size):
    """Reference slots in order (image_1 is the image to edit) -> the pictures, their Qwen copies and, with a VAE,
    the DiT reference blocks.

    vision_size / vae_size map an image's (width, height) to the size each consumer sees.
    """
    names = sorted(images or {}, key=lambda name: int(name.rsplit("_", 1)[-1]))
    images = [images[name][:1] for name in names if images[name] is not None]
    vision_images = []
    refs = []
    for image in images:
        size = (image.shape[2], image.shape[1])
        vision_images.append(_resize_to(image, vision_size(*size)))
        if vae is not None:
            z = vae.encode(_resize_to(image, vae_size(*size)))
            refs.append({"kind": "image", "latent_h": z.shape[-2], "latent_w": z.shape[-1], "latent": z})
    return images, vision_images, refs


class MiniMaxH3ImageConditioningVS(io.ComfyNode):
    """官方 MiniMaxH3ImageConditioning 的抄写版，只把视觉塔参考图短边开放成下拉档位。"""

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="MiniMaxH3ImageConditioningVS",
            display_name="✨ BlackRin H3 图像编码（视觉短边）",
            category="model/conditioning/minimax",
            description=(
                "官方 MiniMaxH3ImageConditioning 的抄写版。唯一差异：送进 Qwen3-VL 视觉塔的参考图短边可选 "
                "1024(官方原值) / 720 / 512。短边越小，视觉 token 越少、编码越快，参考保真度越低。"
            ),
            inputs=[
                io.Clip.Input("clip"),
                io.Vae.Input("vae", optional=True, tooltip="The MiniMax-H3-Image VAE. With it the pictures are also anchored as reference latents, without it they only condition the text encoder."),
                io.String.Input("prompt", multiline=True, dynamic_prompts=True),
                io.Combo.Input(
                    "vision_short_edge",
                    options=VISION_SHORT_EDGE_CHOICES,
                    default="1024",
                    tooltip=(
                        "参考图送进 Qwen 视觉塔时的短边。官方固定 1024。\n"
                        "match = 按生成本身的像素面积等比缩参考图（官方 ref_image_size=\"match\"）；1024 = 与官方完全一致；"
                    "720 / 512 大幅减少视觉 token（耗时约按短边^2 下降）。\n"
                        "注意：VAE 参考 latent 仍按官方的 [1024, 2048] 策略，不受此档位影响（DiT 参考锚点不变）。"
                    ),
                ),
                io.Int.Input("width", default=0, min=0, max=nodes.MAX_RESOLUTION, step=CANVAS_MULTIPLE,
                             tooltip="0 uses the width of image_1 after its reference scaling, or 2048 without images. The model is tuned for 2048x2048 pixels of area"),
                io.Int.Input("height", default=0, min=0, max=nodes.MAX_RESOLUTION, step=CANVAS_MULTIPLE,
                             tooltip="0 uses the height of image_1 after its reference scaling, or 2048 without images."),
                io.Autogrow.Input("images", optional=True, template=io.Autogrow.TemplatePrefix(
                    input=io.Image.Input("image", tooltip="Reference picture, <Picture n> in the prompt; image_1 is the picture to edit."), prefix="image_", min=0, max=100)),
            ],
            outputs=[io.Conditioning.Output(display_name="positive"), io.Latent.Output()],
        )

    @classmethod
    def execute(cls, clip, prompt, width, height, vae=None, images=None, vision_short_edge="1024") -> io.NodeOutput:
        # 官方: _size_short_edge(w, h, IMAGE_REF_SHORT_EDGE, IMAGE_REF_SHORT_EDGE) —— 这里换成下拉档位
        # match 档按生成本身的像素面积缩放，先定下输出画布
        _vae_size = lambda w, h: _size_short_edge(w, h, IMAGE_REF_SHORT_EDGE, IMAGE_REF_VAE_MAX_SHORT_EDGE)
        _names = sorted(images or {}, key=lambda name: int(name.rsplit("_", 1)[-1]))
        _imgs = [images[n][:1] for n in _names if images[n] is not None]
        if width and height:
            _cw, _ch = width, height
        else:
            _s = _vae_size(_imgs[0].shape[2], _imgs[0].shape[1]) if _imgs else (IMAGE_SIZE, IMAGE_SIZE)
            _cw, _ch = width or _s[0], height or _s[1]
        label, vision_size = _vision_size_policy(vision_short_edge, _cw * _ch)
        vae_size = lambda w, h: _size_short_edge(w, h, IMAGE_REF_SHORT_EDGE, IMAGE_REF_VAE_MAX_SHORT_EDGE)
        images, vision_images, refs = _image_refs(images, vae, vision_size, vae_size)

        if vision_images:
            seen = ["%dx%d" % (v.shape[2], v.shape[1]) for v in vision_images]
            # 视觉 token 数 = (h/32) * (w/32)（patch16 + merge2）
            toks = [int(v.shape[1] / 32) * int(v.shape[2] / 32) for v in vision_images]
            logging.info("[BlackRin VisionScale] short_edge=%s  视觉尺寸=%s  视觉token=%s  合计=%d",
                         label, ", ".join(seen), toks, sum(toks))

        cond = clip.encode_from_tokens_scheduled(clip.tokenize(prompt, images=vision_images, picture_label="Picture %d: "))
        if refs:
            cond = node_helpers.conditioning_set_values(cond, {"minimax_refs": refs})
        if not (width and height):
            size = vae_size(images[0].shape[2], images[0].shape[1]) if images else (IMAGE_SIZE, IMAGE_SIZE)
            width, height = width or size[0], height or size[1]
        latent = torch.zeros([1, 24, 1, height // 16, width // 16], device=comfy.model_management.intermediate_device())
        return io.NodeOutput(cond, {"samples": latent})


__all__ = ["MiniMaxH3ImageConditioningVS"]
