# -*- coding: utf-8 -*-
"""BlackRin 魔导书（角色 / 画师标签库）。

从 AstrBot 插件 ``astrbot_plugin_comfyui_local`` 的「魔导书」迁移而来，
**只保留**角色与画师两个数据源 + 搜索 + 作品分类筛选 + 收藏。

不迁移的东西（明确不要）：LLM 提示词规则/优化器、随机池、预设、固定标签、
词库编辑、K2 组句。

数据结构（``data/characters.json`` / ``data/artists.json``，紧凑键名以省体积）::

    characters: [{n: name, cn: name_cn, t: tags, c: category, cc: category_cn,
                  p: post_count, f: fav_count, i: image_url, tl: tags_list}]
    artists:    [{n: name, t: tags, p: post_count, f: fav_count, s: score, i: image_url}]

数据已在构建时按 ``post_count`` 降序排好，检索结果保持该顺序，不再二次排序。

路由（与插件原有的 ``/api/grimoire/*`` 语义逐条对齐）：
    GET  /blackrin/grimoire/sources     源列表（角色 / 画师 + 条目数）
    GET  /blackrin/grimoire/data        分页 + 搜索(q) + 分类(category) + 收藏过滤
    GET  /blackrin/grimoire/categories  某源的作品分类（含中文名与计数，热度降序）
    GET  /blackrin/grimoire/stars       读收藏
    POST /blackrin/grimoire/stars       写收藏
"""

from __future__ import annotations

import json
import logging
import os
import random
import threading

try:
    import folder_paths
except Exception:  # 单元测试/脱离 ComfyUI 时也能导入
    folder_paths = None

log = logging.getLogger("ComfyUI-BlackRin.grimoire")

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "data")

# filter: 前端是否显示分类下拉（画师库 category 全空，不显示）
SOURCES = {
    # key: 数据源标识；name: 面板显示名；file: data/ 下的 JSON；filter: 是否显示作品分类下拉
    "characters": {"name": "角色", "file": "characters.json", "filter": True},
    "artists": {"name": "画师", "file": "artists.json", "filter": False},
    # 服装/头发来自 comfyui-costume-gallery 与 comfyui-portrait-gallery 的本地库，
    # 图片走它们自己的 /xxx_gallery/assets/* 路由，本插件只存标签与图片地址。
    "costume": {"name": "服装", "file": "costume.json", "filter": True},
    "hair": {"name": "头发", "file": "hair.json", "filter": False},
    "pose": {"name": "姿势", "file": "pose.json", "filter": True},
    # 纯属性标签（无配图，前端渲染成文字卡片）：从角色外观标签聚合
    "eyes": {"name": "眼睛", "file": "eyes.json", "filter": False},
    "body": {"name": "体型", "file": "body.json", "filter": False},
    # Portrait Gallery：脸型 / 造型参考图（以后参考图模式用）
    "portrait": {"name": "人像", "file": "portrait.json", "filter": True},
    # 风格：来自 comfyui-easy-use 的 styles 库（47 个库 / 3946 条），标签是整段风格提示词
    "styles": {"name": "风格", "file": "styles.json", "filter": True},
}

_lock = threading.Lock()
_cache: dict[str, list] = {}
_cat_cache: dict[str, dict] = {}


# --------------------------------------------------------------------------- #
# 数据加载（懒加载 + 进程内缓存）
# --------------------------------------------------------------------------- #
def _load(key: str) -> list:
    with _lock:
        cached = _cache.get(key)
        if cached is not None:
            return cached
        src = SOURCES.get(key)
        if not src:
            return []
        path = os.path.join(DATA_DIR, src["file"])
        try:
            with open(path, "r", encoding="utf-8") as f:
                items = json.load(f)
            if not isinstance(items, list):
                raise ValueError("数据格式错误：顶层应为数组")
        except Exception as exc:  # noqa: BLE001
            log.error("魔导书数据加载失败 %s: %s", path, exc)
            items = []
        _cache[key] = items
        log.info("魔导书数据已加载：%s（%d 条）", key, len(items))
        return items


def _public(item: dict) -> dict:
    """内部紧凑键名 → 前端可读字段（与原插件返回结构一致的命名）。"""
    return {
        "name": item.get("n") or "",
        "name_cn": item.get("cn") or item.get("n") or "",
        "tags": item.get("t") or "",
        "category": item.get("c") or "",
        "category_cn": item.get("cc") or item.get("c") or "",
        "post_count": item.get("p") or 0,
        "fav_count": item.get("f") or 0,
        "score": item.get("s"),
        "image_url": item.get("i") or "",
        "preview_url": item.get("v") or "",
        "keywords": item.get("kw") or "",
        "tags_list": item.get("tl") or [],
    }


def _apply_filters(items, q, category, stars_only, preferred):
    """搜索与筛选：语义与插件 _webui_grimoire_data 完全一致。"""
    out = items
    if q:
        kw = q.lower().strip()
        out = [
            it
            for it in out
            if kw in (it.get("n") or "").lower()
            or kw in (it.get("cn") or "").lower()
            or kw in (it.get("t") or "").lower()
            or kw in (it.get("kw") or "").lower()
        ]
    if category:
        cat_kw = category.strip().lower()
        out = [
            it
            for it in out
            if cat_kw in [p.strip().lower() for p in (it.get("c") or "").split(";")]
        ]
    if stars_only:
        names = {n.strip().lower() for n in stars_only.split(",") if n.strip()}
        out = [it for it in out if (it.get("n") or "").lower() in names]
    if preferred:
        pref = [n.strip().lower() for n in preferred.split(",") if n.strip()]
        if pref:
            order = {n: i for i, n in enumerate(pref)}
            head = [it for it in out if (it.get("n") or "").lower() in order]
            head.sort(key=lambda it: order[(it.get("n") or "").lower()])
            rest = [it for it in out if (it.get("n") or "").lower() not in order]
            out = head + rest
    return out


# --------------------------------------------------------------------------- #
# 收藏存储：user/default/BlackRin/grimoire_stars.json
# --------------------------------------------------------------------------- #
def _user_dir() -> str:
    if folder_paths is not None:
        try:
            return folder_paths.get_user_directory()
        except Exception:  # noqa: BLE001
            pass
    current = HERE
    for _ in range(6):
        current = os.path.dirname(current)
        candidate = os.path.join(current, "user")
        if os.path.isdir(candidate):
            return candidate
    return ""


def stars_path() -> str:
    return os.path.join(_user_dir(), "default", "BlackRin", "grimoire_stars.json")


def pins_path() -> str:
    return os.path.join(_user_dir(), "default", "BlackRin", "grimoire_pins.json")


# 本插件自己的缩略图库（把外部插件的图搬进来后就不再依赖它们）
THUMB_ROOT = os.path.join(HERE, "thumbs")

# 风格样例图所在目录（双系统各一份路径，存在哪个用哪个）
STYLE_DIRS = [
    r"D:\Aiwork\Comfyui-library\custom_nodes\comfyui-easy-use\styles",
    "/mnt/AIModels/Aiwork/Comfyui-library/custom_nodes/comfyui-easy-use/styles",
]


def _style_dir() -> str:
    for candidate in STYLE_DIRS:
        if os.path.isdir(candidate):
            return candidate
    return ""


def presets_path() -> str:
    """预设：{预设名: {pins: {...}, scopes: [...], saved_at: ts}}（不含 LoRA，按用户要求）"""
    return os.path.join(_user_dir(), "default", "BlackRin", "grimoire_presets.json")


def _read_stars() -> dict:
    path = stars_path()
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            return {k: list(v) for k, v in data.items() if isinstance(v, list)}
    except FileNotFoundError:
        pass
    except Exception as exc:  # noqa: BLE001
        log.warning("收藏文件读取失败（按空处理）: %s", exc)
    return {}


def _read_pins() -> dict:
    """固定标签：{源名: [{name, tags}, ...]}，结构与收藏同源但带 tags。"""
    try:
        with open(pins_path(), "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            out = {}
            for key, value in data.items():
                if isinstance(value, list):
                    out[key] = [x for x in value if isinstance(x, dict) and x.get("name")]
            return out
    except FileNotFoundError:
        pass
    except Exception as exc:  # noqa: BLE001
        log.warning("固定标签读取失败（按空处理）: %s", exc)
    return {}


def _write_json(path: str, data) -> str:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)
    return path


def _write_stars(data: dict) -> str:
    path = stars_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)
    return path


# --------------------------------------------------------------------------- #
# 路由
# --------------------------------------------------------------------------- #
try:
    from server import PromptServer as _PromptServer
except Exception:  # noqa: BLE001
    _PromptServer = None


def _register() -> bool:
    server = _PromptServer
    instance = getattr(server, "instance", None) if server is not None else None
    routes = getattr(instance, "routes", None)
    if routes is None:
        log.warning("魔导书路由未注册：PromptServer 不可用")
        return False

    from aiohttp import web

    async def grimoire_sources(request):
        return web.json_response(
            {
                "ok": True,
                "sources": [
                    {
                        "key": key,
                        "name": cfg["name"],
                        "count": len(_load(key)),
                        "filter": cfg["filter"],
                    }
                    for key, cfg in SOURCES.items()
                ],
            }
        )

    async def grimoire_data(request):
        key = (request.query.get("source") or "characters").strip()
        if key not in SOURCES:
            return web.json_response({"ok": False, "error": "未知数据源：%s" % key})
        try:
            page = max(1, int(request.query.get("page", "1")))
        except (TypeError, ValueError):
            page = 1
        try:
            page_size = int(request.query.get("pageSize", "50"))
        except (TypeError, ValueError):
            page_size = 50
        page_size = max(1, min(200, page_size))
        q = (request.query.get("q") or "").strip()
        category = (request.query.get("category") or "").strip()
        stars_only = (request.query.get("stars_only") or "").strip()
        preferred = (request.query.get("preferred") or "").strip()

        items = _apply_filters(_load(key), q, category, stars_only, preferred)
        total = len(items)
        # 随机抽：在「过滤后的全集」里抽，而不是只在当前页 50 条里抽
        if (request.query.get("random") or "").strip() not in ("", "0"):
            try:
                count = max(1, min(20, int(request.query.get("count", "1"))))
            except (TypeError, ValueError):
                count = 1
            picks = random.sample(items, min(count, len(items))) if items else []
            return web.json_response(
                {
                    "ok": True,
                    "items": [_public(it) for it in picks],
                    "total": total,
                    "random": True,
                }
            )
        start = (page - 1) * page_size
        page_items = [_public(it) for it in items[start : start + page_size]]
        return web.json_response(
            {
                "ok": True,
                "items": page_items,
                "total": total,
                "page": page,
                "pageSize": page_size,
            }
        )

    async def grimoire_categories(request):
        key = (request.query.get("source") or "characters").strip()
        if key not in SOURCES:
            return web.json_response({"ok": False, "error": "未知数据源：%s" % key})
        # 分类是静态数据，扫一次就缓存（35k 条全表统计约 0.3s，不该每次打开面板都重算）
        cached = _cat_cache.get(key)
        if cached is not None:
            return web.json_response(cached)
        cat_count: dict[str, int] = {}
        cat_cn: dict[str, str] = {}
        for it in _load(key):
            raw = (it.get("c") or "").strip()
            if not raw:
                continue
            for part in [p.strip() for p in raw.split(";") if p.strip()]:
                cat_count[part] = cat_count.get(part, 0) + 1
                if part not in cat_cn:
                    cat_cn[part] = (it.get("cc") or "").strip() or part
        ordered = sorted(cat_count.items(), key=lambda kv: (-kv[1], kv[0].lower()))
        categories = [
            {"category": cat, "name_cn": cat_cn[cat], "count": count}
            for cat, count in ordered
        ]
        payload = {
            "ok": True,
            "categories": [c["category"] for c in categories],
            "categories_cn": categories,
            "total": len(categories),
            "shown": len(categories),
        }
        _cat_cache[key] = payload
        return web.json_response(payload)

    async def grimoire_local_thumb(request):
        """本插件自己目录里的缩略图（grimoire/thumbs/），不依赖任何外部插件。"""
        rel = (request.query.get("p") or "").strip().replace("\\", "/")
        if not rel or ".." in rel.split("/"):
            return web.Response(status=400)
        root = os.path.realpath(THUMB_ROOT)
        target = os.path.realpath(os.path.join(root, rel))
        if not (target == root or target.startswith(root + os.sep)):
            return web.Response(status=403)
        if not os.path.isfile(target):
            return web.Response(status=404)
        return web.FileResponse(target)

    async def grimoire_style_thumb(request):
        """按相对路径返回 easy-use 风格样例图（限定在 styles 目录内，防目录穿越）。"""
        rel = (request.query.get("p") or "").strip().replace("\\", "/")
        if not rel or ".." in rel.split("/"):
            return web.Response(status=400)
        root = _style_dir()
        if not root:
            return web.Response(status=404)
        root_path = os.path.realpath(root)
        target = os.path.realpath(os.path.join(root_path, rel))
        if not (target == root_path or target.startswith(root_path + os.sep)):
            return web.Response(status=403)
        if not os.path.isfile(target):
            return web.Response(status=404)
        return web.FileResponse(target)

    async def grimoire_presets_get(request):
        try:
            with open(presets_path(), "r", encoding="utf-8") as f:
                data = json.load(f)
            if not isinstance(data, dict):
                data = {}
        except FileNotFoundError:
            data = {}
        except Exception as exc:  # noqa: BLE001
            log.warning("预设读取失败（按空处理）: %s", exc)
            data = {}
        return web.json_response({"ok": True, "presets": data})

    async def grimoire_presets_save(request):
        try:
            body = await request.json()
        except Exception:  # noqa: BLE001
            return web.json_response({"ok": False, "error": "请求体不是合法 JSON"})
        name = str(body.get("name") or "").strip()
        if not name:
            return web.json_response({"ok": False, "error": "预设名不能为空"})
        pins = body.get("pins") if isinstance(body.get("pins"), dict) else {}
        scopes = body.get("scopes") if isinstance(body.get("scopes"), list) else []
        clean_pins = {}
        for key in SOURCES:
            rows = pins.get(key)
            if not isinstance(rows, list):
                continue
            clean_pins[key] = []
            for r in rows:
                if not isinstance(r, dict) or not r.get("name"):
                    continue
                try:
                    weight = float(r.get("weight", 1))
                except (TypeError, ValueError):
                    weight = 1.0
                # weight 必须存下来，否则套用预设时权重全变回 1；
                # name_cn / image_url / category 是状态条显示用的，一并存
                clean_pins[key].append({
                    "name": str(r.get("name")),
                    "tags": str(r.get("tags") or ""),
                    "weight": max(0.0, min(5.0, round(weight, 2))),
                    "name_cn": str(r.get("name_cn") or ""),
                    "image_url": str(r.get("image_url") or ""),
                    "category": str(r.get("category") or ""),
                })
        clean_scopes = []
        for item in scopes:
            if not isinstance(item, dict) or not item.get("source"):
                continue
            clean_scopes.append({
                "source": str(item.get("source")),
                "category": str(item.get("category") or ""),
                "count": max(1, min(20, int(item.get("count") or 1))),
                "pick": item.get("pick") if item.get("pick") in ("all", "starred_only", "exclude_starred") else "all",
            })
        try:
            with open(presets_path(), "r", encoding="utf-8") as f:
                data = json.load(f)
            if not isinstance(data, dict):
                data = {}
        except Exception:  # noqa: BLE001
            data = {}
        data[name] = {
            "pins": clean_pins,
            "scopes": clean_scopes,
            "saved_at": __import__("time").time(),
        }
        try:
            _write_json(presets_path(), data)
        except Exception as exc:  # noqa: BLE001
            log.error("预设写入失败: %s", exc)
            return web.json_response({"ok": False, "error": str(exc)})
        return web.json_response({"ok": True, "presets": sorted(data.keys())})

    async def grimoire_presets_delete(request):
        try:
            body = await request.json()
        except Exception:  # noqa: BLE001
            return web.json_response({"ok": False, "error": "请求体不是合法 JSON"})
        name = str(body.get("name") or "").strip()
        try:
            with open(presets_path(), "r", encoding="utf-8") as f:
                data = json.load(f)
            if not isinstance(data, dict):
                data = {}
        except Exception:  # noqa: BLE001
            data = {}
        data.pop(name, None)
        try:
            _write_json(presets_path(), data)
        except Exception as exc:  # noqa: BLE001
            return web.json_response({"ok": False, "error": str(exc)})
        return web.json_response({"ok": True, "presets": sorted(data.keys())})

    async def grimoire_pins_get(request):
        """返回固定标签，并补上预览图 / 中文名（节点状态条直接拿来渲染缩略图）。"""
        pins = _read_pins()
        enriched = {}
        for key, rows in pins.items():
            index = {}
            for item in _load(key):
                index.setdefault((item.get("n") or "").lower(), item)
            out_rows = []
            for row in rows:
                name = row.get("name") or ""
                item = index.get(name.lower())
                try:
                    weight = float(row.get("weight", 1))
                except (TypeError, ValueError):
                    weight = 1.0
                out_rows.append({
                    "name": name,
                    "tags": row.get("tags") or "",
                    "weight": max(0.0, min(5.0, round(weight, 2))),
                    "name_cn": (item or {}).get("cn") or name,
                    "category": (item or {}).get("c") or "",
                    "category_cn": (item or {}).get("cc") or (item or {}).get("c") or "",
                    "image_url": (item or {}).get("i") or "",
                    "source": key,
                })
            enriched[key] = out_rows
        return web.json_response({"ok": True, "pins": enriched})

    async def grimoire_pins_set(request):
        try:
            body = await request.json()
        except Exception:  # noqa: BLE001
            return web.json_response({"ok": False, "error": "请求体不是合法 JSON"})
        pins = body.get("pins")
        if not isinstance(pins, dict):
            return web.json_response({"ok": False, "error": "参数错误"})
        clean = {}
        for key in SOURCES:
            rows = pins.get(key)
            if not isinstance(rows, list):
                continue
            dedup = {}
            for row in rows:
                if not isinstance(row, dict):
                    continue
                name = str(row.get("name") or "").strip()
                if not name:
                    continue
                try:
                    weight = float(row.get("weight", 1))
                except (TypeError, ValueError):
                    weight = 1.0
                weight = max(0.0, min(5.0, round(weight, 2)))
                dedup[name.lower()] = {
                    "name": name,
                    "tags": str(row.get("tags") or "").strip(),
                    "weight": weight,
                }
            clean[key] = list(dedup.values())
        try:
            _write_json(pins_path(), clean)
        except Exception as exc:  # noqa: BLE001
            log.error("固定标签写入失败: %s", exc)
            return web.json_response({"ok": False, "error": str(exc)})
        return web.json_response({"ok": True, "pins": clean})

    async def grimoire_stars_get(request):
        return web.json_response({"ok": True, "stars": _read_stars()})

    async def grimoire_stars_set(request):
        try:
            body = await request.json()
        except Exception:  # noqa: BLE001
            return web.json_response({"ok": False, "error": "请求体不是合法 JSON"})
        key = (body.get("source") or "").strip()
        names = body.get("stars")
        if key not in SOURCES or not isinstance(names, list):
            return web.json_response({"ok": False, "error": "参数错误"})
        clean = []
        seen = set()
        for name in names:
            text = str(name).strip()
            low = text.lower()
            if text and low not in seen:
                seen.add(low)
                clean.append(text)
        data = _read_stars()
        data[key] = clean
        try:
            _write_stars(data)
        except Exception as exc:  # noqa: BLE001
            log.error("收藏写入失败: %s", exc)
            return web.json_response({"ok": False, "error": str(exc)})
        return web.json_response({"ok": True, "count": len(clean)})

    routes.get("/blackrin/grimoire/sources")(grimoire_sources)
    routes.get("/blackrin/grimoire/data")(grimoire_data)
    routes.get("/blackrin/grimoire/categories")(grimoire_categories)
    routes.get("/blackrin/grimoire/local_thumb")(grimoire_local_thumb)
    routes.get("/blackrin/grimoire/style_thumb")(grimoire_style_thumb)
    routes.get("/blackrin/grimoire/presets")(grimoire_presets_get)
    routes.post("/blackrin/grimoire/presets")(grimoire_presets_save)
    routes.post("/blackrin/grimoire/presets/delete")(grimoire_presets_delete)
    routes.get("/blackrin/grimoire/pins")(grimoire_pins_get)
    routes.post("/blackrin/grimoire/pins")(grimoire_pins_set)
    routes.get("/blackrin/grimoire/stars")(grimoire_stars_get)
    routes.post("/blackrin/grimoire/stars")(grimoire_stars_set)
    log.info("魔导书路由已注册：/blackrin/grimoire/*")
    return True


_register()
