# -*- coding: utf-8 -*-
"""把 comfyui-easy-use 的风格库（47 个库 / 3946 条）融进魔导书数据源。

数据源：<ComfyUI>/custom_nodes/comfyui-easy-use/styles/*.json
样例图：同目录 samples/**（本地文件，走本插件路由 /blackrin/grimoire/style_thumb 提供）
"""
import json, os, re, urllib.parse
# 输出目录：脚本放在 grimoire/tools/ 下，数据写回 grimoire/data/
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.normpath(os.path.join(HERE, "..", "data"))

# ⚠️ 按你的机器改：comfyui-easy-use 的 styles 目录
STYLE_DIR = r"D:\Aiwork\Comfyui-library\custom_nodes\comfyui-easy-use\styles"
OUT = os.path.join(OUT_DIR, 'styles.json')

def lib_name(fname):
    """Krea2_moodboard_illustration_插画1.json → 插画1；Krea2_397styles-anime_动漫.json → 动漫"""
    base = os.path.splitext(fname)[0]
    parts = base.split("_")
    return parts[-1] if parts else base

rows = []
seen = set()
dup = 0
for fname in sorted(os.listdir(STYLE_DIR)):
    if not fname.lower().endswith(".json") or fname.startswith("your_styles"):
        continue
    path = os.path.join(STYLE_DIR, fname)
    try:
        data = json.load(open(path, encoding="utf-8"))
    except Exception as exc:
        print("skip", fname, exc)
        continue
    if not isinstance(data, list):
        continue
    lib = lib_name(fname)
    for item in data:
        if not isinstance(item, dict):
            continue
        prompt = (item.get("prompt") or "").strip()
        if not prompt:
            continue
        name = (item.get("name") or "").strip()
        cn = (item.get("name_cn") or name).strip()
        key = f"{lib}::{name}"
        if key in seen:
            dup += 1
            key = f"{key}#{dup}"
        seen.add(key)
        thumb = (item.get("thumbnail") or "").strip()
        thumb = thumb.lstrip(".").lstrip("/\\")          # ./samples/x.webp → samples/x.webp
        url = ""
        if thumb:
            url = "/blackrin/grimoire/style_thumb?p=" + urllib.parse.quote(thumb.replace("\\", "/"))
        rows.append({
            "n": key,
            "cn": cn,
            "t": prompt,
            "neg": (item.get("negative_prompt") or "").strip(),
            "c": lib,
            "cc": lib,
            "p": 0, "f": 0,
            "i": url,
        })

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(rows, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("styles:", len(rows), "条 | 库数:", len({r['c'] for r in rows}), "|", os.path.getsize(OUT), "bytes")
print("有图:", sum(1 for r in rows if r["i"]), "| 无图:", sum(1 for r in rows if not r["i"]))
from collections import Counter
print("库分布 top8:", Counter(r["c"] for r in rows).most_common(8))
print("样例:", rows[0]["cn"], "|", rows[0]["t"][:60])
