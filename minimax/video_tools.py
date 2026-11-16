"""参考视频分辨率压缩。

H3 的参考视频在 VAE 编码前已经按输出画布的像素预算缩放过
（conditioning._reference_pixel_budget），所以源文件的分辨率并不影响编码质量，
只影响**解码耗时与峰值内存**：1080p×144 帧 float32 大约 3.6GB。
这里提供一条路由，把上传的源视频转成 720p/480p 的副本，让解码阶段直接瘦下来。

约定：
- 「480p / 720p」指**短边**：横屏 1080p → 1280×720，竖屏 → 720×1280。
- 源视频短边已经 ≤ 目标值时不做转码（重编码只会掉画质，不会省解码），返回 ``skipped``。
- 产物写回源文件同目录，命名 ``<stem>_<height>p.mp4``；比源文件新就直接复用。
- 音轨必须保留（参考视频的配对音轨会被当作驱动音频）。
"""

from __future__ import annotations

import asyncio
import logging
import os
import re

import folder_paths
from aiohttp import web

try:  # 与 prompt_optimizer 保持一致：路由靠 server.PromptServer 挂载
    from server import PromptServer
except Exception:  # pragma: no cover - 单元测试环境没有 server 模块
    PromptServer = None

from .prompt_optimizer import _ffmpeg_path

LOG = logging.getLogger(__name__)

_ROUTES_REGISTERED = False
ALLOWED_HEIGHTS = (360, 480, 720, 1080)
_DIMENSION_RE = re.compile(r"(\d{2,5})x(\d{2,5})")


def _relative_input_name(output_path: str) -> str:
    """把产物路径换算成 ComfyUI 能解析的文件名（input 目录内保留子目录前缀）。"""
    name = os.path.basename(output_path)
    try:
        input_dir = folder_paths.get_input_directory()
        candidate = os.path.relpath(output_path, input_dir)
    except Exception:
        return name
    if candidate.startswith(".."):
        return name
    return candidate.replace(os.sep, "/")


async def _ffmpeg_capture(*args: str) -> tuple[int, str]:
    process = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _stdout, stderr = await process.communicate()
    return process.returncode or 0, stderr.decode("utf-8", "replace")


async def _probe_size(path: str) -> tuple[int, int] | None:
    """读出视频显示尺寸（ffmpeg 的 -i 报告，已含旋转）。"""
    _code, output = await _ffmpeg_capture(_ffmpeg_path(), "-hide_banner", "-i", path)
    match = _DIMENSION_RE.search(output)
    if not match:
        return None
    return int(match.group(1)), int(match.group(2))


async def _run_ffmpeg(source_path: str, output_path: str, height: int) -> None:
    size = await _probe_size(source_path)
    if size is None:
        raise RuntimeError("读不出源视频分辨率")
    width, source_height = size
    # 竖屏按宽度压、横屏按高度压，"720p" 始终指短边
    if width >= source_height:
        scale = f"scale=-2:{height}:flags=lanczos"
    else:
        scale = f"scale={height}:-2:flags=lanczos"
    command = [
        _ffmpeg_path(), "-hide_banner", "-loglevel", "error", "-y",
        "-i", source_path,
        "-vf", scale,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "160k",
        "-movflags", "+faststart",
        output_path,
    ]
    code, stderr = await _ffmpeg_capture(*command)
    if code:
        raise RuntimeError("参考视频压缩失败: " + stderr.strip()[-600:])


async def compress_reference_video(request):
    try:
        payload = await request.json()
    except Exception:
        return web.json_response({"error": "请求体不是合法 JSON"}, status=400)
    if not isinstance(payload, dict):
        return web.json_response({"error": "请求体不是合法 JSON"}, status=400)

    name = str(payload.get("name") or "").strip()
    try:
        height = int(payload.get("height") or 0)
    except (TypeError, ValueError):
        height = 0
    if not name:
        return web.json_response({"error": "缺少文件名"}, status=400)
    if height not in ALLOWED_HEIGHTS:
        return web.json_response({"error": f"不支持的分辨率: {height}"}, status=400)

    try:
        source_path = folder_paths.get_annotated_filepath(name)
    except Exception:
        source_path = None
    if not source_path or not os.path.isfile(source_path):
        return web.json_response({"error": f"找不到源视频: {name}"}, status=404)

    size = await _probe_size(source_path)
    if size is None:
        return web.json_response({"error": "读不出源视频分辨率"}, status=400)
    short_edge = min(size)
    if short_edge <= height:
        # 已经是目标分辨率以下：重编码只会掉画质，不能省解码
        return web.json_response({
            "skipped": True,
            "reason": f"源视频是 {size[0]}x{size[1]}，短边已经不超过 {height}p",
            "width": size[0],
            "height": size[1],
            "name": name,
        })

    stem = os.path.splitext(os.path.basename(source_path))[0]
    output_path = os.path.join(os.path.dirname(source_path), f"{stem}_{height}p.mp4")
    cached = (
        os.path.isfile(output_path)
        and os.path.getmtime(output_path) >= os.path.getmtime(source_path)
    )
    if cached:
        # 旧产物可能来自不同规则（横竖屏判定改过）：短边对不上就重做
        cached_size = await _probe_size(output_path)
        if cached_size is None or min(cached_size) != height:
            cached = False
            try:
                os.remove(output_path)
            except OSError:
                pass
    if not cached:
        try:
            await _run_ffmpeg(source_path, output_path, height)
        except Exception as error:  # noqa: BLE001 - 直接把原因回给前端面板
            LOG.warning("参考视频压缩失败: %s", error)
            if os.path.isfile(output_path):
                try:
                    os.remove(output_path)
                except OSError:
                    pass
            return web.json_response({"error": str(error)}, status=500)

    out_size = await _probe_size(output_path) or (0, 0)
    return web.json_response({
        "name": _relative_input_name(output_path),
        "requested": height,
        "width": out_size[0],
        "height": out_size[1],
        "source_width": size[0],
        "source_height": size[1],
        "bytes": os.path.getsize(output_path),
        "cached": cached,
    })


def register_video_tool_routes() -> bool:
    global _ROUTES_REGISTERED
    if _ROUTES_REGISTERED:
        return True
    instance = getattr(PromptServer, "instance", None)
    if instance is None:
        return False
    instance.routes.post("/blackrin/minimax-h3/video/compress")(compress_reference_video)
    _ROUTES_REGISTERED = True
    return True


register_video_tool_routes()
