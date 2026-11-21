# vendored: ComfyUI-VOSR2 → BlackRin/vosr2/

| 项 | 值 |
|---|---|
| 上游仓库 | https://github.com/ylchen333/ComfyUI-VOSR2 |
| 上游 commit | `6a21810b3f4f1a0ffc477c55330db0ac03c671f0`（2026-09-14，「testing, fix to loader.py」） |
| 上游许可 | Apache-2.0（本目录 LICENSE 为原文） |
| 合并日期 | 2026-11-21 |
| 合并人 | BlackRin（合并进 ComfyUI-BlackRin，作为子包 `vosr2/`） |

## 收录的文件

```
vosr2/
├── __init__.py      # 重写：保留依赖自检，去掉 comfy_entrypoint（改由主包并表注册）
├── nodes_vosr.py    # 原样（VOSR2ModelLoader / VOSR2Upscale，V3 io.ComfyNode 定义）
├── loader.py        # 原样（bundle 发现、严格加载、首次自动下载）
├── inference.py     # 原样 + 下方 RGBA 兼容补丁
├── color.py         # 原样（wavelet / adain 颜色对齐）
├── tiled_vae.py     # 原样（VAE 分块编解码）
├── models/          # 原样（lightningdit / dinov2 / qwenimage_vae2d / pos_embed / rmsnorm / swiglu_ffn）
├── LICENSE          # 上游 Apache-2.0 全文
├── NOTICE           # 第三方署名
└── UPSTREAM.md      # 本文件
```

## 未收录

- `VOSR_cases/`（73 MB 案例图）、`example_workflows/`、`docs/`、`.github/`、`web/`（节点帮助页）、`workflows/`
- 模型权重（首次运行由 loader 从 CSWRY/VOSR 下载，或使用 `models/vosr2/VOSR2`）

## 本仓库对上游的改动

### 1. RGBA 输入兼容（`inference.py`，标记 `[AMD-PATCH rgba]`）

上游只接受 3 通道 IMAGE，喂 RGBA（带透明通道的立绘/素材）会直接抛
`VOSR2Upscale expects a 3-channel RGB IMAGE, got 4 channels`。

补丁行为：
1. 入口处若为 4 通道，把 alpha 单独取出，仅 RGB 三通道送进模型；
2. 出口处把 alpha 用**双三次**插值放大到输出尺寸，再拼回成 RGBA 返回。

注意：alpha 是插值放大，模型不生成透明度；半透明区域的 RGB 会被模型按实色补细节，
需要严格保留半透明时，先 Split Image with Alpha → 合到实底 → 放大 → 再 Join 回去。

### 2. `__init__.py` 重写

去掉 `comfy_entrypoint`（BlackRin 主包走传统 `NODE_CLASS_MAPPINGS` 分支，根包一暴露
comfy_entrypoint 就会切到 V3 分支、忽略主包其余节点），节点在
`ComfyUI-BlackRin/__init__.py` 里用 `GET_SCHEMA()` 并表注册，**节点 id 与显示名保持不变**
（`VOSR2ModelLoader` / `VOSR2Upscale`），旧工作流零重连。

## 以后怎么跟上游同步

上游目前停更（最后提交 2026-09-14，两个 issue 无回应）。若要跟进：

```bash
# 1. 取上游新代码到临时目录，对比本目录
git clone https://github.com/ylchen333/ComfyUI-VOSR2 /tmp/upstream-vosr2
# 2. 只看差异，重点确认 inference.py 的 RGBA 补丁没被覆盖
diff -ru /tmp/upstream-vosr2 vosr2/ | less
# 3. 合并后更新本文件的 commit 号与本节改动清单
```
