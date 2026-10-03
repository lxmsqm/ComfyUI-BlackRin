"""BlackRin 自有配置：服务(API) + 规则(文本 / 图片)。

与 prompt-assistant（提示词小助手）共存，不做硬替换：

- 自己的配置存在 ``user/default/BlackRin/config.json``；
- 读取时**合并两边**：自己的在前，小助手的在后，同名以自己为准；
- 首次加载若自己没有配置，从小助手**迁移一份种子**（已存在则绝不覆盖）；
- 小助手没装/没配也能跑，只是列表里只有自己的条目。

规则只分两类：
- ``image`` 图片规则 —— 给图文优化推理节点（VLM 反推）、也是 H3 优化器的规则来源；
- ``text``  文本规则 —— 纯文本扩写/改写类的规则。

服务条目沿用 prompt-assistant 的结构（``vlm_models`` / ``llm_models``），
这样两边共用同一套读者，迁移也不需要转换。
"""

from __future__ import annotations

import json
import logging
import os
import urllib.parse
import uuid

import folder_paths

log = logging.getLogger("ComfyUI-BlackRin.config")

CONFIG_VERSION = 1
OWN_DIR_NAME = "BlackRin"
PA_DIR_NAME = "prompt-assistant"
RULE_KINDS = ("image", "text")
# 明显没写完的废条目（小助手那份里实测有一条正文只有一个逗号）不进下拉
MIN_RULE_CHARS = 10


def _user_dir() -> str:
    try:
        return folder_paths.get_user_directory()
    except Exception:
        # 与 nodes.py 的历史回退保持一致：插件目录往上找到 user/
        current = os.path.dirname(os.path.abspath(__file__))
        for _ in range(5):
            current = os.path.dirname(current)
            candidate = os.path.join(current, "user")
            if os.path.isdir(candidate):
                return candidate
        return ""


def own_config_path() -> str:
    return os.path.join(_user_dir(), "default", OWN_DIR_NAME, "config.json")


def _pa_config_path() -> str:
    return os.path.join(_user_dir(), "default", PA_DIR_NAME, "config", "config.json")


def _pa_rules_path() -> str:
    return os.path.join(_user_dir(), "default", PA_DIR_NAME, "rules", "system_prompts.json")


def _read_json(path: str):
    if not path or not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as file:
            return json.load(file)
    except (OSError, ValueError) as exc:
        log.warning("BlackRin 配置读取失败 %s: %s", path, exc)
        return None


def empty_config() -> dict:
    return {
        "version": CONFIG_VERSION,
        "services": [],
        "rules": {"image": [], "text": []},
    }


def load_own() -> dict:
    data = _read_json(own_config_path())
    if not isinstance(data, dict):
        return empty_config()
    config = empty_config()
    services = data.get("services")
    if isinstance(services, list):
        config["services"] = [s for s in services if isinstance(s, dict)]
    rules = data.get("rules")
    if isinstance(rules, dict):
        for kind in RULE_KINDS:
            items = rules.get(kind)
            if isinstance(items, list):
                config["rules"][kind] = [r for r in items if isinstance(r, dict)]
    config["version"] = int(data.get("version") or CONFIG_VERSION)
    return config


def save_own(config: dict) -> str:
    """写回自己的配置；返回写入路径。"""
    path = own_config_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    payload = {
        "version": CONFIG_VERSION,
        "services": [s for s in (config.get("services") or []) if isinstance(s, dict)],
        "rules": {
            kind: [r for r in ((config.get("rules") or {}).get(kind) or []) if isinstance(r, dict)]
            for kind in RULE_KINDS
        },
    }
    with open(path, "w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2)
    return path


# ---------------------------------------------------------------- 小助手侧读取


def _pa_services() -> list[dict]:
    data = _read_json(_pa_config_path())
    services = (data or {}).get("model_services") or []
    return [s for s in services if isinstance(s, dict) and str(s.get("type") or "") != "baidu"]


def _pa_rules() -> dict[str, list[dict]]:
    """把小助手的规则按用途归到 image / text 两类。"""
    data = _read_json(_pa_rules_path()) or {}
    out: dict[str, list[dict]] = {"image": [], "text": []}

    def collect(section, kind):
        items = data.get(section) or {}
        if not isinstance(items, dict):
            return
        for rule_id, item in items.items():
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "").strip()
            content = str(item.get("content") or "").strip()
            if not name or len(content) < MIN_RULE_CHARS:
                continue
            out[kind].append({
                "id": str(rule_id),
                "name": name,
                "content": content,
                "enabled": True,
                "source": "prompt-assistant",
                "readonly": True,
            })

    # 图片规则 = 视觉规则；文本规则 = 扩写/视频文本类规则
    collect("vision_prompts", "image")
    collect("llm_prompts", "text")
    collect("expand_prompts", "text")
    collect("video_prompts", "text")
    return out


def _normalize_service(service: dict, source: str, readonly: bool) -> dict:
    models = {"vlm_models": [], "llm_models": []}
    for key in models:
        for model in service.get(key) or []:
            if isinstance(model, dict) and str(model.get("name") or "").strip():
                models[key].append(dict(model))
    return {
        "id": str(service.get("id") or uuid.uuid4().hex[:8]),
        "name": str(service.get("name") or "").strip(),
        "type": str(service.get("type") or "openai_compatible"),
        "base_url": str(service.get("base_url") or "").strip(),
        "api_key": str(service.get("api_key") or ""),
        "vlm_models": models["vlm_models"],
        "llm_models": models["llm_models"],
        "source": source,
        "readonly": readonly,
    }


# ---------------------------------------------------------------- 迁移 / 合并


def migrate_from_prompt_assistant(force: bool = False) -> dict:
    """从小助手复制一份种子配置。已存在且非空时默认不覆盖。"""
    own = load_own()
    if not force and (own["services"] or own["rules"]["image"] or own["rules"]["text"]):
        return {"migrated": False, "reason": "已有自己的配置，未覆盖"}

    services = [_normalize_service(s, "prompt-assistant", True) for s in _pa_services()]
    rules = _pa_rules()
    config = {
        "version": CONFIG_VERSION,
        "services": services,
        "rules": {
            "image": rules["image"],
            "text": rules["text"],
        },
    }
    path = save_own(config)
    log.info("BlackRin 配置：已从小助手迁移 %d 个服务 / %d 条图片规则 / %d 条文本规则 → %s",
             len(services), len(rules["image"]), len(rules["text"]), path)
    return {
        "migrated": True,
        "services": len(services),
        "rules_image": len(rules["image"]),
        "rules_text": len(rules["text"]),
        "path": path,
    }


def ensure_seeded() -> dict:
    """首次使用自动迁移；已经有自己的配置就什么都不做。"""
    own = load_own()
    if own["services"] or own["rules"]["image"] or own["rules"]["text"]:
        return {"migrated": False}
    if not _pa_services() and not any(_pa_rules().values()):
        return {"migrated": False, "reason": "两边都没有可迁移的配置"}
    return migrate_from_prompt_assistant()


def merged_services() -> list[dict]:
    """自己的 + 小助手的；同名以自己为准。"""
    own = load_own()
    out: list[dict] = []
    seen: set[str] = set()
    for service in own["services"]:
        item = _normalize_service(service, "blackrin", False)
        if not item["name"]:
            continue
        seen.add(item["name"])
        out.append(item)
    for service in _pa_services():
        item = _normalize_service(service, "prompt-assistant", True)
        if not item["name"] or item["name"] in seen:
            continue
        seen.add(item["name"])
        out.append(item)
    return out


def merged_rules(kind: str) -> list[dict]:
    """自己的 + 小助手的规则；同名以自己为准。"""
    if kind not in RULE_KINDS:
        raise ValueError(f"未知的规则类型: {kind}")
    own = load_own()
    out: list[dict] = []
    seen: set[str] = set()
    for rule in own["rules"][kind]:
        name = str(rule.get("name") or "").strip()
        content = str(rule.get("content") or "").strip()
        if not name or len(content) < MIN_RULE_CHARS or rule.get("enabled") is False:
            continue
        seen.add(name)
        out.append({
            "id": str(rule.get("id") or uuid.uuid4().hex[:8]),
            "name": name,
            "content": content,
            "source": "blackrin",
            "readonly": False,
        })
    for rule in _pa_rules()[kind]:
        if rule["name"] in seen:
            continue
        seen.add(rule["name"])
        out.append(rule)
    return out


def optimizer_services() -> list[dict]:
    """H3 优化器要的形状：name / base_url / api_key / models。"""
    out = []
    for service in merged_services():
        if not service["base_url"]:
            continue
        models = sorted({
            str(model.get("name")).strip()
            for model in service["vlm_models"] + service["llm_models"]
            if model.get("name")
        })
        out.append({
            "name": service["name"],
            "base_url": service["base_url"],
            "api_key": service["api_key"],
            "models": models,
            "source": service["source"],
        })
    return out


def optimizer_rules() -> list[dict]:
    """H3 优化器的规则列表。

    H3 的规则本质是"看图改视频提示词"，历史上用的是小助手的视觉规则；
    为了不破坏已有工作流里选的"H3 NSFW"等名字，这里**图片规则在前、文本规则在后**合并，
    名字保持原样不加前缀。
    """
    out = merged_rules("image") + merged_rules("text")
    seen = set()
    unique = []
    for rule in out:
        if rule["name"] in seen:
            continue
        seen.add(rule["name"])
        unique.append({"name": rule["name"], "content": rule["content"]})
    return unique


def active_image_name() -> str:
    """当前激活的图片规则名：自己配置里的 active_image，否则沿用小助手的激活项。"""
    own = load_own()
    own_active = str(own.get("active_image") or "").strip()
    if own_active:
        return own_active
    active = _read_json(os.path.join(_user_dir(), "default", PA_DIR_NAME,
                                     "config", "active_prompts.json")) or {}
    active_id = str(active.get("vision_zh") or active.get("vision_en") or "").strip()
    if not active_id:
        return ""
    items = (_read_json(_pa_rules_path()) or {}).get("vision_prompts") or {}
    item = items.get(active_id)
    return str((item or {}).get("name") or "").strip() if isinstance(item, dict) else ""


def public_config() -> dict:
    """给前端的快照：自己的可编辑配置 + 合并后的只读视图。"""
    own = load_own()
    return {
        "path": own_config_path(),
        "version": CONFIG_VERSION,
        "own": own,
        "merged": {
            "services": [
                {**{k: v for k, v in service.items() if k != "api_key"},
                 "has_key": bool(service.get("api_key"))}
                for service in merged_services()
            ],
            "rules": {kind: merged_rules(kind) for kind in RULE_KINDS},
        },
        "prompt_assistant": {
            "config": _pa_config_path(),
            "rules": _pa_rules_path(),
            "found": bool(_pa_services()) or any(_pa_rules().values()),
        },
    }


def _models_url(base_url: str, service_type: str) -> str:
    """把服务地址归一成「取模型列表」的 URL。"""
    base = str(base_url or "").rstrip("/")
    parsed = urllib.parse.urlparse(base)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("服务地址必须是 http(s):// 开头的完整地址")
    if service_type == "ollama":
        return f"{base}/tags" if base.endswith("/api") else f"{base}/api/tags"
    if base.endswith("/models"):
        return base
    for suffix in ("/chat/completions", "/responses"):
        if base.endswith(suffix):
            base = base[: -len(suffix)]
            break
    return f"{base}/models"


# ---------------------------------------------------------------- HTTP 接口


_ROUTES_REGISTERED = False


def register_config_routes() -> bool:
    global _ROUTES_REGISTERED
    if _ROUTES_REGISTERED:
        return True
    try:
        import aiohttp
        from aiohttp import web
        from server import PromptServer
    except Exception as exc:  # 只在 ComfyUI 环境里可用
        log.warning("BlackRin 配置接口未注册：%s", exc)
        return False
    instance = getattr(PromptServer, "instance", None)
    if instance is None:
        return False
    routes = instance.routes

    async def get_config(request):
        return web.json_response(public_config())

    async def save_config(request):
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"error": "请求体不是合法 JSON"}, status=400)
        incoming = body.get("config") if isinstance(body, dict) else None
        if not isinstance(incoming, dict):
            return web.json_response({"error": "缺少 config 字段"}, status=400)
        path = save_own(incoming)
        log.info("BlackRin 配置已保存：%s", path)
        return web.json_response({"ok": True, "path": path, **public_config()})

    async def migrate_config(request):
        try:
            body = await request.json()
        except Exception:
            body = {}
        force = bool((body or {}).get("force"))
        return web.json_response(migrate_from_prompt_assistant(force=force))

    async def service_models(request):
        """用户点「添加模型」时，向该服务查询可用模型列表（用户主动触发）。

        前端只递服务名（+ 可选地址/密钥）；地址或密钥缺省时按名字在合并配置里查，
        这样小助手那条只读服务也能查（密钥始终留在服务端）。
        """
        try:
            body = await request.json()
        except Exception:
            body = {}
        body = body if isinstance(body, dict) else {}
        name = str(body.get("name") or "").strip()
        base_url = str(body.get("base_url") or "").strip()
        api_key = str(body.get("api_key") or "").strip()
        service_type = str(body.get("type") or "").strip().lower()
        if not base_url or not api_key:
            known = next((s for s in merged_services() if s["name"] == name), None)
            if known is None:
                return web.json_response({"error": f"找不到服务「{name}」"}, status=404)
            base_url = base_url or known["base_url"]
            api_key = api_key or known["api_key"]
            service_type = service_type or known["type"]
        if not base_url:
            return web.json_response({"error": "该服务还没填地址"}, status=400)
        try:
            url = _models_url(base_url, service_type or "openai_compatible")
        except ValueError as error:
            return web.json_response({"error": str(error)}, status=400)

        headers = {"Accept": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        timeout = aiohttp.ClientTimeout(total=30)
        try:
            async with aiohttp.ClientSession(timeout=timeout, trust_env=False) as session:
                async with session.get(url, headers=headers) as response:
                    text = await response.text()
                    if response.status >= 400:
                        return web.json_response(
                            {"error": f"服务返回 {response.status}：{text[:300]}"}, status=502)
                    data = json.loads(text)
        except Exception as error:
            return web.json_response({"error": f"取模型列表失败：{error}"}, status=502)

        names: list[str] = []
        if isinstance(data, dict):
            payload = data.get("data")
            if isinstance(payload, list):
                for item in payload:
                    if isinstance(item, str):
                        names.append(item)
                    elif isinstance(item, dict) and item.get("id"):
                        names.append(str(item["id"]))
            for item in data.get("models") or []:
                if isinstance(item, str):
                    names.append(item)
                elif isinstance(item, dict) and item.get("name"):
                    names.append(str(item["name"]).split("/")[-1])
        return web.json_response({"models": sorted({n for n in names if n}), "url": url})

    routes.get("/blackrin/config")(get_config)
    routes.post("/blackrin/config")(save_config)
    routes.post("/blackrin/config/migrate")(migrate_config)
    routes.post("/blackrin/config/service-models")(service_models)
    _ROUTES_REGISTERED = True
    return True


register_config_routes()
