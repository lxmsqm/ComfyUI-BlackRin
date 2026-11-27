# grimoire/tools — 标签库数据构建脚本

> 这些脚本**不是运行时依赖**。节点运行只读 `grimoire/data/*.json`；
> 这里的脚本是「外部图库 → grimoire/data」的一次性转换工具，
> 数据源更新时重跑一遍即可。

## 脚本清单

| 脚本 | 数据源 | 产物 |
|---|---|---|
| `build_data.py` | AstrBot 插件的 anima 缓存（`anima_characters_cache.json` + `chars.json`） | `characters.json` |
| `build_gallery_data.py` | `comfyui-costume-gallery` 的 `library/data/costume-zh.json` | `costume.json` |
| `build_pose.py` | `comfyui-pose-gallery` 的 `pose-zh.json` + `labels-en.json` | `pose.json` |
| `build_hair.py` | 从 `characters.json` 的 `tags_list` 聚合（出现 ≥30 次） | `hair.json` |
| `build_attr.py` | 同 `characters.json` 聚合 | `eyes.json` / `body.json` |
| `build_styles.py` | `comfyui-easy-use/styles/*.json`（47 个库） | `styles.json` |

人像（`portrait.json`）由 `build_gallery_data.py` 从
`comfyui-portrait-gallery/library/data/portrait.json` 一并生成。

## 用法

```bash
cd custom_nodes/ComfyUI-BlackRin/grimoire/tools

# 1) 先按你的机器改脚本顶部的数据源常量（都标了 ⚠️ 按你的机器改）
#    CN      = ComfyUI 的 custom_nodes 目录
#    BIG     = AstrBot 插件的 allinone 数据目录
#    STYLE_DIR = comfyui-easy-use/styles

# 2) 跑对应脚本（输出目录 OUT_DIR 会自动推到 ../data，不用改）
python build_gallery_data.py
python build_styles.py
# ...
```

依赖顺序：`characters.json` 要先于 `build_hair.py` / `build_attr.py`
（后两个是从角色标签里聚合的）。

## 产物规模（2026-11 实测）

```
characters.json  35,652 条   13.4 MB
artists.json     10,503 条    1.5 MB
styles.json       3,946 条    1.8 MB   （45 个风格库）
pose.json         1,439 条    0.6 MB   （26 类）
portrait.json     1,499 条    0.4 MB
costume.json      1,407 条    0.6 MB   （8 类）
hair.json           129 条
eyes.json            45 条
body.json            16 条
──────────────────────────────
合计             54,683 条   18.3 MB
```

## 注意

- `artists.json` 没有独立构建脚本 —— 它是早期从神记库合并来的（9072 + 1431），
  当前脚本链里不重新生成；要更新得先补一个抓取脚本。
- 风格样例图（`grimoire/thumbs/styles/`，3945 张 / 78.5MB）由人工从
  `comfyui-easy-use/styles/samples` 复制而来（不用脚本）。
- 这些脚本产出的 JSON 是**纯数据**，改了直接提交即可（仓库里已含 18.3MB 数据）。
