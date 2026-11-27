import { app } from "/scripts/app.js";

// ==================== 常量与工具 ====================
const STYLE_ID = "multi-lora-style-v2";
const API_BASE = "/blackrin/multi_lora";

// 注入全局样式（去重）
function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .ml-container {
      width: 100%;
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 12px;
      color: #e0e0e0;
      user-select: none;
    }
    .ml-list {
      display: flex;
      flex-direction: column;
      gap: 5px;
      margin-top: 0;
      min-width: 0;
    }
    .ml-item {
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr) auto auto;
      align-items: center;
      background: #2a2a2a;
      border-radius: 6px;
      padding: 6px;
      gap: 6px;
      border: 1px solid #333;
      transition: border-color 0.2s;
      min-width: 0;
      overflow: hidden;
    }
    .ml-item:hover {
      border-color: #4a9eff;
    }
    .ml-thumb {
      width: 44px;
      height: 44px;
      border-radius: 4px;
      object-fit: cover;
      background: #1e1e1e;
      flex-shrink: 0;
      cursor: pointer;
    }
    .ml-thumb-placeholder {
      width: 44px;
      height: 44px;
      border-radius: 4px;
      background: #333;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      color: #666;
      flex-shrink: 0;
    }
    .ml-info {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
      overflow: hidden;
    }
    .ml-name {
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: #fff;
    }
    .ml-weight-row {
      display: flex;
      align-items: center;
      gap: 5px;
      min-width: 0;
    }
    .ml-weight-label {
      font-size: 10px;
      color: #888;
      white-space: nowrap;
    }
    .ml-slider {
      flex: 1 1 auto;
      min-width: 24px;
      height: 4px;
      -webkit-appearance: none;
      appearance: none;
      background: #444;
      border-radius: 2px;
      outline: none;
    }
    .ml-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #4a9eff;
      cursor: pointer;
    }
    .ml-slider::-moz-range-thumb {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #4a9eff;
      cursor: pointer;
      border: none;
    }
    .ml-weight-val {
      font-size: 10px;
      color: #4a9eff;
      font-weight: bold;
      min-width: 40px;
      text-align: right;
      font-variant-numeric: tabular-nums;
      flex-shrink: 0;
    }
    .ml-delete {
      width: 20px;
      height: 20px;
      border-radius: 4px;
      background: transparent;
      border: none;
      color: #888;
      font-size: 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .ml-delete:hover {
      background: #444;
      color: #ff4444;
    }
    .ml-empty {
      padding: 12px;
      text-align: center;
      color: #666;
      font-size: 11px;
      background: #252525;
      border-radius: 6px;
      border: 1px dashed #444;
    }
    /* 节点内三按钮行 */
    .ml-node-btn-row {
      flex: 0 0 auto;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
      margin-top: 8px;
      min-width: 0;
    }
    .ml-node-btn {
      flex: 1 1 0;
      min-width: 0;
      height: 30px;
      padding: 0 6px;
      background: #26262b;
      border: 1px solid #3a3a42;
      border-radius: 8px;
      color: #b9bec7;
      font-family: inherit;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: .2px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      outline: none;
      transition: background .15s ease, border-color .15s ease, color .15s ease, box-shadow .15s ease, transform .06s ease;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      transition: all 0.15s;
      font-family: inherit;
    }
    .ml-node-btn:hover { background: #303038; border-color: #4a4a56; color: #e3e6eb; }
    .ml-node-btn:active { transform: translateY(1px); }
    .ml-node-btn:focus-visible { box-shadow: 0 0 0 2px rgba(74,158,255,.5); }
    .ml-node-btn-primary { color: #6fb4ff; border-color: #35597d; background: #1e2630; }
    .ml-node-btn-primary:hover { border-color: #4a9eff; color: #9ccdff; background: #22303f; box-shadow: 0 0 0 1px rgba(74,158,255,.15); }
    /* 预设浮层 */
    .ml-preset-pop {
      position: fixed;
      z-index: 100000;
      background: #232323;
      border: 1px solid #444;
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,.6);
      max-height: 240px;
      overflow-y: auto;
      padding: 6px;
      min-width: 220px;
    }
    .ml-preset-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 7px 8px;
      border-radius: 5px;
      cursor: pointer;
      font-size: 12px;
      color: #ddd;
    }
    .ml-preset-row:hover { background: #333; }
    .ml-preset-row .nm { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ml-preset-row .cnt { color: #666; font-size: 11px; }
    .ml-preset-row .del {
      color: #888; border: none; background: transparent; cursor: pointer;
      font-size: 14px; padding: 0 4px; line-height: 1;
    }
    .ml-preset-row .del:hover { color: #ff6b6b; }
    .ml-preset-empty { padding: 12px; text-align: center; color: #666; font-size: 12px; }
    /* 「打开面板」按钮不再单独立样式：统一走 .ml-node-btn（旧的 width:100% + margin-top 会把按钮顶歪） */
    /* 面板样式 */
    .ml-panel-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.7);
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .ml-panel {
      width: 90%;
      max-width: 1000px;
      height: 85vh;
      background: #1e1e1e;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.5);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .ml-panel-header {
      padding: 16px 20px;
      border-bottom: 1px solid #333;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .ml-panel-title {
      font-size: 16px;
      font-weight: bold;
      color: #fff;
    }
    .ml-panel-close {
      width: 32px;
      height: 32px;
      border-radius: 6px;
      background: #2a2a2a;
      border: none;
      color: #888;
      font-size: 18px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .ml-panel-close:hover {
      background: #444;
      color: #fff;
    }
    .ml-panel-body {
      flex: 1;
      display: flex;
      overflow: hidden;
    }
    .ml-sidebar {
      width: 220px;
      background: #252525;
      border-right: 1px solid #333;
      overflow-y: auto;
      padding: 12px;
    }
    .ml-sidebar-title {
      font-size: 11px;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
    }
    .ml-cat-item {
      padding: 8px 10px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      color: #ccc;
      margin-bottom: 2px;
    }
    .ml-cat-item:hover {
      background: #333;
    }
    .ml-cat-item.active {
      background: #4a9eff;
      color: #fff;
    }
    .ml-subcat-item {
      padding: 6px 10px 6px 24px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      color: #999;
      margin-bottom: 1px;
    }
    .ml-subcat-item:hover {
      background: #333;
      color: #ccc;
    }
    .ml-subcat-item.active {
      background: #3a3a3a;
      color: #4a9eff;
    }
    .ml-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .ml-toolbar {
      padding: 12px 16px;
      border-bottom: 1px solid #333;
      display: flex;
      gap: 10px;
      align-items: center;
    }
    /* 「补全缺失预览」等工具条按钮 */
    .ml-toolbar-btn {
      height: 32px;
      padding: 0 12px;
      border-radius: 8px;
      border: 1px solid #383840;
      background: #26262b;
      color: #b9bec7;
      font-family: inherit;
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      transition: background .15s ease, border-color .15s ease, color .15s ease, transform .06s ease;
    }
    .ml-toolbar-btn:hover { background: #303038; border-color: #4a4a56; color: #e3e6eb; }
    .ml-toolbar-btn:active { transform: translateY(1px); }
    .ml-toolbar-btn[disabled] { opacity: .5; cursor: default; transform: none; }
    /* 顶部「输出触发词」开关 */
    .ml-topbar {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      height: 22px;
      padding: 0 2px 4px;
    }
    .ml-switch-label {
      font-size: 11px;
      color: #8b93a0;
      user-select: none;
    }
    .ml-switch {
      position: relative;
      width: 30px;
      height: 16px;
      border-radius: 999px;
      background: #3a3a42;
      border: 1px solid #4a4a56;
      cursor: pointer;
      transition: background .16s ease, border-color .16s ease;
      flex-shrink: 0;
    }
    .ml-switch::after {
      content: "";
      position: absolute;
      top: 1px;
      left: 1px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #9aa2ad;
      transition: transform .16s ease, background .16s ease;
    }
    .ml-switch.on {
      background: rgba(74,158,255,.28);
      border-color: #4a9eff;
    }
    .ml-switch.on::after {
      transform: translateX(14px);
      background: #6fb4ff;
    }
    /* 条目里的小号启用开关 */
    .ml-name-row {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }
    .ml-name-row .ml-name { min-width: 0; }
    .ml-switch-sm {
      width: 24px;
      height: 13px;
      flex-shrink: 0;
    }
    .ml-switch-sm::after {
      width: 9px;
      height: 9px;
    }
    .ml-switch-sm.on::after {
      transform: translateX(11px);
    }
    /* 禁用的条目整行变淡，一眼能看出没启用 */
    .ml-item.disabled { opacity: .45; }
    .ml-item.disabled .ml-name { text-decoration: line-through; }
    /* LoRA 详情弹窗（点预览图打开） */
    .ml-detail-mask {
      position: fixed;
      inset: 0;
      z-index: 2147483000;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, .62);
      backdrop-filter: blur(2px);
    }
    /* 弹窗挂在 document.body 下，拿不到节点容器里的 --ml-* 变量，所以这里颜色全部写死 */
    .ml-detail-box {
      width: min(560px, 92vw);
      max-height: 84vh;
      display: flex;
      flex-direction: column;
      border: 1px solid #3a3d44;
      border-radius: 12px;
      background: #1e2024;
      color: #e6e8ea;
      box-shadow: 0 18px 48px rgba(0, 0, 0, .55);
      overflow: hidden;
    }
    .ml-detail-head {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      border-bottom: 1px solid #33363c;
      background: #24262b;
      color: #e6e8ea;
      font-size: 13px;
      font-weight: 600;
    }
    .ml-detail-head .ml-detail-title {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ml-detail-body {
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .ml-detail-fig {
      width: 100%;
      border-radius: 8px;
      overflow: hidden;
      background: #101317;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 120px;
    }
    .ml-detail-fig img,
    .ml-detail-fig video {
      max-width: 100%;
      max-height: 42vh;
      display: block;
      object-fit: contain;
    }
    .ml-detail-grid {
      display: grid;
      grid-template-columns: 84px minmax(0, 1fr);
      gap: 4px 10px;
      font-size: 12px;
      line-height: 1.5;
    }
    .ml-detail-grid dt { color: #8d949c; }
    .ml-detail-grid dd { color: #e6e8ea; }
    .ml-detail-grid dd { margin: 0; word-break: break-all; user-select: text; }
    .ml-detail-block {
      border: 1px solid #33363c;
      border-radius: 8px;
      padding: 8px 10px;
      background: #24262b;
      font-size: 12px;
    }
    .ml-detail-block h4 {
      margin: 0 0 6px;
      font-size: 11px;
      font-weight: 600;
      color: #8d949c;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .ml-detail-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
    }
    .ml-detail-tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 4px 2px 8px;
      border: 1px solid #3a4560;
      border-radius: 10px;
      background: rgba(74, 158, 255, .12);
      color: #9ecbff;
      cursor: pointer;
      font-size: 11px;
    }
    .ml-detail-tag .ml-tag-del {
      width: 14px;
      height: 14px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: #8d949c;
      font: 11px/14px Arial, sans-serif;
      cursor: pointer;
    }
    .ml-detail-tag .ml-tag-del:hover { background: #e05545; color: #fff; }
    .ml-tag-add {
      display: flex;
      gap: 6px;
      margin-top: 8px;
    }
    .ml-tag-add input {
      flex: 1 1 auto;
      min-width: 0;
      height: 24px;
      padding: 0 7px;
      border: 1px solid #3a3d44;
      border-radius: 5px;
      background: #1a1c20;
      color: #e6e8ea;
      font-size: 11px;
      outline: none;
    }
    .ml-tag-add input:focus { border-color: #4a9eff; }
    .ml-tag-add button {
      flex: 0 0 auto;
      height: 24px;
      padding: 0 10px;
      border: 1px solid #4a9eff;
      border-radius: 5px;
      background: rgba(74, 158, 255, .16);
      color: #9ecbff;
      font-size: 11px;
      cursor: pointer;
    }
    .ml-detail-tag:hover { background: rgba(74, 158, 255, .22); }
    .ml-detail-empty { color: #8d949c; font-size: 11px; }
    /* 备注 */
    .ml-detail-notes {
      width: 100%;
      box-sizing: border-box;
      min-height: 54px;
      max-height: 120px;
      padding: 6px 8px;
      border: 1px solid #3a3d44;
      border-radius: 6px;
      background: #1a1c20;
      color: #e6e8ea;
      font: 11px/1.5 Arial, "Microsoft YaHei", sans-serif;
      resize: vertical;
      outline: none;
    }
    .ml-detail-notes:focus { border-color: #4a9eff; }
    /* tabs */
    .ml-detail-tabs {
      display: flex;
      gap: 2px;
      border-bottom: 1px solid #33363c;
      padding: 0 2px;
    }
    .ml-detail-tab {
      padding: 6px 12px;
      border: 0;
      border-bottom: 2px solid transparent;
      background: transparent;
      color: #8d949c;
      font-size: 12px;
      cursor: pointer;
    }
    .ml-detail-tab:hover { color: #c9d3dd; }
    .ml-detail-tab.active { color: #6fb4ff; border-bottom-color: #4a9eff; }
    .ml-detail-tabpane { min-height: 90px; padding: 10px 2px; }
    .ml-detail-imgs {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
      gap: 6px;
    }
    .ml-detail-imgs img {
      width: 100%;
      aspect-ratio: 1 / 1;
      object-fit: cover;
      border-radius: 6px;
      cursor: zoom-in;
      background: #101317;
    }
    .ml-detail-desc {
      color: #cfd6dd;
      font-size: 12px;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 260px;
      overflow: auto;
      user-select: text;
    }
    .ml-detail-ver {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 260px;
      overflow: auto;
    }
    .ml-detail-ver-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 9px;
      border: 1px solid #33363c;
      border-radius: 7px;
      background: #24262b;
      font-size: 11px;
    }
    .ml-detail-ver-item.cur { border-color: #4a9eff; }
    .ml-detail-ver-main { flex: 1 1 auto; min-width: 0; }
    .ml-detail-ver-name { color: #e6e8ea; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ml-detail-ver-sub { color: #8d949c; margin-top: 2px; }
    .ml-detail-foot {
      display: flex;
      gap: 8px;
      padding: 10px 12px;
      border-top: 1px solid #33363c;
      background: #24262b;
    }
    .ml-detail-btn {
      flex: 1 1 auto;
      height: 30px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border: 1px solid #3a3d44;
      border-radius: 6px;
      background: #2a2d33;
      color: #e6e8ea;
      font-size: 12px;
      cursor: pointer;
    }
    .ml-detail-btn:hover { border-color: #4a9eff; color: #9ecbff; }
    .ml-detail-btn.primary { border-color: #4a9eff; background: rgba(74, 158, 255, .16); color: #9ecbff; }

    /* 条目里的触发词按钮 */
    .ml-trig-btn {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
      border-radius: 4px;
      border: none;
      background: transparent;
      color: #7f8a99;
      font-size: 11px;
      line-height: 1;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background .15s ease, color .15s ease, transform .15s ease;
    }
    .ml-trig-btn:hover { background: #2a3442; color: #6fb4ff; }
    .ml-trig-btn.empty { opacity: .32; cursor: default; }
    .ml-trig-btn.empty:hover { background: transparent; color: #7f8a99; }
    .ml-trig-btn.open { color: #6fb4ff; transform: rotate(180deg); }
    /* 展开的触发词面板 */
    .ml-trig-panel {
      margin: -2px 0 4px;
      padding: 6px 8px;
      background: #232329;
      border: 1px solid #34343d;
      border-left: 2px solid rgba(74,158,255,.5);
      border-radius: 8px;
      min-width: 0;
    }
    .ml-trig-head {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
    }
    .ml-trig-title {
      font-size: 10px;
      color: #8b93a0;
      flex: 1 1 auto;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ml-trig-mini {
      height: 18px;
      padding: 0 6px;
      white-space: nowrap;
      flex-shrink: 0;
      border-radius: 4px;
      border: 1px solid #3a3a44;
      background: #26262b;
      color: #9aa2ad;
      font-size: 10px;
      cursor: pointer;
      font-family: inherit;
    }
    .ml-trig-mini:hover { background: #303038; color: #e3e6eb; border-color: #4a4a56; }
    .ml-trig-chips {
      display: flex;
      flex-direction: column;
      gap: 3px;
      max-height: 132px;
      overflow-y: auto;
      overflow-x: hidden;
      padding-bottom: 4px;   /* 别把最后一行切一半 */
      scrollbar-width: thin;
      scrollbar-color: var(--ml-line-strong) transparent;
    }
    .ml-trig-chips::-webkit-scrollbar { width: 8px; }
    .ml-trig-chips::-webkit-scrollbar-thumb {
      background: var(--ml-line-strong);
      border-radius: 999px;
    }
    /* 列表/标签放在 flex 列里时不许被压缩（否则放不下就被挤成一条线） */
    .ml-trig-chips > *,
    .ml-list > * {
      flex: 0 0 auto;
    }
    .ml-trig-chip {
      max-width: 100%;
      padding: 3px 7px;
      border-radius: 5px;
      font-size: 10px;
      line-height: 1.5;
      cursor: pointer;
      border: 1px solid transparent;
      transition: background .12s ease, color .12s ease, border-color .12s ease;
      word-break: break-word;
      user-select: none;
      /* 长触发词只显示两行（-webkit-box 在 flex 里会渲染成空条，这里用 max-height 裁剪） */
      display: block;
      max-height: calc(1.5em * 2 + 6px);
      overflow: hidden;
    }
    .ml-trig-chip.on {
      background: rgba(74,158,255,.16);
      border-color: rgba(74,158,255,.45);
      color: #b8dcff;
    }
    .ml-trig-chip.on:hover { background: rgba(74,158,255,.26); }
    .ml-trig-chip.off {
      background: #26262b;
      border-color: #34343d;
      color: #61686f;
      text-decoration: line-through;
    }
    .ml-trig-chip.off:hover { color: #9aa2ad; }
    /* 宽版迷你对话框（下载/更新用） */
    /* 用复合选择器提高优先级（.ml-mini 在后面定义，单类名会被它盖掉） */
    .ml-mini.ml-mini-wide { width: 560px; max-width: 92%; }
    .ml-mini.ml-mini-xl { width: 660px; max-width: 94%; }
    .ml-mini.ml-mini-xl .ml-tgv-list { max-height: 420px; }
    .ml-mini.ml-mini-xl .ml-ver-list { max-height: 400px; }
    .ml-mini-inline { display: flex; gap: 8px; align-items: center; }
    .ml-mini-inline .ml-mini-input { flex: 1 1 auto; }
    .ml-mini-btn { height: 32px; padding: 0 14px; flex: 0 0 auto; }
    .ml-mini-select { height: 32px; font-size: 12px; }
    .ml-dim { color: #7d8794; font-size: 11px; }
    .ml-dl-info { font-size: 12px; color: #d6dce6; line-height: 1.6; min-height: 18px; }
    .ml-key-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-radius: var(--ml-r-md);
      background: var(--ml-bg-1);
      border: 1px solid var(--ml-line);
    }
    .ml-key-text {
      flex: 1 1 auto;
      min-width: 0;
      font-size: 11px;
      color: var(--ml-text-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ml-key-text.ok { color: #9fdcae; }
    .ml-key-text.warn { color: #e8c07a; }
    .ml-progress {
      height: 8px;
      border-radius: 999px;
      background: #26262b;
      border: 1px solid #34343d;
      overflow: hidden;
      position: relative;
    }
    .ml-progress-bar {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #3d8bf2, #6fb4ff);
      color: #cfe2ff;
      font-size: 9px;
      text-align: center;
      line-height: 8px;
      transition: width .25s ease;
      white-space: nowrap;
      overflow: hidden;
    }
    /* 更新列表 */
    .ml-update-list {
      max-height: 320px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .ml-update-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      background: #26262b;
      border: 1px solid #34343d;
      border-radius: 10px;
      transition: border-color .15s ease, background .15s ease;
    }
    .ml-update-row:hover { border-color: #4a4a56; background: #2a2a31; }
    .ml-update-left { flex: 1 1 auto; min-width: 0; }
    .ml-update-name {
      font-size: 12px;
      color: #e6ebf2;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ml-update-sub { font-size: 11px; color: #8b93a0; margin-top: 2px; }
    .ml-update-btn { height: 28px; padding: 0 10px; font-size: 11px; }
    .ml-update-empty { padding: 24px 8px; text-align: center; color: #7d8794; font-size: 12px; }
    /* 缩略图通用 */
    .ml-thumb-box {
      flex-shrink: 0;
      border-radius: 6px;
      overflow: hidden;
      background: #1c1f24;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #4a5058;
    }
    .ml-tgm-thumb, .ml-thumb-box.ml-tgm-thumb { width: 44px; height: 44px; }
    .ml-tgm-thumb { object-fit: cover; display: block; }
    .ml-thumb-box.empty { font-size: 18px; border: 1px dashed #34343d; }
    .ml-update-thumbs {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }
    .ml-update-thumb, .ml-thumb-box.ml-update-thumb { width: 42px; height: 42px; }
    .ml-update-thumb { object-fit: cover; display: block; }
    .ml-update-arrow { color: #5c636d; font-size: 12px; }
    /* 单 LoRA 对话框头部（触发词编辑 / 版本列表共用） */
    .ml-tgv-head {
      display: flex;
      gap: 10px;
      align-items: center;
      padding-bottom: 10px;
      border-bottom: 1px solid #34343d;
    }
    .ml-tgv-thumb, .ml-thumb-box.ml-tgv-thumb { width: 46px; height: 46px; }
    .ml-tgv-thumb { object-fit: cover; display: block; }
    .ml-tgv-titles { flex: 1 1 auto; min-width: 0; }
    .ml-tgv-titles .ml-mini-hint { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    /* 触发词编辑列表 */
    .ml-tgv-list {
      max-height: 320px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 5px;
      padding: 2px 0;
    }
    .ml-tgv-row {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      background: #26262b;
      border: 1px solid #34343d;
      border-radius: 8px;
      padding: 5px 8px;
      transition: border-color .15s ease;
    }
    .ml-tgv-row:hover { border-color: #4a4a56; }
    .ml-tgv-dot {
      width: 14px;
      height: 14px;
      margin-top: 8px;
      border-radius: 50%;
      flex-shrink: 0;
      cursor: pointer;
      border: 1px solid #4a4a56;
      background: #2f2f36;
      transition: background .15s ease, border-color .15s ease, box-shadow .15s ease;
    }
    .ml-tgv-dot.on {
      background: #4a9eff;
      border-color: #6fb4ff;
      box-shadow: 0 0 0 2px rgba(74,158,255,.18);
    }
    .ml-tgv-input {
      flex: 1 1 auto;
      min-width: 0;
      min-height: 32px;
      max-height: 170px;
      padding: 6px 8px;
      background: #1b1e23;
      border: 1px solid transparent;
      border-radius: 6px;
      color: #e6ebf2;
      font-family: inherit;
      font-size: 12px;
      line-height: 1.5;
      outline: none;
      resize: vertical;
      overflow-y: auto;
      transition: border-color .15s ease, background .15s ease;
    }
    .ml-tgv-input:hover { border-color: #3a3a44; }
    .ml-tgv-input:focus { border-color: #4a9eff; background: #15181d; }
    .ml-tgv-del {
      width: 22px;
      height: 22px;
      margin-top: 4px;
      flex-shrink: 0;
      border: none;
      border-radius: 5px;
      background: transparent;
      color: #7f8a99;
      font-size: 14px;
      line-height: 1;
      cursor: pointer;
    }
    .ml-tgv-del:hover { background: #3a2626; color: #ff9b9b; }
    .ml-tgv-count { font-size: 10px; color: #7d8794; text-align: right; padding: 2px 4px; }
    .ml-tgv-empty { padding: 18px 8px; text-align: center; color: #7d8794; font-size: 12px; }
    /* 版本列表 */
    .ml-ver-list {
      max-height: 340px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 2px 0;
    }
    .ml-ver-card {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      background: #26262b;
      border: 1px solid #34343d;
      border-radius: 10px;
      transition: border-color .15s ease, background .15s ease;
    }
    .ml-ver-card:hover { border-color: #4a4a56; background: #2a2a31; }
    .ml-ver-card.current { border-color: rgba(74,158,255,.5); background: rgba(74,158,255,.08); }
    .ml-ver-thumb, .ml-thumb-box.ml-ver-thumb { width: 52px; height: 52px; }
    .ml-ver-thumb { object-fit: cover; display: block; }
    .ml-ver-info { flex: 1 1 auto; min-width: 0; }
    .ml-ver-name {
      font-size: 12px;
      font-weight: 600;
      color: #e6ebf2;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .ml-ver-badge {
      font-size: 9px;
      font-weight: 700;
      color: #04121f;
      background: #4a9eff;
      border-radius: 4px;
      padding: 1px 5px;
    }
    .ml-ver-sub { font-size: 11px; color: #8b93a0; margin-top: 2px; }
    .ml-ver-tw {
      font-size: 10px;
      color: #6f7681;
      margin-top: 3px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ml-ver-btn { height: 28px; padding: 0 10px; font-size: 11px; flex-shrink: 0; }
    /* 触发词管理 */
    .ml-trig-mgr { display: flex; flex-direction: column; overflow: hidden; }
    .ml-trig-mgr-head {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      border-bottom: 1px solid #333;
    }
    .ml-trig-mgr-title { font-size: 13px; font-weight: 700; color: #e6ebf2; margin-right: 6px; }
    .ml-trig-mgr-list {
      flex: 1 1 auto;
      overflow-y: auto;
      padding: 10px 16px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .ml-tgm-row {
      display: flex;
      gap: 8px;
      padding: 8px 10px;
      background: #26262b;
      border: 1px solid #34343d;
      border-radius: 8px;
    }
    .ml-tgm-body { flex: 1 1 auto; min-width: 0; }
    .ml-tgm-top {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
    }
    .ml-tgm-name {
      font-size: 12px;
      font-weight: 600;
      color: #e6ebf2;
      flex: 1 1 auto;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ml-tgm-count { font-size: 10px; color: #6fb4ff; margin-right: 4px; }
    /* 卡片右键菜单 */
    .ml-ctx {
      position: fixed;
      z-index: 100002;
      min-width: 178px;
      padding: 6px;
      background: #232329;
      border: 1px solid #3a3a44;
      border-radius: 10px;
      box-shadow: 0 12px 32px rgba(0,0,0,.62);
      font-size: 12px;
      color: #c6cbd3;
      animation: mlCtxIn .1s ease-out;
    }
    @keyframes mlCtxIn {
      from { opacity: 0; transform: scale(.97); }
      to   { opacity: 1; transform: none; }
    }
    .ml-ctx-title {
      padding: 5px 10px 6px;
      color: #7d8794;
      font-size: 10px;
      letter-spacing: .4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ml-ctx-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 7px;
      cursor: pointer;
      white-space: nowrap;
      transition: background .12s ease, color .12s ease;
    }
    .ml-ctx-item:hover { background: #2f3540; color: #eef1f6; }
    .ml-ctx-item .ico { width: 14px; text-align: center; opacity: .9; }
    .ml-ctx-item.danger:hover { background: #3a2626; color: #ffb4b4; }
    .ml-ctx-sep { height: 1px; margin: 5px 6px; background: #34343d; }
    /* 没有预览时的上传占位 */
    .ml-thumb-upload {
      width: 100%;
      height: 100%;
      background: #2b2b31;
      border-bottom: 1px dashed #4a4a56;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      color: #8b93a0;
      font-size: 11px;
      cursor: pointer;
      transition: background .15s ease, color .15s ease, border-color .15s ease;
    }
    .ml-thumb-upload:hover {
      background: #313a45;
      border-color: #4a9eff;
      color: #9ccdff;
    }
    .ml-thumb-upload .ico { font-size: 20px; line-height: 1; }
    /* 面板内迷你对话框（改名用，替代浏览器 prompt） */
    .ml-mini-mask {
      position: absolute;
      inset: 0;
      background: rgba(0,0,0,.45);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 30;
      animation: mlFadeIn .12s ease-out;
    }
    @keyframes mlFadeIn { from { opacity: 0; } to { opacity: 1; } }
    .ml-mini {
      width: 320px;
      max-width: 86%;
      background: #232329;
      border: 1px solid #3a3a44;
      border-radius: 12px;
      box-shadow: 0 16px 40px rgba(0,0,0,.6);
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .ml-mini-title { font-size: 12px; font-weight: 700; color: #e6ebf2; }
    .ml-mini-hint { font-size: 11px; color: #8b93a0; word-break: break-all; }
    .ml-mini-input {
      height: 32px;
      padding: 0 10px;
      background: #1b1e23;
      border: 1px solid #4a9eff;
      border-radius: 8px;
      color: #e6ebf2;
      font-family: inherit;
      font-size: 12px;
      outline: none;
      box-shadow: 0 0 0 2px rgba(74,158,255,.18);
    }
    .ml-mini-row { display: flex; gap: 8px; justify-content: flex-end; }
    .ml-btn-danger {
      background: linear-gradient(180deg, #f26a6a 0%, #d94c4c 100%);
      color: #fff;
      border-color: rgba(255,255,255,.14);
      box-shadow: 0 2px 10px rgba(217,76,76,.35);
    }
    .ml-btn-danger:hover {
      background: linear-gradient(180deg, #ff8080 0%, #e15a5a 100%);
      box-shadow: 0 3px 14px rgba(255,107,107,.45);
    }
    .ml-btn-danger[disabled] { opacity: .6; cursor: default; }
    .ml-search {
      flex: 1;
      padding: 8px 12px;
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 6px;
      color: #fff;
      font-size: 12px;
      outline: none;
    }
    .ml-search:focus {
      border-color: #4a9eff;
    }
    .ml-grid {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
      grid-auto-rows: max-content;   /* 行高按内容算，别让卡片塌成一条线 */
      gap: 12px;
      align-content: start;
    }
    .ml-card {
      position: relative;
      align-self: start;
      background: #2a2a2a;
      border-radius: 8px;
      overflow: hidden;
      cursor: pointer;
      border: 2px solid transparent;
      transition: all 0.2s;
      /* 高度交给内容（缩略图按 896:1152 比例撑开），不再写死 */
      min-height: 0;
      height: auto;
      display: flex;
      flex-direction: column;
    }
    .ml-card:hover {
      border-color: #4a9eff;
      transform: translateY(-2px);
    }
    .ml-card.selected {
      border-color: #4a9eff;
      background: #2d3a4a;
    }
    .ml-card-thumb-wrap {
      /* 896:1152 竖版比例。用 padding-top 撑（aspect-ratio 在 grid 行里会被算成 0） */
      position: relative;
      width: 100%;
      height: 0;
      padding-top: 128.5714%;   /* 1152/896 */
      flex: 0 0 auto;
      overflow: hidden;
      background: #1e1e1e;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .ml-card-thumb {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      background: #1e1e1e;
    }
    .ml-card-info {
      padding: 10px;
    }
    .ml-card-name {
      font-size: 11px;
      font-weight: 600;
      color: #fff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 4px;
    }
    .ml-card-triggers {
      font-size: 10px;
      color: #888;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ml-panel-footer {
      padding: 12px 16px;
      border-top: 1px solid #333;
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      background: linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.18) 100%);
    }
    .ml-footer-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: auto;
    }
    /* 统一按钮基座：等高、内图标对齐、hover/active/focus 一致 */
    .ml-footer-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      height: 32px;
      padding: 0 16px;
      border-radius: 8px;
      border: 1px solid transparent;
      font-family: inherit;
      font-size: 12px;
      font-weight: 600;
      line-height: 1;
      letter-spacing: .3px;
      white-space: nowrap;
      cursor: pointer;
      outline: none;
      user-select: none;
      transition: background .15s ease, border-color .15s ease,
                  color .15s ease, box-shadow .15s ease, transform .06s ease;
    }
    .ml-footer-btn:active {
      transform: translateY(1px);
    }
    .ml-footer-btn:focus-visible {
      box-shadow: 0 0 0 2px rgba(74,158,255,.55);
    }
    .ml-footer-btn .ml-btn-ico {
      font-size: 13px;
      line-height: 1;
      opacity: .95;
    }
    /* 次要按钮（取消 / 存为预设 / 预设） */
    .ml-btn-cancel,
    .ml-btn-ghost {
      background: #26262b;
      color: #b9bec7;
      border-color: #383840;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.03);
    }
    .ml-btn-cancel:hover,
    .ml-btn-ghost:hover {
      background: #303038;
      color: #e3e6eb;
      border-color: #4a4a56;
    }
    .ml-btn-ghost:hover .ml-btn-ico {
      opacity: 1;
    }
    /* 主按钮（应用） */
    .ml-btn-apply {
      background: linear-gradient(180deg, #5aa8ff 0%, #3d8bf2 100%);
      color: #fff;
      border-color: rgba(255,255,255,.14);
      box-shadow: 0 2px 10px rgba(61,139,242,.35);
      padding: 0 22px;
    }
    .ml-btn-apply:hover {
      background: linear-gradient(180deg, #6db2ff 0%, #4a95f7 100%);
      box-shadow: 0 3px 14px rgba(74,158,255,.5);
    }
    .ml-btn-apply:active {
      box-shadow: 0 1px 6px rgba(61,139,242,.4);
    }
    /* 节点内提示条（替代 alert） */
    .ml-toast {
      position: absolute;
      left: 50%;
      bottom: 50px;
      transform: translate(-50%, 6px);
      opacity: 0;
      max-width: calc(100% - 24px);
      padding: 6px 10px;
      background: #2b3038;
      border: 1px solid #3d4450;
      border-radius: 8px;
      color: #d8dee8;
      font-size: 11px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      box-shadow: 0 6px 18px rgba(0,0,0,.5);
      pointer-events: none;
      z-index: 20;
      transition: opacity .18s ease, transform .18s ease;
    }
    .ml-toast.show { opacity: 1; transform: translate(-50%, 0); }
    .ml-toast[data-kind="ok"]  { color: #b9f0c4; border-color: #2f6b3f; background: #22382a; }
    .ml-toast[data-kind="err"] { color: #ffb4b4; border-color: #6b3a3a; background: #37262a; }
    /* 节点内「存为预设」输入行 */
    .ml-composer {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 8px;
    }
    .ml-composer-input {
      flex: 1 1 auto;
      min-width: 0;
      height: 30px;
      padding: 0 8px;
      background: #1b1e23;
      border: 1px solid #4a9eff;
      border-radius: 8px;
      color: #e6ebf2;
      font-family: inherit;
      font-size: 12px;
      outline: none;
      box-shadow: 0 0 0 2px rgba(74,158,255,.18);
    }
    .ml-composer-input::placeholder { color: #6b7280; }
    .ml-composer .ml-node-btn { flex: 0 0 auto; padding: 0 12px; }
    .ml-composer .ml-composer-ok {
      background: linear-gradient(180deg, #5aa8ff 0%, #3d8bf2 100%);
      border-color: rgba(255,255,255,.14);
      color: #fff;
    }
    .ml-composer .ml-composer-ok:hover {
      background: linear-gradient(180deg, #6db2ff 0%, #4a95f7 100%);
    }
    /* 权重值就地编辑 */
    .ml-weight-input {
      width: 48px;
      height: 18px;
      padding: 0 3px;
      background: #1b1e23;
      border: 1px solid #4a9eff;
      border-radius: 4px;
      color: #e6ebf2;
      font-size: 10px;
      text-align: right;
      outline: none;
      font-variant-numeric: tabular-nums;
      flex-shrink: 0;
    }
    .ml-weight-input::-webkit-outer-spin-button,
    .ml-weight-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
    /* 二次确认的删除按钮 */
    .ml-preset-row .del.armed {
      color: #ff6b6b;
      font-size: 11px;
      font-weight: 600;
      padding: 0 6px;
      border: 1px solid #7a3a3a;
      border-radius: 4px;
      background: #3a2424;
    }
    /* 预设浮层 */
    .ml-presets-menu {
      position: absolute;
      bottom: 56px;
      right: 16px;
      background: #232329;
      border: 1px solid #3a3a44;
      border-radius: 10px;
      padding: 6px;
      min-width: 180px;
      z-index: 1000;
      box-shadow: 0 10px 28px rgba(0,0,0,.55);
      animation: mlMenuIn .12s ease-out;
    }
    @keyframes mlMenuIn {
      from { opacity: 0; transform: translateY(4px); }
      to   { opacity: 1; transform: none; }
    }
    .ml-presets-empty {
      padding: 10px 8px;
      color: #71767d;
      font-size: 11px;
      text-align: center;
    }
    .ml-presets-item {
      padding: 8px 10px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      color: #c6cbd3;
      transition: background .12s ease, color .12s ease;
    }
    .ml-presets-item:hover {
      background: #2f2f38;
      color: #eef1f6;
    }
    .ml-presets-save {
      padding: 8px 10px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      color: #5aa8ff;
      margin-top: 4px;
      border-top: 1px solid #3a3a44;
      transition: background .12s ease, color .12s ease;
    }
    .ml-presets-save:hover {
      background: #25303c;
      color: #8cc4ff;
    }

    /* ============================================================
       设计系统：统一色板 / 圆角 / 字号 / 间距
       （放在最后，覆盖上面历史遗留的零散写法）
       ============================================================ */
    .ml-container,
    .ml-panel,
    .ml-mini,
    .ml-ctx,
    .ml-toast,
    .ml-preset-pop,
    .ml-presets-menu {
      --ml-bg-0: #16171b;
      --ml-bg-1: #1d1e23;
      --ml-bg-2: #23242b;
      --ml-bg-3: #2b2d35;
      --ml-line: #34353e;
      --ml-line-strong: #41434f;
      --ml-text: #e7e9ef;
      --ml-text-dim: #a3a9b4;
      --ml-text-mute: #6f7480;
      --ml-accent: #4a9eff;
      --ml-accent-hi: #6fb4ff;
      --ml-accent-soft: rgba(74,158,255,.16);
      --ml-danger: #ff6b6b;
      --ml-r-sm: 6px;
      --ml-r-md: 8px;
      --ml-r-lg: 10px;
      --ml-r-xl: 12px;
      --ml-shadow-1: 0 2px 10px rgba(0,0,0,.28);
      --ml-shadow-2: 0 12px 32px rgba(0,0,0,.55);
      --ml-ring: 0 0 0 2px rgba(74,158,255,.45);
      color: var(--ml-text);
    }

    /* ---------- 统一：卡片/条目/行 表面 ---------- */
    .ml-item,
    .ml-card,
    .ml-tgm-row,
    .ml-update-row,
    .ml-ver-card,
    .ml-tgv-row,
    .ml-trig-panel,
    .ml-thumb-upload,
    .ml-mini,
    .ml-ctx,
    .ml-presets-menu {
      background: var(--ml-bg-2);
      border: 1px solid var(--ml-line);
      border-radius: var(--ml-r-md);
    }
    .ml-card,
    .ml-ver-card,
    .ml-mini,
    .ml-ctx,
    .ml-presets-menu { border-radius: var(--ml-r-lg); }
    .ml-mini, .ml-ctx, .ml-presets-menu { border-radius: var(--ml-r-xl); }

    .ml-item:hover,
    .ml-tgm-row:hover,
    .ml-tgv-row:hover {
      border-color: var(--ml-line-strong);
      background: var(--ml-bg-3);
    }

    /* ---------- 统一：文字层级 ---------- */
    .ml-name,
    .ml-card-name,
    .ml-tgm-name,
    .ml-update-name,
    .ml-ver-name,
    .ml-tgv-input,
    .ml-mini-title,
    .ml-panel-title,
    .ml-trig-mgr-title { color: var(--ml-text); }

    .ml-card-triggers,
    .ml-update-sub,
    .ml-ver-sub,
    .ml-ver-tw,
    .ml-mini-hint,
    .ml-trig-title,
    .ml-tgm-count,
    .ml-tgv-count,
    .ml-dim,
    .ml-weight-label,
    .ml-switch-label { color: var(--ml-text-dim); }
    .ml-ver-tw, .ml-tgv-count, .ml-dim, .ml-update-empty, .ml-tgv-empty { color: var(--ml-text-mute); }

    /* 字号收敛：10 / 11 / 12 / 13 四档 */
    .ml-name, .ml-card-name, .ml-tgm-name, .ml-update-name, .ml-ver-name { font-size: 12px; }
    .ml-card-triggers, .ml-update-sub, .ml-ver-sub, .ml-ver-tw,
    .ml-mini-hint, .ml-trig-title, .ml-weight-label, .ml-switch-label { font-size: 11px; }
    .ml-ver-tw, .ml-tgv-count, .ml-tgm-count, .ml-dim,
    .ml-trig-chip, .ml-weight-val, .ml-trig-mini { font-size: 10px; }
    .ml-panel-title, .ml-trig-mgr-title { font-size: 13px; }
    .ml-mini-title { font-size: 13px; }

    /* ---------- 统一：按钮 ---------- */
    .ml-node-btn,
    .ml-toolbar-btn,
    .ml-footer-btn,
    .ml-mini-btn {
      height: 30px;
      padding: 0 12px;
      border-radius: var(--ml-r-md);
      border: 1px solid var(--ml-line);
      background: var(--ml-bg-2);
      color: var(--ml-text-dim);
      font-family: inherit;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: .2px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      transition: background .15s ease, border-color .15s ease, color .15s ease,
                  box-shadow .15s ease, transform .06s ease;
    }
    .ml-node-btn:hover,
    .ml-toolbar-btn:hover,
    .ml-footer-btn:hover,
    .ml-mini-btn:hover {
      background: var(--ml-bg-3);
      border-color: var(--ml-line-strong);
      color: var(--ml-text);
    }
    .ml-node-btn:active,
    .ml-toolbar-btn:active,
    .ml-footer-btn:active,
    .ml-mini-btn:active { transform: translateY(1px); }
    .ml-node-btn:focus-visible,
    .ml-toolbar-btn:focus-visible,
    .ml-footer-btn:focus-visible,
    .ml-mini-btn:focus-visible,
    .ml-switch:focus-visible,
    .ml-trig-btn:focus-visible { outline: none; box-shadow: var(--ml-ring); }

    /* 主按钮 / 次按钮 / 危险按钮 语义色 */
    .ml-btn-apply,
    .ml-node-btn-primary,
    .ml-composer-ok {
      background: linear-gradient(180deg, #5aa8ff 0%, #3d8bf2 100%);
      border-color: rgba(255,255,255,.14);
      color: #fff;
      box-shadow: 0 2px 10px rgba(61,139,242,.32);
    }
    .ml-btn-apply:hover,
    .ml-node-btn-primary:hover,
    .ml-composer-ok:hover {
      background: linear-gradient(180deg, #6db2ff 0%, #4a95f7 100%);
      box-shadow: 0 3px 14px rgba(74,158,255,.46);
      color: #fff;
    }
    .ml-btn-danger {
      background: linear-gradient(180deg, #f26a6a 0%, #d94c4c 100%);
      border-color: rgba(255,255,255,.14);
      color: #fff;
      box-shadow: 0 2px 10px rgba(217,76,76,.32);
    }
    .ml-btn-danger:hover {
      background: linear-gradient(180deg, #ff8080 0%, #e15a5a 100%);
      box-shadow: 0 3px 14px rgba(255,107,107,.44);
      color: #fff;
    }
    .ml-btn-cancel,
    .ml-btn-ghost { background: var(--ml-bg-2); border-color: var(--ml-line); color: var(--ml-text-dim); }
    .ml-btn-cancel:hover,
    .ml-btn-ghost:hover { background: var(--ml-bg-3); border-color: var(--ml-line-strong); color: var(--ml-text); }

    /* 小尺寸按钮（行内） */
    .ml-trig-mini,
    .ml-update-btn,
    .ml-ver-btn {
      height: 24px;
      padding: 0 8px;
      border-radius: var(--ml-r-sm);
      border: 1px solid var(--ml-line);
      background: var(--ml-bg-1);
      color: var(--ml-text-dim);
      font-family: inherit;
      font-size: 10px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      flex-shrink: 0;
      transition: background .15s ease, border-color .15s ease, color .15s ease;
    }
    .ml-trig-mini:hover,
    .ml-update-btn:hover,
    .ml-ver-btn:hover { background: var(--ml-bg-3); border-color: var(--ml-line-strong); color: var(--ml-text); }

    /* ---------- 统一：输入框 / 下拉 ---------- */
    .ml-search,
    .ml-mini-input,
    .ml-composer-input,
    .ml-tgv-input,
    .ml-weight-input {
      background: var(--ml-bg-0);
      border: 1px solid var(--ml-line);
      border-radius: var(--ml-r-md);
      color: var(--ml-text);
      font-family: inherit;
      outline: none;
      transition: border-color .15s ease, box-shadow .15s ease, background .15s ease;
    }
    .ml-search:focus,
    .ml-mini-input:focus,
    .ml-composer-input:focus,
    .ml-tgv-input:focus,
    .ml-weight-input:focus {
      border-color: var(--ml-accent);
      box-shadow: 0 0 0 2px rgba(74,158,255,.16);
    }
    .ml-search::placeholder,
    .ml-mini-input::placeholder,
    .ml-composer-input::placeholder,
    .ml-tgv-input::placeholder { color: var(--ml-text-mute); }
    .ml-mini-select { color: var(--ml-text); }

    /* ---------- 统一：chips ---------- */
    .ml-trig-chip {
      border-radius: var(--ml-r-sm);
      border: 1px solid var(--ml-line);
      background: var(--ml-bg-1);
      color: var(--ml-text-dim);
      padding: 3px 7px;
    }
    .ml-trig-chip.on {
      background: var(--ml-accent-soft);
      border-color: rgba(74,158,255,.5);
      color: #bfe0ff;
    }
    .ml-trig-chip.on:hover { background: rgba(74,158,255,.26); }
    .ml-trig-chip.off {
      background: var(--ml-bg-0);
      border-color: var(--ml-line);
      color: var(--ml-text-mute);
      text-decoration: line-through;
    }

    /* ---------- 统一：面板外框 ---------- */
    .ml-panel {
      background: var(--ml-bg-1);
      border: 1px solid var(--ml-line);
      border-radius: var(--ml-r-xl);
      box-shadow: var(--ml-shadow-2);
    }
    .ml-panel-header,
    .ml-toolbar,
    .ml-trig-mgr-head { border-bottom: 1px solid var(--ml-line); }
    .ml-panel-footer { border-top: 1px solid var(--ml-line); background: transparent; }
    .ml-sidebar { border-right: 1px solid var(--ml-line); }
    .ml-panel-close {
      width: 26px; height: 26px;
      border-radius: var(--ml-r-sm);
      background: transparent;
      border: 1px solid transparent;
      color: var(--ml-text-mute);
      cursor: pointer;
      transition: background .15s ease, color .15s ease, border-color .15s ease;
    }
    .ml-panel-close:hover { background: var(--ml-bg-3); border-color: var(--ml-line); color: var(--ml-text); }

    .ml-cat-item,
    .ml-subcat-item {
      border-radius: var(--ml-r-sm);
      color: var(--ml-text-dim);
      transition: background .15s ease, color .15s ease;
    }
    .ml-cat-item:hover,
    .ml-subcat-item:hover { background: var(--ml-bg-3); color: var(--ml-text); }
    .ml-cat-item.active,
    .ml-subcat-item.active {
      background: var(--ml-accent-soft);
      color: #bfe0ff;
      border-left: 2px solid var(--ml-accent);
    }
    .ml-sidebar-title { color: var(--ml-text-mute); font-size: 10px; letter-spacing: .6px; }

    /* ---------- 节点内表面色：节点底色偏浅，卡片必须更亮才看得出层次 ---------- */
    .ml-container {
      --ml-bg-0: #1f2026;
      --ml-bg-1: #292b33;
      --ml-bg-2: #31333c;
      --ml-bg-3: #3a3d48;
      --ml-line: #43454f;
      --ml-line-strong: #555866;
      --ml-text: #eceef4;
      --ml-text-dim: #b3b9c4;
      --ml-text-mute: #8a9099;
    }

    /* 节点里的主按钮不用大色块（整行都是蓝的太重），改成描边强调 */
    .ml-node-btn-primary {
      background: var(--ml-bg-2) !important;
      border-color: var(--ml-line) !important;
      color: var(--ml-accent-hi) !important;
      box-shadow: none !important;
    }
    .ml-node-btn-primary:hover {
      background: var(--ml-bg-3) !important;
      border-color: rgba(74,158,255,.55) !important;
      color: #cfe6ff !important;
    }

    /* ---------- 节点内部：看起来是一整块 ---------- */
    .ml-topbar {
      flex: 0 0 auto;
      height: 22px;
      padding: 0 2px 6px;
      border-bottom: 1px solid var(--ml-line);
      margin-bottom: 6px;
    }
    .ml-item { padding: 6px 7px; gap: 7px; }
    .ml-list { gap: 5px; margin-top: 0; }
    .ml-node-btn-row { margin-top: 8px; gap: 6px; }
    .ml-thumb, .ml-thumb-placeholder { border-radius: var(--ml-r-sm); }

    /* ---------- 滚动条统一 ---------- */
    .ml-list,
    .ml-grid,
    .ml-main,
    .ml-trig-chips,
    .ml-tgv-list,
    .ml-ver-list,
    .ml-update-list,
    .ml-trig-mgr-list,
    .ml-preset-pop { scrollbar-width: thin; scrollbar-color: var(--ml-line-strong) transparent; }
    .ml-list::-webkit-scrollbar,
    .ml-grid::-webkit-scrollbar,
    .ml-main::-webkit-scrollbar,
    .ml-trig-chips::-webkit-scrollbar,
    .ml-tgv-list::-webkit-scrollbar,
    .ml-ver-list::-webkit-scrollbar,
    .ml-update-list::-webkit-scrollbar,
    .ml-trig-mgr-list::-webkit-scrollbar,
    .ml-preset-pop::-webkit-scrollbar { width: 8px; height: 8px; }
    .ml-list::-webkit-scrollbar-thumb,
    .ml-grid::-webkit-scrollbar-thumb,
    .ml-main::-webkit-scrollbar-thumb,
    .ml-trig-chips::-webkit-scrollbar-thumb,
    .ml-tgv-list::-webkit-scrollbar-thumb,
    .ml-ver-list::-webkit-scrollbar-thumb,
    .ml-update-list::-webkit-scrollbar-thumb,
    .ml-trig-mgr-list::-webkit-scrollbar-thumb,
    .ml-preset-pop::-webkit-scrollbar-thumb {
      background: var(--ml-line-strong);
      border-radius: 999px;
    }
    .ml-list::-webkit-scrollbar-thumb:hover { background: #4d4f5c; }

    /* 触发词面板：用左侧强调条跟父条目连起来 */
    .ml-container .ml-trig-panel {
      border-left: 2px solid rgba(74,158,255,.55);
      border-top-left-radius: var(--ml-r-sm);
      border-bottom-left-radius: var(--ml-r-sm);
    }
    /* chips 区可滚动时给个渐隐提示，别让人以为被切断了 */
    .ml-trig-chips {
      mask-image: linear-gradient(180deg, #000 84%, rgba(0,0,0,.15) 100%);
      -webkit-mask-image: linear-gradient(180deg, #000 84%, rgba(0,0,0,.15) 100%);
    }

    /* ---------- 单色图标：统一尺寸/线宽/对齐 ---------- */
    .ml-ico {
      width: 14px;
      height: 14px;
      flex: 0 0 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: currentColor;
      opacity: .9;
    }
    .ml-ico svg {
      width: 14px;
      height: 14px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.7;
      stroke-linecap: round;
      stroke-linejoin: round;
      display: block;
    }
    .ml-ico.sm { width: 12px; height: 12px; flex-basis: 12px; }
    .ml-ico.sm svg { width: 12px; height: 12px; stroke-width: 2; }

    /* 缩略图容器（拖拽手柄） */
    .ml-thumb-wrap {
      width: 44px;
      aspect-ratio: 896 / 1152;   /* 跟卡片同一比例 */
      flex-shrink: 0;
      border-radius: var(--ml-r-sm);
      overflow: hidden;
      background: var(--ml-bg-0);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .ml-thumb-wrap .ml-thumb,
    .ml-thumb-wrap .ml-thumb-placeholder {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 0;
    }

    /* ---------- 拖拽排序视觉 ---------- */
    .ml-item { position: relative; }
    .ml-item.dragging { opacity: .45; }
    .ml-item > .ml-thumb-wrap { cursor: grab; }
    .ml-item.dragging > .ml-thumb-wrap { cursor: grabbing; }
    .ml-item.drop-before::before,
    .ml-item.drop-after::after {
      content: "";
      position: absolute;
      left: 2px;
      right: 2px;
      height: 2px;
      border-radius: 2px;
      background: var(--ml-accent);
      box-shadow: 0 0 8px rgba(74,158,255,.7);
    }
    .ml-item.drop-before::before { top: -3px; }
    .ml-item.drop-after::after { bottom: -3px; }

    /* ---------- 对齐：侧边栏 / 列表项 / 菜单图标 ---------- */
    .ml-sidebar-title {
      display: block;
      padding: 0 8px 8px;
      text-transform: uppercase;
    }
    .ml-cat-item,
    .ml-subcat-item {
      display: grid;
      grid-template-columns: 14px minmax(0, 1fr) auto;
      align-items: center;
      gap: 8px;
      height: 28px;
      padding: 0 10px;
      line-height: 1;
      white-space: nowrap;
      overflow: hidden;
    }
    .ml-subcat-item { padding-left: 26px; }
    /* active 的 2px 左边框会顶偏内容，用 padding 补回来，保证图标列对齐 */
    .ml-cat-item.active,
    .ml-subcat-item.active { padding-left: 8px; }
    .ml-subcat-item.active { padding-left: 24px; }
    .ml-cat-item span,
    .ml-subcat-item span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: left;
    }
    .ml-cat-item em,
    .ml-subcat-item em,
    .ml-presets-item em {
      font-style: normal;
      font-size: 10px;
      color: var(--ml-text-mute);
      flex: 0 0 auto;
    }
    .ml-subcat-item { padding-left: 26px; }

    /* 列表项：右侧两个小按钮统一成 22px 方块，垂直居中 */
    .ml-trig-btn,
    .ml-delete {
      width: 22px;
      height: 22px;
      flex: 0 0 22px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      border-radius: var(--ml-r-sm);
    }
    .ml-trig-btn .ml-ico,
    .ml-delete .ml-ico { opacity: .75; }
    .ml-trig-btn.open .ml-ico { opacity: 1; }

    /* 权重行：标签/滑条/数值 一条基线 */
    .ml-weight-row { align-items: center; }
    .ml-weight-label { line-height: 1; padding-top: 1px; }
    .ml-slider { margin: 0 1px; }
    .ml-weight-val { line-height: 1; }

    /* 右键菜单图标列 */
    .ml-ctx-item .ico {
      width: 16px;
      height: 16px;
      flex: 0 0 16px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      opacity: .85;
    }
    .ml-ctx-item:hover .ico { opacity: 1; }
    .ml-ctx-item.danger .ico { color: var(--ml-danger); }

    /* 上传占位里的大图标 */
    .ml-thumb-upload .ml-ico { width: 20px; height: 20px; flex-basis: 20px; }
    .ml-thumb-upload .ml-ico svg { width: 20px; height: 20px; stroke-width: 1.6; }
    .ml-thumb-placeholder .ml-ico,
    .ml-thumb-box.empty .ml-ico { color: var(--ml-text-mute); }

    /* 预设菜单条目 */
    .ml-presets-item {
      display: flex;
      align-items: center;
      gap: 7px;
    }
    .ml-presets-item span { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }

    /* 微调对齐 ---------- */
    .ml-search { height: 30px; padding: 0 10px; font-size: 12px; }
    .ml-toolbar { gap: 8px; padding: 10px 14px; }
    .ml-panel-title { font-weight: 700; letter-spacing: .2px; }
    .ml-sidebar { padding: 10px 8px; gap: 2px; }
    .ml-panel-body { gap: 0; }
    .ml-grid { padding: 12px 14px; gap: 10px; }
    .ml-card-info { padding: 6px 8px 8px; }
    .ml-card-name { padding: 0 0 2px; }
    .ml-card-triggers { padding: 0; }
    .ml-trig-mgr-head { padding: 10px 14px; }
    .ml-trig-mgr-list { padding: 10px 14px 14px; gap: 6px; }
    .ml-mini { padding: 14px; gap: 10px; }
    .ml-tgv-head { padding-bottom: 10px; }
    .ml-ver-card, .ml-update-row, .ml-tgm-row, .ml-tgv-row { padding: 8px; }

    /* ---------- 卡片：统一视觉重量 ---------- */
    .ml-card {
      transition: transform .12s ease, border-color .15s ease, box-shadow .15s ease;
    }
    .ml-card:hover {
      border-color: var(--ml-line-strong);
      box-shadow: var(--ml-shadow-1);
    }
    .ml-card.selected {
      border-color: var(--ml-accent);
      box-shadow: 0 0 0 1px rgba(74,158,255,.35);
    }
    .ml-card-name { padding: 6px 8px 0; }
    .ml-card-triggers { padding: 2px 8px 6px; }

    /* ---------- 节点内「从 C 站下预览」等小图标 ---------- */
    .ml-trig-btn { border-radius: var(--ml-r-sm); }
    .ml-delete { border-radius: var(--ml-r-sm); }
    .ml-delete:hover { background: #3a2626; color: var(--ml-danger); }
  `;
  document.head.appendChild(style);
}

// ==================== 单色图标（stroke 跟随文字色，保证色彩统一） ====================
const ICON_PATHS = {
  panel:    '<rect x="3" y="3.5" width="18" height="17" rx="3"/><path d="M3 9h18"/>',
  folder:   '<path d="M3 7.5A2 2 0 0 1 5 5.5h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  layers:   '<path d="M12 3 3 8l9 5 9-5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  save:     '<path d="M5 4h11l3 3v13H5z"/><path d="M9 4v5h6V4"/><rect x="8" y="13" width="8" height="6" rx="1"/>',
  download: '<path d="M12 4v10"/><path d="M8 10.5 12 14.5l4-4"/><path d="M4 18h16"/>',
  refresh:  '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/>',
  tag:      '<path d="M4 12.5V5a1 1 0 0 1 1-1h7.5L20 11.5 12.5 19z"/><circle cx="8.2" cy="8.2" r="1.3"/>',
  image:    '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="8.5" cy="10" r="1.6"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5"/>',
  pencil:   '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M14.5 6.5 17.5 9.5"/>',
  move:     '<path d="M3 7.5A2 2 0 0 1 5 5.5h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 12v5"/><path d="M9.5 14.5 12 17l2.5-2.5"/>',
  trash:    '<path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>',
  copy:     '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  plus:     '<path d="M12 5v14M5 12h14"/>',
  chevron:  '<path d="M6 9l6 6 6-6"/>',
  close:    '<path d="M6 6l12 12M18 6L6 18"/>',
  check:    '<path d="M5 12.5 9.5 17 19 7"/>',
  spark:    '<path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4l-8.5 8.5"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>'
};

function mlIcon(name, cls) {
  const body = ICON_PATHS[name] || "";
  return `<span class="ml-ico${cls ? " " + cls : ""}"><svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg></span>`;
}

// 取文件名部分（去掉目录和扩展名），用于提示条
function shortLoraName(name) {
  const parts = String(name || "").split(/[\\/]+/).filter(Boolean);
  let base = parts.length ? parts[parts.length - 1] : String(name || "");
  return base.replace(/\.(safetensors|ckpt|pt|bin)$/i, "");
}

// 解析 LoRA 名称为分类
function parseCategories(name) {
  // Windows 下 LoRA 名是 "分类\子类\文件名"（反斜杠），Linux 是正斜杠，
  // 两种都要认。最后一段是文件名，不算分类，只有它前面的目录才是分类。
  const parts = String(name || "").split(/[\\/]+/).filter(Boolean);
  const dirs = parts.length > 1 ? parts.slice(0, -1) : [];
  const leaf = parts.length ? parts[parts.length - 1] : "Uncategorized";
  return {
    top: dirs[0] || "Uncategorized",
    sub: dirs[1] || "General",
    leaf: leaf
  };
}

// 构建分类树
function buildCategoryTree(loras) {
  const tree = {};
  loras.forEach(l => {
    const { top, sub } = parseCategories(l.name);
    if (!tree[top]) tree[top] = new Set();
    tree[top].add(sub);
  });
  return tree;
}

// ==================== 主扩展类 ====================
const NODE_MIN_WIDTH = 372;   // 再窄下去条目会挤爆，强制撑住这个宽度

class MultiLoRALoader {
  constructor(node) {
    this.node = node;
    this.MIN_WIDTH = NODE_MIN_WIDTH;
    this._suppressResize = false;
    this.state = {
      selected: [],
      allLoras: [],
      panelOpen: false,
      tempSelected: [],
      searchQuery: "",
      activeCategory: null,
      activeSubCategory: null,
      presets: [],
      composerOpen: false,     // 节点内「存为预设」输入行
      composerName: "",
      triggerOpen: {}          // 哪些 LoRA 的触发词面板展开着（按 name 记）
    };
    this.domWidget = null;
    this.container = null;
    this.panelEl = null;
    this.init();
  }

  init() {
    try {
      // 节点太窄会让列表/滑条/按钮全部越界，先把最小宽度撑住
      if ((this.node.size && this.node.size[0]) < NODE_MIN_WIDTH) {
        this.node.setSize([NODE_MIN_WIDTH, this.node.size[1]]);
      }
      injectStyles();
      this.loadLoras();
      this.loadPresets();
      this.hideStackWidget();   // 先彻底藏掉原始文本框
      this.state.selected = this.readStackValue();  // 载入工作流时恢复已选 LoRA
      this.createDOMWidget();
      this.hideStackInput();
      this.bindEvents();
    } catch (e) {
      console.error("MultiLoRA init error:", e);
    }
  }

  // 彻底隐藏 lora_stack 的原始文本 widget（那个 [] 输入框）
  hideStackWidget() {
    try {
      // lora_stack（选择结果）和 output_triggers（触发词开关）都由自定义 UI 驱动，原生控件全藏掉
      ["lora_stack", "output_triggers"].forEach(name => {
        const w = (this.node.widgets || []).find(w => w.name === name);
        if (!w) return;
        w.type = "hidden";
        w.computeSize = () => [0, -4];
        w.draw = () => {};                  // 双保险：重写 draw 让它不画
        w.serializeValue = () => w.value;   // 但要能保存
      });
    } catch (e) {
      console.warn("hideStackWidget failed:", e);
    }
  }

  // ---- 「输出触发词」总开关 ----
  getOutputEnabled() {
    const w = (this.node.widgets || []).find(w => w.name === "output_triggers");
    return w ? w.value !== false : true;
  }

  setOutputEnabled(val) {
    const w = (this.node.widgets || []).find(w => w.name === "output_triggers");
    if (w) w.value = !!val;
    this.node.setDirtyCanvas(true, true);
  }

  clearDropMarks() {
    const list = this.container && this.container.querySelector(".ml-list");
    if (!list) return;
    list.querySelectorAll(".drop-before, .drop-after").forEach(el => {
      el.classList.remove("drop-before", "drop-after");
    });
  }

  // ---- 单个 LoRA 的触发词展开面板 ----
  isTriggersOpen(name) {
    return !!(this.state.triggerOpen && this.state.triggerOpen[name]);
  }

  toggleTriggers(name) {
    if (!this.state.triggerOpen) this.state.triggerOpen = {};
    this.state.triggerOpen[name] = !this.state.triggerOpen[name];
    this.renderList();
  }

  // 触发词启用状态：缺省全开
  triggerStates(item) {
    const total = (item.triggers || []).length;
    if (!Array.isArray(item.trigger_states) || item.trigger_states.length !== total) {
      item.trigger_states = new Array(total).fill(true);
    }
    return item.trigger_states;
  }

  createTriggerPanel(item) {
    const wrap = document.createElement("div");
    wrap.className = "ml-trig-panel";

    const head = document.createElement("div");
    head.className = "ml-trig-head";
    const title = document.createElement("span");
    title.className = "ml-trig-title";
    const states = this.triggerStates(item);
    const activeCount = states.filter(Boolean).length;
    title.textContent = `触发词 ${activeCount}/${states.length}`;
    head.appendChild(title);

    // 只留「编辑」：全开/全关在单 LoRA 编辑界面里，别在窄面板挤成一列
    const editBtn = document.createElement("button");
    editBtn.className = "ml-trig-mini";
    editBtn.textContent = "编辑";
    editBtn.onclick = (e) => {
      e.stopPropagation();
      this.openLoraTriggers(this.state.selected.find(x => x.name === item.name) || item);
    };
    head.appendChild(editBtn);
    wrap.appendChild(head);

    const chips = document.createElement("div");
    chips.className = "ml-trig-chips";
    (item.triggers || []).forEach((word, i) => {
      const chip = document.createElement("span");
      const on = states[i] !== false;
      chip.className = "ml-trig-chip" + (on ? " on" : " off");
      chip.textContent = word;
      chip.title = word + "\n\n" + (on ? "点击关闭这条触发词" : "点击启用这条触发词");
      chip.onclick = (e) => {
        e.stopPropagation();
        const st = this.triggerStates(item);
        st[i] = !st[i];
        this.saveToNode();
        this.renderList();
      };
      chips.appendChild(chip);
    });
    wrap.appendChild(chips);

    return wrap;
  }

  // 隐藏 lora_stack 输入桩
  hideStackInput() {
    try {
      const input = this.node.inputs.find(i => i.name === "lora_stack");
      if (input) {
        input.hidden = true;
      }
    } catch (e) {
      console.warn("Failed to hide lora_stack input:", e);
    }
  }

  // 创建 DOM Widget
  createDOMWidget() {
    try {
      const container = document.createElement("div");
      // 必须有 class：设计系统的 CSS 变量挂在 .ml-container 上，没它变量不生效
      container.className = "ml-container";
      container.style.cssText = "width:100%;min-width:0;box-sizing:border-box;padding:6px;position:relative;";
      this.container = container;

      const widgetId = "lora_items_" + Date.now();
      this.domWidget = this.node.addDOMWidget(widgetId, "customWidget", container, {
        serialize: false,
        hideOnZoom: false
      });

      // 初始高度
      this.updateWidgetHeight();
      this.renderList();
      // 注意：按钮区由 renderList 内部渲染（跟随列表变化）
    } catch (e) {
      console.error("Failed to create DOM widget:", e);
    }
  }

  // 更新 widget 高度
  updateWidgetHeight() {
    try {
      if (!this.domWidget || !this.container) return;
      // 关键修复：
      // 1) 用条目数精确算高度，不依赖 scrollHeight（渲染异常时会返回巨大值把节点撑爆）
      // 2) 给个合理上限，超出就内部滚动
      // 3) 不手动 node.setSize —— computeSize 变化后 ComfyUI 会自己调整节点尺寸
      const n = (this.state.selected || []).length;
      // 高度：顶部开关条 + 每个条目(=66) + 展开的触发词面板(=112) + 按钮行
      let listH = n === 0 ? 44 : 6;
      (this.state.selected || []).forEach(it => {
        listH += 66;
        if (this.isTriggersOpen(it.name)) listH += 112;   // 展开的触发词面板
      });
      const TOPBAR = 24, BTNROW = 50;
      let total = Math.max(140, listH + TOPBAR + BTNROW + 12);

      // 按「各子元素实际高度之和」算内容高度：
      // 不能用 scrollHeight —— 它永远 >= 容器高度，所以节点只会变高、收不回去。
      try {
        const cs = getComputedStyle(this.container);
        const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
        // 关键：getBoundingClientRect 返回的是「屏幕像素」，画布缩放会污染测量值，
        // 放大 1.4 倍时高度就会多算 40%，节点下方凭空多出一大片空白。这里除回缩放比。
        const zoom = (window.app && app.canvas && app.canvas.ds && app.canvas.ds.scale) || 1;
        const k = zoom > 0.05 ? zoom : 1;
        let sum = 0;
        Array.from(this.container.children).forEach(ch => {
          const st = getComputedStyle(ch);
          // 列表是可滚动的：它自己的盒子高度被压缩过，必须用 scrollHeight 才是真实内容高度，
          // 否则会「越量越小」形成反馈循环，把节点越缩越扁。
          const h = ch.classList.contains("ml-list")
            ? ch.scrollHeight
            : ch.getBoundingClientRect().height / k;
          sum += h + (parseFloat(st.marginTop) || 0) + (parseFloat(st.marginBottom) || 0);
        });
        const measured = sum + pad + 14;   // +14：ComfyUI 渲染的容器比 computeSize 略矮
        if (measured > 110) total = measured;   // 跟着内容长，不封顶
      } catch (e) { /* 忽略 */ }

      this.domWidget.computeSize = (width) => [width, total];
      // 让 ComfyUI 重算节点尺寸（不要传高度）
      try {
        // computeSize()[1] 已经含标题栏 + IO 桩 + 所有 widget 高度，直接用它，别再额外加余量
        this.node.setSize([this.node.size[0], this.node.computeSize()[1]]);
      } catch (e) { /* 忽略 */ }
      this.node.setDirtyCanvas(true, true);
    } catch (e) {
      console.warn("Failed to update widget height:", e);
    }
  }

  // 渲染节点内列表
  renderList() {
    try {
      if (!this.container) return;
      this.container.innerHTML = "";

      // 顶部：右侧「输出触发词」开关
      const topbar = document.createElement("div");
      topbar.className = "ml-topbar";
      const swLabel = document.createElement("span");
      swLabel.className = "ml-switch-label";
      const outOn = this.getOutputEnabled();
      swLabel.textContent = "输出触发词";
      const sw = document.createElement("span");
      sw.className = "ml-switch" + (outOn ? " on" : "");
      sw.title = outOn ? "当前会输出触发词，点击关闭" : "当前不输出触发词，点击开启";
      sw.onclick = (e) => {
        e.stopPropagation();
        this.setOutputEnabled(!this.getOutputEnabled());
        this.renderList();
      };
      topbar.appendChild(swLabel);
      topbar.appendChild(sw);
      this.container.appendChild(topbar);

      const listDiv = document.createElement("div");
      listDiv.className = "ml-list";

      if (this.state.selected.length === 0) {
        const empty = document.createElement("div");
        empty.className = "ml-empty";
        empty.textContent = "未选择 LoRA，点下方按钮添加";
        listDiv.appendChild(empty);
      } else {
        this.state.selected.forEach((item, index) => {
          const row = this.createListItem(item, index);
          listDiv.appendChild(row);
          if (this.isTriggersOpen(item.name)) {
            const panel = this.createTriggerPanel(item);
            panel.style.marginLeft = "0";      // 贴满宽度：窄节点下缩进会挤成一列窄条
            listDiv.appendChild(panel);
          }
        });
      }

      this.container.appendChild(listDiv);

      // ===== 底部区域：默认三按钮；点「存为预设」后就地变成命名输入行 =====
      if (this.state.composerOpen) {
        this.container.appendChild(this.buildComposerRow());
      } else {
        const btnRow = document.createElement("div");
        btnRow.className = "ml-node-btn-row";

        const btn = document.createElement("button");
        btn.className = "ml-node-btn ml-node-btn-primary ml-open-btn";
        btn.innerHTML = mlIcon("panel") + "<span>打开面板</span>";
        btn.onclick = () => this.openPanel();
        btnRow.appendChild(btn);

        const loadBtn = document.createElement("button");
        loadBtn.className = "ml-node-btn";
        loadBtn.innerHTML = mlIcon("folder") + "<span>加载预设</span>";
        loadBtn.onclick = (ev) => { ev.stopPropagation(); this.showNodePresetMenu(loadBtn); };
        btnRow.appendChild(loadBtn);

        // 存为预设放在节点上：存的是「当前已选 + 当前权重」
        const saveBtn = document.createElement("button");
        saveBtn.className = "ml-node-btn";
        saveBtn.innerHTML = mlIcon("save") + "<span>存为预设</span>";
        saveBtn.title = "把当前选择的 LoRA 及权重存成预设";
        saveBtn.onclick = (ev) => { ev.stopPropagation(); this.openPresetComposer(); };
        btnRow.appendChild(saveBtn);

        this.container.appendChild(btnRow);
      }

      this.updateWidgetHeight();
    } catch (e) {
      console.error("Failed to render list:", e);
    }
  }

  // LoRA 详情弹窗（点预览图打开）：把触发词、路径、底模、大小都收进来
  showLoraDetail(rawLora) {
    try {
      // 已加入列表的条目里存着用户改过的触发词/备注，优先用那份，否则从卡片点开只会看到原始数据
      const pickedEntry = (this.state.selected || []).find(x => x.name === rawLora.name);
      const lora = pickedEntry ? { ...rawLora, ...pickedEntry } : rawLora;
      document.querySelector(".ml-detail-mask")?.remove();
      const fileName = shortLoraName(lora.name);
      const sizeMb = lora.size ? (lora.size / 1024 / 1024) : 0;
      const realName = lora.filename || (lora.name || "").split(/[\\/]/).pop();

      const mask = document.createElement("div");
      mask.className = "ml-detail-mask";
      mask.onclick = (ev) => { if (ev.target === mask) mask.remove(); };

      const box = document.createElement("div");
      box.className = "ml-detail-box";

      // 头
      const head = document.createElement("div");
      head.className = "ml-detail-head";
      const title = document.createElement("div");
      title.className = "ml-detail-title";
      title.textContent = fileName;
      title.title = fileName;
      const closeBtn = document.createElement("button");
      closeBtn.className = "ml-detail-btn";
      closeBtn.style.cssText = "flex:0 0 auto;width:28px;height:24px;padding:0;border:0;background:transparent";
      closeBtn.innerHTML = mlIcon("close");
      closeBtn.onclick = () => mask.remove();
      head.append(title, closeBtn);

      // 主体
      const body = document.createElement("div");
      body.className = "ml-detail-body";

      // 图
      const fig = document.createElement("div");
      fig.className = "ml-detail-fig";
      if (lora.preview_url && lora.preview_type === "video") {
        const video = document.createElement("video");
        video.src = lora.preview_url;
        video.controls = true; video.loop = true; video.muted = true;
        fig.appendChild(video);
      } else if (lora.preview_url) {
        const img = document.createElement("img");
        img.src = lora.preview_url;
        img.onerror = () => { img.remove(); fig.innerHTML = `<span class="ml-detail-empty">${mlIcon("image")} 预览图加载失败</span>`; };
        fig.appendChild(img);
      } else {
        fig.innerHTML = `<span class="ml-detail-empty">${mlIcon("image")} 没有预览图</span>`;
      }
      body.appendChild(fig);

      // 信息表
      const grid = document.createElement("dl");
      grid.className = "ml-detail-grid";
      const infoRows = [
        ["文件名", realName || fileName],
        ["相对路径", lora.name || "—"],
        ["位置", lora.abs_path || "—"],
        ["基础模型", lora.base_model || "—"],
        ["大小", sizeMb ? sizeMb.toFixed(1) + " MB" : "—"],
      ];
      for (const [k, v] of infoRows) {
        const dt = document.createElement("dt");
        dt.textContent = k;
        const dd = document.createElement("dd");
        dd.textContent = v;
        grid.append(dt, dd);
      }
      body.appendChild(grid);

      // 触发词（合并进来：点单个复制 / 全部复制）
      const trigBlock = document.createElement("div");
      trigBlock.className = "ml-detail-block";
      const trigWords = Array.isArray(lora.triggers) ? [...lora.triggers.filter(Boolean)] : [];
      const persistTriggers = () => {
        // 只改当前选中项（写进 lora_stack），不动 safetensors / Lora Manager 的库
        const picked = this.state.selected.find(x => x.name === lora.name);
        if (picked) {
          picked.triggers = [...trigWords];
          this.saveToNode();
          if (this.container) this.renderList();
        }
        lora.triggers = [...trigWords];
      };
      const repaintTags = () => {
        const wrapEl = trigBlock.querySelector(".ml-detail-tags");
        if (!wrapEl) return;
        wrapEl.innerHTML = "";
        trigWords.forEach((word, idx) => {
          const tag = document.createElement("span");
          tag.className = "ml-detail-tag";
          tag.title = "点击复制这一条";
          const label = document.createElement("span");
          label.textContent = word;
          label.onclick = (ev) => {
            ev.stopPropagation();
            navigator.clipboard?.writeText(word);
            this.toast("已复制：" + word, "ok");
          };
          const delTag = document.createElement("button");
          delTag.className = "ml-tag-del";
          delTag.textContent = "×";
          delTag.title = "从当前 LoRA 的触发词里删掉这条（只影响本工作流，不改原文件）";
          delTag.onclick = (ev) => {
            ev.stopPropagation();
            trigWords.splice(idx, 1);
            persistTriggers();
            repaintTags();
            this.toast("已删除触发词", "ok");
          };
          tag.append(label, delTag);
          wrapEl.appendChild(tag);
        });
        if (!trigWords.length) {
          wrapEl.insertAdjacentHTML("afterbegin", '<span class="ml-detail-empty">暂无触发词，可在下面添加</span>');
        }
        // 标题里的数量跟着变
        const cnt = trigBlock.querySelector(".ml-trig-count");
        if (cnt) cnt.textContent = String(trigWords.length);
      };
      const trigHead = document.createElement("h4");
      trigHead.innerHTML = mlIcon("tag", "sm") + `<span>触发词（<span class="ml-trig-count">${trigWords.length}</span>）</span>`;
      if (trigWords.length) {
        const copyAll = document.createElement("button");
        copyAll.className = "ml-detail-btn";
        copyAll.style.cssText = "flex:0 0 auto;margin-left:auto;width:auto;height:20px;padding:0 8px;font-size:10px";
        copyAll.innerHTML = mlIcon("copy", "sm") + "<span>全部复制</span>";
        copyAll.onclick = () => {
          navigator.clipboard?.writeText(trigWords.join(", "));
          this.toast(`已复制 ${trigWords.length} 条触发词`, "ok");
        };
        trigHead.appendChild(copyAll);
      }
      trigBlock.appendChild(trigHead);
      const tagWrap = document.createElement("div");
      tagWrap.className = "ml-detail-tags";
      trigBlock.appendChild(tagWrap);

      // 添加触发词
      const addRow = document.createElement("div");
      addRow.className = "ml-tag-add";
      const addInput = document.createElement("input");
      addInput.placeholder = "输入触发词，回车添加…";
      const doAdd = () => {
        const word = addInput.value.trim();
        if (!word) return;
        if (trigWords.includes(word)) { this.toast("已经有了"); return; }
        trigWords.push(word);
        addInput.value = "";
        persistTriggers();
        repaintTags();
      };
      addInput.onkeydown = (ev) => {
        ev.stopPropagation();
        if (ev.key === "Enter") { ev.preventDefault(); doAdd(); }
      };
      addInput.onmousedown = (ev) => ev.stopPropagation();
      const tagAddBtn = document.createElement("button");
      tagAddBtn.textContent = "添加";
      tagAddBtn.onclick = doAdd;
      addRow.append(addInput, tagAddBtn);
      trigBlock.appendChild(addRow);

      body.appendChild(trigBlock);
      repaintTags();

      // Civitai
      const modelId = lora.civitai_model_id || lora.civitai?.modelId || lora.civitai?.id;
      if (modelId) {
        const cBlock = document.createElement("div");
        cBlock.className = "ml-detail-block";
        cBlock.innerHTML = mlIcon("external", "sm") +
          ` <a href="https://civitai.com/models/${modelId}" target="_blank" rel="noreferrer" style="color:#9ecbff;text-decoration:none">在 Civitai 查看（model ${modelId}）</a>`;
        body.appendChild(cBlock);
      }

      // 备注（存进 lora_stack 的 notes 字段，随时改）
      const notesBlock = document.createElement("div");
      notesBlock.className = "ml-detail-block";
      notesBlock.innerHTML = mlIcon("pencil", "sm") + " <span>附加备注</span>";
      const notesArea = document.createElement("textarea");
      notesArea.className = "ml-detail-notes";
      notesArea.placeholder = "给这个 LoRA 记点东西…";
      notesArea.value = lora.notes || "";
      notesArea.onblur = () => {
        const picked = this.state.selected.find(x => x.name === lora.name);
        if (picked) { picked.notes = notesArea.value; this.saveToNode(); }
        lora.notes = notesArea.value;
      };
      notesArea.onkeydown = (ev) => ev.stopPropagation();
      notesArea.onmousedown = (ev) => ev.stopPropagation();
      notesBlock.appendChild(notesArea);
      body.appendChild(notesBlock);

      // tabs：示例 / 模型描述 / 版本
      const tabsBar = document.createElement("div");
      tabsBar.className = "ml-detail-tabs";
      const tabPane = document.createElement("div");
      tabPane.className = "ml-detail-tabpane";
      tabPane.innerHTML = '<div class="ml-detail-empty">正在从 Civitai 读取…</div>';
      body.append(tabsBar, tabPane);

      const tabDefs = [
        { key: "images", label: "示例" },
        { key: "desc", label: "模型描述" },
        { key: "vers", label: "版本" },
      ];
      const tabState = { active: "images", model: null, error: "" };

      const renderPane = () => {
        tabPane.innerHTML = "";
        if (tabState.error) {
          tabPane.innerHTML = `<div class="ml-detail-empty">${tabState.error}</div>`;
          return;
        }
        if (!tabState.model) {
          tabPane.innerHTML = '<div class="ml-detail-empty">正在从 Civitai 读取…</div>';
          return;
        }
        const versions = tabState.model.versions || [];
        // 优先挑与当前文件同版本的（按 civitai_version_id 匹配），否则取第一个
        const curVer = versions.find(v => String(v.id) === String(lora.civitai_version_id)) || versions[0] || {};

        if (tabState.active === "images") {
          const imgs = curVer.images || [];
          if (!imgs.length) {
            tabPane.innerHTML = '<div class="ml-detail-empty">这个版本没有示例图</div>';
          } else {
            const grid = document.createElement("div");
            grid.className = "ml-detail-imgs";
            imgs.forEach(img => {
              const el = document.createElement("img");
              el.src = img.url;
              el.loading = "lazy";
              el.title = "点击看原图";
              el.onclick = () => window.open(img.url, "_blank");
              el.onerror = () => el.remove();
              grid.appendChild(el);
            });
            tabPane.appendChild(grid);
          }
        } else if (tabState.active === "desc") {
          const div = document.createElement("div");
          div.className = "ml-detail-desc";
          // Civitai 描述是 HTML，转纯文本渲染（避免注入 + 影响面板布局）
          const tmp = document.createElement("div");
          tmp.innerHTML = tabState.model.description || "";
          div.textContent = (tmp.textContent || "").replace(/\n{3,}/g, "\n\n").trim() || "这个模型没有描述";
          tabPane.appendChild(div);
        } else {
          if (!versions.length) {
            tabPane.innerHTML = '<div class="ml-detail-empty">没有版本信息</div>';
            return;
          }
          const list = document.createElement("div");
          list.className = "ml-detail-ver";
          versions.forEach(v => {
            const row = document.createElement("div");
            row.className = "ml-detail-ver-item" + (String(v.id) === String(curVer.id) ? " cur" : "");
            const main = document.createElement("div");
            main.className = "ml-detail-ver-main";
            const nm = document.createElement("div");
            nm.className = "ml-detail-ver-name";
            nm.textContent = v.name || ("版本 " + v.id);
            const sub = document.createElement("div");
            sub.className = "ml-detail-ver-sub";
            const parts = [];
            if (v.baseModel) parts.push(v.baseModel);
            if (v.sizeKB) parts.push((v.sizeKB / 1024).toFixed(1) + " MB");
            if (v.createdAt) parts.push(String(v.createdAt).slice(0, 10));
            sub.textContent = parts.join(" · ") || "—";
            main.append(nm, sub);
            row.appendChild(main);
            if (String(v.id) === String(curVer.id)) {
              const badge = document.createElement("span");
              badge.className = "ml-detail-tag";
              badge.style.cursor = "default";
              badge.textContent = "当前";
              row.appendChild(badge);
            }
            const dl = document.createElement("a");
            dl.href = `https://civitai.com/models/${tabState.model.id}?modelVersionId=${v.id}`;
            dl.target = "_blank";
            dl.rel = "noreferrer";
            dl.className = "ml-detail-btn";
            dl.style.cssText = "flex:0 0 auto;width:auto;height:24px;padding:0 9px;font-size:11px;text-decoration:none";
            dl.innerHTML = mlIcon("external", "sm") + "<span>打开</span>";
            row.appendChild(dl);
            list.appendChild(row);
          });
          tabPane.appendChild(list);
        }
      };

      const paintTabs = () => {
        tabsBar.innerHTML = "";
        tabDefs.forEach(def => {
          const btn = document.createElement("button");
          btn.className = "ml-detail-tab" + (tabState.active === def.key ? " active" : "");
          btn.textContent = def.label;
          btn.onclick = () => { tabState.active = def.key; paintTabs(); renderPane(); };
          tabsBar.appendChild(btn);
        });
      };
      paintTabs();

      if (modelId) {
        fetch(`${API_BASE}/civitai_detail?model_id=${encodeURIComponent(modelId)}`)
          .then(r => r.json())
          .then(data => {
            if (data?.ok && data.model) {
              tabState.model = data.model;
            } else {
              tabState.error = "Civitai 读取失败：" + (data?.error || "未知错误");
            }
            renderPane();
          })
          .catch(err => {
            tabState.error = "Civitai 读取失败：" + (err && err.message || err);
            renderPane();
          });
      } else {
        tabState.error = "这个 LoRA 没有 Civitai 编号，无法读取描述/示例/版本";
        renderPane();
      }

      // 底栏：复制名字 / 加入列表
      const foot = document.createElement("div");
      foot.className = "ml-detail-foot";
      const copyNameBtn = document.createElement("button");
      copyNameBtn.className = "ml-detail-btn";
      copyNameBtn.innerHTML = mlIcon("copy", "sm") + "<span>复制 LoRA 名</span>";
      copyNameBtn.onclick = () => {
        navigator.clipboard?.writeText(lora.name || "");
        this.toast("已复制 LoRA 名", "ok");
      };
      const addBtn = document.createElement("button");
      addBtn.className = "ml-detail-btn primary";
      addBtn.innerHTML = mlIcon("plus", "sm") + "<span>加入列表</span>";
      addBtn.onclick = () => {
        if (!this.state.selected.find(x => x.name === lora.name)) {
          // 注意：不要重读 lora.triggers / lora.notes 的旧值——
          // persistTriggers / notes 已经把它们合并进 pickedEntry 或写回 lora，
          // 这里必须沿用当前 lora 对象，否则从卡片打开再编辑后点加入会把编辑冲掉。
          this.state.selected.push({
            name: lora.name,
            weight: 1.0,
            weight_clip: null,
            preview_url: lora.preview_url || "",
            preview_type: lora.preview_type || "",
            triggers: [...trigWords],
            notes: notesArea.value,
            enabled: true,
          });
          this.saveToNode();
          this.renderList();
          this.toast("已加入列表", "ok");
        } else {
          this.toast("已经在列表里了");
        }
        mask.remove();
      };
      foot.append(copyNameBtn, addBtn);

      box.append(head, body, foot);
      mask.appendChild(box);
      document.body.appendChild(mask);
    } catch (err) {
      console.error("[MultiLoRA] 详情弹窗失败", err);
    }
  }

  // 创建单个列表项
  createListItem(item, index) {
    const row = document.createElement("div");
    row.className = "ml-item" + (item.enabled === false ? " disabled" : "");

    // 缩略图（同时是拖拽手柄）
    const thumb = document.createElement("div");
    thumb.className = "ml-thumb-wrap";
    if (item.preview_url && item.preview_type) {
      if (item.preview_type === "video") {
        const video = document.createElement("video");
        video.src = item.preview_url;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.className = "ml-thumb";
        video.onmouseenter = () => video.play().catch(() => {});
        video.onmouseleave = () => { video.pause(); video.currentTime = 0; };
        thumb.appendChild(video);
      } else {
        const img = document.createElement("img");
        img.src = item.preview_url;
        img.className = "ml-thumb";
        img.onerror = () => {
          img.remove();
          const ph = document.createElement("div");
          ph.className = "ml-thumb-placeholder";
          ph.innerHTML = mlIcon("image");
          thumb.appendChild(ph);
        };
        thumb.appendChild(img);
      }
    } else {
      const ph = document.createElement("div");
      ph.className = "ml-thumb-placeholder";
      ph.innerHTML = mlIcon("image");
      thumb.appendChild(ph);
    }
    row.appendChild(thumb);

    // 详情走右键菜单；这里恢复"触发词"下拉按钮（点开可看/开关触发词）
    const trigWords = Array.isArray(item.triggers) ? item.triggers.filter(Boolean) : [];
    const trigBtn = document.createElement("button");
    trigBtn.className = "ml-trig-btn" + (trigWords.length ? "" : " empty") + (this.isTriggersOpen(item.name) ? " open" : "");
    trigBtn.innerHTML = mlIcon("chevron", "sm");
    trigBtn.title = trigWords.length
      ? `触发词 ${trigWords.length} 条（点开查看/开关）`
      : "这个 LoRA 没有触发词（点开可添加）";
    trigBtn.onclick = (e) => {
      e.stopPropagation();
      this.toggleTriggers(item.name);
    };

    // 信息区
    const info = document.createElement("div");
    info.className = "ml-info";

    // 名字行：左边加一个启用开关（禁用后不参与生成，但保留在列表里）
    const nameRow = document.createElement("div");
    nameRow.className = "ml-name-row";

    const enableSw = document.createElement("div");
    enableSw.className = "ml-switch ml-switch-sm" + (item.enabled === false ? "" : " on");
    enableSw.title = item.enabled === false
        ? "已禁用：不参与生成，点一下启用"
        : "已启用，点一下禁用（保留在列表里）";
    enableSw.onclick = (event) => {
        event.stopPropagation();
        item.enabled = item.enabled === false ? true : false;
        enableSw.classList.toggle("on", item.enabled !== false);
        enableSw.title = item.enabled === false
            ? "已禁用：不参与生成，点一下启用"
            : "已启用，点一下禁用（保留在列表里）";
        row.classList.toggle("disabled", item.enabled === false);
        this.saveToNode();
    };
    nameRow.appendChild(enableSw);

    const nameEl = document.createElement("div");
    nameEl.className = "ml-name";
    nameEl.textContent = item.name;
    nameEl.title = item.name;
    nameRow.appendChild(nameEl);
    info.appendChild(nameRow);

    const weightRow = document.createElement("div");
    weightRow.className = "ml-weight-row";

    const label = document.createElement("span");
    label.className = "ml-weight-label";
    label.textContent = "权重";
    weightRow.appendChild(label);

    // 权重范围：-20 ~ +20（负权重可反向压制 LoRA 效果）
    const W_MIN = -20, W_MAX = 20, W_DEFAULT = 1.0;
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = String(W_MIN);
    slider.max = String(W_MAX);
    slider.step = "0.05";
    if (!Number.isFinite(item.weight)) item.weight = W_DEFAULT;
    slider.value = String(item.weight);
    slider.className = "ml-slider";
    slider.title = "双击复位到 " + W_DEFAULT.toFixed(2);

    const valEl = document.createElement("span");
    valEl.className = "ml-weight-val";
    const paintVal = (v) => {
      valEl.textContent = v.toFixed(2);
      // 负数标红、0 标灰，宽范围下滑到哪了一眼能看出来
      valEl.style.color = v < 0 ? "#ff8a8a" : (v === 0 ? "#7d828a" : "");
    };
    paintVal(item.weight);

    slider.oninput = (e) => {
      const val = parseFloat(e.target.value);
      item.weight = val;
      item.weight_clip = val;
      paintVal(val);
      this.saveToNode();
    };
    // 范围太宽时双击一键回 1.00，省得手动找中点
    slider.ondblclick = () => {
      item.weight = W_DEFAULT;
      item.weight_clip = W_DEFAULT;
      slider.value = String(W_DEFAULT);
      paintVal(W_DEFAULT);
      this.saveToNode();
    };
    weightRow.appendChild(slider);

    // ±20 的宽范围靠拖是拖不准 0.85 这种值的，点数值区就地变输入框（不弹浏览器对话框）
    valEl.style.cursor = "pointer";
    valEl.title = "点击直接输入权重（" + W_MIN + " ~ " + W_MAX + "）";
    valEl.onclick = () => {
      if (weightRow.querySelector(".ml-weight-input")) return;
      const input = document.createElement("input");
      input.type = "number";
      input.className = "ml-weight-input";
      input.min = String(W_MIN);
      input.max = String(W_MAX);
      input.step = "0.05";
      input.value = Number(item.weight).toFixed(2);
      valEl.style.display = "none";
      weightRow.appendChild(input);
      input.focus();
      input.select();

      let done = false;
      const finish = (apply) => {
        if (done) return;
        done = true;
        if (apply) {
          const v = parseFloat(input.value);
          if (Number.isFinite(v)) {
            const clamped = Math.max(W_MIN, Math.min(W_MAX, v));
            item.weight = clamped;
            item.weight_clip = clamped;
            slider.value = String(clamped);
            this.saveToNode();
          }
        }
        input.remove();
        valEl.style.display = "";
        paintVal(Number(item.weight));
      };
      // 键盘事件别漏到画布（否则输入数字会触发 ComfyUI 快捷键）
      input.onkeydown = (e) => {
        e.stopPropagation();
        if (e.key === "Enter") { e.preventDefault(); finish(true); }
        else if (e.key === "Escape") { e.preventDefault(); finish(false); }
      };
      input.onblur = () => finish(true);
    };

    weightRow.appendChild(valEl);

    info.appendChild(weightRow);
    row.appendChild(info);
    row.appendChild(trigBtn);   // grid 第3列：在信息区之后、删除按钮之前

    // ---- 拖拽排序：只有缩略图是拖动手柄（拖滑块/名字都不会误触发） ----
    row.dataset.idx = String(index);
    const dragHandle = thumb;
    dragHandle.draggable = true;
    dragHandle.title = "按住缩略图可以上下调整顺序";
    dragHandle.ondragstart = (e) => {
      e.stopPropagation();
      this._dragIdx = index;
      row.classList.add("dragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", String(index)); } catch (_) { /* 忽略 */ }
      }
    };
    dragHandle.ondragend = () => { row.classList.remove("dragging"); this.clearDropMarks(); };
    row.ondragover = (e) => {
      if (this._dragIdx == null) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      const r = row.getBoundingClientRect();
      const before = (e.clientY - r.top) < r.height / 2;
      this.clearDropMarks();
      row.classList.add(before ? "drop-before" : "drop-after");
    };
    row.ondragleave = () => { row.classList.remove("drop-before", "drop-after"); };
    row.ondrop = (e) => {
      e.preventDefault();
      const from = this._dragIdx;
      if (from == null || from === index) { this.clearDropMarks(); return; }
      const r = row.getBoundingClientRect();
      const before = (e.clientY - r.top) < r.height / 2;
      let to = index + (before ? 0 : 1);
      if (from < to) to -= 1;
      this.clearDropMarks();
      if (to === from) { this.renderList(); return; }
      const moved = this.state.selected.splice(from, 1)[0];
      this.state.selected.splice(to, 0, moved);
      this.saveToNode();
      this.renderList();
      this.toast(`已调整顺序：${shortLoraName(moved.name)} → 第 ${to + 1} 位`, "ok");
    };

    // 删除按钮
    const delBtn = document.createElement("button");
    delBtn.className = "ml-delete";
    delBtn.textContent = "×";
    delBtn.onclick = () => {
      this.state.selected.splice(index, 1);
      this.renderList();
      this.saveToNode();
    };
    row.appendChild(delBtn);

    return row;
  }

  // 保存状态到节点
  saveToNode() {
    try {
      const data = JSON.stringify(this.state.selected);
      if (this.setStackValue(data)) {
        this.node.setDirtyCanvas(true, true);
      } else {
        console.warn("[MultiLoRA] 没找到 lora_stack，选择结果未保存");
      }
    } catch (e) {
      console.error("Failed to save to node:", e);
    }
  }

  // 把 JSON 写进 lora_stack。
  // 关键：真正参与序列化、发给后端的是 node.widgets 里那个 widget 的 value，
  // 写 node.inputs[i].value 是无效的（实测 widget.value 不变、widgets_values 仍是 "[]"）。
  setStackValue(data) {
    try {
      const w = (this.node.widgets || []).find(w => w.name === "lora_stack");
      if (w) {
        w.value = data;
        return true;
      }
    } catch (e) {
      console.warn("[MultiLoRA] 写 widget 失败:", e);
    }
    try {
      const input = (this.node.inputs || []).find(i => i.name === "lora_stack");
      if (input) {
        if (input.widget) {
          input.widget.value = data;
        } else {
          input.value = data;
        }
        return true;
      }
    } catch (e) {
      console.warn("[MultiLoRA] 写 input 失败:", e);
    }
    return false;
  }

  // 从 lora_stack widget 读回（加载工作流 / 复制粘贴节点时用）
  readStackValue() {
    try {
      const w = (this.node.widgets || []).find(w => w.name === "lora_stack");
      const raw = w ? w.value : null;
      if (typeof raw !== "string" || !raw.trim()) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn("[MultiLoRA] 解析已有 lora_stack 失败:", e);
      return [];
    }
  }

  // 绑定事件
  bindEvents() {
    try {
      // 监听节点值变化（从工作流加载时）
      const originalOnSerialize = this.node.serialize;
      this.node.serialize = function(...args) {
        const result = originalOnSerialize.apply(this, args);
        return result;
      };

      // 拖窄时钳住最小宽度（否则条目会溢出到节点外面）
      const self2 = this;
      const origResize = this.node.onResize;
      this.node.onResize = function(size) {
        const r = origResize ? origResize.call(this, size) : undefined;
        try {
          if (self2._suppressResize) return r;
          if (size && size[0] < NODE_MIN_WIDTH - 1) {
            self2._suppressResize = true;
            this.setSize([NODE_MIN_WIDTH, size[1]]);
            self2._suppressResize = false;
          }
        } catch (e) { /* 忽略 */ }
        return r;
      };

      // 加载/粘贴工作流时 configure 会重建 widget 值，这里读回来
      const self = this;
      const originalOnConfigure = this.node.onConfigure;
      this.node.onConfigure = function(...args) {
        const r = originalOnConfigure ? originalOnConfigure.apply(this, args) : undefined;
        try {
          self.state.selected = self.readStackValue();
          self.renderList();
        } catch (e) {
          console.warn("[MultiLoRA] onConfigure 恢复失败:", e);
        }
        return r;
      };

      // 监听节点输入变化
      const originalOnInputChanged = this.node.onInputChanged;
      this.node.onInputChanged = function(name, value) {
        if (name === "lora_stack" && typeof value === "string") {
          try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) {
              this.state.selected = parsed;
              this.renderList();
            }
          } catch (e) {
            console.warn("Failed to parse lora_stack:", e);
          }
        }
        if (originalOnInputChanged) {
          originalOnInputChanged.call(this, name, value);
        }
      };
    } catch (e) {
      console.warn("Failed to bind events:", e);
    }
  }

  // 加载 LoRA 列表
  async loadLoras(force = false) {
    try {
      const res = await fetch(`${API_BASE}/loras` + (force ? "?refresh=1" : ""));
      const data = await res.json();
      this.state.allLoras = data.loras || [];
    } catch (e) {
      console.error("Failed to load loras:", e);
      this.state.allLoras = [];
    }
  }

  // 加载预设
  async loadPresets() {
    try {
      const res = await fetch(`${API_BASE}/presets`);
      const data = await res.json();
      // 后端返回的是 {预设名: [条目]} 对象，这里统一成 [{name, items}] 数组，
      // 否则 this.state.presets.length / forEach 在对象上会失效（TypeError）。
      const raw = data.presets || {};
      this.state.presets = Array.isArray(raw)
        ? raw
        : Object.keys(raw).map(k => ({ name: k, items: Array.isArray(raw[k]) ? raw[k] : [] }));
    } catch (e) {
      console.error("Failed to load presets:", e);
      this.state.presets = [];
    }
  }

  // 打开面板
  // ==================== 单 LoRA 触发词编辑 ====================
  async openLoraTriggers(lora, onClose) {
    this.closeMiniDialog();
    // 先拿一次最新数据：卡片上的 triggers 可能已经过期（比如刚更新过版本）。
    // 注意：必须合并回 state.allLoras 里的「同一个对象」，否则改的是副本，
    // 面板/节点看到的还是旧词表（之前就是这个问题）。
    try {
      const d = await (await fetch(`${API_BASE}/loras`)).json();
      const fresh = (d.loras || []).find(x => x.name === lora.name);
      if (fresh) {
        const same = (this.state.allLoras || []).find(x => x.name === lora.name);
        if (same) {
          Object.assign(same, fresh);
          lora = same;
        } else {
          lora = fresh;
        }
      }
    } catch (e) { /* 拿不到就用现有的 */ }

    const words = [...(lora.triggers || [])];
    const states = (lora.trigger_states && lora.trigger_states.length === words.length)
      ? [...lora.trigger_states]
      : words.map(() => true);

    const mask = document.createElement("div");
    mask.className = "ml-mini-mask";
    const box = document.createElement("div");
    box.className = "ml-mini ml-mini-xl";

    const head = document.createElement("div");
    head.className = "ml-tgv-head";
    head.appendChild(this.makeThumb(lora.preview_url, "ml-tgv-thumb", lora.name));
    const titleWrap = document.createElement("div");
    titleWrap.className = "ml-tgv-titles";
    const t1 = document.createElement("div");
    t1.className = "ml-mini-title";
    t1.textContent = shortLoraName(lora.name);
    const t2 = document.createElement("div");
    t2.className = "ml-mini-hint";
    t2.textContent = lora.name;
    titleWrap.appendChild(t1);
    titleWrap.appendChild(t2);
    head.appendChild(titleWrap);
    box.appendChild(head);

    const listEl = document.createElement("div");
    listEl.className = "ml-tgv-list";
    box.appendChild(listEl);

    const foot = document.createElement("div");
    foot.className = "ml-mini-row";
    const addBtn = document.createElement("button");
    addBtn.className = "ml-footer-btn ml-btn-ghost";
    addBtn.innerHTML = mlIcon("plus") + "<span>添加触发词</span>";
    const copyBtn = document.createElement("button");
    copyBtn.className = "ml-footer-btn ml-btn-ghost";
    copyBtn.innerHTML = mlIcon("copy") + "<span>复制已启用</span>";
    const spacer = document.createElement("div");
    spacer.style.flex = "1 1 auto";
    const closeBtn = document.createElement("button");
    closeBtn.className = "ml-footer-btn ml-btn-apply";
    closeBtn.textContent = "完成";
    foot.appendChild(addBtn);
    foot.appendChild(copyBtn);
    foot.appendChild(spacer);
    foot.appendChild(closeBtn);
    box.appendChild(foot);

    mask.appendChild(box);
    (this.panelEl || document.body).appendChild(mask);
    this._miniMask = mask;

    let saveTimer = null;
    const save = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        const clean = words.map(w => w.trim());
        const disabled = clean.filter((w, i) => w && states[i] === false);
        const payload = {
          name: lora.name,
          words: clean.filter(Boolean),
          disabled: disabled
        };
        try {
          await fetch(`${API_BASE}/triggers`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          this.applyTriggerWords(
            lora.name,
            clean.filter(Boolean),
            words.map((w, i) => states[i]).filter((_, i) => words[i].trim())
          );
        } catch (e) { this.toast("保存失败：" + e, "err"); }
      }, 400);
    };

    const render = () => {
      listEl.innerHTML = "";
      if (!words.length) {
        const empty = document.createElement("div");
        empty.className = "ml-tgv-empty";
        empty.textContent = "还没有触发词，点下面的「添加触发词」";
        listEl.appendChild(empty);
      }
      words.forEach((w, i) => {
        const row = document.createElement("div");
        row.className = "ml-tgv-row";

        const dot = document.createElement("span");
        dot.className = "ml-tgv-dot" + (states[i] === false ? " off" : " on");
        dot.title = states[i] === false ? "已停用（点一下启用）" : "已启用（点一下停用）";
        dot.onclick = () => { states[i] = states[i] === false; dot.className = "ml-tgv-dot" + (states[i] === false ? " off" : " on"); save(); };
        row.appendChild(dot);

        // 触发词常常是一整段提示词：用多行文本框，随内容自动长高
        const input = document.createElement("textarea");
        input.className = "ml-tgv-input";
        input.value = w;
        input.placeholder = "触发词（可以是一整段提示词）";
        input.rows = 1;
        const autosize = () => {
          input.style.height = "auto";
          const h = input.scrollHeight + 2;          // +2 抵消边框，避免出现内部滚动条
          input.style.height = Math.min(Math.max(h, 32), 170) + "px";
        };
        input.oninput = () => { words[i] = input.value; autosize(); save(); };
        input.onkeydown = (e) => { e.stopPropagation(); };  // Enter 换行，不提交
        row.appendChild(input);
        setTimeout(autosize, 0);

        const del = document.createElement("button");
        del.className = "ml-tgv-del";
        del.textContent = "×";
        del.title = "删除这条";
        del.onclick = () => { words.splice(i, 1); states.splice(i, 1); render(); save(); };
        row.appendChild(del);

        listEl.appendChild(row);
      });
      const cnt = document.createElement("div");
      cnt.className = "ml-tgv-count";
      cnt.textContent = `共 ${words.length} 条，启用 ${words.filter((w, i) => w.trim() && states[i] !== false).length} 条`;
      listEl.appendChild(cnt);
    };

    addBtn.onclick = () => {
      words.push("");
      states.push(true);
      render();
      const inputs = listEl.querySelectorAll(".ml-tgv-input");
      const last = inputs[inputs.length - 1];
      if (last) { last.focus(); }
    };

    copyBtn.onclick = async () => {
      const text = words.map(w => w.trim()).filter((w, i) => w && states[i] !== false).join(", ");
      await this.copyText(text);
      this.toast(`已复制 ${shortLoraName(lora.name)} 的 ${text ? text.split(", ").length : 0} 条触发词`, "ok");
    };

    closeBtn.onclick = () => {
      clearTimeout(saveTimer);
      mask.remove();
      if (onClose) onClose();
    };
    mask.onclick = (e) => { if (e.target === mask) closeBtn.click(); };
    render();
  }

  // ==================== 单 LoRA 版本列表 / 更新 ====================
  async openLoraVersions(lora) {
    this.closeMiniDialog();
    const mask = document.createElement("div");
    mask.className = "ml-mini-mask";
    const box = document.createElement("div");
    box.className = "ml-mini ml-mini-xl";

    const head = document.createElement("div");
    head.className = "ml-tgv-head";
    head.appendChild(this.makeThumb(lora.preview_url, "ml-tgv-thumb", lora.name));
    const titleWrap = document.createElement("div");
    titleWrap.className = "ml-tgv-titles";
    const t1 = document.createElement("div");
    t1.className = "ml-mini-title";
    t1.textContent = shortLoraName(lora.name);
    const t2 = document.createElement("div");
    t2.className = "ml-mini-hint";
    t2.textContent = "正在读取 Civitai 版本列表…";
    titleWrap.appendChild(t1);
    titleWrap.appendChild(t2);
    head.appendChild(titleWrap);
    box.appendChild(head);

    const listEl = document.createElement("div");
    listEl.className = "ml-ver-list";
    box.appendChild(listEl);

    const foot = document.createElement("div");
    foot.className = "ml-mini-row";
    const closeBtn = document.createElement("button");
    closeBtn.className = "ml-footer-btn ml-btn-cancel";
    closeBtn.textContent = "关闭";
    foot.appendChild(closeBtn);
    box.appendChild(foot);

    mask.appendChild(box);
    (this.panelEl || document.body).appendChild(mask);
    this._miniMask = mask;
    const close = () => mask.remove();
    closeBtn.onclick = close;
    mask.onclick = (e) => { if (e.target === mask) close(); };

    const fmtSize = (kb) => !kb ? "?" : (kb > 1024 ? (kb / 1024).toFixed(1) + " MB" : Math.round(kb) + " KB");
    const fmtDate = (iso) => (iso || "").slice(0, 10);
    // 目标目录 = 这个 LoRA 所在的文件夹（版本并存，下到同一个目录里）
    const targetDir = (() => {
      const p = String(lora.abs_path || "");
      const i = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"));
      return i > 0 ? p.slice(0, i) : "";
    })();

    // 下载某个版本（另存为新文件，不动现有文件）
    const downloadVersion = async (v, btn) => {
      btn.disabled = true;
      const oldText = btn.innerHTML;
      btn.textContent = "0%";
      try {
        const r = await fetch(`${API_BASE}/civitai_download`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            version_id: v.version_id,
            target_dir: targetDir,
            rename: v.file_name || ""
          })
        });
        const d = await r.json();
        if (!d.ok) {
          btn.disabled = false;
          btn.innerHTML = oldText;
          this.toast(d.error || "下载失败", "err");
          return false;
        }
        await this.watchDownload(d.task_id, (t) => {
          btn.textContent = t.percent == null ? "下载中…" : t.percent.toFixed(0) + "%";
        });
        btn.textContent = "已下载";
        btn.disabled = true;
        this.toast(`已下载 ${v.name}（新文件：${d.name}）`, "ok");
        await this.loadLoras();
        if (this.panelEl) {
          this.renderSidebar(this.panelEl.querySelector(".ml-sidebar"));
          this.renderGrid(this.panelEl.querySelector(".ml-main"));
        }
        return true;
      } catch (e) {
        btn.disabled = false;
        btn.innerHTML = oldText;
        this.toast("下载失败：" + e, "err");
        return false;
      }
    };

    try {
      const res = await fetch(`${API_BASE}/civitai_versions?name=${encodeURIComponent(lora.name)}`);
      const data = await res.json();
      if (!data.ok) { t2.textContent = data.error || "读取失败"; return; }
      t2.textContent = `${data.model_name} · 共 ${data.versions.length} 个版本 · 点「下载」会另存为新文件，不影响现有版本`;

      data.versions.forEach(v => {
        const card = document.createElement("div");
        card.className = "ml-ver-card" + (v.is_current ? " current" : "");

        card.appendChild(this.makeThumb(v.preview_url, "ml-ver-thumb", v.name));

        const info = document.createElement("div");
        info.className = "ml-ver-info";
        const nm = document.createElement("div");
        nm.className = "ml-ver-name";
        nm.textContent = v.name || "未命名版本";
        if (v.is_current) {
          const badge = document.createElement("span");
          badge.className = "ml-ver-badge";
          badge.textContent = "正在使用";
          nm.appendChild(badge);
        } else if (v.installed) {
          const badge = document.createElement("span");
          badge.className = "ml-ver-badge dim";
          badge.textContent = "已下载";
          nm.appendChild(badge);
        }
        const sub = document.createElement("div");
        sub.className = "ml-ver-sub";
        sub.textContent = [
          v.base_model || "未知底模",
          fmtSize(v.size_kb),
          fmtDate(v.published_at)
        ].filter(Boolean).join(" · ");
        info.appendChild(nm);
        info.appendChild(sub);
        if ((v.trained_words || []).length) {
          const tw = document.createElement("div");
          tw.className = "ml-ver-tw";
          tw.textContent = "触发词：" + v.trained_words.slice(0, 4).join(", ")
            + (v.trained_words.length > 4 ? " …" : "");
          info.appendChild(tw);
        }
        card.appendChild(info);

        const btn = document.createElement("button");
        btn.className = "ml-toolbar-btn ml-ver-btn";
        if (v.is_current) {
          btn.textContent = "当前使用";
          btn.disabled = true;
        } else if (v.installed) {
          // 这个版本本地已经有了（当初就是单独下的一份），不再重复下
          btn.textContent = "已下载";
          btn.disabled = true;
          btn.title = v.installed_name || "";
        } else {
          btn.innerHTML = mlIcon("download", "sm") + "<span>下载</span>";
          btn.onclick = () => downloadVersion(v, btn);
        }
        card.appendChild(btn);

        // 右键：跳到这个版本在 C 站的页面（未下载的版本尤其有用）
        if (!v.installed) {
          card.title = "右键：在 Civitai 打开这个版本";
          card.style.cursor = "context-menu";
        }
        card.oncontextmenu = (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          this.openCivitaiPage(data.model_id, v.version_id, data.model_name);
        };

        listEl.appendChild(card);
      });
    } catch (e) {
      t2.textContent = "读取失败：" + e;
    }
  }

  // ---- 载入预设：把条目规范化，并按词恢复触发词开关 ----
  applyPresetItems(items) {
    const all = this.state.allLoras || [];
    return (items || []).map(raw => {
      const it = { ...raw };
      const cur = all.find(l => l.name === it.name);
      // 词表：优先用当前扫描结果（可能后来改过/新增过词），没有才用预设里存的
      const words = (cur && cur.triggers && cur.triggers.length)
        ? [...cur.triggers]
        : [...(it.triggers || [])];

      // 开关：预设里存的是 {词: 开/关}，按词匹配；新增的词默认开
      let states;
      const savedWords = Array.isArray(it.triggers) ? it.triggers : [];
      const savedStates = Array.isArray(it.trigger_states) ? it.trigger_states : null;
      if (savedStates && savedStates.length === savedWords.length) {
        const map = new Map();
        savedWords.forEach((w, i) => map.set(w, savedStates[i] !== false));
        states = words.map(w => (map.has(w) ? map.get(w) : true));
      } else if (cur && Array.isArray(cur.trigger_states) && cur.trigger_states.length === words.length) {
        states = [...cur.trigger_states];
      } else {
        states = words.map(() => true);
      }

      it.triggers = words;
      it.trigger_states = states;
      if (cur) {
        if (!it.abs_path) it.abs_path = cur.abs_path;
        if (!it.preview_type) it.preview_type = cur.preview_type;
        it.preview_url = cur.preview_url || it.preview_url || "";
      }
      if (typeof it.weight !== "number") it.weight = Number(it.weight) || 1;
      if (typeof it.weight_clip !== "number") it.weight_clip = Number(it.weight_clip);
      if (typeof it.enabled !== "boolean") it.enabled = it.enabled !== false;
      return it;
    });
  }

  // ---- 触发词改动后：把同一份数据同步到面板列表 / 节点选中项 / 触发词管理面板 ----
  applyTriggerWords(name, words, states) {
    const all = this.state.allLoras || [];
    const list = this.state.selected || [];
    [all.find(l => l.name === name), ...list.filter(s => s.name === name)].forEach(obj => {
      if (!obj) return;
      obj.triggers = [...words];
      obj.trigger_states = [...states];
    });
    if (this.container) this.renderList();
    this.saveToNode();
    // 触发词管理面板开着就重绘它的行
    if (typeof this._renderTrigMgr === "function") {
      try { this._renderTrigMgr(); } catch (e) { /* 忽略 */ }
    }
    // 卡片网格里的触发词文字也刷新一下
    if (this.panelEl) {
      const grid = this.panelEl.querySelector(".ml-grid");
      if (grid && grid.style.display !== "none") {
        try { this.renderGrid(this.panelEl.querySelector(".ml-main")); } catch (e) { /* 忽略 */ }
      }
    }
  }

  // ---- 打开 Civitai 网页（拿不到 model id 就退化成按名字搜索）----
  openCivitaiPage(modelId, versionId, fallbackName) {
    let url = "";
    if (modelId) {
      url = `https://civitai.com/models/${modelId}`;
      if (versionId) url += `?modelVersionId=${versionId}`;
    } else {
      url = `https://civitai.com/search/models?sortBy=models_v9&query=${encodeURIComponent(shortLoraName(fallbackName || ""))}`;
    }
    try {
      window.open(url, "_blank", "noopener");
      this.toast("已在浏览器打开 Civitai", "ok");
    } catch (e) {
      this.toast("打开失败：" + e, "err");
    }
    return url;
  }

  // ---- 小缩略图（没图时显示占位，不报错）----
  makeThumb(url, cls, title) {
    const box = document.createElement("div");
    box.className = cls + " ml-thumb-box";
    if (url) {
      const img = document.createElement("img");
      img.className = cls;
      img.src = url;
      img.title = title || "";
      img.onerror = () => {
        img.remove();
        box.classList.add("empty");
        box.innerHTML = mlIcon("image");
      };
      box.appendChild(img);
    } else {
      box.classList.add("empty");
      box.innerHTML = mlIcon("image");
    }
    return box;
  }

  // ==================== C 站下载 ====================
  openDownloadDialog(main) {
    this.closeMiniDialog();
    const mask = document.createElement("div");
    mask.className = "ml-mini-mask";
    const box = document.createElement("div");
    box.className = "ml-mini ml-mini-wide";

    const title = document.createElement("div");
    title.className = "ml-mini-title";
    title.textContent = "从 Civitai 下载 LoRA";
    box.appendChild(title);

    const hint = document.createElement("div");
    hint.className = "ml-mini-hint";
    hint.textContent = "粘贴模型页链接（如 civitai.com/models/123456?modelVersionId=789012），也可以只贴模型 ID";
    box.appendChild(hint);

    const row1 = document.createElement("div");
    row1.className = "ml-mini-inline";
    const refInput = document.createElement("input");
    refInput.className = "ml-mini-input";
    refInput.placeholder = "Civitai 链接或模型 ID";
    const parseBtn = document.createElement("button");
    parseBtn.className = "ml-footer-btn ml-btn-apply ml-mini-btn";
    parseBtn.textContent = "解析";
    row1.appendChild(refInput);
    row1.appendChild(parseBtn);
    box.appendChild(row1);

    // Civitai 账号状态（下载需要 API Key）
    const keyRow = document.createElement("div");
    keyRow.className = "ml-key-row";
    const keyText = document.createElement("span");
    keyText.className = "ml-key-text";
    keyText.textContent = "读取 API Key 状态…";
    const keyBtn = document.createElement("button");
    keyBtn.className = "ml-trig-mini";
    keyBtn.textContent = "设置";
    keyBtn.title = "填写 Civitai API Key / 代理";
    keyRow.appendChild(keyText);
    keyRow.appendChild(keyBtn);
    box.appendChild(keyRow);

    const refreshKey = async () => {
      try {
        const d = await (await fetch(`${API_BASE}/civitai_config`)).json();
        if (!d.ok) { keyText.textContent = "读取配置失败"; return null; }
        const srcName = { env: "环境变量", "lora-manager": "复用 LoraManager 的 Key", "node-config": "本节点配置" }[d.key_source] || "";
        if (d.has_key) {
          keyText.className = "ml-key-text ok";
          keyText.textContent = `API Key 已配置（${srcName}：${d.key_hint}）`;
        } else {
          keyText.className = "ml-key-text warn";
          keyText.textContent = "未配置 API Key：公开模型能下，早期访问/受限资源会 403";
        }
        keyText.title = d.proxy_in_use ? `代理：${d.proxy_in_use}` : "未检测到代理（C 站图片需代理）";
        return d;
      } catch (e) {
        keyText.textContent = "读取配置失败：" + e;
        return null;
      }
    };
    keyBtn.onclick = () => {
      this.showCivitaiConfigDialog(refreshKey);
    };
    refreshKey();

    const info = document.createElement("div");
    info.className = "ml-dl-info";
    box.appendChild(info);

    const versionSelect = document.createElement("select");
    versionSelect.className = "ml-mini-input ml-mini-select";
    versionSelect.style.display = "none";
    box.appendChild(versionSelect);

    const dirSelect = document.createElement("select");
    dirSelect.className = "ml-mini-input ml-mini-select";
    dirSelect.style.display = "none";
    box.appendChild(dirSelect);

    const progress = document.createElement("div");
    progress.className = "ml-progress";
    const bar = document.createElement("div");
    bar.className = "ml-progress-bar";
    progress.appendChild(bar);
    progress.style.display = "none";
    box.appendChild(progress);

    const row = document.createElement("div");
    row.className = "ml-mini-row";
    const cancel = document.createElement("button");
    cancel.className = "ml-footer-btn ml-btn-cancel";
    cancel.textContent = "关闭";
    const startBtn = document.createElement("button");
    startBtn.className = "ml-footer-btn ml-btn-apply";
    startBtn.textContent = "下载";
    startBtn.disabled = true;
    row.appendChild(cancel);
    row.appendChild(startBtn);
    box.appendChild(row);

    mask.appendChild(box);
    (this.panelEl || document.body).appendChild(mask);
    this._miniMask = mask;
    const close = () => mask.remove();
    cancel.onclick = close;
    mask.onclick = (e) => { if (e.target === mask) close(); };
    refInput.onkeydown = (e) => { e.stopPropagation(); if (e.key === "Enter") parseBtn.click(); };
    setTimeout(() => refInput.focus(), 40);

    let modelData = null;
    let dirs = [];

    const loadDirs = async () => {
      try {
        const d = await (await fetch(`${API_BASE}/dirs`)).json();
        dirs = d.dirs || [];
        dirSelect.innerHTML = "";
        dirs.forEach(x => {
          const o = document.createElement("option");
          o.value = x.path;
          o.textContent = (x.depth ? "　".repeat(x.depth - 1) : "") + x.rel;
          dirSelect.appendChild(o);
        });
      } catch (e) { /* 忽略 */ }
    };
    loadDirs();

    parseBtn.onclick = async () => {
      const ref = refInput.value.trim();
      if (!ref) { this.toast("先贴个链接或 ID", "err"); return; }
      parseBtn.disabled = true;
      info.textContent = "解析中…";
      try {
        const res = await fetch(`${API_BASE}/civitai_model?ref=${encodeURIComponent(ref)}`);
        const data = await res.json();
        if (!data.ok) { info.textContent = data.error || "解析失败"; parseBtn.disabled = false; return; }
        modelData = data;
        const vcount = (data.versions || []).length;
        info.innerHTML = `<b>${data.model_name}</b>　<span class="ml-dim">${data.type || ""} · ${vcount} 个版本 · @${data.creator || "?"}</span>`;
        versionSelect.innerHTML = "";
        (data.versions || []).forEach(v => {
          const o = document.createElement("option");
          o.value = v.version_id;
          const size = v.size_kb ? (v.size_kb > 1024 ? (v.size_kb / 1024).toFixed(1) + " MB" : Math.round(v.size_kb) + " KB") : "?";
          o.textContent = `${v.name} · ${v.base_model} · ${size}`;
          versionSelect.appendChild(o);
        });
        if (data.selected_version) versionSelect.value = String(data.selected_version);
        versionSelect.style.display = "";
        dirSelect.style.display = "";
        progress.style.display = "";
        bar.style.width = "0%";
        startBtn.disabled = false;
      } catch (e) {
        info.textContent = "解析失败：" + e;
      }
      parseBtn.disabled = false;
    };

    startBtn.onclick = async () => {
      if (!modelData || !versionSelect.value) return;
      startBtn.disabled = true;
      parseBtn.disabled = true;
      bar.style.width = "0%";
      bar.textContent = "0%";
      try {
        const res = await fetch(`${API_BASE}/civitai_download`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version_id: Number(versionSelect.value), target_dir: dirSelect.value })
        });
        const data = await res.json();
        if (!data.ok) { this.toast(data.error || "下载失败", "err"); startBtn.disabled = false; parseBtn.disabled = false; return; }
        this.toast(`开始下载：${data.name}`, "ok");
        await this.watchDownload(data.task_id, (t) => {
          const p = t.percent;
          bar.style.width = (p == null ? 100 : Math.min(100, p)) + "%";
          bar.textContent = p == null ? "下载中…" : p.toFixed(0) + "%";
        });
        this.toast(`已下载：${data.name}`, "ok");
        await this.loadLoras();
        this.renderSidebar(this.panelEl.querySelector(".ml-sidebar"));
        this.renderGrid(main);
      } catch (e) {
        this.toast("下载失败：" + e, "err");
      }
      startBtn.disabled = false;
      parseBtn.disabled = false;
    };
  }

  // ---- Civitai API Key / 代理 设置 ----
  async showCivitaiConfigDialog(onSaved) {
    let cur = { api_key: "", proxy: "", has_key: false, key_hint: "", key_source: "" };
    try {
      const d = await (await fetch(`${API_BASE}/civitai_config`)).json();
      if (d && d.ok) cur = d;
    } catch (e) { /* 读不到就给空表单 */ }

    this.closeMiniDialog();
    const mask = document.createElement("div");
    mask.className = "ml-mini-mask";
    const box = document.createElement("div");
    box.className = "ml-mini ml-mini-wide";

    const title = document.createElement("div");
    title.className = "ml-mini-title";
    title.textContent = "Civitai 账号设置";
    box.appendChild(title);

    const hint = document.createElement("div");
    hint.className = "ml-mini-hint";
    hint.innerHTML = "下载 / 拉取受限资源需要 API Key（Civitai → 账号设置 → API Keys 生成）。" +
      (cur.has_key ? `<br>当前：已配置（${cur.key_hint}）` : "<br>当前：<b>未配置</b>") +
      "<br>留空保存 = 保持不变；要清除请点「清除 Key」。环境变量 / LoraManager 的 Key 优先级更高。";
    box.appendChild(hint);

    const keyInput = document.createElement("input");
    keyInput.className = "ml-mini-input";
    keyInput.placeholder = cur.has_key ? "留空则保持/清除，需要更换就粘贴新 Key" : "粘贴 Civitai API Key";
    box.appendChild(keyInput);

    const proxyInput = document.createElement("input");
    proxyInput.className = "ml-mini-input";
    proxyInput.value = cur.proxy || "";
    proxyInput.placeholder = "代理（可选，如 http://127.0.0.1:7897）";
    box.appendChild(proxyInput);

    const row = document.createElement("div");
    row.className = "ml-mini-row";
    const clearBtn = document.createElement("button");
    clearBtn.className = "ml-footer-btn ml-btn-ghost";
    clearBtn.textContent = "清除 Key";
    clearBtn.style.display = cur.has_key ? "" : "none";
    const spacer = document.createElement("div");
    spacer.style.flex = "1 1 auto";
    const cancel = document.createElement("button");
    cancel.className = "ml-footer-btn ml-btn-cancel";
    cancel.textContent = "取消";
    const ok = document.createElement("button");
    ok.className = "ml-footer-btn ml-btn-apply";
    ok.textContent = "保存";
    row.appendChild(clearBtn);
    row.appendChild(spacer);
    row.appendChild(cancel);
    row.appendChild(ok);
    box.appendChild(row);

    mask.appendChild(box);
    (this.panelEl || document.body).appendChild(mask);
    this._miniMask = mask;
    const close = () => mask.remove();
    cancel.onclick = close;
    mask.onclick = (e) => { if (e.target === mask) close(); };
    keyInput.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === "Enter") { e.preventDefault(); ok.click(); }
      else if (e.key === "Escape") { e.preventDefault(); close(); }
    };

    clearBtn.onclick = async () => {
      clearBtn.disabled = true;
      try {
        const r = await fetch(`${API_BASE}/civitai_config`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ api_key: "" })
        });
        const d = await r.json();
        if (!d.ok) { clearBtn.disabled = false; this.toast(d.error || "清除失败", "err"); return; }
        this.toast("已清除本节点的 API Key", "ok");
        close();
        if (onSaved) onSaved(d);
      } catch (e) {
        clearBtn.disabled = false;
        this.toast("清除失败：" + e, "err");
      }
    };

    ok.onclick = async () => {
      ok.disabled = true;
      try {
        const payload = { proxy: proxyInput.value.trim() };
        // 只有真的输入了才改 key，避免"空着保存"把已有 Key 清掉
        if (keyInput.value.trim()) payload.api_key = keyInput.value.trim();
        const r = await fetch(`${API_BASE}/civitai_config`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const d = await r.json();
        if (!d.ok) { ok.disabled = false; this.toast(d.error || "保存失败", "err"); return; }
        this.toast(d.has_key ? `已保存（${d.key_hint}）` : "已保存（未配置 Key）", "ok");
        close();
        if (onSaved) onSaved(d);
      } catch (e) {
        ok.disabled = false;
        this.toast("保存失败：" + e, "err");
      }
    };
    setTimeout(() => keyInput.focus(), 30);
  }

  async watchDownload(taskId, onTick) {
    for (let i = 0; i < 3600; i++) {
      await new Promise(r => setTimeout(r, 700));
      let t = null;
      try {
        const res = await fetch(`${API_BASE}/download_status?id=${taskId}`);
        const data = await res.json();
        if (!data.ok) return null;
        t = data.task;
      } catch (e) { continue; }
      if (onTick) onTick(t);
      if (t.state === "done") return t;
      if (t.state === "error") { this.toast("下载出错：" + (t.error || "未知"), "err"); return null; }
    }
    return null;
  }

  // ==================== 检查更新 ====================
  openUpdatesDialog(main) {
    this.closeMiniDialog();
    const mask = document.createElement("div");
    mask.className = "ml-mini-mask";
    const box = document.createElement("div");
    box.className = "ml-mini ml-mini-wide";

    const title = document.createElement("div");
    title.className = "ml-mini-title";
    title.textContent = "检查新版本";
    box.appendChild(title);

    const info = document.createElement("div");
    info.className = "ml-mini-hint";
    info.textContent = "正在查询 Civitai…（新版本会下载成独立文件，现有版本原样保留）";
    box.appendChild(info);

    const list = document.createElement("div");
    list.className = "ml-update-list";
    box.appendChild(list);

    const row = document.createElement("div");
    row.className = "ml-mini-row";
    const closeBtn = document.createElement("button");
    closeBtn.className = "ml-footer-btn ml-btn-cancel";
    closeBtn.textContent = "关闭";
    const allBtn = document.createElement("button");
    allBtn.className = "ml-footer-btn ml-btn-apply";
    allBtn.textContent = "全部下载";
    allBtn.disabled = true;
    row.appendChild(closeBtn);
    row.appendChild(allBtn);
    box.appendChild(row);

    mask.appendChild(box);
    (this.panelEl || document.body).appendChild(mask);
    this._miniMask = mask;
    const close = () => mask.remove();
    closeBtn.onclick = close;
    mask.onclick = (e) => { if (e.target === mask) close(); };

    let updates = [];

    const dirOf = (absPath) => {
      const p = String(absPath || "");
      const i = Math.max(p.lastIndexOf("\\"), p.lastIndexOf("/"));
      return i > 0 ? p.slice(0, i) : "";
    };

    // 下载新版本：另存为新文件，旧版本一个字节都不动
    const doDownload = async (item, btnEl) => {
      const local = this.state.allLoras.find(l => l.name === item.name);
      const targetDir = dirOf(local && local.abs_path);
      if (!targetDir) { this.toast("找不到目标目录", "err"); return false; }
      if (btnEl) { btnEl.disabled = true; btnEl.textContent = "0%"; }
      try {
        const res = await fetch(`${API_BASE}/civitai_download`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            version_id: item.latest.version_id,
            target_dir: targetDir,
            rename: item.latest.file_name || ""
          })
        });
        const data = await res.json();
        if (!data.ok) {
          this.toast(data.error || "下载失败", "err");
          if (btnEl) { btnEl.disabled = false; btnEl.textContent = "下载"; }
          return false;
        }
        const t = await this.watchDownload(data.task_id, (tk) => {
          if (btnEl) btnEl.textContent = tk.percent == null ? "下载中…" : tk.percent.toFixed(0) + "%";
        });
        if (!t) {
          if (btnEl) { btnEl.disabled = false; btnEl.textContent = "下载"; }
          return false;
        }
        this.toast(`已下载新版本：${data.name}`, "ok");
        return true;
      } catch (e) {
        this.toast("下载失败：" + e, "err");
        if (btnEl) { btnEl.disabled = false; btnEl.textContent = "下载"; }
        return false;
      }
    };

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/check_updates?refresh=1`);
        const data = await res.json();
        if (!data.ok) { info.textContent = data.error || "检查失败"; return; }
        updates = data.updates || [];
        info.textContent = `检查了 ${data.checked} 个 LoRA，有 ${updates.length} 个能找到新版本（下载后旧版仍在）`;
        list.innerHTML = "";
        if (!updates.length) {
          const empty = document.createElement("div");
          empty.className = "ml-update-empty";
          empty.textContent = "全部都是最新版本";
          list.appendChild(empty);
          return;
        }
        const localThumbOf = (loraName) => {
          const l = this.state.allLoras.find(x => x.name === loraName);
          return l ? l.preview_url : "";
        };
        updates.forEach(item => {
          const rowEl = document.createElement("div");
          rowEl.className = "ml-update-row";

          // 左：当前本地预览；中间箭头；右：新版本预览（拿不到就占位）
          const thumbWrap = document.createElement("div");
          thumbWrap.className = "ml-update-thumbs";
          thumbWrap.appendChild(this.makeThumb(localThumbOf(item.name), "ml-update-thumb", "当前版本"));
          const arrow = document.createElement("span");
          arrow.className = "ml-update-arrow";
          arrow.textContent = "→";
          thumbWrap.appendChild(arrow);
          thumbWrap.appendChild(this.makeThumb(item.latest.preview_url, "ml-update-thumb", "新版本"));
          rowEl.appendChild(thumbWrap);

          const t = document.createElement("div");
          t.className = "ml-update-name";
          t.textContent = shortLoraName(item.name);
          t.title = item.name;
          const s = document.createElement("div");
          s.className = "ml-update-sub";
          s.textContent = `当前 ${item.current_name || "?"} → 新版本 ${item.latest.name} · ${item.latest.base_model}`;
          const btn = document.createElement("button");
          btn.className = "ml-toolbar-btn ml-update-btn";
          btn.innerHTML = mlIcon("download", "sm") + "<span>下载</span>";
          btn.onclick = async () => {
            const ok = await doDownload(item, btn);
            if (ok) { btn.textContent = "已下载"; btn.disabled = true; }
            await this.loadLoras();
            this.renderGrid(main);
          };
          const left = document.createElement("div");
          left.className = "ml-update-left";
          left.appendChild(t);
          left.appendChild(s);
          rowEl.appendChild(left);
          rowEl.appendChild(btn);
          list.appendChild(rowEl);
        });
        allBtn.disabled = false;
        allBtn.onclick = async () => {
          allBtn.disabled = true;
          let done = 0;
          for (const item of updates) {
            allBtn.textContent = `下载中 ${done + 1}/${updates.length}`;
            if (await doDownload(item)) done++;
          }
          allBtn.textContent = `完成 ${done}/${updates.length}`;
          await this.loadLoras();
          this.renderGrid(main);
        };
      } catch (e) {
        info.textContent = "检查失败：" + e;
      }
    })();
  }

  // ==================== 触发词管理面板 ====================
  async openTriggerManager(main) {
    try {
      const grid = main.querySelector(".ml-grid");
      const old = main.querySelector(".ml-trig-mgr");
      if (old) { old.remove(); if (grid) grid.style.display = ""; return; }

      const panel = document.createElement("div");
      panel.className = "ml-trig-mgr";

      const head = document.createElement("div");
      head.className = "ml-trig-mgr-head";
      const t = document.createElement("div");
      t.className = "ml-trig-mgr-title";
      t.textContent = "触发词管理";
      const search = document.createElement("input");
      search.className = "ml-search";
      search.placeholder = "搜索 LoRA…";
      const copyAllBtn = document.createElement("button");
      copyAllBtn.className = "ml-toolbar-btn";
      copyAllBtn.innerHTML = mlIcon("copy") + "<span>复制全部启用</span>";
      const closeBtn = document.createElement("button");
      closeBtn.className = "ml-toolbar-btn";
      closeBtn.textContent = "关闭";
      closeBtn.onclick = () => {
        panel.remove();
        if (grid) grid.style.display = "";
        this._renderTrigMgr = null;
      };
      head.appendChild(t);
      head.appendChild(search);
      head.appendChild(copyAllBtn);
      head.appendChild(closeBtn);
      panel.appendChild(head);

      const listWrap = document.createElement("div");
      listWrap.className = "ml-trig-mgr-list";
      panel.appendChild(listWrap);

      if (grid) grid.style.display = "none";
      main.appendChild(panel);

      const render = () => {
        const q = search.value.trim().toLowerCase();
        listWrap.innerHTML = "";
        const rows = this.state.allLoras.filter(l => !q || l.name.toLowerCase().includes(q));
        if (!rows.length) {
          const e = document.createElement("div");
          e.className = "ml-update-empty";
          e.textContent = "没有匹配的 LoRA";
          listWrap.appendChild(e);
          return;
        }
        rows.forEach(lora => {
          const words = lora.triggers || [];
          const states = lora.trigger_states || words.map(() => true);
          const row = document.createElement("div");
          row.className = "ml-tgm-row";

          // 左侧缩略图：一眼认出是哪个 LoRA
          row.appendChild(this.makeThumb(lora.preview_url, "ml-tgm-thumb", lora.name));

          const body = document.createElement("div");
          body.className = "ml-tgm-body";

          const top = document.createElement("div");
          top.className = "ml-tgm-top";
          const nm = document.createElement("span");
          nm.className = "ml-tgm-name";
          nm.textContent = shortLoraName(lora.name);
          nm.title = lora.name;
          const cnt = document.createElement("span");
          cnt.className = "ml-tgm-count";
          cnt.textContent = `${states.filter(Boolean).length}/${words.length}`;
          const editBtn = document.createElement("button");
          editBtn.className = "ml-trig-mini";
          editBtn.textContent = "编辑";
          editBtn.onclick = () => this.openLoraTriggers(lora, () => render());
          const copyBtn = document.createElement("button");
          copyBtn.className = "ml-trig-mini";
          copyBtn.innerHTML = mlIcon("copy", "sm");
          copyBtn.title = "复制这个 LoRA 已启用的触发词";
          top.appendChild(nm);
          top.appendChild(cnt);
          top.appendChild(editBtn);
          top.appendChild(copyBtn);
          body.appendChild(top);

          const save = async () => {
            try {
              await fetch(`${API_BASE}/triggers`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  name: lora.name,
                  disabled: words.filter((w, i) => states[i] === false),
                  extra: (lora._extraWords || [])
                })
              });
              lora.trigger_states = states;
            } catch (e) { this.toast("保存失败：" + e, "err"); }
          };

          const chips = document.createElement("div");
          chips.className = "ml-trig-chips";
          if (!words.length) {
            const none = document.createElement("span");
            none.className = "ml-dim";
            none.textContent = "（metadata 里没有触发词，可手工加）";
            chips.appendChild(none);
          }
          words.forEach((w, i) => {
            const chip = document.createElement("span");
            chip.className = "ml-trig-chip" + (states[i] === false ? " off" : " on");
            chip.textContent = w;
            chip.title = w + "\n\n" + (states[i] === false ? "点击启用" : "点击关闭");
            chip.onclick = async () => {
              states[i] = states[i] === false;
              chip.className = "ml-trig-chip" + (states[i] === false ? " off" : " on");
              cnt.textContent = `${states.filter(Boolean).length}/${words.length}`;
              await save();
            };
            chips.appendChild(chip);
          });
          body.appendChild(chips);
          row.appendChild(body);

          copyBtn.onclick = async () => {
            const text = words.filter((w, i) => states[i] !== false).join(", ");
            await this.copyText(text);
            this.toast(`已复制 ${shortLoraName(lora.name)} 的触发词`, "ok");
          };
          listWrap.appendChild(row);
        });
      };

      copyAllBtn.onclick = async () => {
        const parts = [];
        const seen = new Set();
        this.state.allLoras.forEach(l => {
          (l.triggers || []).forEach((w, i) => {
            const on = !l.trigger_states || l.trigger_states[i] !== false;
            if (on && !seen.has(w)) { seen.add(w); parts.push(w); }
          });
        });
        await this.copyText(parts.join(", "));
        this.toast(`已复制 ${parts.length} 条触发词`, "ok");
      };

      search.oninput = render;
      this._renderTrigMgr = render;   // 外部（单 LoRA 编辑器保存后）可以据此刷新
      render();
    } catch (e) {
      console.error("[MultiLoRA] trigger manager failed:", e);
      this.toast("打开触发词管理失败：" + e, "err");
    }
  }

  async copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }
    } catch (e) { /* 退回到 execCommand */ }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    } catch (e) {
      this.toast("复制失败，请手动选中", "err");
    }
  }

  // ---- 选择本地图片（上传预览用，隐藏的 file input）----
  pickLocalFile(accept, onPick) {
    let input = document.getElementById("ml-file-input");
    if (!input) {
      input = document.createElement("input");
      input.type = "file";
      input.id = "ml-file-input";
      input.style.display = "none";
      document.body.appendChild(input);
    }
    input.value = "";
    input.accept = accept;
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (file) onPick(file);
    };
    input.click();
  }

  // ---- 上传预览图（非 C 站 LoRA 手动补图）----
  async uploadPreview(lora, file) {
    const name = lora && lora.name;
    if (!name || !file) return false;
    try {
      const fd = new FormData();
      fd.append("file", file, file.name || "preview.png");
      const res = await fetch(`${API_BASE}/upload_preview?name=${encodeURIComponent(name)}`, {
        method: "POST",
        body: fd
      });
      const data = await res.json().catch(() => ({ ok: false, error: "响应解析失败" }));
      if (!data.ok) {
        this.toast(`「${shortLoraName(name)}」${data.error || "上传失败"}`, "err");
        return false;
      }
      lora.preview_url = data.preview_url;
      lora.preview_type = data.media === "video" ? "video" : "image";
      this.toast(`已更新「${shortLoraName(name)}」预览`, "ok");
      return true;
    } catch (e) {
      this.toast("上传失败：" + e, "err");
      return false;
    }
  }

  // ---- 面板内迷你对话框（改名，不弹浏览器 prompt）----
  showMiniDialog({ title, hint, value, onOk }) {
    this.closeMiniDialog();
    const mask = document.createElement("div");
    mask.className = "ml-mini-mask";
    const box = document.createElement("div");
    box.className = "ml-mini";

    const t = document.createElement("div");
    t.className = "ml-mini-title";
    t.textContent = title || "";
    box.appendChild(t);

    if (hint) {
      const h = document.createElement("div");
      h.className = "ml-mini-hint";
      h.textContent = hint;
      box.appendChild(h);
    }

    const input = document.createElement("input");
    input.className = "ml-mini-input";
    input.value = value || "";
    box.appendChild(input);

    const row = document.createElement("div");
    row.className = "ml-mini-row";
    const cancel = document.createElement("button");
    cancel.className = "ml-footer-btn ml-btn-cancel";
    cancel.textContent = "取消";
    const ok = document.createElement("button");
    ok.className = "ml-footer-btn ml-btn-apply";
    ok.textContent = "确定";
    row.appendChild(cancel);
    row.appendChild(ok);
    box.appendChild(row);

    mask.appendChild(box);
    (this.panelEl || document.body).appendChild(mask);

    const close = () => mask.remove();
    const commit = () => { const v = input.value.trim(); close(); if (v) onOk(v); };
    cancel.onclick = close;
    ok.onclick = commit;
    mask.onclick = (e) => { if (e.target === mask) close(); };
    input.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === "Enter") { e.preventDefault(); commit(); }
      else if (e.key === "Escape") { e.preventDefault(); close(); }
    };
    setTimeout(() => { input.focus(); input.select(); }, 30);
    this._miniMask = mask;
  }

  closeMiniDialog() {
    if (this._miniMask && this._miniMask.parentNode) this._miniMask.remove();
    this._miniMask = null;
  }

  // ---- 卡片右键菜单 ----
  closeCardMenu() {
    if (this._ctxMenu && this._ctxMenu.parentNode) this._ctxMenu.remove();
    this._ctxMenu = null;
  }

  showCardMenu(ev, lora, main) {
    this.closeCardMenu();
    const menu = document.createElement("div");
    menu.className = "ml-ctx";

    const title = document.createElement("div");
    title.className = "ml-ctx-title";
    title.textContent = shortLoraName(lora.name);
    menu.appendChild(title);

    const addItem = (ico, label, handler, danger) => {
      const item = document.createElement("div");
      item.className = "ml-ctx-item" + (danger ? " danger" : "");
      const i = document.createElement("span");
      i.className = "ico";
      i.innerHTML = mlIcon(ico, "sm");
      const t = document.createElement("span");
      t.textContent = label;
      item.appendChild(i);
      item.appendChild(t);
      item.onclick = async (e) => {
        e.stopPropagation();
        this.closeCardMenu();
        await handler();
      };
      menu.appendChild(item);
    };

    const syncPicked = () => {
      const picked = this.state.selected.find(x => x.name === lora.name);
      if (picked) {
        picked.preview_url = lora.preview_url;
        picked.preview_type = lora.preview_type;
        this.saveToNode();
        if (this.container) this.renderList();
      }
    };

    addItem("image", lora.preview_type ? "更换预览图" : "上传预览图", () => {
      this.pickLocalFile("image/*,video/mp4,video/webm", async (file) => {
        const ok = await this.uploadPreview(lora, file);
        if (ok) { syncPicked(); this.renderGrid(main); }
      });
    });

    addItem("download", "从 Civitai 下载预览", async () => {
      const ok = await this.fetchCivitaiPreview(lora);
      if (ok) { syncPicked(); this.renderGrid(main); }
    });

    const sep = document.createElement("div");
    sep.className = "ml-ctx-sep";
    menu.appendChild(sep);

    addItem("external", "在 Civitai 打开", () => {
      this.openCivitaiPage(lora.civitai_model_id, lora.civitai_version_id, lora.name);
    });

    addItem("tag", "查看详情…", () => this.showLoraDetail(lora));
    addItem("layers", "版本列表…", () => this.openLoraVersions(lora));

    const sep2 = document.createElement("div");
    sep2.className = "ml-ctx-sep";
    menu.appendChild(sep2);

    addItem("pencil", "重命名", () => this.renameLora(lora));
    addItem("move", "移动位置…", () => this.moveLora(lora));
    addItem("trash", "删除 LoRA…", () => this.deleteLora(lora), true);

    document.body.appendChild(menu);
    // 贴边修正：别跑出视口
    const r = menu.getBoundingClientRect();
    let left = ev.clientX, top = ev.clientY;
    if (left + r.width > window.innerWidth - 6) left = Math.max(6, left - r.width);
    if (top + r.height > window.innerHeight - 6) top = Math.max(6, top - r.height);
    menu.style.left = left + "px";
    menu.style.top = top + "px";

    this._ctxMenu = menu;
    const closer = (e) => {
      if (menu.contains(e.target)) return;
      this.closeCardMenu();
      document.removeEventListener("mousedown", closer, true);
      document.removeEventListener("keydown", escClose, true);
    };
    const escClose = (e) => {
      if (e.key === "Escape") {
        this.closeCardMenu();
        document.removeEventListener("mousedown", closer, true);
        document.removeEventListener("keydown", escClose, true);
      }
    };
    setTimeout(() => {
      document.addEventListener("mousedown", closer, true);
      document.addEventListener("keydown", escClose, true);
    }, 0);
  }

  // ---- 改名 / 移动后同步节点里的引用 ----
  async syncAfterPathChange(oldName, newName) {
    const picked = (this.state.selected || []).find(s => s.name === oldName);
    await this.loadLoras();
    const fresh = this.state.allLoras.find(l => l.name === newName)
      || this.state.allLoras.find(l => l.name === oldName);
    if (picked && fresh) {
      picked.name = fresh.name;
      picked.abs_path = fresh.abs_path;
      picked.preview_url = fresh.preview_url;
      picked.preview_type = fresh.preview_type;
      if (this.container) this.renderList();
      this.saveToNode();
    }
    if (this.panelEl) {
      this.renderSidebar(this.panelEl.querySelector(".ml-sidebar"));
      this.renderGrid(this.panelEl.querySelector(".ml-main"));
    }
  }

  // ---- 删除 LoRA（文件 + 预览 + metadata，二次确认）----
  deleteLora(lora) {
    const name = lora && lora.name;
    if (!name) return;
    this.closeMiniDialog();
    const mask = document.createElement("div");
    mask.className = "ml-mini-mask";
    const box = document.createElement("div");
    box.className = "ml-mini";

    const t = document.createElement("div");
    t.className = "ml-mini-title";
    t.style.color = "#ff9b9b";
    t.textContent = "删除 LoRA";
    box.appendChild(t);

    const hint = document.createElement("div");
    hint.className = "ml-mini-hint";
    hint.style.lineHeight = "1.6";
    hint.innerHTML = "将永久删除：<br>· " + name + ".safetensors<br>· 同名预览图<br>· 同名 metadata.json<br><br>这个操作不能撤销，确定？";
    box.appendChild(hint);

    const row = document.createElement("div");
    row.className = "ml-mini-row";
    const cancel = document.createElement("button");
    cancel.className = "ml-footer-btn ml-btn-cancel";
    cancel.textContent = "取消";
    const ok = document.createElement("button");
    ok.className = "ml-footer-btn ml-btn-danger";
    ok.textContent = "删除";
    row.appendChild(cancel);
    row.appendChild(ok);
    box.appendChild(row);

    mask.appendChild(box);
    (this.panelEl || document.body).appendChild(mask);
    this._miniMask = mask;

    const close = () => mask.remove();
    cancel.onclick = close;
    mask.onclick = (e) => { if (e.target === mask) close(); };

    ok.onclick = async () => {
      ok.disabled = true;
      try {
        const res = await fetch(`${API_BASE}/delete?name=${encodeURIComponent(name)}`, {
          method: "DELETE"
        });
        const data = await res.json().catch(() => ({ ok: false, error: "响应解析失败" }));
        if (!data.ok) { ok.disabled = false; this.toast(data.error || "删除失败", "err"); return; }
        close();
        // 节点里如果选着它，一并移除
        const before = (this.state.selected || []).length;
        this.state.selected = (this.state.selected || []).filter(x => x.name !== name);
        await this.loadLoras();
        if (this.state.selected.length !== before) {
          if (this.container) this.renderList();
          this.saveToNode();
        }
        if (this.panelEl) {
          this.renderSidebar(this.panelEl.querySelector(".ml-sidebar"));
          this.renderGrid(this.panelEl.querySelector(".ml-main"));
        }
        this.toast(`已删除「${shortLoraName(name)}」`, "ok");
      } catch (e) {
        ok.disabled = false;
        this.toast("删除失败：" + e, "err");
      }
    };
  }

  // ---- 移动 LoRA 位置（换目录）----
  async moveLora(lora) {
    let dirs = [];
    try {
      const res = await fetch(`${API_BASE}/dirs`);
      const data = await res.json();
      dirs = data.dirs || [];
    } catch (e) {
      this.toast("读取目录列表失败：" + e, "err");
      return;
    }
    if (!dirs.length) { this.toast("没有可用目录", "err"); return; }

    this.closeMiniDialog();
    const mask = document.createElement("div");
    mask.className = "ml-mini-mask";
    const box = document.createElement("div");
    box.className = "ml-mini";

    const title = document.createElement("div");
    title.className = "ml-mini-title";
    title.textContent = "移动 LoRA 位置";
    box.appendChild(title);

    const hint = document.createElement("div");
    hint.className = "ml-mini-hint";
    hint.textContent = "当前：" + lora.name;
    box.appendChild(hint);

    const select = document.createElement("select");
    select.className = "ml-mini-input ml-mini-select";
    dirs.forEach(d => {
      const opt = document.createElement("option");
      opt.value = d.path;
      // 不要用 "└" 之类符号（某些字体会渲染成奇怪的 L），只用缩进空格表示层级
      opt.textContent = (d.depth ? "　".repeat(d.depth - 1) : "") + d.rel;
      select.appendChild(opt);
    });
    const newOpt = document.createElement("option");
    newOpt.value = "__new__";
    newOpt.textContent = "新建子目录…";
    select.appendChild(newOpt);
    // 默认选中与当前文件不同的第一个目录
    const curDir = String(lora.abs_path || "").replace(/[\\/][^\\/]*$/, "");
    const same = dirs.find(d => d.path.toLowerCase() === curDir.toLowerCase());
    select.value = (same && dirs.find(d => d.path !== same.path))
      ? dirs.find(d => d.path !== same.path).path
      : dirs[0].path;
    box.appendChild(select);

    const newInput = document.createElement("input");
    newInput.className = "ml-mini-input";
    newInput.placeholder = "新目录名（可多级，如 新分类/子类）";
    newInput.style.display = "none";
    box.appendChild(newInput);
    select.onchange = () => {
      newInput.style.display = select.value === "__new__" ? "" : "none";
      if (select.value === "__new__") setTimeout(() => newInput.focus(), 20);
    };

    const row = document.createElement("div");
    row.className = "ml-mini-row";
    const cancel = document.createElement("button");
    cancel.className = "ml-footer-btn ml-btn-cancel";
    cancel.textContent = "取消";
    const ok = document.createElement("button");
    ok.className = "ml-footer-btn ml-btn-apply";
    ok.textContent = "移动";
    row.appendChild(cancel);
    row.appendChild(ok);
    box.appendChild(row);
    mask.appendChild(box);
    (this.panelEl || document.body).appendChild(mask);
    this._miniMask = mask;

    const close = () => mask.remove();
    cancel.onclick = close;
    mask.onclick = (e) => { if (e.target === mask) close(); };
    newInput.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === "Enter") { e.preventDefault(); ok.click(); }
      else if (e.key === "Escape") { e.preventDefault(); close(); }
    };

    ok.onclick = async () => {
      let target = select.value;
      if (target === "__new__") {
        const sub = newInput.value.trim();
        if (!sub) { this.toast("请填写新目录名", "err"); return; }
        // 允许用 / 或 \ 分层，逐段校验非法字符
        const parts = sub.split(/[\\/]+/).filter(Boolean);
        if (parts.some(p => /[*?"<>|:]/.test(p) || p === ".." || p === ".")) {
          this.toast("目录名含非法字符", "err");
          return;
        }
        // 新目录始终落在「当前 LoRA 所在根目录」下面，出不去
        const curRoot = dirs
          .filter(d => curDir.toLowerCase().startsWith(d.root.toLowerCase()))
          .sort((a, b) => b.root.length - a.root.length)[0];
        const root = curRoot ? curRoot.root : dirs[0].root;
        target = [root].concat(parts).join("\\");
      }
      ok.disabled = true;
      try {
        const res = await fetch(`${API_BASE}/move`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: lora.name, target_dir: target })
        });
        const data = await res.json().catch(() => ({ ok: false, error: "响应解析失败" }));
        if (!data.ok) { ok.disabled = false; this.toast(data.error || "移动失败", "err"); return; }
        close();
        await this.syncAfterPathChange(lora.name, data.name);
        this.toast(`已移动到「${target}」`, "ok");
      } catch (e) {
        ok.disabled = false;
        this.toast("移动失败：" + e, "err");
      }
    };
    setTimeout(() => select.focus(), 30);
  }

  // ---- 重命名 LoRA 文件 ----
  renameLora(lora) {
    const current = shortLoraName(lora.name);
    const dir = String(lora.name || "").includes("\\")
      ? String(lora.name).slice(0, String(lora.name).lastIndexOf("\\"))
      : "";
    this.showMiniDialog({
      title: "重命名 LoRA",
      hint: (dir ? `目录：${dir}\\  ·  ` : "") + "预览图和 metadata 会一起改名",
      value: current,
      onOk: async (newName) => {
        if (newName === current) return;
        try {
          const res = await fetch(`${API_BASE}/rename`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: lora.name, new_name: newName })
          });
          const data = await res.json().catch(() => ({ ok: false, error: "响应解析失败" }));
          if (!data.ok) { this.toast(data.error || "改名失败", "err"); return; }
          await this.syncAfterPathChange(lora.name, data.name);
          this.toast(`已改名为「${newName}」`, "ok");
        } catch (e) {
          this.toast("改名失败：" + e, "err");
        }
      }
    });
  }

  // ---- 从 Civitai 下载预览图 ----
  async fetchCivitaiPreview(lora, opts = {}) {
    const name = lora && lora.name;
    if (!name) return false;
    try {
      const res = await fetch(`${API_BASE}/civitai_preview?name=${encodeURIComponent(name)}`);
      const data = await res.json().catch(() => ({ ok: false, error: "响应解析失败" }));
      if (!data.ok) {
        if (!opts.silent) this.toast(`「${shortLoraName(name)}」${data.error || "下载失败"}`, "err");
        return false;
      }
      // 更新内存里的数据，界面立刻能看到
      lora.preview_url = data.preview_url;
      lora.preview_type = data.media === "video" ? "video" : "image";
      lora.nsfw_level = data.nsfw_level;
      if (!opts.silent) this.toast(`已从 C 站下载「${shortLoraName(name)}」预览`, "ok");
      return true;
    } catch (e) {
      if (!opts.silent) this.toast("下载失败：" + e, "err");
      return false;
    }
  }

  // ---- 节点内提示条（替代 alert）----
  toast(msg, kind) {
    try {
      if (!this.container) return;
      let el = this.container.querySelector(".ml-toast");
      if (!el) {
        el = document.createElement("div");
        el.className = "ml-toast";
        this.container.appendChild(el);
      }
      el.textContent = msg;
      el.dataset.kind = kind || "info";
      // 强制回流后再加 show，保证动画每次都播
      void el.offsetWidth;
      el.classList.add("show");
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
    } catch (e) {
      console.warn("[MultiLoRA] toast failed:", e);
    }
  }

  // ---- 节点内「存为预设」输入行 ----
  collectPresetItems() {
    return (this.state.selected || [])
      .filter(it => it && it.name)
      .map(it => ({
        name: it.name,
        abs_path: it.abs_path || "",
        weight: Number(it.weight) || 0,
        weight_clip: Number(it.weight_clip),
        enabled: it.enabled !== false,
        triggers: it.triggers || [],
        // 触发词的逐条开关也存进预设（加载时按词恢复）
        trigger_states: (it.trigger_states && it.trigger_states.length === (it.triggers || []).length)
          ? [...it.trigger_states]
          : (it.triggers || []).map(() => true),
        preview_url: it.preview_url || "",
        preview_type: it.preview_type || ""
      }));
  }

  defaultPresetName() {
    const d = new Date();
    const p = (v) => String(v).padStart(2, "0");
    return `预设_${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  }

  openPresetComposer() {
    const items = this.collectPresetItems();
    if (!items.length) {
      this.toast("请先选择至少一个 LoRA", "err");
      return;
    }
    this.state.composerOpen = true;
    this.state.composerName = this.defaultPresetName();
    this.renderList();
    // 渲染完聚焦并全选，回车即存
    setTimeout(() => {
      const input = this.container && this.container.querySelector(".ml-composer-input");
      if (input) { input.focus(); input.select(); }
    }, 30);
  }

  closePresetComposer() {
    this.state.composerOpen = false;
    this.renderList();
  }

  buildComposerRow() {
    const row = document.createElement("div");
    row.className = "ml-composer";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "ml-composer-input";
    input.placeholder = "预设名称…";
    input.value = this.state.composerName || this.defaultPresetName();
    input.oninput = () => { this.state.composerName = input.value; };
    // 别让键盘事件漏到画布上（否则打字会触发 ComfyUI 快捷键）
    input.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === "Enter") { e.preventDefault(); this.commitPreset(input.value); }
      else if (e.key === "Escape") { e.preventDefault(); this.closePresetComposer(); }
    };
    row.appendChild(input);

    const ok = document.createElement("button");
    ok.className = "ml-node-btn ml-composer-ok";
    ok.textContent = "保存";
    ok.onclick = (ev) => { ev.stopPropagation(); this.commitPreset(input.value); };
    row.appendChild(ok);

    const cancel = document.createElement("button");
    cancel.className = "ml-node-btn";
    cancel.textContent = "取消";
    cancel.onclick = (ev) => { ev.stopPropagation(); this.closePresetComposer(); };
    row.appendChild(cancel);

    return row;
  }

  commitPreset(rawName) {
    try {
      const name = String(rawName || "").trim();
      if (!name) { this.toast("预设名不能为空", "err"); return; }
      const items = this.collectPresetItems();
      if (!items.length) { this.toast("请先选择至少一个 LoRA", "err"); return; }
      fetch(`${API_BASE}/presets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name, items: items })
      })
        .then(r => r.json())
        .then(res => {
          if (res && res.error) { this.toast("保存失败：" + res.error, "err"); return; }
          this.loadPresets();
          this.state.composerOpen = false;
          this.state.composerName = "";
          this.renderList();
          this.toast(`已保存「${name}」（${items.length} 个，含权重）`, "ok");
        })
        .catch(e => this.toast("保存失败：" + e, "err"));
    } catch (e) {
      console.error("[MultiLoRA] commitPreset failed:", e);
      this.toast("保存失败：" + e, "err");
    }
  }

  // 节点上的「加载预设」浮层
  showNodePresetMenu(anchorEl) {
    try {
      // 关闭已有浮层
      document.querySelectorAll(".ml-preset-pop").forEach(n => n.remove());
      fetch("/blackrin/multi_lora/presets").then(r => r.json()).then(data => {
        const presets = data.presets || {};
        const names = Object.keys(presets);
        const pop = document.createElement("div");
        pop.className = "ml-preset-pop";

        const rect = anchorEl.getBoundingClientRect();
        pop.style.left = rect.left + "px";
        pop.style.top = (rect.bottom + 6) + "px";
        pop.style.width = Math.max(220, rect.width) + "px";

        if (!names.length) {
          const e = document.createElement("div");
          e.className = "ml-preset-empty";
          e.textContent = "还没有预设";
          pop.appendChild(e);
        } else {
          names.forEach(nm => {
            const row = document.createElement("div");
            row.className = "ml-preset-row";
            const nameSpan = document.createElement("span");
            nameSpan.className = "nm";
            nameSpan.textContent = nm;
            const cnt = document.createElement("span");
            cnt.className = "cnt";
            cnt.textContent = "(" + (presets[nm] || []).length + ")";
            const del = document.createElement("button");
            del.className = "del";
            del.textContent = "×";
            del.title = "删除此预设";
            // 二次确认：第一次点变「删除?」，2.5 秒内再点才真删（不弹浏览器确认框）
            let armedTimer = null;
            del.onclick = (ev) => {
              ev.stopPropagation();
              if (!del.classList.contains("armed")) {
                del.classList.add("armed");
                del.textContent = "删除?";
                armedTimer = setTimeout(() => {
                  del.classList.remove("armed");
                  del.textContent = "×";
                }, 2500);
                return;
              }
              clearTimeout(armedTimer);
              fetch("/blackrin/multi_lora/presets?name=" + encodeURIComponent(nm), { method: "DELETE" })
                .then(() => { pop.remove(); this.toast("已删除预设「" + nm + "」", "ok"); })
                .catch(e => this.toast("删除失败：" + e, "err"));
            };
            row.appendChild(nameSpan);
            row.appendChild(cnt);
            row.appendChild(del);
            row.onclick = () => {
              // 直接加载（不再弹确认框），选了几个 LoRA 用提示条告诉你
              this.state.selected = this.applyPresetItems(JSON.parse(JSON.stringify(presets[nm] || [])));
              this.renderList();
              this.saveToNode();
              pop.remove();
              this.toast("已加载预设「" + nm + "」（" + (presets[nm] || []).length + " 个）", "ok");
            };
            pop.appendChild(row);
          });
        }

        document.body.appendChild(pop);
        // 点外面关闭（延迟绑定，避免被当前点击立刻关闭）
        setTimeout(() => {
          const closer = (ev) => {
            if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener("click", closer); }
          };
          document.addEventListener("click", closer);
        }, 50);
      }).catch(e => this.toast("读取预设失败：" + e, "err"));
    } catch (e) {
      console.error("[MultiLoRA] showNodePresetMenu failed:", e);
    }
  }

  openPanel() {
    try {
      if (this.state.panelOpen) return;
      this.state.panelOpen = true;
      this.state.tempSelected = [...this.state.selected];
      this.state.searchQuery = "";
      this.state.activeCategory = null;
      this.state.activeSubCategory = null;
      this.createPanel();
    } catch (e) {
      console.error("Failed to open panel:", e);
    }
  }

  // 创建面板
  createPanel() {
    try {
      const overlay = document.createElement("div");
      overlay.className = "ml-panel-overlay";
      this.panelEl = overlay;

      const panel = document.createElement("div");
      panel.className = "ml-panel";

      // 头部
      const header = document.createElement("div");
      header.className = "ml-panel-header";
      const title = document.createElement("div");
      title.className = "ml-panel-title";
      title.textContent = "选择 LoRA";
      const closeBtn = document.createElement("button");
      closeBtn.className = "ml-panel-close";
      closeBtn.textContent = "×";
      closeBtn.onclick = () => this.closePanel();
      header.appendChild(title);
      header.appendChild(closeBtn);
      panel.appendChild(header);

      // 主体
      const body = document.createElement("div");
      body.className = "ml-panel-body";

      // 侧边栏（分类树）
      const sidebar = document.createElement("div");
      sidebar.className = "ml-sidebar";
      this.renderSidebar(sidebar);
      body.appendChild(sidebar);

      // 主区域
      const main = document.createElement("div");
      main.className = "ml-main";

      // 工具栏
      const toolbar = document.createElement("div");
      toolbar.className = "ml-toolbar";
      const search = document.createElement("input");
      search.type = "text";
      search.className = "ml-search";
      search.placeholder = "搜索 LoRA...";
      search.value = this.state.searchQuery;
      search.oninput = (e) => {
        this.state.searchQuery = e.target.value;
        this.renderGrid(main);
      };
      toolbar.appendChild(search);

      // 一键补全：只处理当前没有预览图的 LoRA，逐个从 C 站拉
      const bulkBtn = document.createElement("button");
      bulkBtn.className = "ml-toolbar-btn";
      bulkBtn.innerHTML = mlIcon("image") + "<span>补全预览</span>";
      bulkBtn.title = "给没有预览图的 LoRA 从 Civitai 下载预览";
      bulkBtn.onclick = async () => {
        if (bulkBtn.disabled) return;
        const missing = this.state.allLoras.filter(l => !l.preview_type);
        if (!missing.length) { this.toast("所有 LoRA 都已经有预览图了", "ok"); return; }
        bulkBtn.disabled = true;
        let done = 0, failed = 0;
        for (const lora of missing) {
          bulkBtn.innerHTML = mlIcon("image") + `<span>${done + 1}/${missing.length}</span>`;
          const ok = await this.fetchCivitaiPreview(lora, { silent: true });
          ok ? done++ : failed++;
          this.renderGrid(main);
        }
        bulkBtn.disabled = false;
        bulkBtn.innerHTML = mlIcon("image") + "<span>补全预览</span>";
        this.toast(`补全完成：成功 ${done} 个${failed ? "，失败 " + failed + " 个" : ""}`,
                   failed ? "err" : "ok");
      };
      toolbar.appendChild(bulkBtn);

      // C 站下载
      const dlBtn = document.createElement("button");
      dlBtn.className = "ml-toolbar-btn";
      dlBtn.innerHTML = mlIcon("download") + "<span>下载</span>";
      dlBtn.title = "粘贴 Civitai 模型链接，直接下到 LoRA 目录";
      dlBtn.onclick = () => this.openDownloadDialog(main);
      toolbar.appendChild(dlBtn);

      // 检查更新
      const upBtn = document.createElement("button");
      upBtn.className = "ml-toolbar-btn";
      upBtn.innerHTML = mlIcon("refresh") + "<span>检查新版本</span>";
      upBtn.title = "批量检查有没有新版本（下载成新文件，不会覆盖现有版本）";
      upBtn.onclick = () => this.openUpdatesDialog(main);
      toolbar.appendChild(upBtn);

      // 刷新：重新扫描本地 LoRA 目录，把新放进去的 LoRA 拉进列表
      const refreshBtn = document.createElement("button");
      refreshBtn.className = "ml-toolbar-btn";
      refreshBtn.innerHTML = mlIcon("refresh") + "<span>刷新</span>";
      refreshBtn.title = "重新扫描本地 LoRA 目录（会清掉后端缓存，新放进去的 LoRA 立刻出现）";
      refreshBtn.onclick = async () => {
        if (refreshBtn.disabled) return;
        refreshBtn.disabled = true;
        const oldHtml = refreshBtn.innerHTML;
        refreshBtn.innerHTML = mlIcon("refresh") + "<span>扫描中…</span>";
        try {
          await this.loadLoras(true);
          this.renderGrid(main);
          this.toast(`已刷新，共 ${this.state.allLoras.length} 个 LoRA`, "ok");
        } catch (err) {
          console.error("[MultiLoRA] 刷新失败", err);
          this.toast("刷新失败", "err");
        } finally {
          refreshBtn.disabled = false;
          refreshBtn.innerHTML = oldHtml;
        }
      };
      toolbar.appendChild(refreshBtn);

      main.appendChild(toolbar);

      // 网格
      const grid = document.createElement("div");
      grid.className = "ml-grid";
      main.appendChild(grid);

      this.renderGrid(main);
      body.appendChild(main);
      panel.appendChild(body);

      // 底部
      const footer = document.createElement("div");
      footer.className = "ml-panel-footer";
      const cancelBtn = document.createElement("button");
      cancelBtn.className = "ml-footer-btn ml-btn-cancel";
      cancelBtn.textContent = "取消";
      cancelBtn.onclick = () => this.closePanel();
      const applyBtn = document.createElement("button");
      applyBtn.className = "ml-footer-btn ml-btn-apply";
      // 存为预设已移到节点上（要带权重参数，面板里的 tempSelected 还没应用）
      applyBtn.textContent = "应用";
      applyBtn.onclick = () => {
        this.state.selected = [...this.state.tempSelected];
        this.renderList();
        this.saveToNode();
        this.closePanel();
      };
      const presetsBtn = document.createElement("button");
      presetsBtn.className = "ml-footer-btn ml-btn-ghost";
      presetsBtn.innerHTML = mlIcon("folder") + "<span>预设</span>";
      presetsBtn.onclick = () => this.showPresetsMenu(footer);
      cancelBtn.innerHTML = '<span>取消</span>';
      applyBtn.innerHTML = '<span>应用</span>';
      // 左侧「取消」，右侧操作组「预设 / 应用」
      const actions = document.createElement("div");
      actions.className = "ml-footer-actions";
      actions.appendChild(presetsBtn);
      actions.appendChild(applyBtn);
      footer.appendChild(cancelBtn);
      footer.appendChild(actions);
      panel.appendChild(footer);

      overlay.appendChild(panel);
      document.body.appendChild(overlay);

      // 点击遮罩关闭
      overlay.onclick = (e) => {
        if (e.target === overlay) this.closePanel();
      };
    } catch (e) {
      console.error("Failed to create panel:", e);
    }
  }

  // 渲染侧边栏分类树
  renderSidebar(sidebar) {
    try {
      sidebar.innerHTML = "";
      const title = document.createElement("div");
      title.className = "ml-sidebar-title";
      title.textContent = "分类";
      sidebar.appendChild(title);

      const tree = buildCategoryTree(this.state.allLoras);
      const cats = Object.keys(tree).sort();

      // "全部" 选项
      const allItem = document.createElement("div");
      allItem.className = "ml-cat-item" + (this.state.activeCategory === null ? " active" : "");
      allItem.innerHTML = mlIcon("layers", "sm") + "<span>全部</span><em>" + this.state.allLoras.length + "</em>";
      allItem.onclick = () => {
        this.state.activeCategory = null;
        this.state.activeSubCategory = null;
        this.renderSidebar(sidebar);
        this.renderGrid(this.panelEl.querySelector(".ml-main"));
      };
      sidebar.appendChild(allItem);

      cats.forEach(cat => {
        const catItem = document.createElement("div");
        catItem.className = "ml-cat-item" + (this.state.activeCategory === cat ? " active" : "");
        const catCount = this.state.allLoras.filter(l => parseCategories(l.name).top === cat).length;
        catItem.innerHTML = mlIcon("folder", "sm") + `<span>${cat}</span><em>${catCount}</em>`;
        catItem.onclick = () => {
          // 点击已选中的分类 = 收起（toggle）；点其他分类 = 展开
          if (this.state.activeCategory === cat) {
            this.state.activeCategory = null;
            this.state.activeSubCategory = null;
          } else {
            this.state.activeCategory = cat;
            this.state.activeSubCategory = null;
          }
          this.renderSidebar(sidebar);
          this.renderGrid(this.panelEl.querySelector(".ml-main"));
        };
        sidebar.appendChild(catItem);

        // 子分类（只有 "General" 一个时不展开，避免一堆无意义的“全部子分类”）
        const subs = this.state.activeCategory === cat ? [...tree[cat]].sort() : [];
        if (subs.length === 1 && subs[0] === "General") subs.length = 0;
        if (this.state.activeCategory === cat && subs.length) {
          const allSub = document.createElement("div");
          allSub.className = "ml-subcat-item" + (this.state.activeSubCategory === null ? " active" : "");
          allSub.textContent = "  全部子分类";
          allSub.onclick = () => {
            this.state.activeSubCategory = null;
            this.renderSidebar(sidebar);
            this.renderGrid(this.panelEl.querySelector(".ml-main"));
          };
          sidebar.appendChild(allSub);

          subs.forEach(sub => {
            const subItem = document.createElement("div");
            subItem.className = "ml-subcat-item" + (this.state.activeSubCategory === sub ? " active" : "");
            subItem.textContent = "  " + sub;
            subItem.onclick = () => {
              this.state.activeSubCategory = sub;
              this.renderSidebar(sidebar);
              this.renderGrid(this.panelEl.querySelector(".ml-main"));
            };
            sidebar.appendChild(subItem);
          });
        }
      });
    } catch (e) {
      console.error("Failed to render sidebar:", e);
    }
  }

  // 渲染网格
  renderGrid(main) {
    try {
      const grid = main.querySelector(".ml-grid");
      if (!grid) return;
      grid.innerHTML = "";

      let filtered = this.state.allLoras;

      // 按分类过滤
      if (this.state.activeCategory) {
        filtered = filtered.filter(l => parseCategories(l.name).top === this.state.activeCategory);
      }
      if (this.state.activeSubCategory) {
        filtered = filtered.filter(l => parseCategories(l.name).sub === this.state.activeSubCategory);
      }

      // 按搜索过滤
      if (this.state.searchQuery) {
        const q = this.state.searchQuery.toLowerCase();
        filtered = filtered.filter(l => l.name.toLowerCase().includes(q));
      }

      if (filtered.length === 0) {
        const empty = document.createElement("div");
        empty.style.cssText = "grid-column: 1/-1; text-align: center; color: #666; padding: 40px;";
        empty.textContent = "没有匹配的 LoRA";
        grid.appendChild(empty);
        return;
      }

      filtered.forEach(lora => {
        const card = document.createElement("div");
        card.className = "ml-card" + (this.state.tempSelected.find(s => s.name === lora.name) ? " selected" : "");

        // 缩略图（容器必须有固定高度，否则在 flex 里会被压扁）
        const thumb = document.createElement("div");
        thumb.className = "ml-card-thumb-wrap";
        if (lora.preview_url && lora.preview_type) {
          if (lora.preview_type === "video") {
            const video = document.createElement("video");
            video.src = lora.preview_url;
            video.muted = true;
            video.loop = true;
            video.playsInline = true;
            video.className = "ml-card-thumb";
            video.onmouseenter = () => video.play().catch(() => {});
            video.onmouseleave = () => { video.pause(); video.currentTime = 0; };
            thumb.appendChild(video);
          } else {
            const img = document.createElement("img");
            img.src = lora.preview_url;
            img.className = "ml-card-thumb";
            img.onerror = () => {
              img.remove();
              const ph = document.createElement("div");
              ph.style.cssText = "width:100%;height:120px;background:#333;display:flex;align-items:center;justify-content:center;font-size:32px;";
              ph.innerHTML = mlIcon("image");
              thumb.appendChild(ph);
            };
            thumb.appendChild(img);
          }
        } else {
          // 没有预览：整块占位可点，点了选本地图片上传
          const uploader = document.createElement("div");
          uploader.className = "ml-thumb-upload";
          uploader.innerHTML = mlIcon("plus") + "<span>上传预览</span>";
          uploader.title = "点击选择本地图片作为预览图";
          uploader.onclick = (ev) => {
            ev.stopPropagation();
            this.pickLocalFile("image/*,video/mp4,video/webm", async (file) => {
              uploader.innerHTML = mlIcon("refresh") + "<span>上传中…</span>";
              const ok = await this.uploadPreview(lora, file);
              if (ok) {
                const picked = this.state.selected.find(x => x.name === lora.name);
                if (picked) {
                  picked.preview_url = lora.preview_url;
                  picked.preview_type = lora.preview_type;
                  this.saveToNode();
                  if (this.container) this.renderList();
                }
                this.renderGrid(main);
              } else {
                this.renderGrid(main);
              }
            });
          };
          thumb.appendChild(uploader);
        }
        // 详情改成右键菜单里打开（单击保持原来的"选中"行为）
        card.appendChild(thumb);

        // 信息
        const info = document.createElement("div");
        info.className = "ml-card-info";
        const nameEl = document.createElement("div");
        nameEl.className = "ml-card-name";
        nameEl.textContent = lora.name;
        nameEl.title = lora.name;
        info.appendChild(nameEl);

        if (lora.triggers && lora.triggers.length > 0) {
          const trigEl = document.createElement("div");
          trigEl.className = "ml-card-triggers";
          trigEl.textContent = lora.triggers.join(", ");
          trigEl.title = lora.triggers.join(", ");
          info.appendChild(trigEl);
        }
        card.appendChild(info);

        // 右键菜单（换图 / C 站下载 / 改名 / 移动位置）
        card.oncontextmenu = (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          this.showCardMenu(ev, lora, main);
        };

        card.onclick = () => {
          const idx = this.state.tempSelected.findIndex(s => s.name === lora.name);
          if (idx >= 0) {
            this.state.tempSelected.splice(idx, 1);
          } else {
            this.state.tempSelected.push({
              name: lora.name,
              abs_path: lora.abs_path || "",
              weight: 1.0,
              weight_clip: 1.0,
              enabled: true,
              triggers: lora.triggers || [],
              preview_url: lora.preview_url,
              preview_type: lora.preview_type
            });
          }
          this.renderGrid(main);
        };

        grid.appendChild(card);
      });
    } catch (e) {
      console.error("Failed to render grid:", e);
    }
  }

  // 显示预设菜单
  showPresetsMenu(footer) {
    try {
      const existing = footer.querySelector(".ml-presets-menu");
      if (existing) {
        existing.remove();
        return;
      }

      const menu = document.createElement("div");
      menu.className = "ml-presets-menu";

      if (this.state.presets.length === 0) {
        const empty = document.createElement("div");
        empty.className = "ml-presets-empty";
        empty.textContent = "暂无预设";
        menu.appendChild(empty);
      } else {
        this.state.presets.forEach((preset, i) => {
          const item = document.createElement("div");
          item.className = "ml-presets-item";
          item.innerHTML = mlIcon("folder", "sm") + `<span>${preset.name || "预设 " + (i + 1)}</span><em>${(preset.items || []).length}</em>`;
          item.onclick = () => {
            this.state.tempSelected = this.applyPresetItems(JSON.parse(JSON.stringify(preset.items || [])));
            this.renderGrid(this.panelEl.querySelector(".ml-main"));
            menu.remove();
          };
          menu.appendChild(item);
        });

        // 保存预设统一走节点上的「存为预设」（那边才有真实权重），面板只负责加载
      }

      footer.style.position = "relative";
      footer.appendChild(menu);
    } catch (e) {
      console.error("Failed to show presets menu:", e);
    }
  }

  // 关闭面板
  closePanel() {
    try {
      this.closeMiniDialog();
      this.state.panelOpen = false;
      if (this.panelEl && this.panelEl.parentNode) {
        this.panelEl.parentNode.removeChild(this.panelEl);
      }
      this.panelEl = null;
    } catch (e) {
      console.error("Failed to close panel:", e);
    }
  }

  // 节点销毁时清理
  onRemoved() {
    try {
      this.closePanel();
      if (this.domWidget && Array.isArray(this.node.widgets)) {
        const i = this.node.widgets.indexOf(this.domWidget);
        if (i >= 0) this.node.widgets.splice(i, 1);
      }
    } catch (e) {
      console.warn("Failed to cleanup:", e);
    }
  }
}

// ==================== 注册节点 ====================
app.registerExtension({
  name: "MultiLoRA Loader v2",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    // nodeData.inputs 在某些 ComfyUI 版本里是 undefined，直接 .find 会抛异常
    // 导致整个 beforeRegisterNodeDef 失败 → 后续所有逻辑都不执行。
    // 这里完全不加 input（Python 端已经提供了 lora_stack）。
    if (!nodeData || nodeData.name !== "MultiLoraLoader") return;
    {
      const originalOnNodeCreated = nodeType.prototype.onNodeCreated;
      nodeType.prototype.onNodeCreated = function() {
        if (originalOnNodeCreated) {
          originalOnNodeCreated.call(this);
        }
        // 初始化扩展
        if (!this._multiLoraExt) {
          this._multiLoraExt = new MultiLoRALoader(this);
        }
      };

      // 覆盖 onRemoved 以清理
      const originalOnRemoved = nodeType.prototype.onRemoved;
      nodeType.prototype.onRemoved = function() {
        if (this._multiLoraExt) {
          this._multiLoraExt.onRemoved();
          this._multiLoraExt = null;
        }
        if (originalOnRemoved) {
          originalOnRemoved.call(this);
        }
      };
    }
  }
});

// ==================== 兜底：确保 hook 一定生效 ====================
// ComfyUI 的 beforeRegisterNodeDef 有时因扩展加载时序问题不会对我们的节点触发，
// 这里在页面就绪后强制检查一次并补包装（幂等，patch 过就跳过）。
function __ensureMultiLoraPatched() {
  try {
    const nt = (typeof LiteGraph !== "undefined" && LiteGraph.registered_node_types)
      ? LiteGraph.registered_node_types["MultiLoraLoader"] : null;
    if (!nt || !nt.prototype) return false;
    if (nt.prototype.__multiLoraPatched) return true;
    const orig = nt.prototype.onNodeCreated;
    nt.prototype.onNodeCreated = function () {
      try { if (typeof orig === "function") orig.apply(this, arguments); } catch (e) {}
      try {
        if (!this._multiLoraExt) this._multiLoraExt = new MultiLoRALoader(this);
      } catch (e) { console.error("[MultiLoRA] init failed:", e); }
    };
    nt.prototype.__multiLoraPatched = true;
    console.log("[MultiLoRA] 兜底包装已生效");
    return true;
  } catch (e) {
    console.error("[MultiLoRA] 兜底包装失败:", e);
    return false;
  }
}

// 多次尝试（ComfyUI 加载较慢，给足时间）
let __mlTries = 0;
const __mlTimer = setInterval(() => {
  __mlTries++;
  if (__ensureMultiLoraPatched() || __mlTries > 30) clearInterval(__mlTimer);
}, 1000);
// 页面已就绪时也立即试一次
if (document.readyState === "complete") setTimeout(__ensureMultiLoraPatched, 500);
