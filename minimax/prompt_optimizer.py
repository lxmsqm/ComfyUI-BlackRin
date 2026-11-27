from __future__ import annotations

import asyncio
import base64
from difflib import SequenceMatcher
import ipaddress
import json
import logging
import os
from pathlib import Path
import re
import shutil
import tempfile
import threading
import urllib.error
import urllib.parse
import urllib.request

import aiohttp
from aiohttp import web
import folder_paths
from server import PromptServer

from .. import blackrin_config


# 输出语言不再做成开关：写哪种语言由「优化规则」决定，规则为空时一律走下面这套
# 中文系统提示词 + 中文后处理兜底。
MAX_TOKENS_FLOOR = 512
MAX_TOKENS_CEILING = 32768
DEFAULT_MAX_TOKENS = 8192

DEFAULT_CONFIG = {
    "provider": "assistant",
    "api_url": "",
    "api_key": "",
    "model": "openai/gpt-5.6-sol",
    "protocol": "openai",
    "read_media": True,
    "unload_after": False,
    "max_tokens": DEFAULT_MAX_TOKENS,
    "auto_optimize": False,
}
PROVIDERS = {
    "openai": ("https://api.openai.com/v1", "gpt-4.1-mini", "openai"),
    "gemini": ("https://generativelanguage.googleapis.com/v1beta", "gemini-2.5-flash", "gemini"),
    "openrouter": ("https://openrouter.ai/api/v1", "google/gemini-2.5-flash", "openai"),
    "dashscope": ("https://dashscope.aliyuncs.com/compatible-mode/v1", "qwen-vl-max", "openai"),
    "siliconflow": ("https://api.siliconflow.cn/v1", "Qwen/Qwen2.5-VL-72B-Instruct", "openai"),
}
_ROUTES_REGISTERED = False
_ACTIVE_REQUESTS: dict[str, asyncio.Task] = {}
_ACTIVE_CANCEL_EVENTS: dict[str, threading.Event] = {}
_ASYNC_OPTIMIZER_JOBS: dict[str, asyncio.Task] = {}


def _optimizer_services() -> list[dict]:
    """优化器可用的在线服务：BlackRin 自己的 + 提示词小助手的（同名以自己为准）。

    base_url/api_key 只在服务端流转；公开的 config 接口只暴露名称与模型列表。
    """
    return blackrin_config.optimizer_services()


def _resolve_assistant_provider(config: dict) -> dict:
    """Swap the assistant provider for the concrete OpenAI-compatible service."""
    services = _optimizer_services()
    if not services:
        raise RuntimeError(
            "未找到提示词小助手服务配置，请确认 prompt-assistant 插件的 "
            "user/default/prompt-assistant/config/config.json 中已配置 model_services"
        )
    wanted = str(config.get("assistant_service") or "")
    service = next((item for item in services if item["name"] == wanted), None) or services[0]
    model = str(config.get("model") or "")
    if not model or (service["models"] and model not in service["models"]):
        model = service["models"][0] if service["models"] else ""
    if not model:
        raise RuntimeError(f"提示词小助手服务「{service['name']}」没有可用模型")
    return {
        **config,
        "api_url": service["base_url"],
        "api_key": service["api_key"],
        "protocol": "openai",
        "model": model,
    }


def _optimizer_rules() -> list[dict]:
    """优化器可用的规则（BlackRin 自己的 + 小助手的，图片规则在前）。"""
    return blackrin_config.optimizer_rules()


def _clamp_max_tokens(value) -> int:
    """把最大输出 tokens 收进 [512, 32768]；坏值回落默认值。"""
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = DEFAULT_MAX_TOKENS
    return max(MAX_TOKENS_FLOOR, min(MAX_TOKENS_CEILING, number))


def _normalize_config(data: dict | None) -> dict:
    current = DEFAULT_CONFIG
    data = data if isinstance(data, dict) else {}
    provider = str(data.get("provider") or current["provider"]).lower()
    preset = PROVIDERS.get(provider)
    api_keys = data.get("api_keys") if isinstance(data.get("api_keys"), dict) else {}
    # 优先用「当前服务商对应的那把 key」，避免切换服务商后把上一家的 key
    # 发到新地址；旧工作流只存了通用 api_key 时回落到它。
    provider_api_key = api_keys.get(provider)
    api_key = provider_api_key if provider_api_key is not None else (
        data.get("api_key") if "api_key" in data else current["api_key"]
    )
    provider_models = data.get("provider_models") if isinstance(data.get("provider_models"), dict) else {}
    provider_model = provider_models.get(provider)
    max_tokens = _clamp_max_tokens(data.get("max_tokens", current.get("max_tokens", DEFAULT_MAX_TOKENS)))
    config = {
        "provider": provider,
        "assistant_service": str(data.get("assistant_service") or "").strip(),
        "rule": str(data.get("rule") or "").strip(),
        "api_url": str(data.get("api_url") or (preset[0] if preset else current["api_url"])).strip(),
        "api_key": str(api_key or ""),
        "api_keys": {str(key): str(value or "") for key, value in api_keys.items()},
        "model": str(provider_model or data.get("model") or (preset[1] if preset else current["model"])).strip(),
        "provider_models": {str(key): str(value or "") for key, value in provider_models.items()},
        "protocol": str(data.get("protocol") or (preset[2] if preset else current["protocol"])).lower(),
        "read_media": bool(data.get("read_media", current["read_media"])),
        "unload_after": bool(data.get("unload_after", current.get("unload_after", False))),
        "max_tokens": max_tokens,
        "auto_optimize": bool(data.get("auto_optimize", current.get("auto_optimize", False))),
    }
    return config


def _public_config(config: dict) -> dict:
    return {
        **config,
        "api_key": "",
        "has_api_key": bool(config.get("api_key")),
        "assistant_services": [
            {"name": service["name"], "models": service["models"]}
            for service in _optimizer_services()
        ],
        "assistant_rules": [item["name"] for item in _optimizer_rules()],
    }


def _resolve_input_file(name: str) -> Path:
    value = str(name or "").strip()
    if not value:
        raise ValueError("参考素材文件名为空")
    annotated = folder_paths.get_annotated_filepath(value)
    if annotated and os.path.isfile(annotated):
        return Path(annotated)
    path = Path(folder_paths.get_input_directory()) / value
    if path.is_file():
        return path
    raise FileNotFoundError(f"找不到参考素材: {value}")


def _ffmpeg_path() -> str:
    found = shutil.which("ffmpeg")
    if found:
        return found
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as error:
        raise RuntimeError("参考视频预处理需要 FFmpeg，但当前 ComfyUI 环境未找到 FFmpeg") from error


def _endpoint(config: dict) -> str:
    base = config["api_url"].rstrip("/")
    if config["protocol"] == "gemini":
        if re.search(r":generateContent(?:\?|$)", base):
            return base
        return f"{base}/models/{urllib.parse.quote(config['model'], safe='-_.')}:generateContent"
    if config["protocol"] == "responses":
        return base if base.endswith("/responses") else f"{base}/responses"
    if base.endswith("/chat/completions"):
        return base
    return f"{base}/chat/completions"


def _node_anchor_note(context: dict, duration: float) -> str:
    """把节点提供的锚点事实（关键帧）渲染成附加说明。

    自定义规则会整体替换内置系统提示，但"第几秒锚了哪张图"是节点事实，
    无论用哪套规则都必须告知模型，否则会写出与锚定画面冲突的提示词。
    """
    if not isinstance(context, dict):
        return ""
    lines: list[str] = []
    for item in context.get("keyframes") or []:
        if not isinstance(item, dict):
            continue
        label = str(item.get("label") or "").strip()
        role = str(item.get("role") or "").strip()
        if not label:
            continue
        when = ("the exact first frame at 0.00s" if role == "exact_first_frame"
                else f"the exact last frame at {duration:.2f}s" if role == "exact_last_frame"
                else "a visual keyframe anchor")
        lines.append(f"- {label} is {when}.")
    if not lines:
        return ""
    return (
        "\n\nNode-supplied anchor facts (these override anything above if they conflict):\n"
        + "\n".join(lines)
        + "\nKeep the described moments consistent with what those anchored images show "
          "(subjects, wardrobe, pose, framing, lighting, style). Do not invent anchors that "
          "were not listed, and do not call them first or last frames unless stated."
    )


def _system_prompt(
    task: str,
    duration: float,
    labels: list[str],
    context: dict | None = None,
    user_prompt: str = "",
) -> str:
    task_upper = task.upper()
    fl2va = task_upper == "FL2VA"
    full_reference = task_upper in {"REF2VA", "HYBRID"}
    context = context if isinstance(context, dict) else {}
    label_rule = (
        "FL2VA picture labels must be bare lowercase: picture 1 and picture 2, never angle brackets. "
        "This is a mandatory content requirement, not merely a label-format example: the final prompt must explicitly "
        "contain both exact tokens 'picture 1' and 'picture 2'. The first line must state that picture 1 is the exact "
        f"opening-frame anchor at 0.00s and picture 2 is the exact ending-frame anchor at {duration:.2f}s. Never omit, "
        "rename, translate, capitalize, or replace either token, even when the requested output language is Chinese."
        if fl2va else
        "All media labels must use angle brackets exactly, for example <picture 1>, <video 1>, <audio 1>."
    )
    if full_reference:
        structure = (
            "Return exactly these six sections in this order, with each heading followed by a colon: "
            "subject_definitions, summary, retention_analysis, detailed_description, overall_soundscape, "
            "non_diegetic_music. Formatting is strict: every section heading must occupy its own line; put a newline "
            "immediately after the colon, write that section's content on the following line, and put one blank line "
            "between sections. Never place a heading and its content on the same line, and never join multiple sections "
            "into one paragraph. In subject_definitions, define reusable visible content as <Subject N> and cite "
            "its source label using one short sentence and no more than four identifying visual traits; define "
            "standalone <Picture N> only for a concrete frame anchor. In summary, use one sentence beginning "
            "with a square-bracketed combination of only the relationships that apply: keyframe completion, "
            "reference generation, video editing, video continuation, audio reuse, or audio reference. In "
            "retention_analysis, write one compact line per label and use fully_preserved, partially_preserved, "
            "attribute_transfer, or weak_reference for visual content, and fully_copy, partially_copy, reference, "
            "or weak_reference for audio. A relationship marker alone is never a complete entry. Every line must use "
            "the exact form '<label>: marker - explanation' and add a concise, concrete explanation after the hyphen. "
            "For fully_preserved, state which identity, appearance, scene, composition, or structural properties remain "
            "unchanged in the target. For attribute_transfer, state exactly which appearance, motion, scene, camera, "
            "timing, or structural attributes transfer from the reference and which target receives them. For audio, "
            "state whether the complete signal is copied unchanged, only selected portions or layers are copied, or "
            "only timbre, rhythm, delivery, or other specified attributes are referenced. Use enough information to "
            "make each reference relationship operational, normally one full sentence per label, but do not repeat an "
            "exhaustive appearance inventory already stated in subject_definitions. Never output bare entries such as "
            "'<picture 1>: fully_preserved', '<video 1>: attribute_transfer', or '<audio 1>: fully_copy'. "
            "Make detailed_description action-first, chronological, and production-ready. Give the scene a clear "
            "dramatic progression—establishment, development, a meaningful visual or emotional beat, and a resolved "
            "ending—without changing the user's intended event. Describe subject blocking, observable state changes, "
            "composition, camera movement, and the final visual landing. Use [Shot 1] and timed later shots only for "
            "motivated real cuts that reveal new information; otherwise design a fluid continuous shot. Normally allow "
            "about 350-700 Chinese characters or 220-450 English words for the complete six-section result, and use "
            "more when duration, dialogue, multiple subjects, or genuine shot complexity requires it."
        )
    else:
        structure = (
            "Return exactly these three sections in order: integrated_multimodal_description, overall_soundscape, "
            "non_diegetic_music. Formatting is strict: every section heading must occupy its own line; put a newline "
            "immediately after the colon, write that section's content on the following line, and put one blank line "
            "between sections. Never place a heading and its content on the same line. Build a complete audiovisual "
            "progression rather than merely paraphrasing the user's sentence. Use [Shot 1] for the opening and "
            "timestamps only for motivated real later cuts. For I2VA, "
            "anchor the supplied picture at 0.00s and develop forward. For L2VA, infer a plausible opening and "
            "converge exactly to the supplied picture at the end. For FL2VA, describe one continuous, observable "
            "motion path from picture 1 at 0.00s to picture 2 at the target end time. Give the main description enough "
            "detail to establish the opening composition, action onset, intermediate development, camera evolution, "
            "and a visually resolved ending within the supplied duration. In FL2VA, mention picture 1 again when "
            "establishing the opening state and picture 2 again when describing the final visual landing; both labels "
            "are compulsory and must not be replaced by generic phrases such as 'the first image' or 'the last image'."
        )

    keyframe_lines = []
    for item in context.get("keyframes") or []:
        if not isinstance(item, dict) or not item.get("label") or not item.get("role"):
            continue
        role_text = {
            "exact_first_frame": "is the exact first-frame anchor at 0.00s",
            "exact_last_frame": f"is the exact last-frame anchor at {duration:.2f}s",
            "keyframe": "is a concrete visual keyframe anchor",
        }.get(str(item["role"]), "is a visual reference")
        keyframe_lines.append(f"{item['label']} {role_text}")
    keyframe_rule = (
        "Keyframe roles supplied by the node: " + "; ".join(keyframe_lines) + ". Preserve these roles exactly."
        if keyframe_lines else
        "No concrete keyframe role was supplied by the node; do not invent one."
    )

    audio_mode = str(context.get("audio_mode") or "native")
    audio_rule = {
        "lock_source": (
            "Audio mode is original-audio output. State only that the source video's original audio is preserved "
            "unchanged as the complete target soundtrack and mark it fully_copy. Because the optimizer does not "
            "receive or hear the audio binary, do not identify, describe, classify, or invent any dialogue, music, "
            "ambience, sound effect, instrument, language, rhythm, or other audible content. In overall_soundscape, "
            "write only the selected-language equivalent of 'Preserve the source video's original audio unchanged.' "
            "Do not add any new sound, voice, animal vocalization, ambience, or music."
        ),
        "reference_only": (
            "Audio mode is reference-only: treat supplied audio as audio reference; do not claim its waveform "
            "is copied into the final soundtrack."
        ),
        "remix_source": (
            "Audio mode is source-audio remix: describe only partial copying or remixing of the supplied audio, "
            "never a 1:1 complete copy."
        ),
        "native": "Audio mode is automatic generation: do not claim any uploaded audio is copied into the final output.",
    }.get(audio_mode, "Describe the audio relationship conservatively and do not invent how it is used.")

    singing_rule = ""
    if re.search(
        r"唱|歌曲|歌词|歌唱|演唱|口型|嘴型|对口型|lip\s*sync|sing(?:ing|s)?|lyrics?|vocal",
        user_prompt,
        flags=re.IGNORECASE,
    ):
        singing_rule = (
            " The request involves singing or lip synchronization. Require accurate phoneme-level lip and jaw "
            "synchronization throughout the vocals: mouth movement should follow syllable onset and release, clear "
            "consonant closures, natural vowel shapes, pauses and breaths, and sustained notes; the mouth rests "
            "naturally during non-vocal spans. Also require stable facial identity and continuous mouth motion without "
            "generic loops, visible delay, frozen lips, or facial deformation. Do not reduce a singing performance "
            "to lip movement while the rest of the body remains still. Unless the user explicitly requests restrained "
            "or static performance, design evolving full-body or upper-body performance across the timeline: shifting "
            "weight, torso and shoulder rhythm, head movement, gaze changes, expressive but natural hand and arm "
            "phrasing, and transitions between distinct gestures. Make these movements non-repetitive and responsive "
            "to musical phrases, accents, pauses, intensity changes, and vocal emotion without inventing exact unheard "
            "beats. Coordinate purposeful camera motion and changing shot emphasis with the performance so the image "
            "does not feel like a static portrait with moving lips. Keep lip-sync requirements compact, but give the "
            "visible performance and camera progression enough concrete detail to guide a lively result. Because the audio binary is not "
            "transmitted to the optimizer, never invent exact lyrics, notes, beats, or timestamps and never claim "
            "to have analyzed or heard the file."
        )
    transfer_rule = ""
    if re.search(
        r"替换|置换|换成|变成|动作迁移|模仿.*动作|复刻.*动作|跟随.*动作|"
        r"replace|replacement|swap|motion\s*(?:transfer|reference)|imitate.*motion|copy.*motion",
        user_prompt,
        flags=re.IGNORECASE,
    ):
        transfer_rule = (
            " This is a subject-replacement or motion-transfer request. The following is a strict task-specific "
            "exception that overrides the general instructions to describe actions, timing, performance, camera, "
            "sound, and shot-by-shot events. Describe only the source-to-target relationship: which subject from "
            "<picture N> replaces which subject in <video N>, while the source video's complete motion, timing, "
            "scene, props, composition, camera movement, cuts, and temporal structure remain unchanged. Never name, "
            "infer, enumerate, paraphrase, or timestamp any concrete source-video action, gesture, pose change, facial "
            "expression, dialogue, object interaction, prop function, story event, sound, ambience, or music, even if "
            "it appears visible or inferable in the sampled frames. Use the sampled frames only to distinguish the "
            "subjects that must be replaced. Define replacement subjects only with official numbered labels such as "
            "<Subject 1> and <Subject 2>, never semantic labels such as <cat> or a Chinese name. Give each subject only "
            "the minimum clearly visible identity cues needed to avoid mismatch: subject type or gender, approximate "
            "age when reliable, main clothing and color, hairstyle or fur pattern, hat, and glasses. Do not infer an "
            "occupation or describe pose, expression, action, scene details, lighting, or unrelated appearance. Do not "
            "define the original subjects being removed as target <Subject N> entries unless needed only to make an "
            "unambiguous one-to-one replacement mapping. In detailed_description, keep a single [Shot 1] for the source "
            "timeline, but write a complete operational paragraph rather than a bare one-sentence relationship. State "
            "which source subject or scene is replaced by which referenced target, which target identity and major "
            "appearance or environment attributes remain stable, and which source-video properties remain unchanged: "
            "motion performance, facial-expression timing, blocking, screen direction, camera trajectory, framing, "
            "cuts, pacing, and duration when applicable. Explain how replaced subjects remain spatially integrated with "
            "preserved props and scene elements, but never invent or enumerate the source video's concrete actions, "
            "dialogue, props, events, or sounds; do not expand the source timeline or reconstruct it from sampled frames. Treat the three sampled images from one <video N> as observation "
            "frames of that single reference video, never as separate target shots or evidence of cuts."
        )
    # 默认系统提示词固定写中文；要别的语言请在「优化规则」里换一套模板。
    language_rule = (
        "输出语言强制为中文：所有自然语言说明、主体描述、摘要、镜头描述、声音说明和音乐说明必须使用简体中文，"
        "不得输出英文句子。只有官方固定字段名 subject_definitions、summary、retention_analysis、"
        "detailed_description、integrated_multimodal_description、overall_soundscape、non_diegetic_music，"
        "媒体与主体标签、[Shot N]，以及 fully_preserved、partially_preserved、attribute_transfer、"
        "weak_reference、fully_copy、partially_copy、reference 等固定关系标记保留英文。返回前必须检查并将"
        "其他英文自然语言全部改写成中文。"
    )
    dialogue_rule = (
        "Official dialogue formatting is mandatory in every task and is independent of the selected narration "
        "language. Put every user-supplied spoken line or lyric inside exactly one <d>[Language]...</d> block, using "
        "the dialogue's actual language name in English. In particular, Chinese speech must use the exact form "
        "<d>[Chinese]中文原文</d>; never write Chinese dialogue only inside quotation marks, and never omit [Chinese]. "
        "Keep the speaker description, stable speaker ID such as (S1), speaking action, and delivery outside the <d> "
        "block; inside it preserve only the user's exact words and punctuation without translation or rewriting. "
        "Narration language never overrides supplied dialogue: Chinese speech stays <d>[Chinese]...</d> even in a "
        "Chinese-language answer. Placement is as mandatory as formatting: every <d> block must be embedded "
        "inside integrated_multimodal_description or detailed_description at the exact chronological moment when the "
        "speaker speaks or sings, immediately after that speaker's speaking/singing action and delivery description. "
        "Never collect dialogue into a list, appendix, footer, or separate paragraph after the official sections. "
        "Never place a <d> block in subject_definitions, summary, retention_analysis, overall_soundscape, or "
        "non_diegetic_music. The final section is always non_diegetic_music, and absolutely no text or <d> block may "
        "follow that section's content. For multiple supplied lines, preserve their original order and place each line "
        "at its corresponding point in the shot timeline, with intervening actions and pauses described between lines "
        "when the user's request implies them. Before returning, verify that every supplied line appears exactly once "
        "inside the main shot timeline and nowhere else. Do not wrap paraphrased soundscape descriptions, ambient "
        "sounds, or dialogue that the user did not explicitly supply in <d> tags."
    )
    subject_shorthand_rule = (
        "Subject shorthand formatting is mandatory and globally consistent. If a stable short subject ID is used, "
        "it must always be written with parentheses as (S1), (S2), ... through (S20). Never output a bare S1, S2, "
        "or any other unparenthesized S-number in narration, shot descriptions, actions, dialogue attribution, or "
        "sound descriptions. <Subject N> definitions remain unchanged; (S1) is only the shorthand used to refer back "
        "to a defined subject. Before returning, scan the complete result and replace every standalone bare S1-S20 "
        "with its exact parenthesized form."
    )
    return (
        "You are a professional prompt writer for the open-source MiniMax H3 audiovisual model. Return only the "
        "final production-ready prompt without explanations, markdown fences, filenames, or invented media. "
        "Preserve the user's intent and every supplied dialogue, lyric, and visible-text word verbatim; do not "
        "invent dialogue or lyrics that were not provided. This is a video-generation prompt, not image captioning "
        "or visual reverse-prompting. Reference images are already passed into model conditioning, so identify each "
        "visual subject only with the minimum distinctive cues needed to disambiguate it: usually gender or subject "
        "type, main clothing, main hairstyle, and scene. Do not describe facial features, lighting, pose, background "
        "objects, or composition exhaustively unless they are essential to the requested motion or must change over "
        "time. Spend most words on what happens after the reference frame: causally connected actions, reactions, "
        "story progression, timing, performance, camera behavior, and audio-visual synchronization. Develop the "
        "user's idea into concrete visible beats that fit the duration: establish the situation, let the central "
        "action evolve through meaningful intermediate changes, add a restrained climax or reveal when appropriate, "
        "and finish on a clear visual result rather than an abrupt stop. Do not introduce unrelated characters, props, "
        "locations, conflicts, or plot twists. Avoid repeating the same static trait across sections, avoid decorative "
        "adjectives, and never turn quality requirements into a long negative-prompt checklist. Use professional but "
        "executable cinematography with dynamic video direction by default. Unless the user explicitly requests a static pose, locked-off camera, "
        "minimal movement, or a specific fixed composition, do not let the subject remain nearly motionless after the "
        "opening frame. Build visible motion in successive phases with clear variation and continuity: changes in body "
        "weight, posture, orientation, gesture, interaction, expression, spatial position, or object state. Avoid one "
        "gesture repeated mechanically throughout the clip. For music, singing, dance, performance, fashion, or other "
        "rhythmic scenes, let the body express phrase changes through varied natural gestures and coordinated torso, "
        "shoulder, head, hand, and footwork where framing permits; align movement energy and camera emphasis with broad "
        "musical progression without fabricating unheard exact beats. Treat the reference image as a starting anchor, "
        "not the main subject of the description: spend only enough text to identify it, then prioritize motion design, "
        "performance evolution, kinetic atmosphere, and a visually active ending. For each shot, integrate the useful framing or shot scale, subject blocking, and "
        "camera path into the action. When motion benefits the scene, choose a motivated Push In, Pull Out, Pan, Tilt, "
        "Truck, Pedestal, Arc Shot, Tracking Shot, or controlled Zoom, and specify subtle/large amplitude and slow/fast "
        "speed only when meaningful. Let camera movement reveal information, follow motion, emphasize a transformation, "
        "or land on the final state; do not stack random camera terms or use constant movement without purpose. Vary "
        "composition and visual emphasis over time so the video feels directed rather than static, while preserving "
        "spatial continuity, screen direction, subject identity, and reference constraints. Expand into continuous "
        "actions, camera choreography, synchronized audible events, ambience, and music with enough detail to guide "
        "generation effectively. Prefer a well-designed continuous shot when it can express the event clearly, but "
        "allow a small number of motivated cuts when they materially improve narrative clarity or reveal new visual "
        "information. Do not create labels outside the supplied label list, renumber labels, "
        "or replace labels with filenames. "
        f"Task={task}; duration={duration:.2f}s; available labels={', '.join(labels) or 'none'}. "
        f"{label_rule} {keyframe_rule} {audio_rule} {structure}{singing_rule}{transfer_rule} {dialogue_rule} "
        f"{subject_shorthand_rule} "
        "Audio items are label-only references; never claim you listened to them. Before returning, silently check "
        "that every required section is present in the correct order, every used label exists, no filename appears, "
        "no audio content was fabricated, all timing fits the target duration, and the audio relationship matches "
        f"the supplied mode. {language_rule}"
    )


def _output_language_mandate(has_rule: bool = False) -> str:
    """追加在用户消息末尾的语言硬性要求——模型对提示词末尾的权重最高。

    选了规则时语言由规则自己定（例如 Viggle Remake 规则要求整份英文成品），
    这里只做兜底：规则没规定语言才要求简体中文。
    """
    if has_rule:
        return (
            "\n\n【输出语言（最高优先级，覆盖其他一切指令）】\n"
            "输出语言以系统提示中规则的明确规定为准；规则没有明确规定语言时，全部使用简体中文撰写。"
            "无论规则要求哪种语言，以下内容一律保留英文原样：固定字段名（subject_definitions、summary、"
            "retention_analysis、detailed_description、integrated_multimodal_description、overall_soundscape、"
            "non_diegetic_music）、媒体与主体标签（<Picture 1>、<Video 1>、<Subject 1>、<Audio 1>）、"
            "[Shot N] 标记、MM:SS.mmm 时间戳、"
            "fully_preserved / partially_preserved / attribute_transfer / weak_reference / removed / added / "
            "fully_copy / partially_copy / reference 等固定关系标记、以及文件名。"
            "除规则明确要求外，不得输出任何解释、前言、后记或自检报告。"
        )
    return (
        "\n\n【输出语言硬性要求（最高优先级，覆盖其他一切指令）】\n"
        "最终结果必须全部使用简体中文撰写。任何英文句子、英文短语或英文单词的出现都视为任务失败——"
        "返回前必须逐句自查，把所有英文自然语言改写为简体中文。"
        "仅以下内容允许保留英文原样：固定字段名（subject_definitions、summary、retention_analysis、"
        "detailed_description、integrated_multimodal_description、overall_soundscape、non_diegetic_music）、"
        "媒体与主体标签（<Picture 1>、<Video 1>、<Subject 1>、<Audio 1>）、[Shot N] 标记、MM:SS.mmm 时间戳、"
        "fully_preserved / partially_preserved / attribute_transfer / weak_reference / removed / added / "
        "fully_copy / partially_copy / reference 等固定关系标记、以及文件名。"
    )


def _user_parts(prompt: str, media: list[dict], read_media: bool) -> list[dict]:
    parts = [{"type": "text", "text": "User prompt:\n" + prompt}]
    for item in media:
        label = str(item.get("label") or "")
        kind = str(item.get("kind") or "")
        if kind == "audio":
            parts.append({"type": "text", "text": f"{label} is an uploaded audio reference (content not transmitted)."})
        elif read_media:
            for index, data_url in enumerate(item.get("images") or []):
                parts.append({"type": "text", "text": f"{label} visual {index + 1}."})
                parts.append({"type": "image_url", "image_url": {"url": data_url, "detail": "low"}})
        else:
            parts.append({"type": "text", "text": f"{label} is an uploaded {kind} reference."})
    return parts


def _strip_filenames(text: str) -> str:
    return re.sub(
        r"(?<![\w/\\])[\w .()\-\u4e00-\u9fff]+\.(?:png|jpe?g|webp|bmp|gif|mp4|mov|webm|mkv|avi|mp3|wav|flac|m4a|ogg|aac)(?!\w)",
        "",
        text,
        flags=re.IGNORECASE,
    ).strip()


def _format_prompt_sections(text: str) -> str:
    """Force official section headings onto separate lines without rewriting content."""
    headings = (
        "subject_definitions",
        "summary",
        "retention_analysis",
        "detailed_description",
        "integrated_multimodal_description",
        "overall_soundscape",
        "non_diegetic_music",
    )
    pattern = r"\s*(" + "|".join(map(re.escape, headings)) + r")\s*:\s*"
    formatted = re.sub(pattern, lambda match: f"\n\n{match.group(1).lower()}:\n", str(text), flags=re.IGNORECASE)
    return formatted.strip()


def _normalize_subject_shorthand(text: str) -> str:
    """Guarantee that standalone S1-S20 references use official parentheses."""
    return re.sub(
        r"(?<![A-Za-z0-9_(<（])S([1-9]|1\d|20)(?![A-Za-z0-9_)>）])",
        lambda match: f"(S{match.group(1)})",
        str(text),
        flags=re.IGNORECASE,
    )


def _extract_explicit_dialogues(prompt: str) -> list[tuple[str, str]]:
    """Extract only dialogue that the user explicitly supplied, preserving its exact text."""
    source = str(prompt or "")
    candidates = []
    speech_marker = r"(?:说|说道|说着|喊|喊道|问|问道|回答|答道|台词|对白|says?|speaks?|shouts?|asks?|replies?)"
    patterns = (
        rf"{speech_marker}[^\n“”‘’\"']{{0,20}}[：:]?\s*[“\"]([^”\"\n]+)[”\"]",
        rf"{speech_marker}[^\n“”‘’\"']{{0,20}}[：:]?\s*[‘']([^’'\n]+)[’']",
        rf"{speech_marker}\s*[：:]\s*([^\n；;]+)",
    )
    for pattern in patterns:
        for match in re.finditer(pattern, source, flags=re.IGNORECASE):
            value = match.group(1).strip().strip("“”‘’\"'").strip()
            existing = {item[0] for item in candidates}
            if not value or value in existing or any(value in item or item in value for item in existing):
                continue
            language = "Chinese" if re.search(r"[\u3400-\u9fff]", value) else "English"
            candidates.append((value, language))
    return candidates


def _ensure_supplied_dialogues(text: str, user_prompt: str) -> str:
    """Keep supplied dialogue exactly once and inside the main shot timeline."""
    result = str(text)
    dialogues_to_insert = []
    for index, (dialogue, language) in enumerate(_extract_explicit_dialogues(user_prompt), start=1):
        tag = f"<d>[{language}]{dialogue}</d>"
        main_heading = re.search(
            r"(?:integrated_multimodal_description|detailed_description)\s*:\s*",
            result,
            flags=re.IGNORECASE,
        )
        main_start = main_heading.end() if main_heading else 0
        main_end_match = re.search(
            r"(?:overall_soundscape|non_diegetic_music)\s*:\s*",
            result[main_start:],
            flags=re.IGNORECASE,
        )
        main_end = main_start + main_end_match.start() if main_end_match else len(result)
        timeline = result[main_start:main_end]
        if tag in timeline:
            # Remove accidental duplicates outside the timeline while preserving the valid occurrence.
            prefix = result[:main_start].replace(tag, "")
            suffix = result[main_end:].replace(tag, "")
            result = prefix + timeline + suffix
            continue
        # A correctly tagged line outside the shot timeline is structurally invalid; move rather than duplicate it.
        result = result.replace(tag, "")
        main_heading = re.search(
            r"(?:integrated_multimodal_description|detailed_description)\s*:\s*",
            result,
            flags=re.IGNORECASE,
        )
        main_start = main_heading.end() if main_heading else 0
        main_end_match = re.search(
            r"(?:overall_soundscape|non_diegetic_music)\s*:\s*",
            result[main_start:],
            flags=re.IGNORECASE,
        )
        main_end = main_start + main_end_match.start() if main_end_match else len(result)
        timeline = result[main_start:main_end]
        if dialogue in timeline:
            replaced = False
            for quoted in (f"“{dialogue}”", f"‘{dialogue}’", f'"{dialogue}"', f"'{dialogue}'"):
                if quoted in timeline:
                    timeline = timeline.replace(quoted, tag, 1)
                    replaced = True
                    break
            if not replaced:
                timeline = timeline.replace(dialogue, tag, 1)
            result = result[:main_start] + timeline + result[main_end:]
            continue
        dialogues_to_insert.append((index, tag))

    if dialogues_to_insert:
        main_heading = re.search(
            r"(?:integrated_multimodal_description|detailed_description)\s*:\s*",
            result,
            flags=re.IGNORECASE,
        )
        main_start = main_heading.end() if main_heading else 0
        main_end_match = re.search(
            r"(?:overall_soundscape|non_diegetic_music)\s*:\s*",
            result[main_start:],
            flags=re.IGNORECASE,
        )
        main_end = main_start + main_end_match.start() if main_end_match else len(result)
        timeline = result[main_start:main_end]
        cue = re.search(
            r"(?:开口说话|开始说话|随后说|继续说|说话|演唱|唱着|begins? speaking|starts? speaking|speaks?|says?|sings?)",
            timeline,
            flags=re.IGNORECASE,
        )
        if cue:
            boundary = re.search(r"[。！？.!?](?:\s|$)", timeline[cue.end():])
            insert_at = cue.end() + boundary.end() if boundary else cue.end()
        else:
            shot = re.search(r"\[Shot 1\]\s*", timeline, flags=re.IGNORECASE)
            insert_at = shot.end() if shot else 0
        sentences = []
        for order, (index, tag) in enumerate(dialogues_to_insert):
            action = "说" if order == 0 else "随后继续说"
            sentences.append(f"画面中的说话者 (S{index}) {action}：{tag}")
        insertion = " " + " ".join(sentences) + " "
        timeline = timeline[:insert_at] + insertion + timeline[insert_at:]
        result = result[:main_start] + timeline + result[main_end:]
    return re.sub(r"[ \t]+\n", "\n", result).strip()


def _ensure_fl2va_picture_labels(text: str, task: str, duration: float) -> str:
    """Guarantee that an FL2VA result retains both official bare picture labels."""
    if str(task).upper() != "FL2VA":
        return text
    lowered = str(text).lower()
    if "picture 1" in lowered and "picture 2" in lowered:
        return text
    alignment = (
        f"参考图像与目标视频对齐关系：picture 1 对齐目标视频的 0.00 秒首帧；"
        f"picture 2 对齐目标视频的 {duration:.2f} 秒尾帧。"
    )
    return f"{alignment}\n\n{text}".strip()


def _strip_think(text: str) -> str:
    """剥掉推理模型混进正文的思考块（llama.cpp 系模型常见）。"""
    cleaned = re.sub(r"<think>[\s\S]*?</think>", "", text, flags=re.IGNORECASE)
    # 未闭合的 <think>（输出被截断时）：丢掉思考开始之后的全部内容
    open_idx = cleaned.lower().find("<think>")
    if open_idx >= 0:
        cleaned = cleaned[:open_idx]
    return cleaned.strip()


def _extract_openai(data: dict) -> str:
    try:
        choice = data["choices"][0]
        message = choice["message"]
        content = message.get("content")
        if isinstance(content, list):
            text = "".join(
                str((item.get("text") or {}).get("value") if isinstance(item.get("text"), dict) else item.get("text") or "")
                for item in content if isinstance(item, dict)
            ).strip()
        else:
            text = str(content or "").strip()
        if text:
            return text
        finish_reason = str(choice.get("finish_reason") or "unknown")
        reasoning = str(message.get("reasoning_content") or "").strip()
        usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
        details = usage.get("completion_tokens_details") if isinstance(usage.get("completion_tokens_details"), dict) else {}
        reasoning_tokens = details.get("reasoning_tokens")
        if reasoning or reasoning_tokens:
            raise RuntimeError(
                "API 请求已完成，但模型仅返回了推理内容，没有最终提示词"
                f"（finish_reason={finish_reason}, reasoning_tokens={reasoning_tokens or 'unknown'}）。"
                "请关闭模型思考模式或提高输出 token 上限。"
            )
        raise RuntimeError(f"API 请求成功但返回内容为空（finish_reason={finish_reason}）")
    except (KeyError, IndexError, TypeError):
        raise RuntimeError("The API returned no optimized prompt")


def _extract_openai_responses(data: dict) -> str:
    direct = data.get("output_text")
    if isinstance(direct, str) and direct.strip():
        return direct.strip()
    texts = []
    for output in data.get("output") or []:
        if not isinstance(output, dict):
            continue
        for content in output.get("content") or []:
            if not isinstance(content, dict) or content.get("type") not in {"output_text", "text"}:
                continue
            value = content.get("text")
            if isinstance(value, dict):
                value = value.get("value")
            if value:
                texts.append(str(value))
    if texts:
        return "".join(texts).strip()
    raise RuntimeError("OpenAI Responses returned no optimized prompt")


_TASK_NOTE = {
    "t2va": "纯文本生视频（无源视频，无参考图）",
    "i2va": "单图生视频（首帧）",
    "l2va": "末帧生视频",
    "fl2va": "首尾帧生视频",
    "ref2va": "全能参考（源视频 + 参考图 / 关键帧）",
    "hybrid": "混合参考（源视频 + 参考图 + 音频）",
    "auto": "由节点自动判定",
}

_AUDIO_NOTE = {
    "native": "模型自行生成音频；不得声称复制了上传音频",
    "lock_source": "源视频音轨原样搬运，不新增任何声音、对白或音乐",
    "reference_only": "源音频只作音色/节奏参考，不复制",
    "remix_source": "在源音频基础上重新混音",
}


def _pretty_label(label: str) -> str:
    """`<picture 3>` → `<Picture 3>`，与官方写法一致。"""
    text = str(label or "").strip()
    low = text.lower()
    for key, pretty in (("picture", "Picture"), ("video", "Video"), ("audio", "Audio")):
        if low.startswith(f"<{key}"):
            number = "".join(ch for ch in text if ch.isdigit()) or "1"
            return f"<{pretty} {number}>"
    return text


def _stamp(seconds: float) -> str:
    """秒 → `MM:SS.mmm`。"""
    value = max(0.0, float(seconds))
    minutes = int(value // 60)
    return f"{minutes:02d}:{value - minutes * 60:06.3f}"


def _node_facts_note(payload: dict, context: dict) -> str:
    """规则模式下的节点事实注入。

    自定义规则会整体替换内置系统提示，但"任务类型/时长/可用标签/音频怎么处理"
    是节点事实：不说清楚，模型就写不出落在时长内的时间戳，也不知道有哪些标签能用。
    """
    try:
        duration = float(payload.get("duration") or 5)
    except (TypeError, ValueError):
        duration = 5.0
    duration = max(0.5, duration)
    frames = max(1, int(round(duration * 24)))
    last_ts = (frames - 1) / 24.0
    task = str(payload.get("task") or "").strip().lower() or "auto"
    media = payload.get("media") if isinstance(payload.get("media"), list) else []
    labels: list[str] = []
    for item in media:
        if not isinstance(item, dict):
            continue
        pretty = _pretty_label(item.get("label"))
        if pretty and pretty not in labels:
            labels.append(pretty)
    context = context if isinstance(context, dict) else {}
    audio_mode = str(context.get("audio_mode") or "").strip().lower()
    main_mode = str(context.get("main_mode") or "").strip()

    lines = [
        f"- 任务类型 task = {task}（{_TASK_NOTE.get(task, '按用户需求判断')}）",
        f"- 目标时长 = {duration:.2f} 秒（24fps，共 {frames} 帧）：所有 MM:SS.mmm 时间戳必须 ≤ {_stamp(duration)}，"
        f"最后可用时间戳 {_stamp(last_ts)}，超时即无效。",
        "- 可用标签（只能用这些，编号与上传顺序一致）：" + ("、".join(labels) if labels else "无"),
    ]
    if audio_mode:
        lines.append(f"- audio_mode = {audio_mode}（{_AUDIO_NOTE.get(audio_mode, '按用户需求判断')}）")
    if main_mode:
        lines.append(f"- 生成模式 = {main_mode}")
    return (
        "\n\n【本次任务事实（优化器自动注入的内部信息，禁止复述到成品里，只用于满足格式要求）】\n"
        + "\n".join(lines)
        + "\n标签大小写按官方写法输出（<Picture 1>、<Video 1>、<Subject 1>）；"
          "标签以外的内容按规则要求的语言撰写。"
    )


def _resolve_system_prompt(config: dict, payload: dict) -> tuple[str, bool]:
    """The system prompt for this request, and whether it came from a rule.

    A selected prompt-assistant rule replaces the built-in spec entirely so
    the rule governs the rewrite; otherwise the built-in H3 spec is used.
    """
    rule = str(config.get("rule") or "").strip()
    if rule:
        match = next((item for item in _optimizer_rules() if item["name"] == rule), None)
        if match is None:
            raise RuntimeError(f"未找到提示词小助手规则「{rule}」，请重新打开优化设置选择有效规则")
        # 规则模式下 _system_prompt 被整体替换，但引导图/关键帧这些节点事实
        # 必须继续告知模型，否则它会写出与锚定画面冲突的提示词。
        context = payload.get("context") if isinstance(payload.get("context"), dict) else {}
        anchors = _node_anchor_note(context, float(payload.get("duration") or 5))
        facts = _node_facts_note(payload, context)
        extra = facts + anchors
        return (match["content"] + extra if extra else match["content"]), True
    task = str(payload.get("task") or "T2VA")
    duration = float(payload.get("duration") or 5)
    media = payload.get("media") if isinstance(payload.get("media"), list) else []
    labels = [str(item.get("label")) for item in media if item.get("label")]
    context = payload.get("context") if isinstance(payload.get("context"), dict) else {}
    return _system_prompt(
        task,
        duration,
        labels,
        context,
        str(payload.get("prompt") or ""),
    ), False


def _request_parts(config: dict, payload: dict):
    media = payload.get("media") if isinstance(payload.get("media"), list) else []
    user_prompt = str(payload.get("prompt") or "")
    system, _custom = _resolve_system_prompt(config, payload)
    parts = _user_parts(user_prompt, media, bool(config.get("read_media")))
    parts[0]["text"] += _output_language_mandate(_custom)
    max_tokens = _clamp_max_tokens(config.get("max_tokens"))
    headers = {"Content-Type": "application/json"}
    if config["protocol"] == "gemini":
        gemini_parts = []
        for part in parts:
            if part["type"] == "text":
                gemini_parts.append({"text": part["text"]})
            else:
                url = part["image_url"]["url"]
                header, encoded = url.split(",", 1)
                mime = header.split(";")[0].split(":", 1)[1]
                gemini_parts.append({"inline_data": {"mime_type": mime, "data": encoded}})
        body = {
            "system_instruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": gemini_parts}],
            "generationConfig": {"temperature": 0.35, "maxOutputTokens": max_tokens},
        }
        url = _endpoint(config)
        separator = "&" if "?" in url else "?"
        url += separator + "key=" + urllib.parse.quote(config["api_key"])
    elif config["protocol"] == "responses":
        response_parts = []
        for part in parts:
            if part["type"] == "text":
                response_parts.append({"type": "input_text", "text": part["text"]})
            else:
                response_parts.append({
                    "type": "input_image",
                    "image_url": part["image_url"]["url"],
                    "detail": part["image_url"].get("detail", "low"),
                })
        body = {
            "model": config["model"],
            "instructions": system,
            "input": [{"role": "user", "content": response_parts}],
            "temperature": 0.35,
            "max_output_tokens": max_tokens,
        }
        headers["Authorization"] = f"Bearer {config['api_key']}"
        url = _endpoint(config)
    else:
        body = {
            "model": config["model"],
            "temperature": 0.35,
            "max_tokens": max_tokens,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": parts},
            ],
        }
        # 思考开关不再下发：推理型模型（qwen3 / deepseek / glm 等）照它的默认
        # 行为思考，输出预算由 max_tokens 兜住；混进正文的 <think> 块由
        # _strip_think 统一剥掉，不会污染提示词。
        headers["Authorization"] = f"Bearer {config['api_key']}"
        url = _endpoint(config)
    return url, headers, body


def _is_local_api_host(api_url: str) -> bool:
    """只有本机 / 局域网 / mDNS 的 API 才值得试卸载；云端一律跳过。"""
    try:
        host = urllib.parse.urlparse(str(api_url or "")).hostname or ""
    except ValueError:
        return False
    host = host.strip("[]").strip().lower()
    if not host:
        return False
    if host in {"localhost", "localhost.localdomain", "host.docker.internal", "host.containers.internal"}:
        return True
    if host.endswith(".local") or host.endswith(".lan"):
        return True
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return False
    return address.is_loopback or address.is_private or address.is_link_local


def _api_unload_targets(api_url: str, model: str) -> list[tuple[str, str, dict | None]]:
    """同一台机器上常见卸载写法的候选清单（不认的服务端会 404，无副作用）。

    - llama-swap 网关：GET {root}/unload?model=...（有的版本只认 POST）
    - Ollama：POST {root}/api/generate 带 keep_alive=0 即"用完就放"
    - root 同时试带 /v1 的原地址与剥掉 /v1 的根地址
    """
    base = str(api_url or "").strip().rstrip("/")
    if not base:
        return []
    roots = [base]
    bare = re.sub(r"/v\d+$", "", base)
    if bare and bare != base:
        roots.insert(0, bare)
    query = ("?" + urllib.parse.urlencode({"model": model})) if model else ""
    targets: list[tuple[str, str, dict | None]] = []
    for root in roots:
        targets.append(("GET", root + "/unload" + query, None))
        targets.append(("POST", root + "/unload", {"model": model} if model else {}))
        if model:
            targets.append(("POST", root + "/api/generate", {"model": model, "keep_alive": 0}))
    return targets


async def _unload_api_model(config: dict) -> None:
    """开关打开时，优化跑完就让本地 API 服务把模型放掉，给后面的采样腾显存。

    只对本机 / 局域网地址生效（云端平台没有卸载接口，也轮不到我们管）；
    best effort：所有候选并发打一遍，谁先回 2xx/3xx 就算成功；全部失败也
    只写一条日志，绝不影响已经拿到的提示词。
    """
    if not config.get("unload_after"):
        return
    api_url = str(config.get("api_url") or "")
    if not _is_local_api_host(api_url):
        return
    targets = _api_unload_targets(api_url, str(config.get("model") or ""))
    if not targets:
        return

    async def attempt(session: aiohttp.ClientSession, method: str, url: str, payload: dict | None) -> tuple[str, int] | None:
        try:
            request = session.get(url) if method == "GET" else session.post(url, json=payload)
            async with request as response:
                return url, response.status
        except Exception:
            return None

    timeout = aiohttp.ClientTimeout(total=5)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            results = await asyncio.gather(*(attempt(session, *target) for target in targets))
    except Exception:
        return
    for result in results:
        if result and result[1] < 400:
            logging.info("BlackRin 优化完成，已请求卸载模型: %s", result[0])
            return
    logging.info("BlackRin 优化完成，但没有服务端响应卸载请求（%s 未提供卸载接口）", api_url)


async def _request_async(config: dict, payload: dict) -> str:
    if config.get("provider") == "assistant":
        config = _resolve_assistant_provider(config)
    url, headers, body = _request_parts(config, payload)
    try:
        timeout = aiohttp.ClientTimeout(total=200)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(url, headers=headers, json=body) as response:
                text = await response.text()
                if response.status >= 400:
                    raise RuntimeError(f"API request failed ({response.status}): {text[:1000]}")
                data = json.loads(text)
    except asyncio.CancelledError:
        raise
    except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as error:
        raise RuntimeError(f"API request failed: {error}") from error
    if config["protocol"] == "gemini":
        try:
            result = "".join(part.get("text", "") for part in data["candidates"][0]["content"]["parts"]).strip()
        except (KeyError, IndexError, TypeError):
            raise RuntimeError("Gemini returned no optimized prompt")
    elif config["protocol"] == "responses":
        result = _strip_think(_extract_openai_responses(data))
    else:
        result = _strip_think(_extract_openai(data))
    # 拿完结果就让本机 / 局域网 API 服务把模型放掉（best effort，失败无所谓）。
    await _unload_api_model(config)
    return result


async def get_prompt_optimizer_config(_request):
    return web.json_response(_public_config(DEFAULT_CONFIG))


def _custom_models_url(api_url: str) -> str:
    base = (api_url or "").strip().rstrip("/")
    if not base:
        raise ValueError("API URL 不能为空，请先填写自定义 API 地址")
    if base.endswith("/models"):
        return base
    # Accept chat-completions style URLs and derive the model-list endpoint.
    for suffix in ("/chat/completions", "/responses", "/generateContent"):
        if base.endswith(suffix):
            base = base[: -len(suffix)]
            break
    return f"{base}/models"


async def list_custom_api_models(request):
    try:
        body = await request.json()
    except Exception:
        body = {}
    api_url = str(body.get("api_url") or request.query.get("api_url") or "").strip()
    api_key = str(body.get("api_key") or request.query.get("api_key") or "").strip()
    protocol = str(body.get("protocol") or "openai").lower()
    try:
        url = _custom_models_url(api_url)
        headers = {"Accept": "application/json"}
        if api_key:
            if protocol == "gemini":
                separator = "&" if "?" in url else "?"
                url = f"{url}{separator}key={urllib.parse.quote(api_key, safe='')}"
            else:
                headers["Authorization"] = f"Bearer {api_key}"
        timeout = aiohttp.ClientTimeout(total=30)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(url, headers=headers) as response:
                text = await response.text()
                if response.status >= 400:
                    raise RuntimeError(f"获取模型列表失败 ({response.status}): {text[:500]}")
                data = json.loads(text)
    except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as error:
        return web.json_response({"error": f"获取模型列表失败: {error}"}, status=502)
    except RuntimeError as error:
        return web.json_response({"error": str(error)}, status=502)

    models: list[str] = []
    if isinstance(data, dict):
        payload = data.get("data")
        if isinstance(payload, list):
            for item in payload:
                if isinstance(item, str):
                    models.append(item)
                elif isinstance(item, dict) and item.get("id"):
                    models.append(str(item["id"]))
        elif isinstance(data.get("models"), list):
            # Gemini style: {"models": [{"name": "models/gemini-..."}]}
            for item in data["models"]:
                if isinstance(item, dict) and item.get("name"):
                    name = str(item["name"]).split("/")[-1]
                    models.append(name)
                elif isinstance(item, str):
                    models.append(item)
    models = sorted(set(models))
    return web.json_response({"models": models})


async def save_prompt_optimizer_config(request):
    return web.json_response(_public_config(_normalize_config(await request.json())))


def _prepare_prompt_optimization(payload: dict) -> tuple[dict, threading.Event]:
    node_config = payload.get("config") if isinstance(payload.get("config"), dict) else {}
    config = _normalize_config(node_config)
    # 不再强制要求 api_key：本地 / 局域网服务（llama-swap、Ollama、LM Studio）通常不需要 key。
    # 需要 key 的云端服务走「提示词小助手」的服务列表（key 存在全局配置里，不进工作流）。
    if config.get("provider") != "assistant" and (
        not config.get("api_url") or not config.get("model")
    ):
        raise ValueError("请先配置提示词优化 API")
    cancel_event = threading.Event()
    payload["_cancel_event"] = cancel_event
    return config, cancel_event


async def _run_prompt_optimization(config: dict, payload: dict) -> str:
    result = await _request_async(config, payload)
    if not result:
        raise RuntimeError("API 返回了空提示词")
    # A selected rule owns the output format. The repairs below force the
    # built-in six/three-section structure, angle-bracket labels and <d> dialogue
    # back onto whatever the model produced, which would silently rewrite a
    # community template's own conventions.
    if str(config.get("rule") or "").strip():
        return str(result).strip()
    formatted = _format_prompt_sections(_strip_filenames(result))
    formatted = _ensure_fl2va_picture_labels(
        formatted,
        str(payload.get("task") or "T2VA"),
        float(payload.get("duration") or 5),
    )
    formatted = _ensure_supplied_dialogues(
        formatted,
        str(payload.get("prompt") or ""),
    )
    return _normalize_subject_shorthand(formatted)


def _register_optimizer_task(request_id: str, task: asyncio.Task, cancel_event: threading.Event) -> None:
    previous_cancel_event = _ACTIVE_CANCEL_EVENTS.pop(request_id, None)
    if previous_cancel_event is not None:
        previous_cancel_event.set()
    previous = _ACTIVE_REQUESTS.pop(request_id, None)
    if previous is not None:
        previous.cancel()
    _ACTIVE_CANCEL_EVENTS[request_id] = cancel_event
    _ACTIVE_REQUESTS[request_id] = task


async def optimize_prompt(request):
    request_id = ""
    try:
        payload = await request.json()
        request_id = str(payload.get("request_id") or "")
        config, cancel_event = _prepare_prompt_optimization(payload)
        task = asyncio.create_task(_run_prompt_optimization(config, payload))
        if request_id:
            _register_optimizer_task(request_id, task, cancel_event)
        formatted = await task
        return web.json_response({"prompt": formatted})
    except asyncio.CancelledError:
        return web.json_response({"error": "提示词优化已取消"}, status=499)
    except Exception as error:
        return web.json_response({"error": str(error)}, status=400)
    finally:
        if request_id:
            _ACTIVE_REQUESTS.pop(request_id, None)
            _ACTIVE_CANCEL_EVENTS.pop(request_id, None)


async def start_prompt_optimization(request):
    """Start a long optimization without holding a hosted reverse-proxy request open."""
    try:
        payload = await request.json()
        request_id = str(payload.get("request_id") or "")
        if not request_id:
            raise ValueError("提示词优化请求缺少 request_id")
        config, cancel_event = _prepare_prompt_optimization(payload)
        task = asyncio.create_task(_run_prompt_optimization(config, payload))
        old_job = _ASYNC_OPTIMIZER_JOBS.pop(request_id, None)
        if old_job is not None:
            old_job.cancel()
        _ASYNC_OPTIMIZER_JOBS[request_id] = task
        _register_optimizer_task(request_id, task, cancel_event)
        return web.json_response({"request_id": request_id, "status": "running"}, status=202)
    except Exception as error:
        return web.json_response({"error": str(error)}, status=400)


async def prompt_optimization_status(request):
    request_id = str(request.query.get("request_id") or "")
    task = _ASYNC_OPTIMIZER_JOBS.get(request_id)
    if task is None:
        return web.json_response({"error": "找不到提示词优化任务"}, status=404)
    if not task.done():
        return web.json_response({"status": "running"})
    _ASYNC_OPTIMIZER_JOBS.pop(request_id, None)
    _ACTIVE_REQUESTS.pop(request_id, None)
    _ACTIVE_CANCEL_EVENTS.pop(request_id, None)
    try:
        return web.json_response({"status": "success", "prompt": task.result()})
    except asyncio.CancelledError:
        return web.json_response({"error": "提示词优化已取消"}, status=499)
    except Exception as error:
        return web.json_response({"error": str(error)}, status=400)


async def cancel_prompt_optimization(request):
    payload = await request.json()
    request_id = str(payload.get("request_id") or "")
    task = _ACTIVE_REQUESTS.pop(request_id, None)
    async_job = _ASYNC_OPTIMIZER_JOBS.pop(request_id, None)
    cancel_event = _ACTIVE_CANCEL_EVENTS.pop(request_id, None)
    if cancel_event is not None:
        cancel_event.set()
    if task is not None:
        task.cancel()
    if async_job is not None and async_job is not task:
        async_job.cancel()
    return web.json_response({"cancelled": task is not None or async_job is not None or cancel_event is not None})


def register_prompt_optimizer_routes() -> bool:
    global _ROUTES_REGISTERED
    if _ROUTES_REGISTERED:
        return True
    instance = getattr(PromptServer, "instance", None)
    if instance is None:
        return False
    routes = instance.routes
    routes.get("/blackrin/minimax-h3/prompt-optimizer/config")(get_prompt_optimizer_config)
    routes.post("/blackrin/minimax-h3/prompt-optimizer/custom-models")(list_custom_api_models)
    routes.post("/blackrin/minimax-h3/prompt-optimizer/config")(save_prompt_optimizer_config)
    routes.post("/blackrin/minimax-h3/prompt-optimizer/optimize")(optimize_prompt)
    routes.post("/blackrin/minimax-h3/prompt-optimizer/start")(start_prompt_optimization)
    routes.get("/blackrin/minimax-h3/prompt-optimizer/status")(prompt_optimization_status)
    routes.post("/blackrin/minimax-h3/prompt-optimizer/cancel")(cancel_prompt_optimization)
    _ROUTES_REGISTERED = True
    return True


register_prompt_optimizer_routes()
