"""BlackRin MiniMax H3 integration.

Ported from Goohai-MiniMax-H3_Integration (GPL-3.0): the main conditioning
node and the adapter that splits its bundle for downstream samplers. The
diffusion model remains an external input in the downstream sampler.
"""
from __future__ import annotations

import os
import json
import logging
import shutil
import subprocess
import tempfile
import time

import folder_paths
import nodes
import torch
import comfy.model_management as model_management
import comfy.samplers
from comfy_api.latest import io
from comfy_api.latest._input_impl import VideoFromFile
from comfy_extras import nodes_audio

from .conditioning import build_conditioning
from .core import FPS, align_frame_count, align_frame_count_down, video_latent_t
from .multi_segment import DEFAULT_PIN_FRAMES, frames_for_tokens, sample_multi_segment
from . import prompt_optimizer  # noqa: F401  (registers optimizer routes on import)


NODE_CATEGORY = "BlackRin/MiniMax H3"
MAX_RESOLUTION = 16384
ASPECTS = {
    "adaptive": None,
    "16:9": 16 / 9,
    "9:16": 9 / 16,
    "3:2": 3 / 2,
    "2:3": 2 / 3,
    "4:3": 4 / 3,
    "3:4": 3 / 4,
    "1:1": 1.0,
    "21:9": 21 / 9,
}
DEFAULT_CLIP = "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors"
DEFAULT_VIDEO_VAE = "minimax_h3_video_vae_fp16.safetensors"
DEFAULT_AUDIO_VAE = "minimax_h3_audio_vae_fp32.safetensors"


def _uploaded_media(name, tooltip=None, hidden=False):
    """Store a custom-uploaded filename without Combo enum validation.

    The DOM panel owns the upload control.  A fixed upload Combo cannot
    represent an unused slot: ComfyUI validates every submitted Combo value,
    so the old ``(none)`` sentinel made the last empty media slots invalid.
    Empty strings are valid optional STRING values and are converted to None
    by the existing file loaders.
    """
    return io.String.Input(
        name,
        default="",
        optional=True,
        tooltip=tooltip,
        extra_dict={"hidden": True} if hidden else None,
    )


def _hidden_combo(name, options, default=None):
    return io.Combo.Input(
        name,
        options=options,
        default=default,
        extra_dict={"hidden": True},
    )


def _hidden_float(name, default, minimum, maximum, step, round_value=None):
    return io.Float.Input(
        name,
        default=default,
        min=minimum,
        max=maximum,
        step=step,
        round=round_value,
        extra_dict={"hidden": True},
    )


def _hidden_int(name, default, minimum, maximum, step=1):
    return io.Int.Input(
        name,
        default=default,
        min=minimum,
        max=maximum,
        step=step,
        extra_dict={"hidden": True},
    )


def _coerce_int(value, default=0, minimum=None, maximum=None):
    """Accept legacy serialized widget values without leaking them downstream."""
    if value is None or value == "" or value == "(none)":
        result = int(default)
    else:
        try:
            result = int(float(value))
        except (TypeError, ValueError):
            result = int(default)
    if minimum is not None:
        result = max(int(minimum), result)
    if maximum is not None:
        result = min(int(maximum), result)
    return result


def _coerce_float(value, default=0.0, minimum=None, maximum=None):
    """Accept legacy serialized widget values without leaking them downstream."""
    if value is None or value == "" or value == "(none)":
        result = float(default)
    else:
        try:
            result = float(value)
        except (TypeError, ValueError):
            result = float(default)
    if minimum is not None:
        result = max(float(minimum), result)
    if maximum is not None:
        result = min(float(maximum), result)
    return result


def _mode_model_number(mode):
    return 1 if mode == "all_reference" else 0


def _restore_ui_state(gh_state_json, main_mode, prompt, media_values):
    """Recover DOM-owned values from the workflow's serialized state."""
    if not gh_state_json or gh_state_json == "(none)":
        return main_mode, prompt, media_values
    try:
        state = json.loads(gh_state_json)
    except (TypeError, ValueError, json.JSONDecodeError):
        return main_mode, prompt, media_values
    if not isinstance(state, dict):
        return main_mode, prompt, media_values

    restored_mode = state.get("mode")
    if restored_mode in {"text_keyframes", "all_reference"}:
        main_mode = restored_mode

    prompts = state.get("prompts")
    if isinstance(prompts, dict) and isinstance(prompts.get(main_mode), str):
        prompt = prompts[main_mode]
    elif isinstance(state.get("prompt"), str):
        prompt = state["prompt"]

    # When the media list exists it is the source of truth, including removals.
    # This prevents stale hidden widget values from reviving deleted uploads.
    serialized_media = state.get("media")
    if isinstance(serialized_media, list):
        restored_media = {}
        for item in serialized_media:
            if not isinstance(item, (list, tuple)) or len(item) != 2:
                continue
            slot, entry = item
            if slot not in media_values or not isinstance(entry, dict):
                continue
            name = entry.get("name")
            if isinstance(name, str) and name and name != "(none)":
                restored_media[slot] = name
        media_values = {name: restored_media.get(name, "") for name in media_values}

    return main_mode, prompt, media_values


def _serialized_first_visual_name(gh_state_json, mode):
    if not gh_state_json or gh_state_json == "(none)":
        return None
    try:
        state = json.loads(gh_state_json)
    except (TypeError, ValueError, json.JSONDecodeError):
        return None
    media = dict(state.get("media", [])) if isinstance(state, dict) else {}
    if mode == "text_keyframes":
        ordered_slots = ["first_frame", "last_frame"]
    else:
        # Ref2VA presents videos before pictures, regardless of upload time.
        ordered_slots = [
            *(f"ref_video_{i}" for i in range(1, 4)),
            *(f"ref_image_{i}" for i in range(1, 10)),
        ]
    for slot in ordered_slots:
        entry = media.get(slot)
        if not isinstance(entry, dict) or entry.get("kind") not in {"image", "video"}:
            continue
        name = entry.get("name")
        if isinstance(name, str) and name and name != "(none)":
            return name
    return None


def _serialized_muted_video_slots(gh_state_json):
    if not gh_state_json or gh_state_json == "(none)":
        return set()
    try:
        state = json.loads(gh_state_json)
    except (TypeError, ValueError, json.JSONDecodeError):
        return set()
    media = state.get("media", []) if isinstance(state, dict) else []
    return {
        slot for slot, entry in media
        if isinstance(slot, str) and slot.startswith("ref_video_")
        and isinstance(entry, dict) and bool(entry.get("muted"))
    }


def _serialized_trim_ranges(gh_state_json):
    """Return saved non-destructive media selections keyed by slot（音频与视频通用）。"""
    if not gh_state_json or gh_state_json == "(none)":
        return {}
    try:
        state = json.loads(gh_state_json)
    except (TypeError, ValueError, json.JSONDecodeError):
        return {}
    media = state.get("media", []) if isinstance(state, dict) else []
    ranges = {}
    for item in media:
        if not isinstance(item, (list, tuple)) or len(item) != 2:
            continue
        slot, entry = item
        if not isinstance(slot, str) or not isinstance(entry, dict):
            continue
        if entry.get("kind") not in {"audio", "video"}:
            continue
        try:
            start = max(0.0, float(entry.get("trimStart", 0) or 0))
            raw_end = entry.get("trimEnd")
            end = float(raw_end) if raw_end is not None else None
        except (TypeError, ValueError):
            continue
        if end is not None and end > start:
            ranges[slot] = (start, end)
    return ranges


def _serialized_media_numbers(gh_state_json, key, minimum, maximum):
    """从工作流状态里按槽位读一个数值字段（例如参考视频的上传帧率）。"""
    if not gh_state_json or gh_state_json == "(none)":
        return {}
    try:
        state = json.loads(gh_state_json)
    except (TypeError, ValueError, json.JSONDecodeError):
        return {}
    media = state.get("media", []) if isinstance(state, dict) else []
    values = {}
    for item in media:
        if not isinstance(item, (list, tuple)) or len(item) != 2:
            continue
        slot, entry = item
        if not isinstance(slot, str) or not isinstance(entry, dict):
            continue
        try:
            value = float(entry.get(key))
        except (TypeError, ValueError):
            continue
        if minimum <= value <= maximum:
            values[slot] = value
    return values


def _default_model(options, preferred):
    return preferred if preferred in options else (options[0] if options else None)


def _release_text_encoder(clip) -> None:
    """Best-effort CLIP-only VRAM release across ComfyUI versions."""
    patcher = getattr(clip, "patcher", None)
    unloaded = False
    try:
        if patcher is not None:
            unload = getattr(model_management, "unload_model_and_clones", None)
            if not callable(unload):
                # Compatibility with ComfyUI builds that used the older name.
                unload = getattr(model_management, "unload_model_clones", None)
            if callable(unload):
                unload(patcher)
                unloaded = True
    except Exception as exc:
        logging.warning("MiniMax H3 could not explicitly unload the text encoder: %s", exc)
    finally:
        if patcher is not None and not unloaded:
            try:
                # Last-resort targeted offload. Never unload every model here:
                # both VAEs are still required by downstream nodes.
                detach = getattr(patcher, "detach", None)
                if callable(detach):
                    detach()
            except Exception as exc:
                logging.warning("MiniMax H3 could not detach the text encoder: %s", exc)
        try:
            empty_cache = getattr(model_management, "soft_empty_cache", None)
            if callable(empty_cache):
                empty_cache()
        except Exception as exc:
            logging.warning("MiniMax H3 could not clear released text-encoder cache: %s", exc)


def _round32(value: float) -> int:
    return max(32, int(value / 32 + 0.5) * 32)


def calculate_canvas(aspect: str, megapixels: float, source_width=None, source_height=None):
    ratio = ASPECTS.get(aspect, ASPECTS["16:9"])
    if ratio is None:
        try:
            ratio = float(source_width) / float(source_height)
        except (TypeError, ValueError, ZeroDivisionError):
            ratio = ASPECTS["16:9"]
    area = max(0.05, float(megapixels)) * 1024 * 1024
    # Round both axes independently from the requested aspect ratio. Using
    # area / rounded_width makes even 1:1 drift after the second rounding.
    width = _round32((area * ratio) ** 0.5)
    height = _round32((area / ratio) ** 0.5)
    if ratio == 1.0:
        height = width
    return min(MAX_RESOLUTION, width), min(MAX_RESOLUTION, height)


def calculate_length(duration_seconds: float) -> int:
    requested_frames = max(5, round(float(duration_seconds) * 24))
    return requested_frames + (5 - (requested_frames % 17)) % 17


def _load_image_file(value):
    if not value or value == "(none)":
        return None
    image, _mask = nodes.LoadImage().load_image(value)
    return image


# 音频槽里可能残留历史错位写入的图片文件名：按扩展名识别后静默跳过
_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".avif"}


def _load_audio_file(value):
    if not value or value == "(none)":
        return None
    if os.path.splitext(str(value))[1].lower() in _IMAGE_EXTS:
        logging.info("MiniMax H3: 音频槽里的图片文件已跳过: %s", value)
        return None
    try:
        return nodes_audio.LoadAudio.load(value)[0]
    except Exception as primary_error:
        # ComfyUI's PyAV loader can reject otherwise usable files (notably
        # some FLAC encoders or files containing a damaged metadata/frame
        # block).  Decode through FFmpeg to a plain PCM WAV as a compatibility
        # fallback.  This also broadens support to common formats such as
        # M4A/AAC, OGG/Opus, WMA and AIFF without changing H3's AUDIO contract.
        source_path = folder_paths.get_annotated_filepath(value)
        try:
            ffmpeg = shutil.which("ffmpeg")
            if not ffmpeg:
                import imageio_ffmpeg
                ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()

            with tempfile.TemporaryDirectory(prefix="minimax_h3_audio_") as temp_dir:
                wav_path = os.path.join(temp_dir, "decoded.wav")
                process = subprocess.run(
                    [
                        ffmpeg,
                        "-hide_banner", "-loglevel", "error", "-y",
                        "-fflags", "+discardcorrupt", "-err_detect", "ignore_err",
                        "-i", source_path,
                        "-vn", "-map", "0:a:0",
                        "-c:a", "pcm_s16le", wav_path,
                    ],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.PIPE,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                )
                if process.returncode != 0 or not os.path.isfile(wav_path):
                    details = (process.stderr or "").strip()[-1200:]
                    raise RuntimeError(details or f"FFmpeg exited with code {process.returncode}")
                waveform, sample_rate = nodes_audio.load(wav_path)
                logging.info(
                    "MiniMax H3 decoded audio through FFmpeg compatibility fallback: %s",
                    os.path.basename(source_path),
                )
                return {"waveform": waveform.unsqueeze(0), "sample_rate": sample_rate}
        except Exception as fallback_error:
            raise RuntimeError(
                f"无法解码音频 {os.path.basename(str(source_path))}。"
                "节点支持常见音频格式，但该文件可能已损坏、扩展名与实际编码不符，"
                "或当前环境缺少可用的 FFmpeg。"
                f"\nComfyUI/PyAV: {primary_error}"
                f"\nFFmpeg fallback: {fallback_error}"
            ) from fallback_error


def _trim_audio_to_duration(audio, duration_seconds):
    """Return a same-rate AUDIO value exactly matching the requested duration."""
    if audio is None:
        return None
    waveform = audio["waveform"]
    sample_rate = int(audio["sample_rate"])
    sample_count = max(1, round(float(duration_seconds) * sample_rate))
    trimmed = waveform[..., :sample_count]
    if trimmed.shape[-1] < sample_count:
        trimmed = torch.nn.functional.pad(trimmed, (0, sample_count - trimmed.shape[-1]))
    return {"waveform": trimmed, "sample_rate": sample_rate}


def _apply_audio_selection(audio, selection):
    """Slice an AUDIO value by a saved UI range without changing its rate."""
    if audio is None or not selection:
        return audio
    waveform = audio["waveform"]
    sample_rate = int(audio["sample_rate"])
    start_seconds, end_seconds = selection
    start_sample = max(0, min(waveform.shape[-1], round(float(start_seconds) * sample_rate)))
    end_sample = max(start_sample + 1, min(waveform.shape[-1], round(float(end_seconds) * sample_rate)))
    return {"waveform": waveform[..., start_sample:end_sample], "sample_rate": sample_rate}


def _slice_video_frames(frames, source_fps, selection):
    """按用户选的起止秒，从源视频里切出片段（在转 24fps 之前，保留原始时间精度）。"""
    if frames is None or not selection or source_fps <= 0:
        return frames
    start_seconds, end_seconds = selection
    total = frames.shape[0]
    first = max(0, min(total - 1, int(round(start_seconds * source_fps))))
    last = max(first + 1, min(total, int(round(end_seconds * source_fps))))
    return frames[first:last]


def _sample_video_frames(frames, source_fps, target_frames, output_fps=FPS):
    """把源视频重采样到 output_fps（默认 24），播放速度不变，并按目标帧数截断。

    参考视频的上传帧率直接决定 VAE 编码量与 ref token 数，也就是编码时间和
    采样算力；调低 output_fps 能在保留时间跨度的前提下减少上传帧数。
    """
    if frames is None or frames.shape[0] <= 1:
        return frames
    source_fps = float(source_fps or 0)
    output_fps = float(output_fps or FPS)
    requested = max(1, int(target_frames))
    if source_fps > 0:
        source_duration_frames = max(1, round(frames.shape[0] * output_fps / source_fps))
        target_frames = min(requested, source_duration_frames)
    else:
        target_frames = min(requested, frames.shape[0])
    # H3 的参考视频至少要 5 帧（conditioning 侧会拒绝更短的）
    target_frames = max(min(5, frames.shape[0]), target_frames)
    if source_fps <= 0:
        source_indices = torch.arange(target_frames, dtype=torch.long)
    else:
        # Preserve source playback rate: 60fps -> 24fps drops frames at the
        # 24fps cadence; 12fps -> 24fps repeats source frames at that cadence.
        source_indices = torch.floor(
            torch.arange(target_frames, dtype=torch.float32) * source_fps / output_fps
        ).long()
    source_indices = source_indices.clamp(max=frames.shape[0] - 1)
    return frames[source_indices][:target_frames]


class BlackRin_MiniMaxH3Integration(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="BlackRin_MiniMaxH3Integration",
            category=NODE_CATEGORY,
            description="Integrated MiniMax H3 conditioning input. The diffusion model remains external.",
            inputs=[
                _hidden_combo("main_mode", ["text_keyframes", "all_reference"], "text_keyframes"),
                io.Combo.Input(
                    "clip_name",
                    options=folder_paths.get_filename_list("text_encoders"),
                    default=_default_model(folder_paths.get_filename_list("text_encoders"), DEFAULT_CLIP),
                ),
                io.Combo.Input(
                    "video_vae_name",
                    options=folder_paths.get_filename_list("vae"),
                    default=_default_model(folder_paths.get_filename_list("vae"), DEFAULT_VIDEO_VAE),
                ),
                io.Combo.Input(
                    "audio_vae_name",
                    options=folder_paths.get_filename_list("vae"),
                    default=_default_model(folder_paths.get_filename_list("vae"), DEFAULT_AUDIO_VAE),
                ),
                io.Combo.Input("aspect", options=list(ASPECTS), default="adaptive"),
                io.Float.Input("megapixels", default=0.5, min=0.2, max=2.0, step=0.1, round=0.1),
                io.Int.Input(
                    "duration_seconds",
                    default=5,
                    min=2,
                    max=30,
                    step=1,
                ),
                io.String.Input("prompt", multiline=True, dynamic_prompts=True, default="", extra_dict={"hidden": True}),
                _uploaded_media("first_frame", tooltip="Optional first frame", hidden=True),
                _uploaded_media("last_frame", tooltip="Optional last frame", hidden=True),
                _uploaded_media("hybrid_audio", tooltip="Optional audio for keyframe Hybrid", hidden=True),
                _uploaded_media("ref_image_1", hidden=True),
                _uploaded_media("ref_image_2", hidden=True),
                _uploaded_media("ref_image_3", hidden=True),
                _uploaded_media("ref_image_4", hidden=True),
                _uploaded_media("ref_image_5", hidden=True),
                _uploaded_media("ref_image_6", hidden=True),
                _uploaded_media("ref_image_7", hidden=True),
                _uploaded_media("ref_image_8", hidden=True),
                _uploaded_media("ref_image_9", hidden=True),
                _uploaded_media("ref_video_1", hidden=True),
                _uploaded_media("ref_video_2", hidden=True),
                _uploaded_media("ref_video_3", hidden=True),
                _uploaded_media("ref_audio_1", hidden=True),
                _uploaded_media("ref_audio_2", hidden=True),
                _uploaded_media("ref_audio_3", hidden=True),
                _hidden_combo("task_type", ["auto", "t2va", "i2va", "l2va", "fl2va", "ref2va", "hybrid"], "auto"),
                _hidden_combo("audio_mode", ["native", "lock_source", "reference_only", "remix_source"], "lock_source"),
                _hidden_float("audio_denoise_strength", 0.0, 0.0, 1.0, 0.01, 0.01),
                # Match T8: 1 selects the first audio; 0 disables remapping.
                _hidden_int("drive_audio_ordinal", 1, 0, 6),
                # JZL's ref_scale: a pixel-area multiplier for reference media.
                # 1.0 keeps the official "never enlarge" behaviour; above 1.0
                # reference images/videos are upscaled before VAE encoding.
                _hidden_float("ref_image_scale", 1.0, 1.0, 5.0, 0.1),
                # match scales references to the generation canvas area; max
                # pins the short edge at 2048 regardless of the canvas.
                _hidden_combo("ref_image_size", ["match", "max"], "match"),
                # Keep this last so adding persistence does not shift legacy
                # widgets_values positions for any existing input.
                io.String.Input("gh_state_json", default="", optional=True, extra_dict={"hidden": True}),
                # Keep new inputs after every legacy widget so old workflow
                # widget-value positions remain unchanged.
                io.String.Input(
                    "prompt_override",
                    display_name="Prompt",
                    optional=True,
                    force_input=True,
                    tooltip="Optional upstream prompt; overrides the local prompt editor when connected",
                ),
                # Second-stage (upscale) sizing. Aspect always follows the first
                # stage so the two stay locked together; only the target budget
                # is a choice. Emitted as plain numbers, since the upscale node
                # downstream owns the actual resampling. Disabling the second
                # pass is done by bypassing that branch, not by a switch here.
                io.Float.Input(
                    "upscale_megapixels",
                    default=1.0,
                    min=0.1,
                    max=10.0,
                    step=0.1,
                    tooltip="Second-stage target megapixels, 0.1 to 10. The "
                            "aspect ratio always follows the first stage. Must "
                            "not be below the first-stage megapixels.",
                ),
                io.String.Input(
                    "segments_json",
                    default="",
                    optional=True,
                    extra_dict={"hidden": True},
                ),
            ],
            # A private socket type keeps the adapter as the only compatible
            # expansion node when dragging from this output.
            outputs=[io.Custom("MiniMax").Output(display_name=">")],
        )

    @classmethod
    def execute(cls, main_mode, aspect, megapixels, duration_seconds, clip_name, video_vae_name, audio_vae_name,
                prompt, first_frame, last_frame, hybrid_audio, ref_image_1, ref_image_2, ref_image_3,
                ref_image_4, ref_image_5, ref_image_6, ref_image_7, ref_image_8, ref_image_9,
                ref_video_1, ref_video_2, ref_video_3, ref_audio_1, ref_audio_2, ref_audio_3,
                task_type, audio_mode, audio_denoise_strength,
                drive_audio_ordinal, ref_image_scale, ref_image_size,
                gh_state_json="", prompt_override=None,
                upscale_megapixels=1.0, segments_json=""):
        # ComfyUI can replay an older hidden-widget snapshot as the literal
        # string "(none)". T8 treats this control as an int, with 0 disabling
        # remapping, so normalize it before calling the shared conditioning.
        drive_audio_ordinal = _coerce_int(drive_audio_ordinal, default=1, minimum=0, maximum=6)
        # This slot held the strict_prompt_tags boolean before ref_image_scale
        # replaced it. True/False coerce to 1.0 either way, so old graphs keep
        # the default behaviour instead of silently zooming references.
        ref_image_scale = _coerce_float(ref_image_scale, default=1.0, minimum=1.0, maximum=5.0)
        media_values = {
            "first_frame": first_frame, "last_frame": last_frame, "hybrid_audio": hybrid_audio,
            "ref_image_1": ref_image_1, "ref_image_2": ref_image_2, "ref_image_3": ref_image_3,
            "ref_image_4": ref_image_4, "ref_image_5": ref_image_5, "ref_image_6": ref_image_6,
            "ref_image_7": ref_image_7, "ref_image_8": ref_image_8, "ref_image_9": ref_image_9,
            "ref_video_1": ref_video_1, "ref_video_2": ref_video_2, "ref_video_3": ref_video_3,
            "ref_audio_1": ref_audio_1, "ref_audio_2": ref_audio_2, "ref_audio_3": ref_audio_3,
        }
        main_mode, prompt, media_values = _restore_ui_state(
            gh_state_json, main_mode, prompt, media_values
        )
        if prompt_override is not None:
            prompt = str(prompt_override)
        trigger_words = ""
        if gh_state_json:
            # 触发词由前端排队前烤进 gh_state_json（Toggle → 状态），不走执行
            # 连线：models number 选型反馈会与 lora 模型链成环。
            try:
                trigger_words = str(json.loads(gh_state_json).get("trigger_words") or "").strip()
            except (TypeError, ValueError):
                pass
        first_frame = media_values["first_frame"]
        last_frame = media_values["last_frame"]
        hybrid_audio = media_values["hybrid_audio"]
        ref_image_1, ref_image_2, ref_image_3 = (media_values[f"ref_image_{i}"] for i in range(1, 4))
        ref_image_4, ref_image_5, ref_image_6 = (media_values[f"ref_image_{i}"] for i in range(4, 7))
        ref_image_7, ref_image_8, ref_image_9 = (media_values[f"ref_image_{i}"] for i in range(7, 10))
        ref_video_1, ref_video_2, ref_video_3 = (media_values[f"ref_video_{i}"] for i in range(1, 4))
        ref_audio_1, ref_audio_2, ref_audio_3 = (media_values[f"ref_audio_{i}"] for i in range(1, 4))
        trim_ranges = _serialized_trim_ranges(gh_state_json)
        video_fps = _serialized_media_numbers(gh_state_json, "refFps", 1.0, 60.0)
        first = _load_image_file(first_frame)
        last = _load_image_file(last_frame)
        hybrid = _apply_audio_selection(
            _load_audio_file(hybrid_audio), trim_ranges.get("hybrid_audio")
        )
        # Hybrid uses the same H3-aligned timeline for the mux track, target
        # audio latent, and reference-audio condition. This prevents a longer
        # source file from giving the reference condition a different clock.
        effective_duration = calculate_length(duration_seconds) / 24.0
        hybrid = _trim_audio_to_duration(hybrid, effective_duration)
        # The dedicated Hybrid upload is the GH equivalent of T8's first
        # autogrow ref_audio input. Keep it as a reference and also provide it
        # as the internal drive track so Hybrid works without an <Audio N> tag.
        refs = {
            f"ref_image_{i}": loaded
            for i, value in enumerate(
                [ref_image_1, ref_image_2, ref_image_3, ref_image_4, ref_image_5,
                 ref_image_6, ref_image_7, ref_image_8, ref_image_9],
                1,
            )
            if (loaded := _load_image_file(value)) is not None
        }
        muted_video_slots = _serialized_muted_video_slots(gh_state_json)
        # 参考视频只解码一次（原始帧），单段与多段共用：
        # 单段取整条（或用户选区），多段按组顺序切分。
        video_components = {}
        for i, value in enumerate([ref_video_1, ref_video_2, ref_video_3], 1):
            if not value or value == "(none)":
                continue
            path = folder_paths.get_annotated_filepath(value)
            video_components[i] = VideoFromFile(path).get_components()

        def reference_video_frames(index, window, target_frames):
            """按时间窗（秒）从解码好的参考视频取帧，并应用上传帧率。"""
            components = video_components.get(index)
            if components is None:
                return None, None
            frames = _slice_video_frames(components.images, components.frame_rate, window)
            frames = _sample_video_frames(
                frames, components.frame_rate, target_frames,
                video_fps.get(f"ref_video_{index}", FPS),
            )
            audio = _apply_audio_selection(components.audio, window) if window else components.audio
            return frames, audio

        def reference_video_audio(index, soundtrack, window):
            """配对音轨按「实际取用的时间跨度」裁，与上传帧率无关。

            音轨长度绝不能跟着重采样后的帧数走：降帧率只是少喂视频帧，
            不影响这段音频在时间轴上有多长；否则驱动音频会被一起截短，
            后面的段就切不到音频了。
            """
            if soundtrack is None or f"ref_video_{index}" in muted_video_slots:
                return None
            if window is None:
                return soundtrack
            return _trim_audio_to_duration(soundtrack, max(0.0, float(window[1]) - float(window[0])))

        ref_videos, video_audio = {}, {}
        for index in sorted(video_components):
            window = trim_ranges.get(f"ref_video_{index}")
            frames, soundtrack = reference_video_frames(
                index, window, calculate_length(duration_seconds)
            )
            if frames is not None:
                ref_videos[f"ref_video_{index}"] = frames
                paired = reference_video_audio(index, soundtrack, window)
                if paired is not None:
                    video_audio[f"ref_video_audio_{index}"] = paired
        audios = [
            _trim_audio_to_duration(
                _apply_audio_selection(
                    _load_audio_file(value), trim_ranges.get(f"ref_audio_{index}")
                ),
                effective_duration,
            )
            for index, value in enumerate([ref_audio_1, ref_audio_2, ref_audio_3], 1)
        ]
        audios = {f"ref_audio_{i}": value for i, value in enumerate(audios, 1) if value is not None}
        ordered_drive_audios = [
            video_audio[f"ref_video_audio_{i}"]
            for i in range(1, 4)
            if f"ref_video_audio_{i}" in video_audio
        ] + list(audios.values())
        if (
            main_mode == "all_reference"
            and audio_mode == "lock_source"
            and drive_audio_ordinal == 0
            and ordered_drive_audios
        ):
            drive_audio_ordinal = 1
        selected_drive_audio = (
            ordered_drive_audios[drive_audio_ordinal - 1]
            if main_mode == "all_reference" and 0 < drive_audio_ordinal <= len(ordered_drive_audios)
            else None
        )
        internal_drive_audio = hybrid if main_mode == "text_keyframes" and hybrid is not None else selected_drive_audio

        visual_source = None
        serialized_first_visual = _serialized_first_visual_name(gh_state_json, main_mode)
        if main_mode == "text_keyframes":
            if serialized_first_visual and first_frame == serialized_first_visual:
                visual_source = first
            elif serialized_first_visual and last_frame == serialized_first_visual:
                visual_source = last
            else:
                visual_source = first if first is not None else last
        else:
            if serialized_first_visual:
                for slot, filename in ((f"ref_video_{i}", value) for i, value in enumerate(
                    [ref_video_1, ref_video_2, ref_video_3], 1
                )):
                    if filename == serialized_first_visual:
                        visual_source = ref_videos.get(slot)
                        break
                if visual_source is None:
                    for slot, filename in ((f"ref_image_{i}", value) for i, value in enumerate(
                        [ref_image_1, ref_image_2, ref_image_3, ref_image_4, ref_image_5, ref_image_6, ref_image_7, ref_image_8, ref_image_9], 1
                    )):
                        if filename == serialized_first_visual:
                            visual_source = refs.get(slot)
                            break
            ordered_visual_values = [
                ref_videos.get(f"ref_video_{i}") for i in range(1, 4)
            ] + [
                refs.get(f"ref_image_{i}") for i in range(1, 10)
            ]
            for value in (() if visual_source is not None else ordered_visual_values):
                if value is not None:
                    visual_source = value
                    break
        if visual_source is not None:
            source_height, source_width = int(visual_source.shape[1]), int(visual_source.shape[2])
        else:
            source_width = source_height = None
        width, height = calculate_canvas(aspect, megapixels, source_width, source_height)
        # 时间条有分组时，时长由分组决定；单组视为单段，只覆盖时长
        if segments_json:
            _single_group = _parse_prompt_groups(segments_json)
            if len(_single_group) == 1:
                duration_seconds = float(_single_group[0].get("duration") or duration_seconds)
        length = calculate_length(duration_seconds)
        # Second stage reuses the first stage's resolved aspect rather than the
        # raw selection, so an "adaptive" first stage still gives the upscale a
        # concrete ratio to hold. Setting both megapixel budgets equal makes the
        # downstream upscale a no-op; the second pass itself is disabled by
        # bypassing that branch.
        if float(upscale_megapixels) < float(megapixels):
            raise ValueError(
                f"二采百万像素 ({float(upscale_megapixels):g}) 不能低于"
                f"一采百万像素 ({float(megapixels):g})；二采是放大阶段，请把二采调高。"
            )
        upscale_width, upscale_height = calculate_canvas(
            aspect, upscale_megapixels, source_width, source_height
        )
        clip = nodes.CLIPLoader().load_clip(clip_name, "minimax")[0]
        video_vae = nodes.VAELoader().load_vae(video_vae_name)[0]
        audio_vae = nodes.VAELoader().load_vae(audio_vae_name)[0]

        if main_mode == "text_keyframes":
            refs, ref_videos, video_audio = {}, {}, {}
            audios = {"ref_audio_1": hybrid} if hybrid is not None else {}
        elif main_mode == "all_reference":
            # Keep keyframe uploads in the workflow state so switching back
            # does not lose them, but do not feed them into Ref2VA execution.
            first, last, hybrid = None, None, None
        elif hybrid is not None:
            audios["ref_audio_1"] = hybrid

        # Only keyframe Hybrid has an internal drive track. Reference-only
        # mode must always let the model generate audio.
        if internal_drive_audio is None:
            audio_mode = "native"
        is_original_audio = audio_mode == "lock_source"
        effective_duration = length / 24.0
        final_audio = _trim_audio_to_duration(internal_drive_audio, effective_duration)

        try:
            if segments_json:
                groups = _parse_prompt_groups(segments_json)
                # 空提示词的组必须显式报错：静默丢弃会让后面的段整体前移一个
                # 时间槽，用户看到的就是"提示词串了"
                try:
                    _raw_groups = json.loads(segments_json)
                except (TypeError, ValueError):
                    _raw_groups = []
                _empty_slots = [
                    pos + 1 for pos, item in enumerate(_raw_groups if isinstance(_raw_groups, list) else [])
                    if not str((item or {}).get("prompt") or "").strip()
                ]
                if _empty_slots and len(groups) < len(_raw_groups):
                    raise ValueError(
                        f"多段模式：第 {_empty_slots} 组的提示词是空的。"
                        "空组会被跳过并导致后面的段时间错位，请给每组都填提示词，"
                        "或删掉多余的组。"
                    )
                if len(groups) >= 2:
                    # 多段模式：按组建条件（驱动/合成音频按段切片保持 BGM
                    # 连续），条件组和空 AV latent 打包进 bundle，采样交给
                    # ✨ BlackRin 多段采样 节点（latent 级段间接续在那里做）。
                    conditionings, av_latents, trims = [], [], []
                    cursor = 0
                    video_cursor = 0.0
                    total_visible = 0
                    try:
                        gh_state = json.loads(gh_state_json)
                    except (TypeError, ValueError):
                        gh_state = {}
                    fps = max(1, int(gh_state.get("fps") or 24)) if isinstance(gh_state, dict) else 24
                    group_guides_cfg = _serialized_group_guides(gh_state_json)
                    # lock_source 需要驱动音频覆盖全片：在编码前先把总账算清，
                    # 免得烧完几十秒编码才在某一组报 "requires drive_audio"。
                    if audio_mode == "lock_source" and internal_drive_audio is not None:
                        drive_wave = internal_drive_audio.get("waveform")
                        drive_samples = int(drive_wave.shape[-1]) if drive_wave is not None else 0
                        drive_rate = max(1, int(internal_drive_audio.get("sample_rate") or 1))
                        drive_seconds = drive_samples / drive_rate
                        planned_seconds = sum(
                            align_frame_count(max(
                                5, round(float(group.get("duration") or duration_seconds) * fps)
                            )) / fps
                            for group in groups
                        )
                        if drive_samples <= 0:
                            raise ValueError(
                                "多段模式：音频模式为 lock_source，但驱动音频是空的。"
                                "请在参考视频/参考音频里提供完整音轨，或把音频模式改为 native。"
                            )
                        if drive_seconds < planned_seconds - 0.05:
                            raise ValueError(
                                f"多段模式：lock_source 的驱动音频只有 {drive_seconds:.2f}s，"
                                f"盖不住全部 {len(groups)} 组共 {planned_seconds:.2f}s。"
                                "请提供更长的驱动音频、调短各组时长，或把音频模式改为 native。"
                            )
                    accumulated_tokens = 0
                    for index, group in enumerate(groups):
                        visible = align_frame_count(max(
                            5, round(float(group.get("duration") or duration_seconds) * fps)
                        ))
                        want_cont = index > 0 and groups[index].get("cont", True) is not False
                        pin = max(
                            5, align_frame_count_down(min(DEFAULT_PIN_FRAMES, visible))
                        ) if want_cont else 0
                        # 段间拼接要保持解码相位：头部裁剪量会被补到与已累加 token
                        # 同相位，最多多裁 4 个 token。这里把那段余量按【本段实际
                        # 需要的 extra token】算准，而不是固定留一个 17 帧周期——
                        # 否则每段都白采十几帧（约 10~20 秒/段）。
                        if index == 0:
                            total = visible
                        else:
                            base_tokens = video_latent_t(pin) if pin else 0
                            want = accumulated_tokens % 5
                            extra = next(
                                e for e in range(5) if (base_tokens + e) % 5 == want
                            )
                            head_frames = frames_for_tokens(base_tokens + extra)
                            total = align_frame_count(visible + head_frames)
                        # 参考视频按组顺序切分：第 i 组取源视频 [游标, 游标+本组时长)；
                        # 用户在前端设的选区作为整条时间轴的起点。取不到足够帧
                        # （源视频比总输出短）时，该组就不带这条参考。
                        group_seconds = visible / fps
                        seg_videos, seg_video_audios = {}, {}
                        for video_index in sorted(video_components):
                            base_range = trim_ranges.get(f"ref_video_{video_index}")
                            start = (base_range[0] if base_range else 0.0) + video_cursor
                            window = (start, start + group_seconds)
                            frames, soundtrack = reference_video_frames(
                                video_index, window, visible
                            )
                            if frames is None or frames.shape[0] < 5:
                                continue
                            seg_videos[f"ref_video_{video_index}"] = frames
                            paired = reference_video_audio(video_index, soundtrack, window)
                            if paired is not None:
                                seg_video_audios[f"ref_video_audio_{video_index}"] = paired
                        # 本组的中段引导图：组内秒数 → 采样 latent 里的像素帧号。
                        # 第 2 组起的 latent 头部有 pin 帧（接续引导，导出时会被裁掉），
                        # 所以引导图要加上 head 偏移，否则会锚进被裁掉的那段里。
                        group_guides = []
                        for name, seconds in group_guides_cfg.get(index, ()):
                            guide = _load_image_file(name)
                            if guide is None:
                                continue
                            frame_idx = int(round(min(seconds, group_seconds) * fps))
                            frame_idx = min(max(0, frame_idx), visible - 1) + pin
                            group_guides.append((guide, frame_idx))
                        seg_kwargs = {
                            "task_type": "auto",
                            "audio_mode": audio_mode,
                            "audio_denoise_strength": audio_denoise_strength,
                            "add_source_as_reference": True,
                            "ref_image_size": ref_image_size,
                            "ref_image_zoom": ref_image_scale,
                            "drive_audio": _slice_drive_audio(
                                internal_drive_audio, cursor, visible, fps
                            ),
                            "final_audio": _slice_drive_audio(final_audio, cursor, visible, fps),
                            "first_frame": first,
                            "last_frame": last,
                            "ref_images": refs,
                            "ref_videos": seg_videos,
                            "ref_video_audios": seg_video_audios,
                            "ref_audios": audios,
                            "guide_images": group_guides,
                        }
                        _t_enc = time.perf_counter()
                        result = build_conditioning(
                            clip, video_vae, audio_vae,
                            _prepend_trigger_words(group["prompt"], trigger_words),
                            width, height, total, **seg_kwargs,
                        )
                        logging.info(
                            "BlackRin 多段：段 %d/%d 条件编码 %.1fs（%d 帧）",
                            index + 1, len(groups), time.perf_counter() - _t_enc, total,
                        )
                        conditionings.append(result[0])
                        av_latents.append(result[1])
                        trims.append([pin, visible])
                        cursor += visible
                        video_cursor += group_seconds
                        total_visible += visible
                        accumulated_tokens += video_latent_t(visible)
                    # 二采条件：全部段提示词合并成一份"完整剧本"后单独编码，
                    # 供分块放大链全程使用（文字覆盖全片；参考视频用整条，
                    # 因为按组切分是逐段生成的事，二采跑的是全片）
                    joined_prompt = chr(10).join(
                        str(g.get("prompt") or "").strip() for g in groups
                    ).strip() or groups[0]["prompt"]
                    joined_prompt = _prepend_trigger_words(joined_prompt, trigger_words)
                    upscale_mode = str(gh_state.get("upscale_mode") or "merge")
                    up_kwargs = dict(seg_kwargs)
                    up_kwargs["drive_audio"] = None
                    up_kwargs["final_audio"] = None
                    # 二采条件不带驱动/合成音频，音频模式必须一起回到 native：
                    # lock_source 之类需要驱动音频的模式在这里没有驱动源，
                    # conditioning 会直接报 "requires drive_audio"。
                    up_kwargs["audio_mode"] = "native"
                    up_kwargs["ref_videos"] = ref_videos
                    up_kwargs["ref_video_audios"] = video_audio
                    up_positive = None
                    if upscale_mode == "first":
                        # 快速模式：直接复用第 1 段条件（省一次长文本编码，约 1-1.5 分钟）
                        up_positive = conditionings[0]
                        logging.info("BlackRin 多段：二采条件复用第 1 段（upscale_mode=first）")
                    else:
                        _t_up = time.perf_counter()
                        up_result = build_conditioning(
                            clip, video_vae, audio_vae, joined_prompt,
                            width, height, total_visible, **up_kwargs,
                        )
                        up_positive = up_result[0]
                        logging.info(
                            "BlackRin 多段：二采条件（合并剧本）编码 %.1fs（%d 帧）",
                            time.perf_counter() - _t_up, total_visible,
                        )
                    logging.info(
                        "BlackRin 多段条件编码完成：%d 组（合计 %d 帧 ≈ %.1f 秒 @24fps）",
                        len(groups), total_visible, total_visible / 24.0,
                    )
                    bundle = {
                        "internal": True,
                        "conditionings": conditionings,
                        "av_latents": av_latents,
                        "trims": trims,
                        "video_vae": video_vae, "audio_vae": audio_vae,
                        "models_number": _mode_model_number(main_mode),
                        "mux_audio": None, "is_original_audio": is_original_audio,
                        "upscale_width": upscale_width, "upscale_height": upscale_height,
                        "total_frames": total_visible,
                        "upscale_positive": up_positive,
                    }
                    return io.NodeOutput(bundle)
            single_guides = []
            for name, seconds in _serialized_group_guides(gh_state_json).get(0, ()):
                guide = _load_image_file(name)
                if guide is None:
                    continue
                single_guides.append((guide, min(int(round(seconds * 24)), length - 1)))
            result = build_conditioning(
                clip, video_vae, audio_vae, _prepend_trigger_words(prompt, trigger_words),
                width, height, length,
                "auto", audio_mode, audio_denoise_strength, True,
                ref_image_size, ref_image_scale, internal_drive_audio, final_audio,
                first, last, refs, ref_videos, video_audio, audios,
                guide_images=single_guides,
            )
        finally:
            _release_text_encoder(clip)
            clip = None
        bundle = {
            "positive": result[0], "av_latent": result[1], "mux_audio": result[2],
            "video_vae": video_vae, "audio_vae": audio_vae,
            "width": width, "height": height, "length": length,
            "duration_seconds": duration_seconds, "resolved_mode": main_mode,
            "is_original_audio": is_original_audio,
            "upscale_width": upscale_width, "upscale_height": upscale_height,
        }
        return io.NodeOutput(bundle)


def _slice_drive_audio(audio, start_frame: int, frame_count: int, fps: int = 24):
    """把整片的驱动/合成音频按段起点切片，保持多段间 BGM 连续。"""
    if audio is None or audio.get("waveform") is None:
        return None
    sr = int(audio["sample_rate"])
    start = round(start_frame / float(fps) * sr)
    end = round((start_frame + frame_count) / float(fps) * sr)
    wave = audio["waveform"][..., start:end]
    if wave.shape[-1] <= 0:
        return None
    return {"waveform": wave, "sample_rate": sr}


def _prepend_trigger_words(prompt: str, trigger_words: str) -> str:
    """触发词在执行期前置到最终提示词；不进编辑器，所以不会被提示词优化改写。"""
    prompt = prompt.strip()
    if not trigger_words:
        return prompt
    return f"{trigger_words}\n{prompt}" if prompt else trigger_words


def _serialized_group_guides(gh_state_json):
    """每组的「中段引导图」：{组下标: [(文件名, 组内秒数), ...]}。

    前端存在 gh_state.guides 里；组内秒数在调用端换算成绝对像素帧号。
    """
    if not gh_state_json or gh_state_json == "(none)":
        return {}
    try:
        state = json.loads(gh_state_json)
    except (TypeError, ValueError, json.JSONDecodeError):
        return {}
    raw = state.get("guides") if isinstance(state, dict) else None
    if not isinstance(raw, dict):
        return {}
    out = {}
    for key, items in raw.items():
        try:
            group_index = int(key)
        except (TypeError, ValueError):
            continue
        entries = []
        for item in items if isinstance(items, list) else []:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "").strip()
            if not name:
                continue
            try:
                seconds = float(item.get("seconds") or 0)
            except (TypeError, ValueError):
                continue
            entries.append((name, max(0.0, seconds)))
        if entries:
            out[group_index] = entries
    return out


def _parse_prompt_groups(segments_json: str) -> list[dict]:
    if not segments_json:
        return []
    try:
        data = json.loads(segments_json)
    except (TypeError, ValueError):
        return []
    groups = []
    for item in data if isinstance(data, list) else []:
        if isinstance(item, dict) and str(item.get("prompt") or "").strip():
            groups.append({
                "prompt": str(item["prompt"]),
                "duration": float(item.get("duration") or 0),
                "cont": item.get("cont") is not False,
            })
    return groups


class BlackRin_MiniMaxH3Adapter(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="BlackRin_MiniMaxH3Adapter",
            category=NODE_CATEGORY,
            inputs=[io.Custom("MiniMax").Input("integration", display_name="<")],
            outputs=[
                io.Conditioning.Output("positive"), io.Latent.Output("av_latent"),
                io.Vae.Output("video_vae"), io.Vae.Output("audio_vae"), io.Int.Output("models number"),
                io.Audio.Output("mux_audio"), io.Boolean.Output("is_original_audio"),
                io.Int.Output(
                    "upscale_width",
                    tooltip="Second-stage target width; equals the first-stage width while upscale is off.",
                ),
                io.Int.Output(
                    "upscale_height",
                    tooltip="Second-stage target height; equals the first-stage height while upscale is off.",
                ),
                io.Int.Output(
                    "total_frames",
                    tooltip="Total frame count for the clip, already snapped to the model's 17k+5 grid.",
                ),
                io.Int.Output(
                    "trims",
                    display_name="接续裁剪帧",
                    tooltip="多段模式下每段的 [接续引导帧数, 期望导出帧数]（列表）；"
                            "单段模式为 0。接 ✨ BlackRin 多段采样。",
                ),
                io.Conditioning.Output(
                    "upscale_positive",
                    display_name="二采条件",
                    tooltip="多段模式下供二采放大链使用的单份条件"
                            "（取第 1 段：参考图各段一致）。",
                ),
            ],
        )

    @classmethod
    def execute(cls, integration):
        if integration.get("internal"):
            # 多段模式：正向条件/AV 潜空间/裁剪帧数按组以列表递出，
            # ✨ BlackRin 多段采样 在画布原采样位置接手做段间接续采样；
            # 其余出口（VAE 等）照常供解码/二采链使用。
            return io.NodeOutput(
                integration.get("conditionings"),
                integration.get("av_latents"),
                integration.get("video_vae"), integration.get("audio_vae"),
                integration.get("models_number"),
                integration.get("mux_audio"), integration.get("is_original_audio"),
                integration.get("upscale_width"), integration.get("upscale_height"),
                integration.get("total_frames"),
                integration.get("trims"),
                integration.get("upscale_positive"),
            )
        first_width = int(integration.get("width") or 0)
        first_height = int(integration.get("height") or 0)
        return io.NodeOutput(
            integration["positive"], integration["av_latent"],
            integration["video_vae"], integration["audio_vae"],
            _mode_model_number(integration.get("resolved_mode")),
            integration["mux_audio"], bool(integration.get("is_original_audio", False)),
            int(integration.get("upscale_width") or first_width),
            int(integration.get("upscale_height") or first_height),
            int(integration.get("length") or 0),
            0,
            integration["positive"],
        )


class BlackRin_MultiSegmentSampler(io.ComfyNode):
    """✨ BlackRin 多段采样：站在原采样位置，逐段采样并做段间接续。

    多段模式下适配器递来的是条件/latent/裁剪帧数的列表；单段模式是
    单个值。本节点两种都收：逐段调官方 custom-sampler 链（BasicGuider
    蒸馏路径），段间把上一段采样 latent 的尾部钉进下一段开头做接续
    引导（参考图 refs 原样生效），最后拼接全片 AV latent。
    """

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="BlackRin_MultiSegmentSampler",
            category=NODE_CATEGORY,
            description="Multi-segment sampler: replaces BasicGuider + "
                        "SamplerCustomAdvanced. Samples the integration's "
                        "prompt-group conditionings consecutively, pinning "
                        "each segment's tail into the next as continuation.",
            inputs=[
                io.Model.Input("model", display_name="模型"),
                io.Sigmas.Input("sigmas", display_name="噪声表"),
                io.Conditioning.Input("positive", display_name="正向条件"),
                io.Latent.Input("latent", display_name="AV潜空间"),
                io.Int.Input("trims", display_name="接续裁剪帧", force_input=True),
                io.Sampler.Input("sampler", display_name="采样器", optional=True,
                                 tooltip="接画布的 K采样器选择；不接则用下面的 sampler_name"),
                io.Int.Input(
                    "seed",
                    default=0,
                    min=0,
                    max=2**32 - 1,
                    step=1,
                    extra_dict={"control_after_generate": True},
                ),
            ],
            outputs=[
                io.Latent.Output("latents", display_name="全片latent"),
                io.String.Output("multi_report", display_name="报告"),
            ],
        )

    @classmethod
    def execute(cls, model, sigmas, positive, latent, trims, sampler, seed):
        # trims 兼作模式判别：多段时适配器递列表，单段是单个数
        if isinstance(trims, list):
            positives, latents = positive, latent
        else:
            positives, latents, trims = [positive], [latent], [trims]
        if not isinstance(positives, list) or len(positives) != len(latents):
            raise ValueError("多段采样：正向条件与 AV 潜空间的组数不一致")
        latents_out, reports = sample_multi_segment(
            positives, latents, trims,
            model=model, sigmas=sigmas, seed=seed, sampler_obj=sampler,
        )
        return io.NodeOutput(latents_out, "\n".join(reports))
