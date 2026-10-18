"""BlackRin H3 多段采样小节点。

一体化节点（时间条提示词组）按组建好 N 份条件后，本节点接手：
逐段调官方 custom-sampler 链采样，段间把上一段**导出尾部**的
latent 钉进下一段的 minimax_keyframes 做接续引导（参考图 refs
原样生效，官方 PackedLayout 原生支持 keyframes+refs 共存），
输出拼接好的全片 AV latent，交给用户现有的解码 / 二采分块链。

接续关键：每段采样总长 = align(可见帧 + 引导帧)，对齐余量在
尾部裁掉，头部精确裁掉引导帧——导出帧紧贴引导帧，中间不留任何
自由生成帧，否则段间接缝会闪烁。

解码相位关键：H3 的 token→帧映射是 (1,4,4,4,4) 五 token 一循环
（17 帧），VAE 解码器（vae.py: tokens_chunk_size=5、token_overlap=2）
按 token **在序列中的索引**分块铺帧并做块间混合。逐段采样时每段都
从相位 0 开始，但拼成一条序列后，第 i 段起点索引会偏离它采样时的
相位，导致该段内容被按错误的时间结构铺开——表现为每 17 帧一次的
规律性闪烁。因此段间接续必须让"已累加导出 token 数"与该段的头部
裁剪 token 数同相位（见 _aligned_head_tokens）。注意 video_latent_t
对任何帧数都返回 5k+2，所以相位只能靠**按 token 数**裁剪来调，不能
由帧数反推。
"""

from __future__ import annotations

import logging
import time

import torch

import comfy.model_management as model_management
import comfy.nested_tensor
import node_helpers

from .core import align_frame_count_down, video_latent_t

log = logging.getLogger("ComfyUI-BlackRin.minimax.multi_segment")

FRAME_RESCALE = 5.0 / 3.0
FRAME_PER_TOKEN = (1, 4, 4, 4, 4)
# 接续引导窗口。5 帧 = video_latent_t(5) = 2 token——这是同时满足两个约束的
# 最小值：①末尾 pin 窗口起点必须落在 5 的倍数上（导出段 token 恒为 5k+2，
# 2 token 的窗口起点 ≡0）；②SOL 的 cond 段会被整块标成 exact-KV，块内只要
# 一行不可稀疏整块就跳过不了，所以 pin 越长、段间那些 block 越难稀疏，
# 每步耗时上升得比线性更快（实测 22 帧 pin 让同长度段慢 2.2 倍）。
DEFAULT_PIN_FRAMES = 5
# 解码器按 5 个 token（17 帧）一个块铺帧，段间必须保持这个相位。
PHASE_CYCLE = len(FRAME_PER_TOKEN)


def frames_for_tokens(token_count: int) -> int:
    """token 数 → 从相位 0 铺开时的像素帧数（video_latent_t 的逆运算）。"""
    return sum(FRAME_PER_TOKEN[k % PHASE_CYCLE] for k in range(int(token_count)))


def _aligned_head_tokens(pin_frames: int, accumulated_tokens: int) -> int:
    """头部裁剪的 token 数：不少于引导 token，且与已累加 token 同相位。

    多裁的 token 只是丢弃（不导出），所以导出长度与用户设定的时长不受影响。
    """
    base = video_latent_t(pin_frames) if pin_frames > 0 else 0
    want = accumulated_tokens % PHASE_CYCLE
    for extra in range(PHASE_CYCLE):
        head = base + extra
        if head % PHASE_CYCLE == want:
            return head
    return base


def _unpack(out):
    if hasattr(out, "args"):
        args = out.args
        if args:
            return args
    if isinstance(out, (tuple, list)):
        return out
    raise RuntimeError(f"Unexpected node output type: {type(out)!r}")


def _av_streams(latent: dict) -> tuple[torch.Tensor, torch.Tensor]:
    samples = latent["samples"]
    if torch.is_tensor(samples) or not hasattr(samples, "unbind"):
        raise ValueError("BlackRin 多段采样：需要 MiniMax H3 AV NestedTensor latent")
    return list(samples.unbind())[0], list(samples.unbind())[1]


def _latent_frames(latent: dict) -> int:
    video, _ = _av_streams(latent)
    return frames_for_tokens(video.shape[2])


def _segment_plan(entry) -> tuple[int, int | None]:
    """把一段的裁剪计划归一化成 (引导帧数, 期望导出帧数)。

    一体化节点按段递来 [引导帧数, 期望导出帧数]；单段模式递单个整数。
    """
    if isinstance(entry, (list, tuple)):
        pin = int(entry[0])
        visible = int(entry[1]) if len(entry) > 1 and entry[1] is not None else None
        return pin, visible
    return int(entry), None


def _cut_av_latent(latent: dict, head_tokens: int, keep_tokens: int) -> dict:
    """按 token 精确裁剪：丢掉头部 head_tokens，保留 keep_tokens（AV 对齐）。"""
    video, audio = _av_streams(latent)
    a0 = round(frames_for_tokens(head_tokens) * FRAME_RESCALE)
    a1 = a0 + round(frames_for_tokens(keep_tokens) * FRAME_RESCALE)
    return {
        "samples": comfy.nested_tensor.NestedTensor(
            (video[..., head_tokens:head_tokens + keep_tokens, :, :],
             audio[..., a0:a1])
        )
    }


def _tail_keyframe(prev_samples, pin_tokens: int) -> dict:
    """上一段**导出后** latent 的尾部 → 下一段 frame 0 起的接续引导。

    导出段的 token 数恒为 5k+2，末尾 5k+2 个 token 的窗口起点因此落在
    5 的倍数上——与 keyframe 从 frame 0 铺开的相位一致。
    """
    video, audio = _av_streams(prev_samples)
    pin_frames = frames_for_tokens(pin_tokens)
    return {
        "resolved_frame_index": 0,
        "latent": video[..., -pin_tokens:, :, :],
        "audio_latent": audio[..., -round(pin_frames * FRAME_RESCALE):],
    }


def _slice_audio(audio: dict | None, start_frame: int, frame_count: int, fps: int = 24) -> dict | None:
    if audio is None or audio.get("waveform") is None:
        return None
    sr = int(audio["sample_rate"])
    start = round(start_frame / float(fps) * sr)
    end = round((start_frame + frame_count) / float(fps) * sr)
    wave = audio[..., start:end]
    if wave.shape[-1] <= 0:
        return None
    return {"waveform": wave, "sample_rate": sr}


def sample_multi_segment(
    conditionings: list,
    av_latents: list[dict],
    trims: list,
    *,
    model,
    sigmas,
    seed: int,
    sampler_obj,
    pin_frames: int = DEFAULT_PIN_FRAMES,
) -> tuple[dict, list[str]]:
    """按组建好的条件逐段采样，段间 latent 接续。

    conditionings / av_latents: 一体化节点按组建好的等长列表。
    trims[i] = [引导帧数, 期望导出帧数]；每次导出都会把头部裁剪量补到与
    已累加导出 token 同相位，保证拼接后的解码时间结构正确。
    返回 (全片拼接 latent, reports)。
    """
    from comfy_extras.nodes_custom_sampler import (
        BasicGuider,
        RandomNoise,
        SamplerCustomAdvanced,
    )

    if sigmas is None:
        raise ValueError("BlackRin 多段采样：请接噪声表（如 ManualSigmas 或基本调度器）")
    if sampler_obj is None:
        raise ValueError("BlackRin 多段采样：请把 K采样器选择 接到「采样器」口")

    pin_tokens = video_latent_t(pin_frames)
    reports: list[str] = []
    parts: list[dict] = []
    prev_export = None
    accumulated = 0

    if torch.is_tensor(sigmas):
        sigma_t = sigmas.detach().float().cpu().reshape(-1)
    else:
        sigma_t = torch.tensor([float(x) for x in sigmas], dtype=torch.float32)

    for index, positive in enumerate(conditionings):
        latent = av_latents[index]
        guide_frames, visible_frames = _segment_plan(trims[index] if index < len(trims) else 0)
        if visible_frames is None:
            visible_frames = align_frame_count_down(_latent_frames(latent))
        head_tokens = _aligned_head_tokens(guide_frames, accumulated)
        keep_tokens = video_latent_t(visible_frames)

        if prev_export is not None and head_tokens >= pin_tokens:
            keyframes = list(positive[0][1].get("minimax_keyframes", []))
            keyframes.append(_tail_keyframe(prev_export, pin_tokens))
            positive = node_helpers.conditioning_set_values(
                positive, {"minimax_keyframes": keyframes}
            )

        noise = _unpack(RandomNoise.execute(int(seed) + index))[0]
        _t_guider = time.perf_counter()
        guider = _unpack(BasicGuider.execute(model, positive))[0]
        _t_sample = time.perf_counter()
        samples = _unpack(
            SamplerCustomAdvanced.execute(noise, guider, sampler_obj, sigma_t, latent)
        )[0]
        _t_done = time.perf_counter()

        sampled_tokens = _av_streams(samples)[0].shape[2]
        if head_tokens + keep_tokens > sampled_tokens:
            raise ValueError(
                f"BlackRin 多段采样：段 {index + 1} 采样长度不足"
                f"（需 {head_tokens + keep_tokens} token，只有 {sampled_tokens}）"
            )
        exported = _cut_av_latent(samples, head_tokens, keep_tokens)
        parts.append(exported)
        prev_export = exported
        accumulated += keep_tokens
        reports.append(
            f"段 {index + 1}/{len(conditionings)}：采样 {frames_for_tokens(sampled_tokens)} 帧"
            f"（头部裁 {head_tokens} token、导出 {visible_frames} 帧 / {keep_tokens} token）"
        )
        log.info(
            "BlackRin 多段采样 %d/%d 完成（头部 %d token，导出 %d token，累加 %d）"
            " · guider %.2fs / 采样 %.2fs / 每步 %.2fs",
            index + 1, len(conditionings), head_tokens, keep_tokens, accumulated,
            _t_sample - _t_guider, _t_done - _t_sample,
            (_t_done - _t_sample) / max(1, len(sigma_t) - 1),
        )
        # Only reclaim when the next segment can actually use the room. On ROCm
        # empty_cache() releases every free block back to the driver, so the
        # next allocation re-faults from scratch and the opening steps of the
        # following segment run much slower. Keep the cache warm otherwise.
        if model_management.get_free_memory() < 2 * 1024 ** 3:
            model_management.soft_empty_cache()

    video = torch.cat([_av_streams(p)[0] for p in parts], dim=2)
    audio = torch.cat([_av_streams(p)[1] for p in parts], dim=-1)
    return {"samples": comfy.nested_tensor.NestedTensor((video, audio))}, reports
