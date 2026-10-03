# 🖤 ComfyUI-BlackRin

一个 ComfyUI 自定义节点包，提供 **图像缩放**、**图片反推提示词**、**MiniMax H3 音视频条件构建** 和 **分组总控** 功能。

> `minimax/` 子包与 `web/js/minimax_h3_integration.js` 移植自
> [Goohai-MiniMax-H3_Integration](https://github.com/goohai/Goohai-MiniMax-H3_Integration)
> （GPL-3.0-or-later），节点 ID 与 API 路由前缀已改为 BlackRin 命名空间，可与原插件共存。

---

## 节点总览

| 节点名称 | 分类 | 功能 |
|---------|------|------|
| ✨ BlackRin H3智能一体化 | `BlackRin/MiniMax H3` | H3 条件构建：时间条分组提示词、参考素材管理、AV 潜空间 |
| ✨ BlackRin H3适配器 | `BlackRin/MiniMax H3` | 拆包一体化输出：条件/潜空间/VAE/二采条件等 |
| ✨ BlackRin 多段采样 | `BlackRin/MiniMax H3` | 逐段采样 + 段间接续（尾部 latent 钉入），替代 BasicGuider 链 |
| ✨ BlackRin 自动缩放 | `BlackRin/Utils` | 按目标百万像素智能缩放图像 |
| ✨ 图文优化推理 | `BlackRin/Utils` | 图像 → VLM → 反推提示词 |
| ✨ BlackRin 分组总控 | `BlackRin/Utils` | 面板上按组切换分组的 启用/屏蔽/静音 |
| ✨ BlackRin 分组锚点 | `BlackRin/Utils` | 放进分组内，向总控注册该分组 |

---

## 与原版 (Goohai) 的差异

在 [Goohai-MiniMax-H3_Integration](https://github.com/goohai/Goohai-MiniMax-H3_Integration) 基础上的主要改动：

- **多段采样与相位对齐**：`BlackRin_MultiSegmentSampler` 按提示词组逐段采样，段间把上一段导出尾部 latent 钉入下一段做接续引导；头部裁剪按 token 数对齐 H3 的 5-token/17 帧解码相位，修复多段拼接后每 17 帧一次的规律性闪烁。
- **时间条分组提示词**：一体化节点面板按组管理提示词，每组独立时长、独立接续开关（剪刀/双箭头）、二采条件模式（合并剧本 / 复用第 1 段）。
- **二采条件输出**：多段时把全部组提示词合并成整片剧本单独编码，供 3D 潜空间放大链全程使用。
- **提示词优化器增强**：分组感知（优化/还原只作用激活组）、llama-swap 支持（禁用思考、响应剥离、用完卸载）、输出语言硬化。
- **LoRA 触发词注入**：TriggerWord Toggle 的当前选择经前端状态通道（`gh_state_json`）进入最终提示词——不走执行连线，避开 H3 选型反馈与 lora 模型链的依赖环；不进编辑器，与提示词优化互不干扰。
- **命名空间**：节点 ID 与 API 路由前缀改为 BlackRin，可与原版插件共存。

---

## 许可

- 本仓库以 **GPL-3.0-or-later** 发布：`minimax/` 子包与 H3 前端移植自 [Goohai-MiniMax-H3_Integration](https://github.com/goohai/Goohai-MiniMax-H3_Integration)（GPL-3.0-or-later），后者内置 [T8](https://github.com/T8mars/comfyui-minimax-h3-audio-T8) 的条件构建实现。
- `sol_attn.py` 基于 Apache-2.0 许可的 SOL 稳定注意力实现移植。
- 完整许可证文本见 [LICENSE](LICENSE)。

---

## 分组总控 / 分组锚点

替代 rgthree 的 Mute/Bypass Relay+Repeater：**零连线**的分组开关系统。

- 把 **分组锚点** 放进任意 LiteGraph 分组内（自动识别所在组并显示组名），一个组放一个即可；
- **分组总控** 面板自动列出所有已注册分组，每组一个按钮三态循环：
  - **启用**（绿色）：组内节点全部恢复正常（mode 0）；
  - **屏蔽**（橙色）：组内节点设为 ComfyUI 原生 bypass（mode 4），每个节点把输入直通到输出——即原生的"屏蔽转发"；
  - **静音**（红色）：组内节点彻底断开（mode 2），下游会缺输入，适合末端输出组。
- 状态存总控节点 properties 随工作流保存，重新加载工作流后自动应用；
- 总控/锚点是纯前端控制器，无输入输出、不参与执行；应用状态时自动跳过总控和锚点自身。

---

## 节点详解

### 1. ✨ BlackRin 自动缩放

按目标百万像素智能缩放图像，保持原始宽高比，宽高对齐到所选倍数（8/16/32）。

**输入：**

| 端口 | 类型 | 说明 |
|------|------|------|
| `图像` | IMAGE | 输入图像（可选；未连接或上游输出为空时直接直通，输出 None 和 0×0） |
| `目标百万像素` | FLOAT | 目标总像素量 0.1–10.0（步长 0.1，默认 1.0） |
| `对齐倍数` | COMBO | 宽高取整到 N 的倍数：8 / 16 / 32（默认 32） |
| `采样方法` | COMBO | lanczos / bilinear / nearest / area |

**输出：**

| 端口 | 类型 | 说明 |
|------|------|------|
| `图像` | IMAGE | 缩放后的图像 |
| `输出宽度` | INT | 缩放后的宽度 |
| `输出高度` | INT | 缩放后的高度 |

**缩放逻辑：**
- 宽高比跟随输入图像：长边 = √(目标像素 / 宽高比)，短边 = 长边 × 宽高比
- 两边分别向下取整到对齐倍数的整数倍（保证不超过目标像素量）
- 前端节点上实时显示计算出的输出分辨率（`计算分辨率` 预览行）

---

### 2. ✨ 图文优化推理

图片反推提示词节点。读取 prompt-assistant 的规则预设和服务配置，将 **1~N 张图像 + 规则 + 外部文本** 一起发送给 VLM 服务（OpenAI 兼容），返回反推提示词。

**输入（必填）：**

| 端口 | 类型 | 说明 |
|------|------|------|
| `input_text` | STRING（仅连线） | 外部文本输入，无文本框，只能从其他节点接线 |
| `rule` | COMBO | 规则预设（从 prompt-assistant 的 `system_prompts.json` 读取） |
| `custom_rule` | BOOLEAN | 启用时，`input_text` 的文本追加到规则预设后一起发送 |
| `vlm_service` | COMBO | VLM 服务/模型选择（从 prompt-assistant 的 `config.json` 读取） |
| `seed` | INT | 随机种子，支持随机/固定/递增/递减控制 |
| `unload_after` | BOOLEAN | 推理完成后自动卸载 LM Studio 模型释放显存 |

**输入（可选）：**

| 端口 | 类型 | 说明 |
|------|------|------|
| `图片1` | IMAGE | 第 1 张图片（接入后自动新增 图片2、图片3…，前端动态槽位） |

**输出：**

| 端口 | 类型 | 说明 |
|------|------|------|
| `反推文本` | STRING | 模型返回的反推提示词 |
| `反推列表` | STRING list | 单元素列表（与输入保持对应） |

**核心逻辑：**
- 接几张图就传几张，**所有图片在同一次 API 调用中一起发送**给 VLM
- 每张图内部的 batch 帧也会展开为独立图片一起传
- `custom_rule = 关`：只发送选中的规则预设
- `custom_rule = 开`：规则预设 + `\n\n` + `input_text`，一起发送给 VLM

**API 格式：** OpenAI 兼容（与 LM Studio / 智谱 / Ollama 等兼容）

**卸载功能：** 推理完成后读取 `config.json` 中 `service_id = "service_896"` 的模型列表，逐个调用所选服务的 `/api/v1/models/unload` 接口自动卸载释放显存。

**日志输出：**
```
[图片反推] 3张图→e4bq2
[图片反推] 模型返回的内容摘要...
[图片反推] ✅ 卸载: e4bq2
[图片反推] 📊 卸载 1/2
```

---

## 配置文件

节点读取 prompt-assistant 插件的配置文件（如果已安装）：
- `ComfyUI/user/default/prompt-assistant/config/config.json` — 服务/模型配置
- `ComfyUI/user/default/prompt-assistant/rules/system_prompts.json` — 规则预设

如果未安装 prompt-assistant，会回退到其模板文件。

---

## 注册信息

- **目录：** `custom_nodes/ComfyUI-BlackRin/`
- **入口：** `__init__.py`——`nodes.py` 提供工具节点，`minimax/integration.py` 提供 H3 三节点，`sol_attn.py` 以 V3 schema 并入同一张映射表
- **前端扩展：** `WEB_DIRECTORY = "./web"`
  - `web/js/minimax_h3_integration.js` — H3 一体化面板（时间条分组、优化器、触发词烤入）
  - `web/js/blackrin_group_control.js` — 分组总控/锚点
  - `web/js/blackrin_image_caption.js` — 图文反推动态图片槽位
  - `web/js/blackrin_resolution_calc.js` — 自动缩放分辨率预览
  - `web/js/blackrin_config.js` — 配置读写
- **自己的配置：** `ComfyUI/user/default/BlackRin/config.json`（优化器服务与规则，含密钥，不入库）
