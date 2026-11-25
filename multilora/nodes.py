#!/usr/bin/env python3
"""
nodes.py - Multi LoRA Loader 节点 + HTTP API

修复记录（2026-11-20）：
  1. LORA_ROOT 原来写死 Ubuntu 路径（/mnt/AIModels/...），Windows 下扫出 0 个 LoRA
     → 改为走 folder_paths.get_folder_paths("loras")，保留 Linux 路径做兜底
  2. apply() 里 clip 是未定义局部变量（NameError），空栈直接崩、非空栈被 except 吞掉
     → 节点保持纯净：只有 MODEL 进出 + TRIGGERS，clip 内部固定 None（纯 MODEL 侧应用）
  3. 前端不传 abs_path 导致每条被跳过 → 后端按 name 回查 abs_path（带路径校验）
  4. 预览接口拿 scan 的绝对路径去 join LORA_ROOT 再校验越界 → 必然 403
     → 直接用 scan 结果、只做 realpath 是否落在 LoRA 根目录内的校验
"""
import os
import io
import re
import asyncio
import uuid
import json
import time
import hashlib
import logging
import urllib.parse
import aiohttp
from aiohttp import web
from server import PromptServer

import folder_paths
import comfy.utils
import comfy.sd

# 导入同目录下的 loralib
try:
    from . import loralib
except ImportError:
    import loralib

# Linux 侧兜底路径（Windows 下走 folder_paths，不会用到这里）
FALLBACK_LORA_ROOT = "/mnt/AIModels/Aiwork/Comfyui-library/models/loras"
# ★ 2026-11-22 双系统：Windows 侧同一个物理库的路径。哪边存在扫哪边。
WINDOWS_LORA_ROOT = r"D:\Aiwork\Comfyui-library\models\loras"

PLUGIN_DIR = os.path.dirname(os.path.abspath(__file__))
PRESET_FILE = os.path.join(PLUGIN_DIR, "user_data", "lora_presets.json")

# 确保预设目录存在
os.makedirs(os.path.dirname(PRESET_FILE), exist_ok=True)

# 日志记录
logger = logging.getLogger("ComfyUI.MultiLoraLoader")

# 扫描结果缓存：{roots_tuple: (ts, loras)}
_SCAN_CACHE = {}
_SCAN_TTL = 8.0


def get_lora_roots():
    """返回当前 ComfyUI 实际使用的 LoRA 根目录（realpath 列表）"""
    roots = []
    try:
        for p in folder_paths.get_folder_paths("loras"):
            if not p:
                continue
            rp = os.path.realpath(p)
            if rp not in roots:
                roots.append(rp)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"MultiLoraLoader: 读取 folder_paths 的 loras 目录失败: {e}")

    # ★ 双系统自动适配：两套库目录都尝试，存在就加进扫描根（同一个物理目录，另一边 isdir 为 False 自然跳过）。
    #   原来只有「folder_paths 给空」才兜底，而 ComfyUI 自带的空 models/loras 也算非空 → Ubuntu 侧永远读不到。
    for extra in (WINDOWS_LORA_ROOT, FALLBACK_LORA_ROOT):
        if extra and os.path.isdir(extra):
            rp = os.path.realpath(extra)
            if rp not in roots:
                roots.append(rp)

    return roots


def _inside_roots(path, roots=None):
    """path 是否落在某个 LoRA 根目录内（按路径分段比较，避免前缀误判）"""
    roots = roots if roots is not None else get_lora_roots()
    rp = os.path.realpath(path)
    for root in roots:
        try:
            if os.path.commonpath([rp, root]) == root:
                return True
        except ValueError:
            # 不同盘符（Windows）会抛 ValueError
            continue
    return False


def _scan_all(force=False):
    """扫描所有 LoRA 根目录，返回 (loras, roots)。结果带短 TTL 缓存。"""
    roots = get_lora_roots()
    key = tuple(roots)
    now = time.time()

    if not force:
        cached = _SCAN_CACHE.get(key)
        if cached and now - cached[0] < _SCAN_TTL:
            return cached[1], roots

    loras = loralib.scan_loras(list(roots)) if roots else []
    _SCAN_CACHE[key] = (now, loras)
    return loras, roots


def _norm_lora_name(value):
    """名字归一：统一正斜杠、去扩展名、忽略大小写。

    双系统必需——老工作流里存的是 Windows 风格 "Anima\\sex动作\\xxx"，
    换到 Linux 后扫描出来是 "Anima/sex动作/xxx"，不归一就永远匹配不上。
    """
    text = str(value or "").strip().replace("\\", "/")
    low = text.lower()
    for ext in (".safetensors", ".ckpt", ".pt", ".pth", ".bin", ".sft"):
        if low.endswith(ext):
            text = text[: -len(ext)]
            break
    return text.lower()


def _find_lora(name):
    """按 name 找 LoRA 条目（相对路径、无扩展名，分隔符与大小写都做归一）"""
    if not name:
        return None
    want = _norm_lora_name(name)
    loras, _ = _scan_all()
    for lora in loras:
        if _norm_lora_name(lora.get("name")) == want:
            return lora
    return None


def _resolve_abs_path(item):
    """
    从前端条目取绝对路径：
      1) 优先用 item["abs_path"]（必须在 LoRA 根目录内）
      2) 否则按 name 回查扫描结果（前端老版本不传 abs_path）
    返回绝对路径字符串或 None
    """
    roots = get_lora_roots()

    abs_path = item.get("abs_path") or ""
    if abs_path and os.path.isfile(abs_path) and _inside_roots(abs_path, roots):
        return os.path.realpath(abs_path)

    name = item.get("name") or ""
    if name:
        lora = _find_lora(name)
        if lora:
            return lora.get("abs_path")
    return None


class MultiLoraLoader:
    """
    多 LoRA 加载器节点
    支持通过 JSON 字符串批量加载多个 LoRA，并输出拼接好的触发词
    """
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "model": ("MODEL",),
            },
            "optional": {
                "lora_stack": ("STRING", {"default": "[]", "multiline": True}),
                "output_triggers": ("BOOLEAN", {"default": True}),
            }
        }

    RETURN_TYPES = ("MODEL", "STRING")
    RETURN_NAMES = ("MODEL", "TRIGGERS")
    FUNCTION = "apply"
    CATEGORY = "MultiLora"

    def apply(self, model, lora_stack="[]", output_triggers=True):
        """应用多个 LoRA 到 MODEL（纯 MODEL 侧，不碰 CLIP）"""
        clip = None
        # 解析 lora_stack JSON
        loras = []
        try:
            loras = json.loads(lora_stack) if lora_stack else []
            if not isinstance(loras, list):
                loras = []
        except (json.JSONDecodeError, TypeError):
            logger.warning(
                "MultiLoraLoader: 无法解析 lora_stack，使用空数组。输入: %s...",
                str(lora_stack)[:100],
            )
            loras = []

        # 过滤有效项
        valid_loras = []
        for item in loras:
            if not isinstance(item, dict):
                continue
            if not item.get("enabled", True):
                continue
            try:
                weight = float(item.get("weight", 0.0))
            except (TypeError, ValueError):
                weight = 0.0
            if weight == 0:
                continue
            item = dict(item)
            item["weight"] = weight
            valid_loras.append(item)

        if not valid_loras:
            return (model, "")

        applied = 0
        for lora_item in valid_loras:
            name = lora_item.get("name", "Unknown")
            abs_path = _resolve_abs_path(lora_item)
            if not abs_path:
                logger.warning(f"MultiLoraLoader: LoRA '{name}' 找不到文件，跳过")
                continue

            strength_model = lora_item.get("weight", 1.0)
            try:
                strength_clip = float(lora_item.get("weight_clip", strength_model))
            except (TypeError, ValueError):
                strength_clip = strength_model  # 保留字段以便日后接 CLIP，当前传 None 时无效

            try:
                lora_data = comfy.utils.load_torch_file(abs_path, safe_load=True)
                model, clip = comfy.sd.load_lora_for_models(
                    model, clip, lora_data, strength_model, strength_clip
                )
                applied += 1
                # 本节点不接 CLIP，clip 侧权重不生效，日志里别写 clip= 造成误会
                logger.info(
                    "MultiLoraLoader: 已应用 '%s' (model=%.3f)%s",
                    name, strength_model,
                    "" if strength_clip == strength_model else "（clip 侧权重未应用：节点无 CLIP 输入）",
                )
            except Exception as e:  # noqa: BLE001
                logger.warning(f"MultiLoraLoader: 加载 LoRA '{name}' 失败: {e}，跳过该项")
                continue

        trigger_text = loralib.build_trigger_text(valid_loras) if output_triggers else ""
        if output_triggers:
            logger.info(
                f"MultiLoraLoader: 本次共应用 {applied}/{len(valid_loras)} 个 LoRA，"
                f"触发词 {len(trigger_text.split(', ')) if trigger_text else 0} 条"
            )
        else:
            logger.info(
                f"MultiLoraLoader: 本次共应用 {applied}/{len(valid_loras)} 个 LoRA，"
                f"触发词输出已关闭"
            )
        return (model, trigger_text)


# ==================== HTTP API 注册 ====================

def _validate_name(name):
    """校验 name 参数，防止路径穿越"""
    if not name or not isinstance(name, str):
        return False
    if ".." in name:
        return False
    if not name.strip():
        return False
    return True


@PromptServer.instance.routes.get("/blackrin/multi_lora/loras")
async def get_loras(request):
    """获取所有可用的 LoRA 列表"""
    try:
        loras, roots = _scan_all(force=request.query.get("refresh") == "1")
        trigger_conf = _load_trigger_conf()

        result_loras = []
        for lora in loras:
            name = lora.get("name", "")
            abs_path = lora.get("abs_path", "")
            encoded_name = urllib.parse.quote(name, safe='')
            # 触发词：metadata 自带的 + 管理面板里手加的，并带上每条的开/关状态
            base_words = list(lora.get("triggers", []) or [])
            conf_entry = trigger_conf.get(name) if isinstance(trigger_conf.get(name), dict) else {}
            edited_words = conf_entry.get("words")
            if isinstance(edited_words, list):
                all_words = [str(w) for w in edited_words if str(w).strip()]
            else:
                extra_words = [str(w) for w in (conf_entry.get("extra") or []) if str(w).strip()]
                all_words = base_words + [w for w in extra_words if w not in base_words]
            disabled_set = {str(w) for w in (conf_entry.get("disabled") or [])}

            result_loras.append({
                "name": name,
                "filename": os.path.basename(abs_path or name),
                "abs_path": abs_path,
                "size": lora.get("size", 0),
                "preview_type": lora.get("preview_type") or "",
                "triggers": all_words,
                "trigger_states": [w not in disabled_set for w in all_words],
                "base_model": lora.get("base_model", ""),
                "nsfw_level": lora.get("nsfw_level", 0),
                "preview_source": lora.get("preview_source", ""),  # sha256 = 改名后靠哈希认回的
                "civitai_model_id": lora.get("civitai_model_id"),
                "civitai_version_id": lora.get("civitai_version_id"),
                "preview_url": f"/blackrin/multi_lora/preview?name={encoded_name}",
            })

        return web.json_response({
            "loras": result_loras,
            "count": len(result_loras),
            "roots": roots,
        })
    except Exception as e:  # noqa: BLE001
        logger.error(f"MultiLoraLoader API: 获取 LoRA 列表失败: {e}")
        return web.json_response({"error": str(e)}, status=500)


@PromptServer.instance.routes.get("/blackrin/multi_lora/preview")
async def get_preview(request):
    """获取 LoRA 预览文件，支持 HTTP Range 请求"""
    name = request.query.get("name", "")

    if not _validate_name(name):
        return web.Response(status=400, text="Invalid name parameter")

    target_lora = _find_lora(name)
    if not target_lora:
        return web.Response(status=404, text="LoRA not found")

    preview_abs = target_lora.get("preview_abs") or ""
    if not preview_abs:
        return web.Response(status=404, text="No preview available")

    # 路径来自自己的扫描结果，这里只做一次“确实在 LoRA 根目录内”的兜底校验
    if not _inside_roots(preview_abs):
        logger.warning(f"MultiLoraLoader API: 预览路径越界: {preview_abs}")
        return web.Response(status=403, text="Access denied")

    real_path = os.path.realpath(preview_abs)
    if not os.path.isfile(real_path):
        return web.Response(status=404, text="Preview file not found")

    file_size = os.path.getsize(real_path)
    lower = real_path.lower()
    if lower.endswith(('.mp4', '.webm', '.mov')):
        content_type = "video/mp4"
    elif lower.endswith('.png'):
        content_type = "image/png"
    elif lower.endswith('.webp'):
        content_type = "image/webp"
    elif lower.endswith(('.jpg', '.jpeg')):
        content_type = "image/jpeg"
    else:
        content_type = "application/octet-stream"

    range_header = request.headers.get('Range')
    if range_header:
        try:
            range_value = range_header.replace("bytes=", "")
            if "-" in range_value:
                start_str, end_str = range_value.split("-", 1)
                start = int(start_str) if start_str else 0
                end = int(end_str) if end_str else file_size - 1

                if start < 0 or start >= file_size or start > end:
                    return web.Response(
                        status=416,
                        headers={"Content-Range": f"bytes */{file_size}"}
                    )
                if end >= file_size:
                    end = file_size - 1

                length = end - start + 1
                with open(real_path, 'rb') as f:
                    f.seek(start)
                    data = f.read(length)

                return web.Response(
                    body=data,
                    status=206,
                    content_type=content_type,
                    headers={
                        "Content-Range": f"bytes {start}-{end}/{file_size}",
                        "Content-Length": str(length),
                        "Accept-Ranges": "bytes",
                    }
                )
        except (ValueError, IndexError) as e:  # noqa: BLE001
            logger.warning(f"MultiLoraLoader API: 无效的 Range 请求: {range_header}, 错误: {e}")

    with open(real_path, 'rb') as f:
        data = f.read()

    return web.Response(
        body=data,
        content_type=content_type,
        headers={
            "Content-Length": str(file_size),
            "Accept-Ranges": "bytes",
        }
    )


@PromptServer.instance.routes.get("/blackrin/multi_lora/presets")
async def get_presets(request):
    """获取所有预设，返回 {"presets": {名字: [条目]}}"""
    try:
        presets = loralib.load_presets(PRESET_FILE)
        return web.json_response({"presets": presets})
    except Exception as e:  # noqa: BLE001
        logger.error(f"MultiLoraLoader API: 获取预设失败: {e}")
        return web.json_response({"error": str(e)}, status=500)


@PromptServer.instance.routes.post("/blackrin/multi_lora/presets")
async def save_preset(request):
    """保存预设"""
    try:
        data = await request.json()
        name = data.get("name", "")
        items = data.get("items", [])

        if not name:
            return web.json_response({"error": "Name is required"}, status=400)
        if not _validate_name(name):
            return web.json_response({"error": "Invalid preset name"}, status=400)

        loralib.save_preset(PRESET_FILE, name, items)
        return web.json_response({"ok": True})
    except Exception as e:  # noqa: BLE001
        logger.error(f"MultiLoraLoader API: 保存预设失败: {e}")
        return web.json_response({"error": str(e)}, status=500)


@PromptServer.instance.routes.delete("/blackrin/multi_lora/presets")
async def delete_preset(request):
    """删除预设"""
    try:
        name = request.query.get("name", "")
        if not name:
            return web.json_response({"error": "Name is required"}, status=400)
        if not _validate_name(name):
            return web.json_response({"error": "Invalid preset name"}, status=400)

        success = loralib.delete_preset(PRESET_FILE, name)
        return web.json_response({"ok": success})
    except Exception as e:  # noqa: BLE001
        logger.error(f"MultiLoraLoader API: 删除预设失败: {e}")
        return web.json_response({"error": str(e)}, status=500)


# ==================== Civitai 预览图下载 ====================
# 参考 ComfyUI-Lora-Manager 的实现（civitai_client.py / preview_asset_service.py）：
#   · 接口：GET {base}/model-versions/by-hash/{sha256} 或 /model-versions/{versionId}
#   · 认证：Authorization: Bearer <civitai_api_key>（by-hash 走 auth，图片不需要）
#   · 图片地址把 /original=true 改写成 /width=450,optimized=true 省带宽
#   · 落盘：转成 webp（宽 448）放模型同目录，删掉旧的同名预览，回写 metadata.json
# 先试 civitai.red（国内可直连，Lora-Manager 也用它），再兜底官方 civitai.com
CIVITAI_API_BASES = ("https://civitai.red/api/v1", "https://civitai.com/api/v1")
# 本节点自己的配置（可选）：{"api_key": "...", "proxy": "http://127.0.0.1:7890", "api_base": "..."}
CIVITAI_CONF_FILE = os.path.join(PLUGIN_DIR, "user_data", "civitai.json")
PREVIEW_TARGET_WIDTH = 448
PREVIEW_EXTS = (".jpeg", ".jpg", ".png", ".webp", ".gif", ".mp4", ".webm")
_SHA256_CACHE = {}


def _read_json_file(path):
    # utf-8-sig：PowerShell 写的 UTF8 带 BOM，不带 sig 会直接解析失败
    try:
        with open(path, "r", encoding="utf-8-sig") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


def _write_json_file(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def _civitai_conf():
    data = _read_json_file(CIVITAI_CONF_FILE)
    return data if isinstance(data, dict) else {}


def _civitai_api_bases():
    env_base = (os.environ.get("CIVITAI_API_BASE") or "").strip()
    if env_base:
        return (env_base.rstrip("/"),)
    conf_base = (_civitai_conf().get("api_base") or "").strip()
    if conf_base:
        return (conf_base.rstrip("/"),)
    return CIVITAI_API_BASES


_LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1", "0.0.0.0"}


def _use_proxy_for(url, proxy):
    """本机地址永不走代理：否则开了 Clash 之后本地镜像/测试服务会被挡成 502"""
    if not proxy:
        return None
    try:
        host = (urllib.parse.urlparse(url).hostname or "").lower()
    except ValueError:
        return proxy
    if not host:
        return proxy
    if host in _LOCAL_HOSTS or host.startswith("127.") or host.endswith(".local"):
        return None
    return proxy


def _detect_proxy():
    """
    找可用代理：环境变量 > 本节点配置 > Lora-Manager 设置 > 探测本机常见端口
    （image.civitai.com 在国内直连不通，没代理下不了图）
    """
    for key in ("CIVITAI_PROXY", "HTTPS_PROXY", "https_proxy",
                "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"):
        val = (os.environ.get(key) or "").strip()
        if val:
            return val

    conf_proxy = (_civitai_conf().get("proxy") or "").strip()
    if conf_proxy:
        return conf_proxy

    lm_settings = os.path.join(
        os.path.dirname(PLUGIN_DIR), "ComfyUI-Lora-Manager", "settings.json"
    )
    lm = _read_json_file(lm_settings) if os.path.isfile(lm_settings) else None
    if isinstance(lm, dict):
        for key in ("proxy", "https_proxy", "http_proxy"):
            val = (lm.get(key) or "").strip() if isinstance(lm.get(key), str) else ""
            if val:
                return val

    # 探测本机常见代理端口（Clash 7890/7897、v2ray 10809/10808、通用 1080）
    import socket
    for port in (7890, 7897, 7891, 10809, 10808, 1080, 2080):
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.3):
                return f"http://127.0.0.1:{port}"
        except OSError:
            continue
    return ""


def _ensure_civitai_conf_file():
    """首次使用时写一份空配置，方便手动填 api_key / proxy"""
    if os.path.isfile(CIVITAI_CONF_FILE):
        return
    try:
        os.makedirs(os.path.dirname(CIVITAI_CONF_FILE), exist_ok=True)
        _write_json_file(CIVITAI_CONF_FILE, {"api_key": "", "proxy": "", "api_base": ""})
    except OSError:
        pass


def _civitai_token_info():
    """返回 (token, source)。source ∈ env / lora-manager / node-config / ''"""
    for key in ("CIVITAI_API_KEY", "CIVITAI_TOKEN"):
        val = (os.environ.get(key) or "").strip()
        if val:
            return val, "env"
    lm_settings = os.path.join(
        os.path.dirname(PLUGIN_DIR), "ComfyUI-Lora-Manager", "settings.json"
    )
    data = _read_json_file(lm_settings) if os.path.isfile(lm_settings) else None
    if isinstance(data, dict):
        val = (data.get("civitai_api_key") or "").strip()
        if val:
            return val, "lora-manager"
    val = (_civitai_conf().get("api_key") or "").strip()
    if val:
        return val, "node-config"
    return "", ""


def _get_civitai_token():
    """优先环境变量，其次复用 Lora-Manager 的设置，最后读本节点自己的配置"""
    return _civitai_token_info()[0]


def _mask_token(token):
    if not token:
        return ""
    if len(token) <= 8:
        return "*" * len(token)
    return f"{token[:4]}...{token[-4:]}"


def _sha256_of_file(path):
    """文件 sha256（按 路径+mtime+size 缓存，避免每次重算几百 MB）"""
    try:
        st = os.stat(path)
    except OSError:
        return ""
    key = (path, st.st_mtime, st.st_size)
    cached = _SHA256_CACHE.get(path)
    if cached and cached[0] == key:
        return cached[1]
    h = hashlib.sha256()
    try:
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b""):
                h.update(chunk)
    except OSError as e:
        logger.warning(f"MultiLoraLoader: 计算 sha256 失败 {path}: {e}")
        return ""
    digest = h.hexdigest()
    _SHA256_CACHE[path] = (key, digest)
    return digest


def _rewrite_preview_url(url, media_type=None):
    """把 C 站 /original=true 改写成压缩版，省流量（抄 Lora-Manager 的规则）"""
    if not url:
        return url
    try:
        parsed = urllib.parse.urlparse(url)
    except ValueError:
        return url
    host = (parsed.hostname or "").lower()
    if host != "civitai.com" and not host.endswith(".civitai.com"):
        return url
    if "/original=true" not in parsed.path:
        return url
    replacement = "/transcode=true,width=450,optimized=true" if (media_type or "").lower() == "video" \
        else "/width=450,optimized=true"
    new_path = parsed.path.replace("/original=true", replacement, 1)
    if new_path == parsed.path:
        return url
    return urllib.parse.urlunparse(parsed._replace(path=new_path))


def _pick_civitai_image(version):
    """从版本信息里挑一张预览：优先静态图、优先分辨率高的"""
    images = version.get("images") or []
    candidates = [i for i in images if isinstance(i, dict) and i.get("url")]
    if not candidates:
        return None

    def score(item):
        is_image = 1 if (item.get("type") or "image") == "image" else 0
        area = int(item.get("width") or 0) * int(item.get("height") or 0)
        return (is_image, area)

    candidates.sort(key=score, reverse=True)
    return candidates[0]


def _persist_preview(lora_abs_path, data, content_type, media_type, preferred_ext=""):
    """把下载的字节写进模型同目录，返回最终路径（图片统一转 webp）"""
    folder = os.path.dirname(lora_abs_path)
    stem = os.path.splitext(os.path.basename(lora_abs_path))[0]
    ctype = (content_type or "").lower()
    is_video = media_type == "video" or ctype.startswith("video/")

    payload = data
    ext = ""
    if is_video:
        ext = ".webm" if (preferred_ext.lower() == ".webm" or "webm" in ctype) else ".mp4"
    else:
        try:
            from PIL import Image  # ComfyUI 自带 Pillow
            im = Image.open(io.BytesIO(data))
            if getattr(im, "is_animated", False):
                im.seek(0)
            im = im.convert("RGB")
            if im.width > PREVIEW_TARGET_WIDTH:
                new_h = max(1, round(im.height * PREVIEW_TARGET_WIDTH / im.width))
                im = im.resize((PREVIEW_TARGET_WIDTH, new_h), Image.LANCZOS)
            buf = io.BytesIO()
            im.save(buf, format="WEBP", quality=85, method=4)
            payload = buf.getvalue()
            ext = ".webp"
        except Exception as e:  # 没装 Pillow 或图片损坏：原样落盘
            logger.warning(f"MultiLoraLoader: 预览转 webp 失败，原样保存: {e}")
            if "png" in ctype:
                ext = ".png"
            elif "webp" in ctype:
                ext = ".webp"
            else:
                ext = ".jpg"

    # 清掉同名的其它格式预览，避免节点扫到两张
    for old_ext in PREVIEW_EXTS:
        old_path = os.path.join(folder, stem + old_ext)
        if old_ext != ext and os.path.exists(old_path):
            try:
                os.remove(old_path)
            except OSError as e:
                logger.warning(f"MultiLoraLoader: 删除旧预览失败 {old_path}: {e}")

    out_path = os.path.join(folder, stem + ext)
    with open(out_path, "wb") as f:
        f.write(payload)
    return out_path


def _update_lora_metadata(lora_abs_path, preview_path, nsfw_level):
    meta_path = os.path.splitext(lora_abs_path)[0] + ".metadata.json"
    if not os.path.isfile(meta_path):
        return
    meta = _read_json_file(meta_path)
    if not isinstance(meta, dict):
        return
    meta["preview_url"] = preview_path.replace("\\", "/")
    try:
        meta["preview_nsfw_level"] = int(nsfw_level)
    except (TypeError, ValueError):
        meta["preview_nsfw_level"] = 0
    try:
        _write_json_file(meta_path, meta)
    except OSError as e:
        logger.warning(f"MultiLoraLoader: 回写 metadata 失败 {meta_path}: {e}")


async def _civitai_get_json(session, url, proxy=""):
    async with session.get(
        url, timeout=aiohttp.ClientTimeout(total=15), proxy=_use_proxy_for(url, proxy)
    ) as resp:
        if resp.status == 404:
            return None, "not found"
        if resp.status in (401, 403):
            return None, "需要 Civitai API Key（401/403）"
        if resp.status == 429:
            return None, "Civitai 限流（429），稍后再试"
        if resp.status >= 400:
            return None, f"HTTP {resp.status}"
        return await resp.json(content_type=None), None


@PromptServer.instance.routes.get("/blackrin/multi_lora/civitai_preview")
async def civitai_preview(request):
    """
    从 Civitai 下载某个 LoRA 的预览图并落盘
    查询参数：name=<LoRA 名>（必填）、refresh=1 强制重下
    """
    name = request.query.get("name", "")
    if not _validate_name(name):
        return web.json_response({"ok": False, "error": "Invalid name parameter"}, status=400)

    lora = _find_lora(name)
    if not lora:
        return web.json_response({"ok": False, "error": "LoRA not found"}, status=404)

    abs_path = lora.get("abs_path") or ""
    if not abs_path or not os.path.isfile(abs_path):
        return web.json_response({"ok": False, "error": "LoRA 文件不存在"}, status=404)

    try:
        meta_path = os.path.splitext(abs_path)[0] + ".metadata.json"
        meta = _read_json_file(meta_path) if os.path.isfile(meta_path) else {}
        meta = meta if isinstance(meta, dict) else {}
        civitai_meta = meta.get("civitai") if isinstance(meta.get("civitai"), dict) else {}

        version_id = civitai_meta.get("id") or meta.get("modelVersionId") or meta.get("version_id")
        sha256 = (meta.get("sha256") or "").strip().lower()
        if not sha256:
            sha256 = _sha256_of_file(abs_path)

        token = _get_civitai_token()
        proxy = _detect_proxy()
        bases = _civitai_api_bases()
        headers = {"User-Agent": "ComfyUI-MultiLora/1.0"}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        version = None
        last_err = ""
        async with aiohttp.ClientSession(headers=headers) as session:
            for base in bases:
                endpoints = []
                if version_id:
                    endpoints.append(f"{base}/model-versions/{version_id}")
                if sha256:
                    endpoints.append(f"{base}/model-versions/by-hash/{sha256}")
                for url in endpoints:
                    try:
                        data, err = await _civitai_get_json(session, url, proxy)
                    except Exception as e:  # noqa: BLE001
                        last_err = f"{base}: {e}"
                        continue
                    if data:
                        version = data
                        break
                    last_err = err or last_err
                if version:
                    break

            if not version:
                return web.json_response(
                    {"ok": False, "error": f"查不到 Civitai 信息（{last_err or '无结果'}）"},
                    status=502,
                )

            image = _pick_civitai_image(version)
            if not image:
                return web.json_response(
                    {"ok": False, "error": "该版本在 C 站没有预览图"}, status=404
                )

            media_type = image.get("type") or "image"
            url = _rewrite_preview_url(image.get("url"), media_type=media_type)
            ext_hint = os.path.splitext(urllib.parse.urlparse(image.get("url") or "").path)[1]
            try:
                async with session.get(
                    url, timeout=aiohttp.ClientTimeout(total=90), proxy=_use_proxy_for(url, proxy)
                ) as resp:
                    if resp.status >= 400:
                        return web.json_response(
                            {"ok": False, "error": f"下载预览失败 HTTP {resp.status}"}, status=502
                        )
                    payload = await resp.read()
                    content_type = resp.headers.get("Content-Type", "image/jpeg")
            except Exception as e:  # noqa: BLE001
                # 关键信息放最前面，前端提示条截断也看得见
                if proxy:
                    msg = f"下载预览失败（代理 {proxy} 不通）: {e}"
                else:
                    msg = f"直连 image.civitai.com 失败，需要代理: {e}"
                return web.json_response({"ok": False, "error": msg}, status=502)

        nsfw_level = image.get("nsfwLevel")
        if nsfw_level is None:
            nsfw_level = image.get("nsfw_level") or 0
        saved = _persist_preview(abs_path, payload, content_type, media_type, ext_hint or "")
        _update_lora_metadata(abs_path, saved, nsfw_level)
        _SCAN_CACHE.clear()  # 让 /loras 立刻看到新预览

        encoded = urllib.parse.quote(name, safe="")
        logger.info(f"MultiLoraLoader: 已从 C 站写入预览 {saved}")
        return web.json_response({
            "ok": True,
            "name": name,
            "saved": saved,
            "media": "video" if media_type == "video" else "image",
            "nsfw_level": nsfw_level,
            "preview_url": f"/blackrin/multi_lora/preview?name={encoded}&v={int(time.time())}",
        })
    except Exception as e:  # noqa: BLE001
        logger.error(f"MultiLoraLoader API: Civitai 预览下载失败: {e}")
        return web.json_response({"ok": False, "error": str(e)}, status=500)


# ==================== 手动上传预览 / 改名 ====================

MAX_UPLOAD_BYTES = 80 * 1024 * 1024   # 单张预览上限 80MB
_BAD_NAME_CHARS = set('\\/:*?"<>|')


@PromptServer.instance.routes.post("/blackrin/multi_lora/upload_preview")
async def upload_preview(request):
    """手动上传预览图（非 C 站的 LoRA 也能有图）：multipart 表单，字段名随意"""
    name = request.query.get("name", "")
    if not _validate_name(name):
        return web.json_response({"ok": False, "error": "Invalid name parameter"}, status=400)

    lora = _find_lora(name)
    if not lora:
        return web.json_response({"ok": False, "error": "LoRA not found"}, status=404)

    abs_path = lora.get("abs_path") or ""
    if not abs_path or not os.path.isfile(abs_path):
        return web.json_response({"ok": False, "error": "LoRA 文件不存在"}, status=404)

    ctype = (request.content_type or "").lower()
    if not ctype.startswith("multipart/"):
        return web.json_response({"ok": False, "error": "需要 multipart/form-data 上传"}, status=400)

    payload = b""
    filename = ""
    part_ctype = "image/png"
    try:
        reader = await request.multipart()
        while True:
            part = await reader.next()
            if part is None:
                break
            if part.filename:
                filename = part.filename or ""
                part_ctype = part.headers.get("Content-Type", "application/octet-stream")
                payload = await part.read(decode=False)
                break
            await part.release()
    except Exception as e:  # noqa: BLE001
        return web.json_response({"ok": False, "error": f"上传解析失败: {e}"}, status=400)

    if not payload:
        return web.json_response({"ok": False, "error": "没有收到文件"}, status=400)
    if len(payload) > MAX_UPLOAD_BYTES:
        return web.json_response({"ok": False, "error": "文件太大（上限 80MB）"}, status=413)

    ext_hint = os.path.splitext(filename)[1].lower()
    media_type = "video" if (part_ctype.startswith("video/") or ext_hint in (".mp4", ".webm", ".mov")) else "image"

    try:
        saved = _persist_preview(abs_path, payload, part_ctype, media_type, ext_hint)
    except Exception as e:  # noqa: BLE001
        logger.error(f"MultiLoraLoader: 保存上传预览失败: {e}")
        return web.json_response({"ok": False, "error": f"保存失败: {e}"}, status=500)

    _update_lora_metadata(abs_path, saved, lora.get("nsfw_level") or 0)
    _SCAN_CACHE.clear()
    encoded = urllib.parse.quote(name, safe="")
    logger.info(f"MultiLoraLoader: 已保存手动上传的预览 {saved}")
    return web.json_response({
        "ok": True,
        "name": name,
        "saved": saved,
        "media": media_type,
        "preview_url": f"/blackrin/multi_lora/preview?name={encoded}&v={int(time.time())}",
    })


@PromptServer.instance.routes.post("/blackrin/multi_lora/rename")
async def rename_lora(request):
    """
    重命名 LoRA 文件（只在原目录内改文件名，扩展名跟着原文件走）；
    预览图与 metadata 一起改名，避免出现“孤儿图”。
    """
    try:
        data = await request.json()
    except Exception:  # noqa: BLE001
        return web.json_response({"ok": False, "error": "JSON 解析失败"}, status=400)

    name = data.get("name", "")
    new_stem = str(data.get("new_name", "")).strip()

    if not _validate_name(name):
        return web.json_response({"ok": False, "error": "Invalid name parameter"}, status=400)
    if not new_stem:
        return web.json_response({"ok": False, "error": "新名字不能为空"}, status=400)
    if any(ch in _BAD_NAME_CHARS for ch in new_stem):
        return web.json_response({"ok": False, "error": '名字里不能有 \\ / : * ? " < > |'}, status=400)
    if new_stem in (".", ".."):
        return web.json_response({"ok": False, "error": "名字非法"}, status=400)

    lora = _find_lora(name)
    if not lora:
        return web.json_response({"ok": False, "error": "LoRA not found"}, status=404)

    abs_path = lora.get("abs_path") or ""
    if not abs_path or not os.path.isfile(abs_path):
        return web.json_response({"ok": False, "error": "LoRA 文件不存在"}, status=404)
    if not _inside_roots(abs_path):
        return web.json_response({"ok": False, "error": "文件不在 LoRA 目录内"}, status=403)

    folder = os.path.dirname(abs_path)
    base = os.path.basename(abs_path)
    old_stem, ext = os.path.splitext(base)
    new_stem = os.path.splitext(new_stem)[0] or new_stem   # 用户手滑带扩展名就去掉

    if new_stem == old_stem:
        return web.json_response({"ok": True, "name": name, "changed": False})

    target = os.path.join(folder, new_stem + ext)
    if os.path.exists(target):
        return web.json_response({"ok": False, "error": f"已存在同名文件：{new_stem}{ext}"}, status=409)

    try:
        os.rename(abs_path, target)
    except OSError as e:
        return web.json_response({"ok": False, "error": f"重命名失败: {e}"}, status=500)

    renamed = []
    # 预览图 / metadata 跟着改名
    for pext in PREVIEW_EXTS:
        old_p = os.path.join(folder, old_stem + pext)
        if os.path.exists(old_p):
            new_p = os.path.join(folder, new_stem + pext)
            try:
                os.replace(old_p, new_p)
                renamed.append(os.path.basename(new_p))
            except OSError as e:
                logger.warning(f"MultiLoraLoader: 预览改名失败 {old_p}: {e}")

    old_meta = os.path.join(folder, old_stem + ".metadata.json")
    new_meta = os.path.join(folder, new_stem + ".metadata.json")
    if os.path.exists(old_meta):
        try:
            os.replace(old_meta, new_meta)
            meta = _read_json_file(new_meta)
            if isinstance(meta, dict):
                meta["file_name"] = new_stem
                meta["file_path"] = target.replace("\\", "/")
                if meta.get("preview_url"):
                    meta["preview_url"] = os.path.join(folder, new_stem + os.path.splitext(
                        str(meta.get("preview_url")))[1]).replace("\\", "/")
                _write_json_file(new_meta, meta)
            renamed.append(os.path.basename(new_meta))
        except OSError as e:
            logger.warning(f"MultiLoraLoader: metadata 改名失败 {old_meta}: {e}")

    _SCAN_CACHE.clear()
    rel_new = (os.path.splitext(lora.get("name", old_stem))[0])
    rel_new = os.path.join(os.path.dirname(lora.get("name", "")), new_stem).strip("\\/").replace("/", "\\")
    logger.info(f"MultiLoraLoader: 已改名 {name} -> {rel_new}（同时改名 {renamed}）")
    return web.json_response({"ok": True, "name": rel_new, "old_name": name,
                              "changed": True, "renamed_files": renamed})


# ==================== 目录列举 / 位置转移 ====================

MAX_DIR_DEPTH = 4   # 目录树最多展示几层，避免扫出几百个节点


def get_move_roots():
    """
    「移动位置」允许的范围 = 只认 .../models/loras 这种标准模型目录。
    folder_paths 里可能还有 output/loras 之类的附加路径，那些不允许作为目的地。
    """
    roots = get_lora_roots()
    allowed = [
        r for r in roots
        if os.path.basename(r).lower() == "loras"
        and os.path.basename(os.path.dirname(r)).lower() == "models"
    ]
    return allowed if allowed else roots[:1]


@PromptServer.instance.routes.get("/blackrin/multi_lora/dirs")
async def list_dirs(request):
    """列出所有 LoRA 目录（含根目录与子目录），供「移动位置」选择"""
    result = []
    try:
        for root in get_move_roots():
            result.append({
                "path": root,
                "rel": "（根目录）",
                "root": root,
                "depth": 0,
            })
            for dirpath, dirnames, _files in os.walk(root):
                dirnames[:] = sorted(d for d in dirnames if not d.startswith("."))
                rel = os.path.relpath(dirpath, root)
                if rel == ".":
                    continue
                depth = len(rel.replace("\\", "/").split("/"))
                if depth >= MAX_DIR_DEPTH:
                    dirnames[:] = []
                result.append({
                    "path": dirpath,
                    "rel": rel.replace("\\", "/"),
                    "root": root,
                    "depth": depth,
                })
    except Exception as e:  # noqa: BLE001
        logger.error(f"MultiLoraLoader API: 列举目录失败: {e}")
        return web.json_response({"error": str(e)}, status=500)
    return web.json_response({"dirs": result})


@PromptServer.instance.routes.post("/blackrin/multi_lora/move")
async def move_lora(request):
    """
    转移 LoRA 位置：把 .safetensors（连同预览图和 metadata）移动到指定目录。
    目标目录必须在某个 LoRA 根目录内；不存在则新建。
    """
    try:
        data = await request.json()
    except Exception:  # noqa: BLE001
        return web.json_response({"ok": False, "error": "JSON 解析失败"}, status=400)

    name = data.get("name", "")
    target_dir = str(data.get("target_dir", "")).strip()

    if not _validate_name(name):
        return web.json_response({"ok": False, "error": "Invalid name parameter"}, status=400)
    if not target_dir:
        return web.json_response({"ok": False, "error": "目标目录不能为空"}, status=400)

    lora = _find_lora(name)
    if not lora:
        return web.json_response({"ok": False, "error": "LoRA not found"}, status=404)

    abs_path = lora.get("abs_path") or ""
    if not abs_path or not os.path.isfile(abs_path):
        return web.json_response({"ok": False, "error": "LoRA 文件不存在"}, status=404)
    if not _inside_roots(abs_path):
        return web.json_response({"ok": False, "error": "源文件不在 LoRA 目录内"}, status=403)

    roots = get_move_roots()
    target_dir = os.path.normpath(target_dir)
    # 目标必须在允许的根目录内（models/loras），出不去
    root_hit = None
    for root in roots:
        try:
            if os.path.commonpath([os.path.realpath(target_dir), root]) == root:
                root_hit = root
                break
        except ValueError:
            continue
    if not root_hit:
        return web.json_response({"ok": False, "error": "目标目录不在 LoRA 根目录内"}, status=403)

    rel_tgt = os.path.relpath(target_dir, root_hit)
    if rel_tgt != "." and any(ch in _BAD_NAME_CHARS for ch in rel_tgt):
        return web.json_response({"ok": False, "error": "目标目录名包含非法字符"}, status=400)

    src_dir = os.path.dirname(abs_path)
    if os.path.realpath(src_dir) == os.path.realpath(target_dir):
        return web.json_response({"ok": False, "error": "已经在这个目录里了"}, status=400)

    try:
        os.makedirs(target_dir, exist_ok=True)
    except OSError as e:
        return web.json_response({"ok": False, "error": f"创建目录失败: {e}"}, status=500)

    base = os.path.basename(abs_path)
    stem, _ext = os.path.splitext(base)
    dst_file = os.path.join(target_dir, base)
    if os.path.exists(dst_file):
        return web.json_response(
            {"ok": False, "error": f"目标目录已有同名文件：{base}"}, status=409
        )

    moved = []
    try:
        os.replace(abs_path, dst_file)
        moved.append(base)
    except OSError as e:
        return web.json_response({"ok": False, "error": f"移动失败: {e}"}, status=500)

    # 预览图 + metadata 一起搬
    for pext in PREVIEW_EXTS:
        src_p = os.path.join(src_dir, stem + pext)
        if os.path.exists(src_p):
            dst_p = os.path.join(target_dir, stem + pext)
            try:
                os.replace(src_p, dst_p)
                moved.append(os.path.basename(dst_p))
            except OSError as e:
                logger.warning(f"MultiLoraLoader: 预览移动失败 {src_p}: {e}")

    src_meta = os.path.join(src_dir, stem + ".metadata.json")
    if os.path.exists(src_meta):
        dst_meta = os.path.join(target_dir, stem + ".metadata.json")
        try:
            os.replace(src_meta, dst_meta)
            meta = _read_json_file(dst_meta)
            if isinstance(meta, dict):
                meta["file_path"] = dst_file.replace("\\", "/")
                if meta.get("preview_url"):
                    meta["preview_url"] = os.path.join(
                        target_dir, stem + os.path.splitext(str(meta.get("preview_url")))[1]
                    ).replace("\\", "/")
                _write_json_file(dst_meta, meta)
            moved.append(os.path.basename(dst_meta))
        except OSError as e:
            logger.warning(f"MultiLoraLoader: metadata 移动失败 {src_meta}: {e}")

    _SCAN_CACHE.clear()
    rel_root = os.path.relpath(target_dir, root_hit)
    new_rel_name = os.path.join("" if rel_root == "." else rel_root, stem).replace("/", "\\")
    logger.info(f"MultiLoraLoader: 已移动 {name} -> {new_rel_name}（{moved}）")
    return web.json_response({
        "ok": True,
        "old_name": name,
        "name": new_rel_name,
        "target_dir": target_dir,
        "moved_files": moved,
    })


@PromptServer.instance.routes.delete("/blackrin/multi_lora/delete")
async def delete_lora(request):
    """删除 LoRA：.safetensors + 预览图 + metadata.json 一起删（不可恢复）"""
    name = request.query.get("name", "")
    if not _validate_name(name):
        return web.json_response({"ok": False, "error": "Invalid name parameter"}, status=400)

    lora = _find_lora(name)
    if not lora:
        return web.json_response({"ok": False, "error": "LoRA not found"}, status=404)

    abs_path = lora.get("abs_path") or ""
    if not abs_path or not os.path.isfile(abs_path):
        return web.json_response({"ok": False, "error": "LoRA 文件不存在"}, status=404)
    if not _inside_roots(abs_path):
        return web.json_response({"ok": False, "error": "文件不在 LoRA 目录内"}, status=403)

    folder = os.path.dirname(abs_path)
    stem = os.path.splitext(os.path.basename(abs_path))[0]
    deleted = []

    try:
        os.remove(abs_path)
        deleted.append(os.path.basename(abs_path))
    except OSError as e:
        return web.json_response({"ok": False, "error": f"删除失败: {e}"}, status=500)

    for pext in PREVIEW_EXTS:
        p = os.path.join(folder, stem + pext)
        if os.path.exists(p):
            try:
                os.remove(p)
                deleted.append(os.path.basename(p))
            except OSError as e:
                logger.warning(f"MultiLoraLoader: 删除预览失败 {p}: {e}")

    meta = os.path.join(folder, stem + ".metadata.json")
    if os.path.exists(meta):
        try:
            os.remove(meta)
            deleted.append(os.path.basename(meta))
        except OSError as e:
            logger.warning(f"MultiLoraLoader: 删除 metadata 失败 {meta}: {e}")

    _SCAN_CACHE.clear()
    logger.info(f"MultiLoraLoader: 已删除 {name}（{deleted}）")
    return web.json_response({"ok": True, "name": name, "deleted": deleted})


# ==================== Civitai 模型下载 / 检查更新 ====================
# 参考 ComfyUI-Lora-Manager 的 download_manager.py / aria2_downloader.py：
#   · 下载地址 {host}/api/download/models/{versionId}（civitai.red 是镜像，国内可直连）
#   · 带 token 时 Authorization: Bearer，同时 query 追加 ?token=
#   · 下完写 <stem>.metadata.json（sha256 / civitai / base_model / preview_url）并抓预览图

CIVITAI_DL_HOSTS = ("https://civitai.red", "https://civitai.com")


def _civitai_dl_hosts():
    """下载域名，可被 env / 配置覆盖（测试或换镜像时用）"""
    env = (os.environ.get("CIVITAI_DL_BASE") or "").strip()
    if env:
        return tuple(x.strip().rstrip("/") for x in env.split(",") if x.strip())
    conf = (_civitai_conf().get("dl_base") or "").strip()
    if conf:
        return tuple(x.strip().rstrip("/") for x in conf.split(",") if x.strip())
    return CIVITAI_DL_HOSTS
TRIGGERS_CONF_FILE = os.path.join(PLUGIN_DIR, "user_data", "triggers.json")

DOWNLOAD_TASKS = {}          # task_id -> dict(state/bytes/total/name/error/path)
_UPDATE_CACHE = {}           # modelId -> (ts, model_json)
_UPDATE_TTL = 600


def _civitai_conf_get(key, default=""):
    val = _civitai_conf().get(key)
    return val if isinstance(val, str) and val else default


def _parse_civitai_ref(text):
    """
    解析用户粘贴的 Civitai 链接 / 纯数字
    返回 (model_id, version_id) 任一可能为 None
    """
    raw = (text or "").strip()
    if not raw:
        return None, None
    if raw.isdigit():
        return int(raw), None

    model_id = version_id = None
    m = re.search(r"models/(\d+)", raw)
    if m:
        model_id = int(m.group(1))
    m = re.search(r"modelVersionId=(\d+)", raw)
    if m:
        version_id = int(m.group(1))
    m = re.search(r"api/download/models/(\d+)", raw)
    if m:
        version_id = int(m.group(1))
    if not model_id and not version_id:
        m = re.search(r"(\d{5,9})", raw)
        if m:
            model_id = int(m.group(1))
    return model_id, version_id


async def _civitai_fetch(session, path, proxy):
    """依次尝试 civitai.red / civitai.com 的 API"""
    last = ""
    for base in _civitai_api_bases():
        try:
            data, err = await _civitai_get_json(session, base.rstrip("/") + path, proxy)
        except Exception as e:  # noqa: BLE001
            last = str(e)
            continue
        if data:
            return data, None
        last = err or last
    return None, last or "查不到 Civitai 信息"


def _version_summary(version):
    files = version.get("files") or []
    primary = None
    for f in files:
        if isinstance(f, dict) and f.get("primary"):
            primary = f
            break
    if primary is None and files:
        primary = files[0]
    return {
        "version_id": version.get("id"),
        "name": version.get("name") or "",
        "base_model": version.get("baseModel") or "",
        "trained_words": (version.get("trainedWords") or []),
        "published_at": version.get("publishedAt") or version.get("createdAt") or "",
        "size_kb": (primary or {}).get("sizeKB"),
        "file_name": (primary or {}).get("name") or "",
        "download_url": version.get("downloadUrl") or "",
        "preview_url": _rewrite_preview_url((_pick_civitai_image(version) or {}).get("url")),
        "early_access": bool(version.get("availability") == "EarlyAccess"),
    }


@PromptServer.instance.routes.get("/blackrin/multi_lora/civitai_model")
async def civitai_model(request):
    """解析 Civitai 链接/ID，返回模型信息与全部版本（用于下载面板）"""
    ref = request.query.get("ref", "")
    model_id, version_id = _parse_civitai_ref(ref)
    if not model_id and not version_id:
        return web.json_response({"ok": False, "error": "看不懂这个链接，粘贴 Civitai 模型页地址或数字 ID"}, status=400)

    token = _get_civitai_token()
    proxy = _detect_proxy()
    headers = {"User-Agent": "ComfyUI-MultiLora/1.0"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        async with aiohttp.ClientSession(headers=headers) as session:
            version = None
            if version_id and not model_id:
                version, err = await _civitai_fetch(session, f"/model-versions/{version_id}", proxy)
                if not version:
                    return web.json_response({"ok": False, "error": f"查不到版本：{err}"}, status=502)
                model_id = version.get("modelId")
            if version_id:
                version, err = await _civitai_fetch(session, f"/model-versions/{version_id}", proxy)
                if not version:
                    return web.json_response({"ok": False, "error": f"查不到版本：{err}"}, status=502)

            model, err = await _civitai_fetch(session, f"/models/{model_id}", proxy)
            if not model:
                return web.json_response({"ok": False, "error": f"查不到模型：{err}"}, status=502)

        versions = [v for v in (model.get("modelVersions") or []) if isinstance(v, dict)]
        versions.sort(key=lambda v: (v.get("publishedAt") or v.get("createdAt") or ""), reverse=True)
        return web.json_response({
            "ok": True,
            "model_id": model_id,
            "model_name": model.get("name") or "",
            "type": model.get("type") or "",
            "creator": (model.get("creator") or {}).get("username") or "",
            "stats": model.get("stats") or {},
            "versions": [_version_summary(v) for v in versions],
            "selected_version": (version or {}).get("id"),
        })
    except Exception as e:  # noqa: BLE001
        return web.json_response({"ok": False, "error": str(e)}, status=500)


def _safe_filename(name, fallback="lora.safetensors"):
    name = re.sub(r'[\\/:*?"<>|]+', "_", (name or "").strip()) or fallback
    if not os.path.splitext(name)[1]:
        name += ".safetensors"
    return name


async def _stream_download(task_id, url, dest_path, proxy, token):
    """带进度的流式下载到 dest_path"""
    task = DOWNLOAD_TASKS[task_id]
    headers = {"User-Agent": "ComfyUI-MultiLora/1.0", "Accept": "*/*"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    part_path = dest_path + ".part"
    try:
        connector = None
        async with aiohttp.ClientSession(headers=headers) as session:
            async with session.get(
                url, proxy=_use_proxy_for(url, proxy), timeout=aiohttp.ClientTimeout(total=None, sock_read=120)
            ) as resp:
                if resp.status >= 400:
                    task.update(state="error", error=f"HTTP {resp.status}")
                    return False
                total = int(resp.headers.get("Content-Length") or 0)
                task["total"] = total
                written = 0
                with open(part_path, "wb") as f:
                    async for chunk in resp.content.iter_chunked(1024 * 512):
                        f.write(chunk)
                        written += len(chunk)
                        task["bytes"] = written
                if total and written < total * 0.999:
                    task.update(state="error", error=f"下载不完整（{written}/{total} 字节）")
                    try:
                        os.remove(part_path)
                    except OSError:
                        pass
                    return False
        os.replace(part_path, dest_path)
        task.update(state="done", bytes=written, path=dest_path)
        return True
    except Exception as e:  # noqa: BLE001
        task.update(state="error", error=str(e))
        try:
            if os.path.exists(part_path):
                os.remove(part_path)
        except OSError:
            pass
        return False


async def _post_process_download(task_id, dest_path, version):
    """下载完成后：补 metadata.json + 抓预览图"""
    task = DOWNLOAD_TASKS[task_id]
    try:
        sha = _sha256_of_file(dest_path)
        meta = {
            "file_name": os.path.splitext(os.path.basename(dest_path))[0],
            "file_path": dest_path.replace("\\", "/"),
            "size": os.path.getsize(dest_path) if os.path.isfile(dest_path) else 0,
            "sha256": sha,
            "base_model": version.get("baseModel") or "",
            "from_civitai": True,
            "civitai": {
                "id": version.get("id"),
                "modelId": version.get("modelId"),
                "name": version.get("name") or "",
                "baseModel": version.get("baseModel") or "",
                "trainedWords": version.get("trainedWords") or [],
                "publishedAt": version.get("publishedAt") or "",
            },
        }
        meta_path = os.path.splitext(dest_path)[0] + ".metadata.json"
        _write_json_file(meta_path, meta)

        image = _pick_civitai_image(version)
        if image:
            url = _rewrite_preview_url(image.get("url"), media_type=image.get("type"))
            proxy = _detect_proxy()
            token = _get_civitai_token()
            headers = {"User-Agent": "ComfyUI-MultiLora/1.0"}
            if token:
                headers["Authorization"] = f"Bearer {token}"
            async with aiohttp.ClientSession(headers=headers) as session:
                async with session.get(url, proxy=_use_proxy_for(url, proxy),
                                       timeout=aiohttp.ClientTimeout(total=90)) as resp:
                    if resp.status < 400:
                        payload = await resp.read()
                        saved = _persist_preview(
                            dest_path, payload, resp.headers.get("Content-Type", "image/jpeg"),
                            image.get("type") or "image",
                            os.path.splitext(urllib.parse.urlparse(image.get("url") or "").path)[1],
                        )
                        _update_lora_metadata(dest_path, saved, image.get("nsfwLevel") or 0)
        task["state"] = "done"
    except Exception as e:  # noqa: BLE001
        logger.warning(f"MultiLoraLoader: 下载后处理失败: {e}")
        task["state"] = "done"   # 文件已落盘，后处理失败不算下载失败
    finally:
        _SCAN_CACHE.clear()


@PromptServer.instance.routes.get("/blackrin/multi_lora/civitai_config")
async def get_civitai_config(request):
    """Civitai 账号配置状态（API Key 是否存在、来源、掩码、代理）"""
    token, source = _civitai_token_info()
    conf = _civitai_conf()
    return web.json_response({
        "ok": True,
        "has_key": bool(token),
        "key_source": source,                 # env / lora-manager / node-config / ''
        "key_hint": _mask_token(token),
        "proxy": conf.get("proxy") or "",
        "proxy_in_use": _detect_proxy(),
        "conf_path": CIVITAI_CONF_FILE,
    })


@PromptServer.instance.routes.post("/blackrin/multi_lora/civitai_config")
async def save_civitai_config(request):
    """保存 API Key / 代理到 user_data/civitai.json（空串 = 清除）"""
    try:
        data = await request.json()
    except Exception:  # noqa: BLE001
        return web.json_response({"ok": False, "error": "JSON 解析失败"}, status=400)
    if not isinstance(data, dict):
        return web.json_response({"ok": False, "error": "参数格式错误"}, status=400)

    conf = dict(_civitai_conf())
    conf.setdefault("api_base", "")
    conf.setdefault("dl_base", "")

    if "api_key" in data:
        key = str(data.get("api_key") or "").strip()
        if key.lower().startswith("bearer "):
            key = key[7:].strip()
        conf["api_key"] = key
    if "proxy" in data:
        conf["proxy"] = str(data.get("proxy") or "").strip()

    try:
        os.makedirs(os.path.dirname(CIVITAI_CONF_FILE), exist_ok=True)
        _write_json_file(CIVITAI_CONF_FILE, conf)
    except OSError as e:
        return web.json_response({"ok": False, "error": f"保存失败: {e}"}, status=500)

    token, source = _civitai_token_info()
    logger.info(f"MultiLoraLoader: Civitai 配置已保存（key {'有' if token else '无'}，来源 {source or '-'}）")
    return web.json_response({
        "ok": True,
        "has_key": bool(token),
        "key_source": source,
        "key_hint": _mask_token(token),
        "proxy": conf.get("proxy") or "",
    })


@PromptServer.instance.routes.post("/blackrin/multi_lora/civitai_download")
async def civitai_download(request):
    """
    下载指定的 Civitai 版本到目标目录。
    参数：{version_id 或 ref, target_dir, rename(可选)}
    """
    try:
        data = await request.json()
    except Exception:  # noqa: BLE001
        return web.json_response({"ok": False, "error": "JSON 解析失败"}, status=400)

    version_id = data.get("version_id")
    ref = str(data.get("ref") or "")
    target_dir = str(data.get("target_dir") or "").strip()
    rename = str(data.get("rename") or "").strip()

    if not version_id:
        _mid, _vid = _parse_civitai_ref(ref)
        version_id = _vid
    if not version_id:
        return web.json_response({"ok": False, "error": "没有指定版本 ID"}, status=400)
    if not target_dir:
        return web.json_response({"ok": False, "error": "没有指定下载目录"}, status=400)

    roots = get_move_roots()
    target_dir = os.path.normpath(target_dir)
    inside = False
    for root in roots:
        try:
            if os.path.commonpath([os.path.realpath(target_dir), root]) == root:
                inside = True
                break
        except ValueError:
            continue
    if not inside:
        return web.json_response({"ok": False, "error": "下载目录必须在 LoRA 根目录内"}, status=403)

    token = _get_civitai_token()
    proxy = _detect_proxy()
    headers = {"User-Agent": "ComfyUI-MultiLora/1.0"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        async with aiohttp.ClientSession(headers=headers) as session:
            version, err = await _civitai_fetch(session, f"/model-versions/{version_id}", proxy)
        if not version:
            return web.json_response({"ok": False, "error": f"查不到版本信息：{err}"}, status=502)
    except Exception as e:  # noqa: BLE001
        return web.json_response({"ok": False, "error": str(e)}, status=500)

    if version.get("availability") == "EarlyAccess":
        return web.json_response({"ok": False, "error": "该版本需要 Civitai 会员/API Key 才能下载"}, status=403)

    summary = _version_summary(version)
    filename = _safe_filename(rename or summary["file_name"] or f"civitai_{version_id}.safetensors")
    dest_path = os.path.join(target_dir, filename)
    if os.path.exists(dest_path) and not data.get("overwrite"):
        return web.json_response(
            {"ok": False, "error": f"目标目录已有同名文件：{filename}"}, status=409
        )

    os.makedirs(target_dir, exist_ok=True)
    task_id = uuid.uuid4().hex[:12]
    DOWNLOAD_TASKS[task_id] = {
        "id": task_id, "state": "running", "bytes": 0,
        "total": int((summary.get("size_kb") or 0) * 1024),
        "name": filename, "path": dest_path, "error": "",
        "model_name": summary.get("name") or "", "version_id": version_id,
    }

    async def _worker():
        ok = False
        last_err = ""
        for host in _civitai_dl_hosts():
            url = f"{host}/api/download/models/{version_id}"
            if token:
                url += f"?token={urllib.parse.quote(token)}"
            logger.info(f"MultiLoraLoader: 开始下载 {url}")
            ok = await _stream_download(task_id, url, dest_path, proxy, token)
            if ok:
                break
            last_err = DOWNLOAD_TASKS[task_id].get("error", "")
            DOWNLOAD_TASKS[task_id].update(state="running", error="")
        if ok:
            await _post_process_download(task_id, dest_path, version)
        else:
            DOWNLOAD_TASKS[task_id].update(state="error", error=last_err or "下载失败")

    asyncio.create_task(_worker())
    return web.json_response({"ok": True, "task_id": task_id, "name": filename,
                              "target_dir": target_dir, "size_kb": summary.get("size_kb")})


@PromptServer.instance.routes.get("/blackrin/multi_lora/download_status")
async def download_status(request):
    tid = request.query.get("id", "")
    task = DOWNLOAD_TASKS.get(tid)
    if not task:
        return web.json_response({"ok": False, "error": "任务不存在"}, status=404)
    out = dict(task)
    total = out.get("total") or 0
    out["percent"] = round((out.get("bytes") or 0) * 100.0 / total, 1) if total else None
    return web.json_response({"ok": True, "task": out})


@PromptServer.instance.routes.get("/blackrin/multi_lora/check_updates")
async def check_updates(request):
    """检查哪些 LoRA 在 Civitai 上有更新版本"""
    token = _get_civitai_token()
    proxy = _detect_proxy()
    headers = {"User-Agent": "ComfyUI-MultiLora/1.0"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    loras, _roots = _scan_all(force=request.query.get("refresh") == "1")
    checked = 0
    results = []
    try:
        async with aiohttp.ClientSession(headers=headers) as session:
            for lora in loras:
                abs_path = lora.get("abs_path") or ""
                meta_path = os.path.splitext(abs_path)[0] + ".metadata.json"
                meta = _read_json_file(meta_path) if os.path.isfile(meta_path) else None
                if not isinstance(meta, dict):
                    continue
                civ = meta.get("civitai") if isinstance(meta.get("civitai"), dict) else {}
                model_id = civ.get("modelId") or meta.get("modelId")
                cur_version = civ.get("id") or meta.get("version_id")
                if not model_id:
                    continue

                cached = _UPDATE_CACHE.get(model_id)
                if cached and time.time() - cached[0] < _UPDATE_TTL:
                    model = cached[1]
                else:
                    model, _err = await _civitai_fetch(session, f"/models/{model_id}", proxy)
                    if model:
                        _UPDATE_CACHE[model_id] = (time.time(), model)
                checked += 1
                if not model:
                    continue

                versions = [v for v in (model.get("modelVersions") or []) if isinstance(v, dict)]
                if not versions:
                    continue
                versions.sort(key=lambda v: (v.get("publishedAt") or v.get("createdAt") or ""), reverse=True)
                latest = versions[0]
                if cur_version and latest.get("id") == cur_version:
                    continue
                # 本地已经把这个新版本下下来了（作为独立文件）就不算待下载
                latest_id = int(latest.get("id") or 0)
                already = False
                if latest_id:
                    for other in loras:
                        other_meta = _read_json_file(
                            os.path.splitext(other.get("abs_path") or "")[0] + ".metadata.json"
                        ) if os.path.isfile(os.path.splitext(other.get("abs_path") or "")[0] + ".metadata.json") else None
                        if not isinstance(other_meta, dict):
                            continue
                        civ2 = other_meta.get("civitai") if isinstance(other_meta.get("civitai"), dict) else {}
                        if (civ2.get("id") or other_meta.get("version_id")) == latest.get("id"):
                            already = True
                            break
                if already:
                    continue
                results.append({
                    "name": lora.get("name"),
                    "current_version_id": cur_version,
                    "current_name": civ.get("name") or "",
                    "latest": _version_summary(latest),
                    "model_id": model_id,
                    "model_name": model.get("name") or "",
                })
    except Exception as e:  # noqa: BLE001
        return web.json_response({"ok": False, "error": str(e)}, status=500)

    return web.json_response({"ok": True, "checked": checked, "updates": results})


# 说明：不再提供「原地覆盖更新」。Civitai 的版本是并存的（新版不保证更好），
# 选版本 = 下载成新文件，旧版本原样保留，由用户自己决定用哪个。


# ==================== 触发词管理（持久化） ====================

def _load_trigger_conf():
    data = _read_json_file(TRIGGERS_CONF_FILE)
    return data if isinstance(data, dict) else {}


@PromptServer.instance.routes.get("/blackrin/multi_lora/triggers")
async def get_trigger_conf(request):
    return web.json_response({"ok": True, "triggers": _load_trigger_conf()})


@PromptServer.instance.routes.post("/blackrin/multi_lora/triggers")
async def save_trigger_conf(request):
    """保存某个 LoRA 的触发词配置：{name, disabled:[...], extra:[...]}"""
    try:
        data = await request.json()
    except Exception:  # noqa: BLE001
        return web.json_response({"ok": False, "error": "JSON 解析失败"}, status=400)
    name = str(data.get("name") or "")
    if not _validate_name(name):
        return web.json_response({"ok": False, "error": "Invalid name"}, status=400)

    words = data.get("words")
    disabled = data.get("disabled")
    extra = data.get("extra")
    conf = _load_trigger_conf()
    entry = conf.get(name) if isinstance(conf.get(name), dict) else {}
    if isinstance(words, list):
        # 用户在编辑界面里改过的完整词表（可加、可删、可改文字）
        entry["words"] = [str(x) for x in words if str(x).strip()]
    if isinstance(disabled, list):
        entry["disabled"] = [str(x) for x in disabled]
    if isinstance(extra, list):
        entry["extra"] = [str(x) for x in extra]
    if entry:
        conf[name] = entry
    else:
        conf.pop(name, None)
    try:
        os.makedirs(os.path.dirname(TRIGGERS_CONF_FILE), exist_ok=True)
        _write_json_file(TRIGGERS_CONF_FILE, conf)
    except OSError as e:
        return web.json_response({"ok": False, "error": f"保存失败: {e}"}, status=500)
    _SCAN_CACHE.clear()
    return web.json_response({"ok": True, "count": len(conf)})


_CIVITAI_MODEL_CACHE = {}


@PromptServer.instance.routes.get("/blackrin/multi_lora/civitai_detail")
async def civitai_detail(request):
    """Civitai 模型详情（描述 / 示例图 / 全部版本），供详情弹窗 tabs 用。"""
    model_id = (request.query.get("model_id") or "").strip()
    if not model_id.isdigit():
        return web.json_response({"ok": False, "error": "bad model_id"}, status=400)

    now = time.time()
    cached = _CIVITAI_MODEL_CACHE.get(model_id)
    if cached and now - cached[0] < 600:
        return web.json_response({"ok": True, "model": cached[1], "cached": True})

    token = _get_civitai_token()
    proxy = _detect_proxy()
    headers = {"User-Agent": "ComfyUI-MultiLora/1.0"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    raw = None
    last_err = ""
    for base in _civitai_api_bases():
        try:
            async with aiohttp.ClientSession() as sess:
                async with sess.get(
                    f"{base}/models/{model_id}",
                    headers=headers,
                    proxy=proxy or None,
                    timeout=aiohttp.ClientTimeout(total=25),
                ) as resp:
                    if resp.status != 200:
                        last_err = f"HTTP {resp.status} @ {base}"
                        continue
                    raw = await resp.json()
                    break
        except Exception as exc:  # noqa: BLE001
            last_err = f"{type(exc).__name__}: {exc}"
            continue

    if not raw:
        return web.json_response({"ok": False, "error": last_err or "fetch failed"}, status=502)

    versions = []
    for ver in (raw.get("modelVersions") or []):
        images = []
        for img in (ver.get("images") or [])[:24]:
            url = img.get("url") or ""
            if not url:
                continue
            images.append({
                "url": "/blackrin/multi_lora/civitai_image?url=" + urllib.parse.quote(url, safe=""),
                "width": img.get("width"),
                "height": img.get("height"),
                "nsfw": img.get("nsfwLevel") or img.get("nsfw") or 0,
            })
        size_kb = None
        for file_item in (ver.get("files") or []):
            if str(file_item.get("type", "")).lower() == "model":
                size_kb = file_item.get("sizeKB")
                break
        versions.append({
            "id": ver.get("id"),
            "name": ver.get("name"),
            "baseModel": ver.get("baseModel"),
            "createdAt": ver.get("createdAt"),
            "description": (ver.get("description") or "")[:6000],
            "trainedWords": ver.get("trainedWords") or [],
            "images": images,
            "sizeKB": size_kb,
            "downloadUrl": ver.get("downloadUrl"),
        })

    model = {
        "id": raw.get("id"),
        "name": raw.get("name"),
        "type": raw.get("type"),
        "description": raw.get("description") or "",
        "creator": (raw.get("creator") or {}).get("username") or "",
        "versions": versions,
    }
    _CIVITAI_MODEL_CACHE[model_id] = (now, model)
    return web.json_response({"ok": True, "model": model})


@PromptServer.instance.routes.get("/blackrin/multi_lora/civitai_image")
async def civitai_image_proxy(request):
    """代理 Civitai 图片（国内直连 image.civitai.com 不通，必须走代理）。"""
    url = (request.query.get("url") or "").strip()
    if not url:
        return web.Response(status=400)
    host = (urllib.parse.urlparse(url).hostname or "").lower()
    if host != "civitai.com" and not host.endswith(".civitai.com"):
        return web.Response(status=403)
    proxy = _detect_proxy()
    try:
        async with aiohttp.ClientSession() as sess:
            async with sess.get(url, proxy=proxy or None,
                                timeout=aiohttp.ClientTimeout(total=25)) as resp:
                if resp.status != 200:
                    return web.Response(status=resp.status)
                body = await resp.read()
                return web.Response(
                    body=body,
                    content_type=resp.content_type or "image/jpeg",
                    headers={"Cache-Control": "private, max-age=86400"},
                )
    except Exception as exc:  # noqa: BLE001
        logger.warning("civitai 图片代理失败: %s", exc)
        return web.Response(status=502)


@PromptServer.instance.routes.get("/blackrin/multi_lora/civitai_versions")
async def civitai_versions(request):
    """按本地 LoRA 的 metadata 拉取它在 Civitai 上的全部版本（含预览/大小/日期）"""
    name = request.query.get("name", "")
    if not _validate_name(name):
        return web.json_response({"ok": False, "error": "Invalid name"}, status=400)
    lora = _find_lora(name)
    if not lora:
        return web.json_response({"ok": False, "error": "LoRA not found"}, status=404)

    abs_path = lora.get("abs_path") or ""
    meta_path = os.path.splitext(abs_path)[0] + ".metadata.json"
    meta = _read_json_file(meta_path) if os.path.isfile(meta_path) else None
    meta = meta if isinstance(meta, dict) else {}
    civ = meta.get("civitai") if isinstance(meta.get("civitai"), dict) else {}
    model_id = civ.get("modelId") or meta.get("modelId")
    current_version = civ.get("id") or meta.get("version_id")
    if not model_id:
        return web.json_response({"ok": False, "error": "这个 LoRA 的 metadata 里没有 Civitai 模型信息"}, status=404)

    token = _get_civitai_token()
    proxy = _detect_proxy()
    headers = {"User-Agent": "ComfyUI-MultiLora/1.0"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        async with aiohttp.ClientSession(headers=headers) as session:
            model, err = await _civitai_fetch(session, f"/models/{model_id}", proxy)
        if not model:
            return web.json_response({"ok": False, "error": f"查不到模型：{err}"}, status=502)
    except Exception as e:  # noqa: BLE001
        return web.json_response({"ok": False, "error": str(e)}, status=500)

    versions = [v for v in (model.get("modelVersions") or []) if isinstance(v, dict)]
    versions.sort(key=lambda v: (v.get("publishedAt") or v.get("createdAt") or ""), reverse=True)

    # 本地已经装了哪些版本：按 metadata 里的 civitai.id 反查（版本并存，同名不同版本要能区分）
    installed = {}
    for other in _scan_all()[0]:
        other_meta_path = os.path.splitext(other.get("abs_path") or "")[0] + ".metadata.json"
        other_meta = _read_json_file(other_meta_path) if os.path.isfile(other_meta_path) else None
        if not isinstance(other_meta, dict):
            continue
        civ2 = other_meta.get("civitai") if isinstance(other_meta.get("civitai"), dict) else {}
        vid = civ2.get("id") or other_meta.get("version_id")
        if vid:
            installed[int(vid)] = other.get("name")

    summaries = []
    for v in versions:
        item = _version_summary(v)
        vid = int(v.get("id") or 0)
        item["is_current"] = (v.get("id") == current_version)
        item["installed"] = vid in installed
        item["installed_name"] = installed.get(vid) or ""
        summaries.append(item)

    return web.json_response({
        "ok": True,
        "name": name,
        "model_id": model_id,
        "model_name": model.get("name") or "",
        "current_version_id": current_version,
        "versions": summaries,
    })


# 首次运行写一份空的 Civitai 配置文件，方便填 api_key / proxy
_ensure_civitai_conf_file()


# ==================== 节点注册 ====================

NODE_CLASS_MAPPINGS = {
    "MultiLoraLoader": MultiLoraLoader
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "MultiLoraLoader": "Multi LoRA Loader"
}

WEB_DIRECTORY = "./web"
