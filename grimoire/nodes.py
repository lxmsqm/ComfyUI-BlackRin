# -*- coding: utf-8 -*-
"""BlackRin 标签库节点（魔导书）。

设计原则（2026-11-22 与用户确认）：
- **只出标签文本，不做任何编码**：输出一个 STRING，接任何模型族的 CLIPTextEncode。
- 数据源可扩展：角色 / 画师 / 服装 / 头发，以后加源只需往 ``grimoire/data/`` 丢 JSON
  并在 ``server.py`` 的 SOURCES 里登记一行。
- 参考图模式、模型编码全部不在这里做。

面板（web/js/blackrin_grimoire_node.js）负责浏览与选词，选中的标签写回本节点的
``tags`` widget；节点本身只把它原样输出。
"""

from __future__ import annotations

import json
import logging
import random

log = logging.getLogger("ComfyUI-BlackRin.grimoire.node")

NODE_ID = "BlackRin_GrimoireTags"
NODE_NAME = "✨ 标签库"


class BlackRin_GrimoireTags:
    """标签库：选好的标签直接当提示词用；可把若干数据源设为「随机」，每次执行各抽一条。"""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "tags": (
                    "STRING",
                    {
                        "multiline": True,
                        "default": "",
                        "dynamicPrompts": False,
                        "tooltip": "点节点上的「📚 标签库」按钮从角色/画师/服装/头发里选词；也可以直接手打。",
                    },
                )
            },
            "optional": {
                # 面板状态（只看 random_sources：哪些源处于常驻随机状态）
                "panel_state": ("STRING", {"default": "", "multiline": False}),
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("tags",)
    FUNCTION = "collect"
    CATEGORY = "BlackRin"
    DESCRIPTION = (
        "魔导书标签库：角色 / 画师 / 服装 / 头发 / 姿势 / 眼睛 / 体型 / 人像。\n"
        "数据源右侧的 shuffle 按钮可把该源设为「常驻随机」——每次执行从该源随机抽一条标签。\n"
        "只输出文本，不含任何模型编码，可接任意文生图链路。"
    )

    @staticmethod
    def _read_state(panel_state: str) -> dict:
        try:
            state = json.loads(panel_state or "{}")
            return state if isinstance(state, dict) else {}
        except Exception:
            return {}

    @classmethod
    def _random_scopes(cls, panel_state: str):
        """随机范围列表：[(源, 分类, 抽取数量)]，分类为空 = 整源。

        新结构 ``random_scopes: [{source, category, count}]``；
        旧结构（random_sources / random_categories）仍兼容，数量记 1。
        """
        state = cls._read_state(panel_state)
        scopes = []

        raw = state.get("random_scopes")
        if isinstance(raw, list):
            for item in raw:
                if not isinstance(item, dict):
                    continue
                key = item.get("source")
                if not isinstance(key, str) or not key:
                    continue
                category = item.get("category") or ""
                try:
                    count = int(item.get("count", 1))
                except (TypeError, ValueError):
                    count = 1
                pick = item.get("pick") if item.get("pick") in ("all", "starred_only", "exclude_starred") else "all"
                scopes.append((key, str(category), max(1, min(20, count)), pick))
            if scopes:
                return scopes

        raw_sources = state.get("random_sources")
        if isinstance(raw_sources, list):
            scopes.extend((k, "", 1, "all") for k in raw_sources if isinstance(k, str))
        raw_cats = state.get("random_categories")
        if isinstance(raw_cats, list):
            for item in raw_cats:
                if isinstance(item, str) and "::" in item:
                    key, cat = item.split("::", 1)
                    if key and cat:
                        scopes.append((key, cat, 1, "all"))
        return scopes

    @classmethod
    def _random_sources(cls, panel_state: str):
        return [k for k in cls._read_state(panel_state).get("random_sources") or [] if isinstance(k, str)]

    def collect(self, tags, panel_state=""):
        """输出 = 手选标签 + 固定标签（运行时强制包含）+ 随机源各抽一条，全程去重。"""
        from . import server as _srv

        # 旧工作流里 tags 可能是真正的 None（不是字符串），必须显式排除，
        # 否则 str(None) 会被当成一个词写进提示词：输出 "None, (large breasts:1.5)..."
        raw_base = "" if tags is None else str(tags)
        if raw_base.strip().lower() == "none":
            raw_base = ""
        base = raw_base.strip()
        parts = [base] if base else []
        seen = {t.strip().lower() for t in base.split(",") if t.strip()}

        def merge(text):
            keep = []
            for tag in str(text or "").split(","):
                tag = tag.strip()
                if not tag or tag.lower() in seen:
                    continue
                seen.add(tag.lower())
                keep.append(tag)
            if keep:
                parts.append(", ".join(keep))

        # ① 固定标签：从**节点自己的 panel_state** 读（随工作流保存 → 工作流之间天然隔离；
        #    以前读全局 grimoire_pins.json，导致固定会跨工作流污染）
        pinned = []
        pinned_state = self._read_state(panel_state).get("pins") or {}
        for key, rows in pinned_state.items():
            if not isinstance(rows, list):
                continue
            for row in rows:
                tag = (row.get("tags") or "").strip()
                if not tag:
                    continue
                # 权重：weight != 1 时按 ComfyUI 语法包一层 (tags:权重)
                try:
                    weight = float(row.get("weight", 1))
                except (TypeError, ValueError):
                    weight = 1.0
                weight = max(0.0, min(5.0, round(weight, 2)))
                weighted = tag if abs(weight - 1.0) < 1e-6 else "(%s:%s)" % (tag, ("%.2f" % weight).rstrip("0").rstrip("."))
                before = len(parts)
                merge(weighted)
                if len(parts) > before:
                    pinned.append({
                        "source": key, "name": row.get("name") or "",
                        "tags": weighted, "weight": weight,
                    })

        # ② 常驻随机：每个范围抽 count 条（分类级只在该作品分类里抽）
        picked = []
        for key, category, count, pick in self._random_scopes(panel_state):
            rows = _srv._load(key)
            if category:
                want = category.strip().lower()
                rows = [
                    it for it in rows
                    if want in [p.strip().lower() for p in (it.get("c") or "").split(";")]
                ]
            # 收藏范围（照原插件 random_pick_mode：all / starred_only / exclude_starred）
            if pick and pick != "all":
                starred = {str(name).lower() for name in (_srv._read_stars().get(key) or [])}
                if pick == "starred_only":
                    rows = [it for it in rows if (it.get("n") or "").lower() in starred]
                else:
                    rows = [it for it in rows if (it.get("n") or "").lower() not in starred]
            if not rows:
                log.warning("BlackRin 标签库：随机范围无可用条目 %s / %s", key, category or "(整源)")
                continue
            take = min(count, len(rows))
            for row in random.sample(rows, take) if take > 1 else [random.choice(rows)]:
                text = (row.get("t") or "").strip()
                if not text:
                    continue
                before = len(parts)
                merge(text)
                if len(parts) > before:
                    picked.append({
                        "source": key,
                        "category": category,
                        "pick": pick,
                        "count": take,
                        "name": row.get("cn") or row.get("n") or "",
                        "tags": text,
                    })

        text = ", ".join(parts)
        if picked:
            log.info("BlackRin 标签库：随机抽到 %s", " / ".join(
                "%s%s:%s" % (p["source"], ("/" + p["category"]) if p.get("category") else "", p["name"])
                for p in picked))
        if pinned:
            log.info("BlackRin 标签库：固定标签 %s", " / ".join(p["name"] for p in pinned))
        return {"ui": {"text": [text], "pinned": pinned, "random": picked}, "result": (text,)}

    @classmethod
    def IS_CHANGED(cls, tags, panel_state=""):
        """有常驻随机源时每次都重新抽（NaN 让 ComfyUI 不缓存）；否则按「tags + 固定标签」指纹缓存。"""
        if cls._random_scopes(panel_state):
            return float("nan")
        # 固定也在这个 state 里，整个串参与指纹：改了固定/权重就会重跑
        safe_tags = "" if tags is None else str(tags)
        return f"{safe_tags}|{panel_state or ''}"


NODE_CLASS_MAPPINGS = {NODE_ID: BlackRin_GrimoireTags}
NODE_DISPLAY_NAME_MAPPINGS = {NODE_ID: NODE_NAME}
