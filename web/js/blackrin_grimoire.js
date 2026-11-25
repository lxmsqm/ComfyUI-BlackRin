/**
 * BlackRin 魔导书 · 角色 / 画师标签面板
 * ======================================
 * 从 AstrBot 插件的「魔导书」迁移，只保留：角色 + 画师两个数据源、搜索、作品分类筛选、收藏。
 * 不包含：LLM 优化规则、随机池、预设、固定标签、词库编辑。
 *
 * 用法（任何节点都能接）：
 *     import { openGrimoire } from "./blackrin_grimoire.js";
 *     openGrimoire({ insert: text => insertToPrompt(text) });
 *
 * 数据来自后端 /blackrin/grimoire/*（grimoire/server.py），
 * 收藏存 ComfyUI 的 user/default/BlackRin/grimoire_stars.json。
 *
 * 交互（与魔导书一致 + 用户要求的两段式）：
 *   - 单击卡片     → 直接把标签插进提示词（光标处，无光标则追加末尾）
 *   - Shift + 单击 → 收进底部「已选」区，之后一次插入
 *   - ★ 角标       → 收藏 / 取消收藏；「只看收藏」在工具栏
 *   - 搜索框匹配 name / name_cn / tags，分类按作品精确筛选，50 条一页
 */

const ROUTE = "/blackrin/grimoire";
const PAGE_SIZE = 50;
const Z = 10060;

/** 统一图标：全部用线框 SVG + currentColor，跟着主题色走，不再用彩色 emoji */
const ICONS = {
    // 数据源
    user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5c0-4 3.4-6 7.5-6s7.5 2 7.5 6"/>',
    brush: '<path d="M14.5 3.5a2.1 2.1 0 013 3L8 16l-4 1 1-4 9.5-9.5z"/><path d="M13 6l2 2"/>',
    shirt: '<path d="M8.5 3.5L12 5.5l3.5-2 4 2.8-2.6 3.2v9.5h-9.8V9.5L4.5 6.3z"/>',
    wave: '<path d="M3 12c2.4-5 5.4 5 7.8 0s5.4 5 7.8 0"/><path d="M3 17c2.4-5 5.4 5 7.8 0s5.4 5 7.8 0"/>',
    pose: '<polyline points="21 12 17 12 14.5 20 9.5 4 7 12 3 12"/>',
    eye: '<path d="M1.8 12S6 5.8 12 5.8 22.2 12 22.2 12 18 18.2 12 18.2 1.8 12 1.8 12z"/><circle cx="12" cy="12" r="3"/>',
    body: '<rect x="7" y="3.2" width="10" height="17.6" rx="3.4"/><path d="M10 8.5h4"/><path d="M10 12h4"/>',
    portrait: '<rect x="3.2" y="3.6" width="17.6" height="16.8" rx="2.6"/><circle cx="12" cy="10.4" r="2.4"/><path d="M7 18c1.3-2.2 2.9-3.2 5-3.2s3.7 1 5 3.2"/>',
    // 卡片操作
    pin: '<path d="M12 16.5V21"/><path d="M9 10.4V5.2a1 1 0 011-1h4a1 1 0 011 1v5.2a2 2 0 00.6 1.4l1.6 1.5A1 1 0 0116.5 15h-9a1 1 0 01-.7-1.7l1.6-1.5a2 2 0 00.6-1.4z"/>',
    copy: '<rect x="8.6" y="2.6" width="6.8" height="3.6" rx="1.2"/><path d="M15.4 4.4H18a2 2 0 012 2v13a2 2 0 01-2 2H6a2 2 0 01-2-2v-13a2 2 0 012-2h2.6"/>',
    star: '<polygon points="12 2.8 14.9 8.7 21.4 9.6 16.7 14.2 17.8 20.7 12 17.6 6.2 20.7 7.3 14.2 2.6 9.6 9.1 8.7"/>',
    moon: '<path d="M20 14.5A8.2 8.2 0 019.5 4a8.4 8.4 0 1010.5 10.5z"/>',
    sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    library: '<path d="M4 5.5A1.5 1.5 0 015.5 4H9v16H5.5A1.5 1.5 0 014 18.5z"/><path d="M9 4h5.5A1.5 1.5 0 0116 5.5v13a1.5 1.5 0 01-1.5 1.5H9z"/><path d="M16 6.5l3.2-.8a1.2 1.2 0 011.5.9l2 12.6"/>',
    trash: '<path d="M4 7h16"/><path d="M9.5 7V5.2A1.2 1.2 0 0110.7 4h2.6a1.2 1.2 0 011.2 1.2V7"/><path d="M6.5 7l1 12.2A1.8 1.8 0 009.3 21h5.4a1.8 1.8 0 001.8-1.8L17.5 7"/><path d="M10.5 11v6M13.5 11v6"/>',
    bookmark: '<path d="M6 3.5h12a1 1 0 011 1V21l-7-4-7 4V4.5a1 1 0 011-1z"/>',
    palette: '<path d="M12 3a9 9 0 100 18h1.2a2.2 2.2 0 002.2-2.2 2 2 0 012-2h1.3A2.3 2.3 0 0021 14.5 9 9 0 0012 3z"/><circle cx="7.6" cy="11.4" r="1.05"/><circle cx="11.2" cy="7.6" r="1.05"/><circle cx="15.6" cy="9.2" r="1.05"/>',
    shuffle: '<polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>',
};

/** 图标 sprite：所有图标只定义一次，用 <use> 复用（50 张卡 × 3 按钮 = 150 次引用，别重复解析 path） */
function installIconSprite() {
    if (document.getElementById("bgi-sprite")) return;
    const holder = document.createElement("div");
    holder.id = "bgi-sprite";
    holder.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;visibility:hidden";
    holder.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg"><defs>${
        Object.entries(ICONS)
            .map(([key, body]) => `<symbol id="bgi-${key}" viewBox="0 0 24 24">${body}</symbol>`)
            .join("")
    }</defs></svg>`;
    document.body.append(holder);
}

const svgIcon = (name, size = 14, filled = false) =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="${filled ? "currentColor" : "none"}" `
    + `stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">`
    + `<use href="#bgi-${name}"/></svg>`;

// 随机按钮用内联 SVG（🎲 在部分字体下会被渲染成单色灰点，实测截图看不清）
const SHUFFLE_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" '
    + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    + '<polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>'
    + '<polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>'
    + '<line x1="4" y1="4" x2="9" y2="9"/></svg>';

// filter: 该源是否有「分类」可筛（角色有作品、服装有季节/类型；画师与头发没有）
const SOURCE_META = {
    characters: { label: "角色", icon: "user", filter: true },
    artists: { label: "画师", icon: "brush", filter: false },
    costume: { label: "服装", icon: "shirt", filter: true },
    hair: { label: "头发", icon: "wave", filter: false },
    pose: { label: "姿势", icon: "pose", filter: true },
    eyes: { label: "眼睛", icon: "eye", filter: false },
    body: { label: "体型", icon: "body", filter: false },
    portrait: { label: "人像", icon: "portrait", filter: true },
    styles: { label: "风格", icon: "palette", filter: true },
};

const sourceHasFilter = key => SOURCE_META[key]?.filter === true;

const state = {
    source: "characters",
    q: "",
    category: "",
    starOnly: false,
    page: 1,
    total: 0,
    items: [],
    categories: [],
    catSearch: "",
    catLimit: 160,          // 分类列表首屏只渲染这么多（3651 个全渲染会占 2 万+ DOM 节点）
    catFilter: "",
    collapsed: false,
    stars: { characters: [], artists: [] },
    pins: { characters: [], artists: [] },
    initialPins: null,          // 打开面板时由节点传进来的固定标签（来自 panel_state）
    onPinsChange: null,         // 固定变化后回写给节点
    // 常驻随机的源（源行 shuffle 按钮控制）：节点每次执行从这里各随机抽一条
    randomSources: new Set(),
    randomCategories: new Set(),
    randomCounts: new Map(),      // key（源 或 "源::分类"）→ 每次抽几个
    randomPicks: new Map(),       // key → "all" | "starred_only" | "exclude_starred"
    onRandomChange: null,
    sourceCounts: {},
    presets: {},
    insert: null,
    loading: false,
    searchTimer: null,
};

let dom = null;
let stylesInstalled = false;

/* ------------------------------------------------------------------ utils */

function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
        if (key === "class") node.className = value;
        else if (key === "style" && typeof value === "object") Object.assign(node.style, value);
        else if (key === "text") node.textContent = value;
        else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
        else if (value !== undefined && value !== null) node.setAttribute(key, value);
    }
    for (const child of children.flat()) {
        if (child == null) continue;
        node.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
    return node;
}

const THEME_KEY = "blackrin-grimoire-theme";
const LAYOUT_KEY = "blackrin-grimoire-layout";

/** 面板位置只活在本次 ComfyUI 会话里：拖到哪，关掉再开还在；ComfyUI 重启就回默认居中 */
let sessionPos = null;

/** 面板布局：窗口尺寸位置 + 卡片字号，跟着浏览器记 */
function readLayout() {
    try {
        const raw = localStorage.getItem(LAYOUT_KEY);
        const data = raw ? JSON.parse(raw) : null;
        return data && typeof data === "object" ? data : {};
    } catch {
        return {};
    }
}

function saveLayout(patch) {
    try {
        localStorage.setItem(LAYOUT_KEY, JSON.stringify({ ...readLayout(), ...patch }));
    } catch {}
}

const clampNum = (value, min, max) => Math.max(min, Math.min(max, value));

/**
 * 统一字号：卡片文字、左侧源列表、分类列表共用同一个基准，
 * 分类列表略小一点；侧栏宽度也跟着放宽，字号变大不会把名字挤没。
 */
function applyFontSize(size) {
    const px = clampNum(Number(size) || 11, 9, 18);
    const root = document.documentElement.style;
    root.setProperty("--bgs-card-fs", `${px}px`);
    root.setProperty("--bgs-cat-fs", `${Math.max(9, Math.round(px * 0.94))}px`);
    root.setProperty("--bgs-side-w", `${Math.round(212 + (px - 11) * 11)}px`);
}

function currentTheme() {
    try {
        return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
    } catch {
        return "dark";
    }
}

function applyTheme(theme) {
    document.documentElement.dataset.bgsTheme = theme === "light" ? "light" : "dark";
    try {
        localStorage.setItem(THEME_KEY, theme);
    } catch {}
    const btn = dom?.themeBtn;
    if (btn) {
        const light = theme === "light";
        btn.innerHTML = svgIcon(light ? "sun" : "moon", 14);
        btn.title = light ? "切换到深色" : "切换到浅色";
    }
}

function installStyles() {
    if (stylesInstalled) return;
    stylesInstalled = true;
    installIconSprite();
    const style = document.createElement("style");
    style.id = "blackrin-grimoire-style";
style.textContent = `
/* ===== 主题变量：默认深色；[data-bgs-theme="light"] 覆盖 ===== */
:root, [data-bgs-theme="dark"]{
  --bgs-bg:#0f1519;            /* 最深：图片/输入底 */
  --bgs-surface:#1a1d21;       /* 弹层底 */
  --bgs-head:#21262b;          /* 头部 */
  --bgs-card:#2a2a2a;          /* 卡片（与多 LoRA 节点一致） */
  --bgs-card-hover:#2d3a4a;
  --bgs-control:#262b31;       /* 控件底 */
  --bgs-control-hover:#313841;
  --bgs-border:#33383e;
  --bgs-border-soft:#2a2f35;
  --bgs-text:#e0e0e0;
  --bgs-text-sub:#9aa4ae;
  --bgs-text-dim:#6b7681;
  --bgs-accent:#4a9eff;        /* 主色：与多 LoRA 节拍一致 */
  --bgs-accent-soft:#1c3350;
  --bgs-accent-text:#8fc6ff;
  --bgs-pin:#e0a33c;           /* 固定 */
  --bgs-pin-soft:#2e2515;
  --bgs-pin-text:#ffd79a;
  --bgs-star:#ffc93c;
  --bgs-danger:#e05545;
  --bgs-shadow:0 18px 50px rgba(0,0,0,.6);
}
[data-bgs-theme="light"]{
  --bgs-bg:#eef1f5;
  --bgs-surface:#ffffff;
  --bgs-head:#f4f6f9;
  --bgs-card:#ffffff;
  --bgs-card-hover:#e8f1fe;
  --bgs-control:#f1f4f8;
  --bgs-control-hover:#e3e9f1;
  --bgs-border:#d3dae3;
  --bgs-border-soft:#e4e9ef;
  --bgs-text:#1f252b;
  --bgs-text-sub:#556170;
  --bgs-text-dim:#6b7684;
  --bgs-accent:#2f7fe0;
  --bgs-accent-soft:#dbe9fb;
  --bgs-accent-text:#1f6ac4;
  --bgs-pin:#b87400;
  --bgs-pin-soft:#fdf1dc;
  --bgs-pin-text:#8a5a00;
  --bgs-star:#d99e00;
  --bgs-danger:#c0392b;
  --bgs-shadow:0 18px 50px rgba(30,50,80,.22);
}
.bg-overlay{position:fixed;inset:0;z-index:${Z};display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.62);font:12px Arial,"Microsoft YaHei",sans-serif;color:var(--bgs-text)}
[data-bgs-theme="light"] .bg-overlay{background:rgba(30,45,60,.35)}
.bg-dialog{position:fixed;display:grid;grid-template-rows:auto minmax(0,1fr) auto;background:var(--bgs-surface);border:1px solid var(--bgs-border);border-radius:10px;box-shadow:var(--bgs-shadow);overflow:hidden}
/* 三个拖动把手：左下 / 右下 / 右上，拉多少就多大地儿 */
.bg-grip{position:absolute;width:16px;height:16px;z-index:30}
.bg-grip.rb{right:0;bottom:0;cursor:nwse-resize}
.bg-grip.lb{left:0;bottom:0;cursor:nesw-resize}
.bg-grip.rt{right:0;top:0;cursor:nesw-resize}
.bg-grip:after{content:"";position:absolute;right:3px;bottom:3px;width:7px;height:7px;border-right:2px solid var(--bgs-text-dim);border-bottom:2px solid var(--bgs-text-dim);opacity:.55;transform:rotate(0deg)}
.bg-grip.rt:after{right:3px;top:3px;bottom:auto;border-right:2px solid var(--bgs-text-dim);border-bottom:0;border-top:2px solid var(--bgs-text-dim);}
.bg-grip:hover:after{opacity:1;border-color:var(--bgs-accent)}
.bg-head{display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--bgs-head);border-bottom:1px solid var(--bgs-border);cursor:grab;user-select:none;touch-action:none}
.bg-head.dragging{cursor:grabbing}
.bg-head button{cursor:pointer}
.bg-title{font-size:13px;color:var(--bgs-text);margin-right:4px;white-space:nowrap}
.bg-tab{height:26px;padding:0 14px;border:1px solid var(--bgs-border);border-radius:6px;background:var(--bgs-control);color:var(--bgs-text);font-size:12px;cursor:pointer;white-space:nowrap}
.bg-tab.active{background:var(--bgs-accent);border-color:var(--bgs-accent);color:#fff;font-weight:600}
.bg-theme,.bg-close,.bg-fs{margin-left:auto;width:26px;height:26px;border:1px solid var(--bgs-border);border-radius:6px;background:var(--bgs-control);color:var(--bgs-text-sub);font-size:13px;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.bg-close,.bg-fs{margin-left:0}
.bg-theme:hover,.bg-close:hover,.bg-fs:hover{background:var(--bgs-control-hover);color:var(--bgs-text)}
.bg-fs{font-size:11px;font-weight:700}
.bg-fs-group{display:flex;gap:4px;margin-left:auto}
/* 左侧数据源 */
.bg-srcs{display:flex;flex-direction:column;gap:2px;padding:0 0 6px;margin:0 0 4px;border-bottom:1px solid var(--bgs-border-soft)}
.bg-src{display:flex;align-items:stretch;border-radius:6px}
.bg-src.on{background:var(--bgs-accent-soft);box-shadow:inset 2px 0 0 var(--bgs-accent)}
.bg-src-main{flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:6px;padding:5px 6px;border:0;border-radius:6px 0 0 6px;background:transparent;color:var(--bgs-text);font-family:Arial,"Microsoft YaHei",sans-serif;font-size:var(--bgs-card-fs,11px);text-align:left;cursor:pointer;white-space:nowrap;overflow:hidden}
.bg-src.on .bg-src-main{color:var(--bgs-accent-text);font-weight:600}
.bg-src-main:hover{background:var(--bgs-control-hover)}
.bg-src-ico{flex:0 0 auto;font-size:12px;line-height:1}
.bg-src-name{overflow:hidden;text-overflow:ellipsis}
.bg-src-count{margin-left:auto;padding-left:6px;color:var(--bgs-text-dim);font-size:calc(var(--bgs-card-fs,11px) * 0.9);font-weight:400;flex:0 0 auto}
.bg-src.on .bg-src-count{color:var(--bgs-accent-text)}
.bg-src-rand{flex:0 0 auto;width:26px;padding:0;border:0;border-radius:0 6px 6px 0;background:transparent;color:var(--bgs-text-dim);opacity:.55;font-size:12px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:opacity .12s,color .12s,background .12s}
.bg-src:hover .bg-src-rand{opacity:1}
.bg-src-rand:hover{background:var(--bgs-accent-soft);color:var(--bgs-accent);opacity:1}
.bg-src-rand.on{background:var(--bgs-accent-soft);color:var(--bgs-accent);box-shadow:inset 0 0 0 1px var(--bgs-accent)}
/* 随机池的「收藏范围」星标：只有开随机时才出现，点了循环 全部→只抽收藏→排除收藏 */
.bg-pick{flex:0 0 auto;width:20px;height:22px;padding:0;border:1px solid transparent;border-radius:4px;background:transparent;color:var(--bgs-text-dim);cursor:pointer;display:none;align-items:center;justify-content:center}
.bg-pick.show{display:flex}
.bg-pick:hover{background:var(--bgs-accent-soft);color:var(--bgs-accent)}
.bg-pick.on{color:var(--bgs-star);border-color:var(--bgs-star)}
.bg-pick.exclude{color:var(--bgs-danger);border-color:var(--bgs-danger)}
.bg-cat .bg-pick{width:16px;height:16px}
.bg-src.rand .bg-src-main{color:var(--bgs-accent)}
.bg-src.sub-rand{box-shadow:inset 0 0 0 1px var(--bgs-accent)}
.bg-sub-badge{flex:0 0 auto;display:inline-flex;align-items:center;gap:2px;margin-left:4px;padding:0 5px;height:15px;border-radius:8px;background:var(--bgs-accent-soft);color:var(--bgs-accent-text);font:9px/15px Arial,sans-serif}
/* 数据源行上的固定角标（金色，与随机角标区分） */
.bg-pin-badge-inline{flex:0 0 auto;display:inline-flex;align-items:center;gap:2px;margin-left:4px;padding:0 5px;height:15px;border-radius:8px;background:var(--bgs-pin-soft);color:var(--bgs-pin-text);font:9px/15px Arial,sans-serif;font-weight:700}
.bg-pin-badge-inline svg,.bg-sub-badge svg{display:block}
.bg-src.has-pin .bg-src-main{color:var(--bgs-pin-text)}
.bg-src.has-pin .bg-src-ico{color:var(--bgs-pin)}
.bg-rand-hint{color:var(--bgs-accent-text);font-size:10px;white-space:nowrap;padding:0 2px}
.bg-body{display:grid;grid-template-columns:var(--bgs-side-w,212px) var(--bgs-catside-w,200px) minmax(0,1fr);min-height:0}
/* 子分类独立竖列（数据源右边，PC 空间大就竖着列） */
.bg-catside{display:flex;flex-direction:column;min-height:0;min-width:0;border-right:1px solid var(--bgs-border-soft);background:var(--bgs-surface);padding:0 8px 4px}
/* 无分类的源（画师/头发/眼睛/体型）：分类列整列消失，网格要同步改成两列，
   否则内容区会落到 200px 的列里，卡片被挤成一条 */
.bg-body.no-cat{grid-template-columns:var(--bgs-side-w,212px) minmax(0,1fr)}
.bg-catside .bg-cat-search{width:100%;box-sizing:border-box;margin:0 0 6px;padding:5px 7px;border:1px solid var(--bgs-border);border-radius:5px;background:var(--bgs-control);color:var(--bgs-text);font-family:Arial,sans-serif;font-size:var(--bgs-cat-fs,11px);outline:none}
.bg-catside .bg-cat-search:focus{border-color:var(--bgs-accent)}
.bg-side{display:flex;flex-direction:column;min-height:0;border-right:1px solid var(--bgs-border-soft);background:var(--bgs-surface);padding:0 9px 4px}
.bg-side-head{padding:8px 0 6px;color:var(--bgs-text-sub);font-size:calc(var(--bgs-cat-fs,11px) * 0.95);display:flex;align-items:center;gap:6px}
.bg-side-head .bg-count{margin-left:auto;color:var(--bgs-text-dim)}
.bg-cat-search{width:100%;box-sizing:border-box;margin:0 0 6px;padding:5px 7px;border:1px solid var(--bgs-border);border-radius:5px;background:var(--bgs-control);color:var(--bgs-text);font-family:Arial,sans-serif;font-size:var(--bgs-cat-fs,11px)}
.bg-cat-search:focus{outline:none;border-color:var(--bgs-accent)}
.bg-cat-list{flex:1 1 auto;min-height:0;overflow:auto;padding:0}
.bg-cat{display:flex;align-items:center;gap:6px;width:100%;box-sizing:border-box;padding:4px 7px;margin:1px 0;border:0;border-radius:5px;background:transparent;color:var(--bgs-text);font-family:Arial,sans-serif;font-size:var(--bgs-cat-fs,11px);text-align:left;cursor:pointer;white-space:nowrap;overflow:hidden}
.bg-cat:hover{background:var(--bgs-control-hover)}
.bg-cat.active{background:var(--bgs-accent-soft);color:var(--bgs-accent-text)}
.bg-cat-rand{flex:0 0 auto;width:17px;height:17px;padding:0;border:0;border-radius:4px;background:transparent;color:var(--bgs-text-dim);cursor:pointer;opacity:.42;display:flex;align-items:center;justify-content:center;transition:opacity .12s,color .12s,background .12s}
.bg-cat:hover .bg-cat-rand{opacity:1;color:var(--bgs-text-sub);background:var(--bgs-control-hover)}
.bg-cat-rand:hover{opacity:1!important;background:var(--bgs-accent-soft);color:var(--bgs-accent)}
.bg-cat.rand{background:var(--bgs-accent-soft);color:var(--bgs-accent-text)}
/* 「有固定 / 开随机」的分类：置顶后加一层浅色底和左侧条，一眼能看到 */
.bg-cat.hot{background:color-mix(in oklab, var(--bgs-accent) 10%, transparent);box-shadow:inset 2px 0 0 var(--bgs-accent)}
.bg-cat.has-pin .bg-cat-rand{opacity:.85}
.bg-cat-pin{flex:0 0 auto;display:flex;align-items:center;color:var(--bgs-pin)}
.bg-cat.has-pin{background:color-mix(in oklab, var(--bgs-pin) 14%, transparent);box-shadow:inset 2px 0 0 var(--bgs-pin)}
.bg-cat.has-pin .bg-cat-name{color:var(--bgs-pin-text);font-weight:600}
.bg-cat.rand .bg-cat-rand,.bg-cat-rand.on{opacity:1;color:var(--bgs-accent)}
.bg-cat-name{overflow:hidden;text-overflow:ellipsis}
.bg-cat-count{margin-left:auto;color:var(--bgs-text-dim);font-size:calc(var(--bgs-cat-fs,11px) * 0.9);flex:0 0 auto}
.bg-cat.active .bg-cat-count,.bg-cat.rand .bg-cat-count{color:var(--bgs-accent-text)}
.bg-cat-empty{padding:8px;color:var(--bgs-text-dim);font-size:11px}
.bg-cat-more{width:100%;margin:3px 0 2px;padding:5px 7px;border:1px dashed var(--bgs-border);border-radius:5px;background:transparent;color:var(--bgs-text-sub);font-family:Arial,sans-serif;font-size:calc(var(--bgs-cat-fs,11px) * 0.95);cursor:pointer}
.bg-cat-more:hover{background:var(--bgs-control-hover);color:var(--bgs-accent);border-color:var(--bgs-accent)}
.bg-side,.bg-main,.bg-grid{min-width:0}
/* 右侧 */
.bg-main{position:relative;display:grid;grid-template-rows:auto minmax(0,1fr);min-height:0}
/* 子分类横向筛选条（从左侧栏搬过来的）：可左右滚动，占用搜索栏下方一整行 */
.bg-catbar{display:flex;align-items:center;gap:5px;padding:6px 10px;border-bottom:1px solid var(--bgs-border-soft);overflow:hidden;max-height:52px;flex-wrap:nowrap}
/* 条内的分类列表本身也要横向排（否则每个 chip 独占一行，会把内容区撑爆） */
.bg-catbar .bg-cat-list{display:flex;flex:1 1 auto;min-width:0;gap:5px;overflow-x:auto;overflow-y:hidden;padding:0}
.bg-catbar .bg-cat-list::-webkit-scrollbar{height:6px}
.bg-catbar::-webkit-scrollbar{height:6px}
.bg-catbar .bg-cat{flex:0 0 auto;width:auto;max-width:none;padding:4px 9px;border:1px solid var(--bgs-border);border-radius:12px;background:var(--bgs-control)}
.bg-catbar .bg-cat:hover{background:var(--bgs-control-hover)}
.bg-catbar .bg-cat.active{background:var(--bgs-accent-soft);border-color:var(--bgs-accent);color:var(--bgs-accent-text)}
.bg-catbar .bg-cat.rand{background:var(--bgs-accent-soft);border-color:var(--bgs-accent);color:var(--bgs-accent-text)}
.bg-catbar .bg-cat.hot{border-color:var(--bgs-accent);box-shadow:none;background:color-mix(in oklab, var(--bgs-accent) 12%, transparent)}
.bg-catbar .bg-cat-pin{display:flex;align-items:center}
.bg-catbar .bg-cat-more{flex:0 0 auto;width:auto;margin:0;padding:4px 9px;border-radius:12px;white-space:nowrap}
.bg-catbar-search{flex:0 0 104px;width:104px;box-sizing:border-box;padding:4px 7px;border:1px solid var(--bgs-border);border-radius:12px;background:var(--bgs-control);color:var(--bgs-text);font-family:Arial,sans-serif;font-size:calc(var(--bgs-cat-fs,11px) * 0.95);outline:none}
.bg-catbar-search:focus{border-color:var(--bgs-accent)}
.bg-catbar-empty{color:var(--bgs-text-dim);font-size:11px;padding:0 4px;white-space:nowrap}
.bg-tools{display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid var(--bgs-border-soft);flex-wrap:wrap}
.bg-q{flex:1 1 200px;min-width:120px;box-sizing:border-box;padding:6px 9px;border:1px solid var(--bgs-border);border-radius:6px;background:var(--bgs-control);color:var(--bgs-text);font:12px Arial,sans-serif;outline:none}
.bg-q:focus{border-color:var(--bgs-accent)}
.bg-btn{height:27px;padding:0 10px;border:1px solid var(--bgs-border);border-radius:6px;background:var(--bgs-control);color:var(--bgs-text);font-size:11px;cursor:pointer;white-space:nowrap}
.bg-btn:hover{background:var(--bgs-control-hover)}
.bg-btn.on{background:var(--bgs-accent);border-color:var(--bgs-accent);color:#fff;font-weight:600}
.bg-btn:disabled{opacity:.45;cursor:not-allowed}
.bg-btn{display:inline-flex;align-items:center;gap:4px}
.bg-btn svg{display:block}
.bg-star-btn span{white-space:nowrap}
/* 预设浮层 */
.bg-preset-pop{position:absolute;right:6px;top:calc(100% + 4px);z-index:40;width:280px;max-height:min(420px,70vh);display:none;flex-direction:column;background:var(--bgs-surface);border:1px solid var(--bgs-border);border-radius:8px;box-shadow:var(--bgs-shadow);overflow:hidden}
.bg-preset-pop.open{display:flex}
.bg-preset-head{padding:8px 10px;border-bottom:1px solid var(--bgs-border-soft);color:var(--bgs-text);font-size:12px;font-weight:600}
.bg-preset-list{flex:1 1 auto;min-height:0;overflow:auto;padding:4px}
.bg-preset-row{display:flex;align-items:center;gap:6px;padding:5px 7px;border-radius:6px;cursor:pointer}
.bg-preset-row:hover{background:var(--bgs-control-hover)}
.bg-preset-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--bgs-text);font-size:12px}
.bg-preset-meta{flex:0 0 auto;color:var(--bgs-text-dim);font-size:10px}
.bg-preset-del{flex:0 0 auto;width:20px;height:20px;padding:0;border:1px solid var(--bgs-border);border-radius:4px;background:var(--bgs-control);color:var(--bgs-text-dim);cursor:pointer;display:flex;align-items:center;justify-content:center}
.bg-preset-del:hover{background:var(--bgs-danger);border-color:var(--bgs-danger);color:#fff}
.bg-preset-empty{padding:14px 8px;color:var(--bgs-text-dim);font-size:11px;text-align:center}
.bg-preset-save{display:flex;gap:6px;padding:8px;border-top:1px solid var(--bgs-border-soft);background:var(--bgs-head)}
.bg-preset-save input{flex:1 1 auto;min-width:0;padding:5px 7px;border:1px solid var(--bgs-border);border-radius:5px;background:var(--bgs-control);color:var(--bgs-text);font-size:11px;outline:none}
.bg-preset-save input:focus{border-color:var(--bgs-accent)}
.bg-preset-save button{flex:0 0 auto;padding:0 10px;height:26px;border:1px solid var(--bgs-accent);border-radius:5px;background:var(--bgs-accent-soft);color:var(--bgs-accent-text);font-size:11px;cursor:pointer}
.bg-total{color:var(--bgs-text-sub);font-size:11px;white-space:nowrap;margin-left:auto}
/* 卡片网格（对齐多 LoRA 节点的 ml-card） */
.bg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(var(--bgs-card-min,200px),1fr));grid-auto-rows:max-content;gap:12px;padding:10px;overflow:auto;align-content:start;min-height:0}
/* 卡片排版照魔导书 .grm-gallery-card：细边框、hover 主色、固定外发光、收藏淡金底 */
.bg-card{display:flex;flex-direction:column;background:var(--bgs-card);border:1px solid var(--bgs-border);border-radius:8px;overflow:hidden;min-width:0;user-select:none;transition:border-color .15s,background .15s;position:relative}
.bg-card:hover{border-color:var(--bgs-accent)}
.bg-card.cur{border-color:var(--bgs-accent)}
.bg-card.picked{box-shadow:0 0 0 2px var(--bgs-pin)}
.bg-card.pinned{box-shadow:0 0 0 2px var(--bgs-pin)}
.bg-card.starred{box-shadow:0 0 0 2px var(--bgs-star);background:color-mix(in oklab, var(--bgs-star) 8%, var(--bgs-card))}
.bg-card-img{position:relative;width:100%;padding-top:150%;overflow:hidden;background:var(--bgs-bg);flex:0 0 auto}
.bg-card-img img{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:cover;transition:transform .18s ease}
.bg-card-img:hover img{transform:scale(1.06)}
.bg-card-ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--bgs-text-dim);font-size:20px}
.bg-card-name{flex:0 0 auto;padding:6px 8px 2px;color:var(--bgs-text);font-size:calc(var(--bgs-card-fs,11px) * 1.12);font-weight:500;line-height:1.35;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-top:0}
.bg-card-name small{display:block;margin-top:2px;color:var(--bgs-text-sub);font-size:calc(var(--bgs-card-fs,11px) * 0.82);font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bg-card.noimg .bg-card-name{padding:16px 10px;min-height:84px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;font-size:14px;line-height:1.35;border-top:0;cursor:pointer}
.bg-card.noimg .bg-card-name small{font-size:10px;margin-top:5px;color:var(--bgs-text-sub);white-space:normal}
.bg-card-actions{flex:0 0 auto;display:flex;justify-content:center;gap:6px;padding:2px 8px 8px;background:transparent}
.bg-act{width:22px;height:22px;padding:0;border:1px solid transparent;border-radius:5px;background:transparent;color:var(--bgs-text-sub);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .12s,color .12s}
.bg-act:hover{background:var(--bgs-control-hover);color:var(--bgs-text)}
.bg-act.on{color:var(--bgs-pin);background:var(--bgs-pin-soft);border-color:var(--bgs-pin)}
.bg-act.on.star{color:var(--bgs-star);background:color-mix(in oklab, var(--bgs-star) 16%, transparent);border-color:var(--bgs-star)}
.bg-act.on.star{color:var(--bgs-star)}
.bg-act svg{pointer-events:none;display:block}
.bg-src-ico{display:flex;align-items:center;justify-content:center;flex:0 0 auto;color:var(--bgs-text-sub);transition:color .12s}
.bg-src-ico svg{display:block}
.bg-src.on .bg-src-ico,.bg-src.rand .bg-src-ico{color:var(--bgs-accent)}
/* 滚动条跟随主题（原先跟着系统默认，浅色主题里是黑条） */
.bg-overlay *{scrollbar-width:thin;scrollbar-color:var(--bgs-border) transparent}
.bg-overlay ::-webkit-scrollbar{width:9px;height:9px}
.bg-overlay ::-webkit-scrollbar-track{background:transparent}
.bg-overlay ::-webkit-scrollbar-thumb{background:var(--bgs-border);border-radius:5px;border:2px solid transparent;background-clip:content-box}
.bg-overlay ::-webkit-scrollbar-thumb:hover{background:var(--bgs-text-dim);background-clip:content-box}
.bg-overlay ::-webkit-scrollbar-corner{background:transparent}
.bg-pin-badge{position:absolute;left:4px;top:4px;z-index:4;display:flex;align-items:center;gap:3px;height:18px;padding:0 5px;border-radius:5px;background:var(--bgs-pin);color:#2a1c04;font:9px/18px Arial,"Microsoft YaHei",sans-serif;font-weight:700;box-shadow:0 1px 4px rgba(0,0,0,.35)}
.bg-pin-badge svg{display:block}
.bg-check{position:absolute;left:4px;top:4px;width:15px;height:15px;border-radius:4px;border:1px solid var(--bgs-border);background:rgba(10,20,28,.6);z-index:3;display:none;align-items:center;justify-content:center;font:10px/1 Arial,sans-serif;color:#04141c}
.bg-card.picked .bg-check{display:flex;background:var(--bgs-pin);border-color:var(--bgs-pin)}
.bg-hover{position:fixed;z-index:${Z + 5};display:none;pointer-events:none;padding:4px;background:var(--bgs-surface);border:1px solid var(--bgs-accent);border-radius:8px;box-shadow:var(--bgs-shadow)}
.bg-hover.show{display:block}
.bg-hover img{display:block;width:300px;height:300px;object-fit:contain;border-radius:5px;background:var(--bgs-bg)}
.bg-hover-cap{margin-top:3px;max-width:300px;color:var(--bgs-text);font-size:10px;line-height:1.3;text-align:center;word-break:break-all}
.bg-empty{grid-column:1/-1;display:flex;align-items:center;justify-content:center;height:180px;color:var(--bgs-text-dim);font-size:12px}
/* 底栏 */
.bg-foot{display:flex;align-items:center;gap:7px;padding:7px 10px;border-top:1px solid var(--bgs-border);background:var(--bgs-head);flex-wrap:wrap}
.bg-pager{display:flex;align-items:center;gap:5px;margin-left:auto;color:var(--bgs-text-sub);font-size:11px}
.bg-pager input{width:48px;box-sizing:border-box;padding:3px 5px;border:1px solid var(--bgs-border);border-radius:4px;background:var(--bgs-control);color:var(--bgs-text);font:11px Arial,sans-serif;text-align:center}
.bg-selwrap{display:flex;align-items:center;gap:5px;flex:1 1 260px;min-width:0;flex-wrap:wrap}
.bg-chip{display:inline-flex;align-items:center;gap:4px;max-width:200px;padding:2px 5px 2px 7px;border:1px solid var(--bgs-border);border-radius:10px;background:var(--bgs-control);color:var(--bgs-text);font-size:10px}
.bg-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bg-chip button{border:0;background:transparent;color:var(--bgs-text-dim);font:11px/1 Arial,sans-serif;cursor:pointer;padding:0}
.bg-chip button:hover{color:var(--bgs-danger)}
.bg-sel-hint{color:var(--bgs-text-dim);font-size:10px}
.bg-toast{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);padding:6px 12px;border-radius:6px;background:var(--bgs-accent);color:#fff;font-size:11px;pointer-events:none;opacity:0;transition:opacity .18s;box-shadow:0 6px 18px rgba(0,0,0,.35)}
.bg-toast.show{opacity:1}
@media (max-width:760px){
  .bg-body{grid-template-columns:minmax(0,1fr);grid-template-rows:auto auto minmax(0,1fr)}
  .bg-side{border-right:0;border-bottom:1px solid var(--bgs-border-soft);max-height:196px;min-width:0}
  .bg-catside{border-right:0;border-bottom:1px solid var(--bgs-border-soft);max-height:150px}
  .bg-body.no-cat{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr)}
  .bg-cat-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3px}
  .bg-cat{width:100%;max-width:none}
  .bg-grid{grid-template-columns:repeat(auto-fill,minmax(88px,1fr))}
}
`;
    document.head.append(style);
}

async function fetchJSON(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json();
}

function toast(text) {
    if (!dom) return;
    dom.toast.textContent = text;
    dom.toast.classList.add("show");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => dom.toast.classList.remove("show"), 1400);
}

/* --------------------------------------------------------------- 数据接口 */

async function loadCategories() {
    state.categories = [];
    state.catSearch = "";
    state.catFilter = "";
    if (!sourceHasFilter(state.source)) return;
    try {
        const data = await fetchJSON(`${ROUTE}/categories?source=${encodeURIComponent(state.source)}`);
        state.categories = data?.ok ? data.categories_cn || [] : [];
    } catch (error) {
        console.warn("[BlackRin 魔导书] 分类加载失败", error);
    }
}

async function loadStars() {
    try {
        const data = await fetchJSON(`${ROUTE}/stars`);
        if (data?.ok && data.stars) {
            state.stars = {
                characters: Array.isArray(data.stars.characters) ? data.stars.characters : [],
                artists: Array.isArray(data.stars.artists) ? data.stars.artists : [],
            };
        }
    } catch (error) {
        console.warn("[BlackRin 魔导书] 收藏加载失败", error);
    }
}

/** 固定标签现在存在节点自己的 panel_state 里（随工作流保存），这里只做本地初始化 */
async function loadPins() {
    const all = state.initialPins && typeof state.initialPins === "object" ? state.initialPins : {};
    state.pins = {};
    for (const key of Object.keys(SOURCE_META)) {
        state.pins[key] = Array.isArray(all[key]) ? all[key] : [];
    }
    syncPinnedCategories();
    if (dom?.sources) renderSources();
}

async function savePins() {
    try {
        state.onPinsChange?.(state.pins);
    } catch (error) {
        console.warn("[BlackRin 魔导书] 固定标签回写失败", error);
    }
}

/** 把「当前源下哪些作品分类有固定标签」算出来，供左侧分类列表置顶/标记 */
function syncPinnedCategories() {
    const set = new Set();
    for (const row of state.pins[state.source] || []) {
        const cat = row.category || "";
        if (cat) set.add(cat.toLowerCase());
    }
    state.pinnedCategories = set;
}

function isPinned(item, source = state.source) {
    const list = state.pins[source] || [];
    const low = item.name.toLowerCase();
    return list.some(row => (row.name || "").toLowerCase() === low);
}

async function togglePin(item) {
    const source = state.source;
    const list = state.pins[source] || (state.pins[source] = []);
    const low = item.name.toLowerCase();
    const index = list.findIndex(row => (row.name || "").toLowerCase() === low);
    if (index >= 0) list.splice(index, 1);
    else list.unshift({
        name: item.name,
        tags: item.tags || "",
        weight: 1,
        // 顺手把展示用的信息也存进来，状态条就不用回服务端查了
        name_cn: item.name_cn || item.name,
        image_url: item.image_url || "",
        category: item.category || "",
    });
    renderCards();
    syncPinnedCategories();
    renderSources();
    renderSide();
    await savePins();
    // 固定会影响置顶顺序，重新拉一次让固定项回到最前（保持当前页）
    refreshData();
}

/* ---------------- 预设：保存/应用/删除「固定标签 + 随机范围」 ---------------- */

async function loadPresets() {
    try {
        const data = await fetchJSON(`${ROUTE}/presets`);
        state.presets = (data && data.ok && data.presets) || {};
    } catch (error) {
        console.warn("[BlackRin 魔导书] 预设加载失败", error);
        state.presets = {};
    }
    renderPresets();
}

function renderPresets() {
    if (!dom?.presetList) return;
    const names = Object.keys(state.presets || {}).sort();
    dom.presetList.innerHTML = "";
    if (!names.length) {
        dom.presetList.append(el("div", { class: "bg-preset-empty" }, "还没有预设：先在下面输入名字保存"));
        return;
    }
    for (const name of names) {
        const item = state.presets[name] || {};
        const pinCount = Object.values(item.pins || {}).reduce((n, rows) => n + (rows?.length || 0), 0);
        const scopeCount = (item.scopes || []).length;
        const del = el("button", {
            class: "bg-preset-del",
            title: "删除该预设",
            onclick: async event => {
                event.stopPropagation();
                await deletePreset(name);
            },
        });
        del.innerHTML = svgIcon("trash", 11);
        dom.presetList.append(el("div", {
            class: "bg-preset-row",
            title: `固定 ${pinCount} 条 · 随机 ${scopeCount} 个范围 —— 点击应用`,
            onclick: () => applyPreset(name),
        },
            el("span", { class: "bg-preset-name" }, name),
            el("span", { class: "bg-preset-meta" }, `${pinCount}📌 ${scopeCount}🎲`),
            del));
    }
}

async function applyPreset(name) {
    const item = state.presets?.[name];
    if (!item) return;
    // 固定标签存在节点自己的 panel_state 里（工作流隔离），所以这里改本地状态 + 回写节点，
    // 不能再 POST /pins（那是旧的全局接口，写进去没人读）
    state.pins = {};
    for (const key of Object.keys(SOURCE_META)) {
        const rows = item.pins?.[key];
        state.pins[key] = Array.isArray(rows)
            ? rows.map(row => ({ ...row, weight: Number(row.weight ?? 1) }))
            : [];
    }
    syncPinnedCategories();
    try {
        await savePins();          // → state.onPinsChange → 节点写 panel_state
    } catch (error) {
        console.warn("[BlackRin 魔导书] 预设写回固定失败", error);
    }
    state.randomSources = new Set();
    state.randomCategories = new Set();
    state.randomCounts = new Map();
    state.randomPicks = new Map();
    for (const scope of item.scopes || []) {
        if (!scope?.source) continue;
        const count = Math.max(1, Math.min(20, Number(scope.count) || 1));
        const pick = ["all", "starred_only", "exclude_starred"].includes(scope.pick) ? scope.pick : "all";
        if (scope.category) {
            const key = `${scope.source}::${scope.category}`;
            state.randomCategories.add(key);
            state.randomCounts.set(key, count);
            state.randomPicks.set(key, pick);
        } else {
            state.randomSources.add(scope.source);
            state.randomCounts.set(scope.source, count);
            state.randomPicks.set(scope.source, pick);
        }
    }
    emitRandomChange();
    renderSide();
    renderSources();
    renderRandomHint();
    toast(`已应用预设：${name}`);
    togglePresetPop(false);
}

async function savePreset(name) {
    const clean = String(name || "").trim();
    if (!clean) {
        toast("先给预设起个名字");
        return;
    }
    const scopes = [];
    for (const key of state.randomSources) {
        scopes.push({ source: key, category: "", count: state.randomCounts.get(key) || 1, pick: state.randomPicks.get(key) || "all" });
    }
    for (const scope of state.randomCategories) {
        const [key, cat] = scope.split("::");
        scopes.push({ source: key, category: cat, count: state.randomCounts.get(scope) || 1, pick: state.randomPicks.get(scope) || "all" });
    }
    try {
        const data = await fetchJSON(`${ROUTE}/presets`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: clean, pins: state.pins || {}, scopes }),
        });
        if (!data?.ok) throw new Error(data?.error || "保存失败");
        await loadPresets();
        if (dom?.presetNameInput) dom.presetNameInput.value = "";
        toast(`已保存预设：${clean}`);
    } catch (error) {
        console.warn("[BlackRin 魔导书] 保存预设失败", error);
        toast("保存预设失败");
    }
}

async function deletePreset(name) {
    try {
        await fetchJSON(`${ROUTE}/presets/delete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
        });
        await loadPresets();
        toast(`已删除预设：${name}`);
    } catch (error) {
        console.warn("[BlackRin 魔导书] 删除预设失败", error);
        toast("删除预设失败");
    }
}

function togglePresetPop(force) {
    if (!dom?.presetPop) return;
    const open = force != null ? force : !dom.presetPop.classList.contains("open");
    dom.presetPop.classList.toggle("open", open);
    if (open) loadPresets();
}

/** 复制 tags 到剪贴板（http 非安全上下文没有 clipboard API，走 textarea 兜底） */
function copyTags(item) {
    const text = composeText(item);
    if (!text) {
        toast("没有可复制的标签");
        return;
    }
    const fallback = () => {
        try {
            const area = document.createElement("textarea");
            area.value = text;
            area.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
            document.body.append(area);
            area.select();
            document.execCommand("copy");
            area.remove();
            toast(`已复制 ${item.name_cn || item.name}`);
        } catch (error) {
            console.warn("[BlackRin 魔导书] 复制失败", error);
            toast("复制失败");
        }
    };
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            toast(`已复制 ${item.name_cn || item.name}`);
        }).catch(fallback);
    } else {
        fallback();
    }
}

async function saveStars() {
    const name = state.source;
    try {
        await fetchJSON(`${ROUTE}/stars`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source: name, stars: state.stars[name] }),
        });
    } catch (error) {
        console.warn("[BlackRin 魔导书] 收藏保存失败", error);
        toast("收藏保存失败");
    }
}

async function refreshData() {
    if (state.loading) return;
    state.loading = true;
    renderCards();
    const params = new URLSearchParams({
        source: state.source,
        page: String(state.page),
        pageSize: String(PAGE_SIZE),
    });
    if (state.q) params.set("q", state.q);
    if (state.category) params.set("category", state.category);
    if (state.starOnly) {
        const names = state.stars[state.source] || [];
        if (!names.length) {
            state.items = [];
            state.total = 0;
            state.loading = false;
            renderCards();
            renderPager();
            return;
        }
        params.set("stars_only", names.join(","));
    }
    // 置顶顺序：固定 > 收藏 > 其余（后端在分页前重排，跨页有效）
    const pinNames = (state.pins[state.source] || []).map(row => row.name).filter(Boolean);
    const starNames = (state.stars[state.source] || []).filter(name =>
        !pinNames.some(pin => pin.toLowerCase() === name.toLowerCase()));
    const preferred = [...pinNames, ...starNames];
    if (preferred.length) params.set("preferred", preferred.join(","));
    try {
        const data = await fetchJSON(`${ROUTE}/data?${params.toString()}`);
        if (!data?.ok) throw new Error(data?.error || "加载失败");
        state.items = data.items || [];
        state.total = data.total || 0;
        // 越界（例如删词后页码超出）回退一页重试一次
        if (!state.items.length && state.total > 0 && state.page > 1) {
            state.page = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
            state.loading = false;
            return refreshData();
        }
    } catch (error) {
        console.warn("[BlackRin 魔导书] 数据加载失败", error);
        state.items = [];
        state.total = 0;
        toast("数据加载失败");
    } finally {
        state.loading = false;
        renderCards();
        renderPager();
    }
}

/* ------------------------------------------------------------------ 组合 */

function isStarred(item) {
    const list = state.stars[state.source] || [];
    const low = item.name.toLowerCase();
    return list.some(name => name.toLowerCase() === low);
}

/** 逗号分隔去重（大小写不敏感，保持首次出现顺序） */
function dedupeTags(text) {
    const seen = new Set();
    const out = [];
    for (const raw of String(text || "").split(",")) {
        const tag = raw.trim();
        if (!tag) continue;
        const key = tag.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(tag);
    }
    return out.join(", ");
}

/**
 * 组装要插入的文本。
 * 「固定标签」在插入时自动附带（两个数据源的固定都带），所以固定一个画师之后，
 * 抽/点任何角色都会自动带上那个 @画师；被插入的条目自己不会重复出现。
 */
function composeText(item, source = state.source) {
    const parts = [];
    for (const key of Object.keys(state.pins)) {
        for (const row of state.pins[key] || []) {
            if (!row.tags) continue;
            if ((row.name || "").toLowerCase() === item.name.toLowerCase()) continue;
            parts.push(row.tags);
        }
    }
    parts.push((item.tags || "").trim());
    return dedupeTags(parts.join(", "));
}

function insertOne(item, opts = {}) {
    const text = composeText(item);
    if (!text) return;
    if (typeof state.insert === "function") state.insert(text);
    toast(opts.toastText || `已插入 ${item.name_cn || item.name}`);
}

async function toggleStar(item) {
    const list = state.stars[state.source] || (state.stars[state.source] = []);
    const low = item.name.toLowerCase();
    const index = list.findIndex(name => name.toLowerCase() === low);
    if (index >= 0) list.splice(index, 1);
    else list.unshift(item.name);
    renderCards();
    await saveStars();
    // 收藏也置顶：重拉一次让后端按 preferred 重排（保持当前页）
    refreshData();
}

/* ------------------------------------------------------------------ 渲染 */

function renderSources() {
    if (!dom?.sources) return;
    for (const [key, ref] of Object.entries(dom.sources)) {
        const sourceRand = state.randomSources.has(key);
        const subCount = [...state.randomCategories].filter(k => k.startsWith(`${key}::`)).length;
        ref.row.classList.toggle("on", state.source === key);
        ref.row.classList.toggle("rand", sourceRand);
        // 自己没开整源随机、但有分类在随机 → 青边 + 角标，一眼看出该源仍参与
        ref.row.classList.toggle("sub-rand", !sourceRand && subCount > 0);
        ref.rand?.classList.toggle("on", sourceRand);
        if (ref.pick) {
            ref.pick.classList.toggle("show", sourceRand);
            const pickMode = state.randomPicks.get(key) || "all";
            ref.pick.classList.toggle("on", pickMode === "starred_only");
            ref.pick.classList.toggle("exclude", pickMode === "exclude_starred");
            ref.pick.title = pickMode === "starred_only"
                ? "当前：只抽收藏（点击切换为排除收藏）"
                : pickMode === "exclude_starred"
                    ? "当前：排除收藏（点击切回全部）"
                    : "当前：全部（点击切换为只抽收藏）";
        }
        // 两个角标分工：pinBadge 只显示固定条数（金），badge 只显示分类随机数（蓝）
        const pinCount = (state.pins[key] || []).length;
        if (ref.badge) {
            ref.badge.innerHTML = subCount ? `${svgIcon("shuffle", 9)}<span>${subCount}</span>` : "";
            ref.badge.style.display = subCount ? "" : "none";
        }
        if (ref.pinBadge) {
            ref.pinBadge.innerHTML = pinCount ? `${svgIcon("pin", 9)}<span>${pinCount}</span>` : "";
            ref.pinBadge.style.display = pinCount ? "" : "none";
        }
        ref.row.classList.toggle("has-pin", pinCount > 0);
        const count = state.sourceCounts[key];
        ref.count.textContent = count == null ? "" : String(count);
    }
}

/** 面板里循环切换某个随机范围的收藏范围：全部 → 只抽收藏 → 排除收藏 */
function cyclePick(key) {
    const order = ["all", "starred_only", "exclude_starred"];
    const now = state.randomPicks.get(key) || "all";
    const next = order[(order.indexOf(now) + 1) % order.length];
    state.randomPicks.set(key, next);
    renderSources();
    renderSide();
    renderRandomHint();
    emitRandomChange();
    const label = next === "starred_only" ? "只抽收藏" : next === "exclude_starred" ? "排除收藏" : "全部";
    toast(`随机范围已切到：${label}`);
}

/** 把当前随机状态组装成 scopes（带抽取数量）回写给节点 */
function emitRandomChange() {
    const scopes = [];
    for (const key of state.randomSources) {
        scopes.push({
            source: key, category: "",
            count: state.randomCounts.get(key) || 1,
            pick: state.randomPicks.get(key) || "all",
        });
    }
    for (const scope of state.randomCategories) {
        const [key, cat] = scope.split("::");
        scopes.push({
            source: key, category: cat,
            count: state.randomCounts.get(scope) || 1,
            pick: state.randomPicks.get(scope) || "all",
        });
    }
    try {
        state.onRandomChange?.({ scopes });
    } catch (error) {
        console.warn("[BlackRin 魔导书] 随机状态回写失败", error);
    }
}

/** 分类级随机开关：只在这个作品分类里抽 */
function toggleCategoryRandom(key, label) {
    const wasOn = state.randomCategories.has(key);
    if (wasOn) {
        state.randomCategories.delete(key);
        state.randomCounts.delete(key);
        state.randomPicks.delete(key);
    } else {
        state.randomCategories.add(key);
        if (!state.randomCounts.has(key)) state.randomCounts.set(key, 1);
        if (!state.randomPicks.has(key)) state.randomPicks.set(key, "all");
    }
    renderSide();
    renderSources();
    renderRandomHint();
    emitRandomChange();
    toast(wasOn ? `已关闭「${label}」随机` : `「${label}」已设为常驻随机`);
}

/** 常驻随机开关：开了之后节点每次执行都从该源随机抽一条标签 */
function toggleRandomSource(key) {
    const wasOn = state.randomSources.has(key);
    if (wasOn) {
        state.randomSources.delete(key);
        state.randomCounts.delete(key);
        state.randomPicks.delete(key);
    } else {
        state.randomSources.add(key);
        if (!state.randomCounts.has(key)) state.randomCounts.set(key, 1);
        if (!state.randomPicks.has(key)) state.randomPicks.set(key, "all");
    }
    renderSources();
    renderRandomHint();
    emitRandomChange();
    const label = SOURCE_META[key]?.label || key;
    toast(wasOn ? `已关闭「${label}」随机` : `「${label}」已设为常驻随机`);
}

function renderRandomHint() {
    if (!dom?.randomHint) return;
    const parts = [];
    for (const key of state.randomSources) {
        const n = state.randomCounts.get(key) || 1;
        parts.push(`${SOURCE_META[key]?.label || key}${n > 1 ? " ×" + n : ""}`);
    }
    for (const scope of state.randomCategories) {
        const [key, cat] = scope.split("::");
        const n = state.randomCounts.get(scope) || 1;
        parts.push(`${SOURCE_META[key]?.label || key}/${cat}${n > 1 ? " ×" + n : ""}`);
    }
    dom.randomHint.textContent = parts.length ? `随机：${parts.join(" / ")}` : "";
    dom.randomHint.style.display = parts.length ? "" : "none";
}

async function loadSources() {
    try {
        const data = await fetchJSON(`${ROUTE}/sources`);
        if (!data?.ok) return;
        for (const item of data.sources || []) state.sourceCounts[item.key] = item.count;
        renderSources();
    } catch (error) {
        console.warn("[BlackRin 魔导书] 数据源列表加载失败", error);
    }
}

function renderSide() {
    dom.catList.innerHTML = "";
    const filtersOn = sourceHasFilter(state.source);
    // 画师库没有作品分类：整块（标题 + 搜索框 + 列表）一起收掉，不留空壳
    dom.catSearch.style.display = filtersOn ? "" : "none";
    dom.catList.style.display = filtersOn ? "" : "none";
    if (dom.catSide) dom.catSide.style.display = filtersOn ? "" : "none";
    if (dom.body) dom.body.classList.toggle("no-cat", !filtersOn);
    const keyword = state.catSearch.trim().toLowerCase();
    const list = state.categories.filter(cat =>
        !keyword || (cat.name_cn || "").toLowerCase().includes(keyword) || (cat.category || "").toLowerCase().includes(keyword));

    const makeRow = (label, count, active, onClick) => {
        const row = el("button", { class: `bg-cat${active ? " active" : ""}`, title: label, onclick: onClick },
            el("span", { class: "bg-cat-name" }, label),
            count != null ? el("span", { class: "bg-cat-count" }, String(count)) : null);
        return row;
    };

    /** 作品分类行：额外带一个「只在这个分类里随机」的开关 */
    const makeCatRow = (cat, label, count, active, flags = {}) => {
        const key = `${state.source}::${cat}`;
        const on = state.randomCategories.has(key);
        const hasPin = !!flags.hasPin;
        const rand = el("button", {
            class: `bg-cat-rand${on ? " on" : ""}`,
            title: on ? `取消「${label}」的随机` : `「${label}」设为常驻随机（每次从该分类抽一条）`,
            onclick: event => {
                event.stopPropagation();
                event.preventDefault();
                toggleCategoryRandom(key, label);
            },
        });
        rand.innerHTML = SHUFFLE_SVG;
        const pick = el("button", {
            class: `bg-pick${on ? " show" : ""}`,
            title: "收藏范围：全部",
            onclick: event => {
                event.stopPropagation();
                event.preventDefault();
                cyclePick(key);
            },
        });
        pick.innerHTML = svgIcon("star", 11);
        const pickMode = state.randomPicks.get(key) || "all";
        pick.classList.toggle("on", pickMode === "starred_only");
        pick.classList.toggle("exclude", pickMode === "exclude_starred");
        return el("div", {
            class: `bg-cat${active ? " active" : ""}${on ? " rand" : ""}${hasPin ? " has-pin" : ""}${(on || hasPin) ? " hot" : ""}`,
            title: `${label}${count != null ? ` · ${count}` : ""}${hasPin ? " · 有固定标签" : ""}${on ? " · 已开随机" : ""}`,
            onclick: () => {
                state.category = state.category === cat ? "" : cat;
                state.page = 1;
                renderSide();
                refreshData();
            },
        },
            hasPin ? (() => {
                const mark = el("span", { class: "bg-cat-pin" });
                mark.innerHTML = svgIcon("pin", 10);
                return mark;
            })() : null,
            el("span", { class: "bg-cat-name" }, label),
            count != null ? el("span", { class: "bg-cat-count" }, String(count)) : null,
            rand,
            pick);
    };

    dom.catList.append(makeRow("全部", null, !state.category, () => {
        state.category = "";
        state.page = 1;
        renderSide();
        refreshData();
    }));
    if (!filtersOn) return;
    if (!list.length) {
        dom.catList.append(el("div", { class: "bg-cat-empty" }, "没有匹配的作品"));
        return;
    }
    // ★ 有固定标签 / 开了随机的分类排到最前面（其余保持原顺序），方便快速定位
    const hotOf = cat => {
        const catKey = `${state.source}::${cat.category}`;
        const hasPin = state.pinnedCategories.has((cat.category || "").toLowerCase());
        const hasRand = state.randomCategories.has(catKey);
        return { hasPin, hasRand, hot: hasPin || hasRand };
    };
    const ordered = [...list].sort((a, b) => {
        const ha = hotOf(a).hot ? 1 : 0;
        const hb = hotOf(b).hot ? 1 : 0;
        return hb - ha;
    });
    // 搜索时直接全列（结果本来就少）；不搜索时先渲染 catLimit 条，剩下的按需加载，
    // 否则 3651 个分类行 ≈ 2.2 万个 DOM 节点，切源会卡 80~100ms。
    const shown = keyword ? ordered : ordered.slice(0, state.catLimit);
    const frag = document.createDocumentFragment();
    for (const cat of shown) {
        const label = cat.name_cn && cat.name_cn !== cat.category ? cat.name_cn : cat.category;
        const flags = hotOf(cat);
        frag.append(makeCatRow(cat.category, label, cat.count, state.category === cat.category, flags));
    }
    if (!keyword && list.length > shown.length) {
        const more = el("button", {
            class: "bg-cat-more",
            onclick: () => {
                state.catLimit += 400;
                renderSide();
            },
        }, `显示更多（还有 ${list.length - shown.length} 个）`);
        frag.append(more);
    }
    dom.catList.append(frag);
}

function renderCards() {
    const grid = dom.grid;
    cancelHoverPreview();
    grid.innerHTML = "";
    if (state.loading) {
        grid.append(el("div", { class: "bg-empty" }, "加载中…"));
        return;
    }
    if (!state.items.length) {
        const hint = state.starOnly ? "还没有收藏（点卡片下排的收藏按钮）" : "没有匹配结果";
        grid.append(el("div", { class: "bg-empty" }, hint));
        return;
    }
    const batch = document.createDocumentFragment();
    for (const item of state.items) {
        const pinned = isPinned(item);
        const starred = isStarred(item);


        /* 有图：图片区（悬停放大预览）；纯属性标签没有配图，走文字卡片 */
        const hasImage = !!item.image_url;
        const imgWrap = hasImage ? el("div", {
            class: "bg-card-img",
            onmouseenter: event => scheduleHoverPreview(item, event.currentTarget),
            onmouseleave: () => cancelHoverPreview(),
        }) : null;
        if (hasImage) {
            imgWrap.append(el("img", {
                src: item.image_url,
                loading: "lazy",
                decoding: "async",
                alt: item.name,
                onerror: event => {
                    cancelHoverPreview();
                    event.target.replaceWith(el("div", { class: "bg-card-ph" }, "🖼"));
                },
            }));
        }
        if (imgWrap) imgWrap.append(el("div", { class: "bg-check" }, "✓"));
        // 固定角标：有图的贴图片左上角；无图（文字卡）在卡片建好后贴上去
        let pinBadge = null;
        if (pinned) {
            pinBadge = el("div", { class: "bg-pin-badge", title: "已固定：运行时强制包含这条标签" });
            pinBadge.innerHTML = svgIcon("pin", 10) + "<span>固定</span>";
            if (imgWrap) imgWrap.append(pinBadge);
        }

        const card = el("div", {
            class: `bg-card${hasImage ? "" : " noimg"}${pinned ? " pinned" : ""}${starred ? " starred" : ""}`,
            title: `${item.name}\n${item.tags}${item.category_cn || item.category ? `\n${item.category_cn || item.category}` : ""}${state.source === "characters" ? ` · 作品数 ${item.post_count}` : ""}\n单击插入 · Shift+单击加入已选 · 悬停看大图`,

        },
            imgWrap,
            el("div", { class: "bg-card-name" },
                item.name_cn && item.name_cn !== item.name ? item.name_cn : item.name,
                item.name_cn && item.name_cn !== item.name ? el("small", {}, item.name) : null),
            el("div", { class: "bg-card-actions" },
                (() => {
                    const b = el("button", {
                        class: `bg-act pin${pinned ? " on" : ""}`,
                        title: pinned ? "取消固定" : "固定（置顶＋插入时自动带上）",
                        onclick: event => { event.stopPropagation(); togglePin(item); },
                    });
                    b.innerHTML = svgIcon("pin", 13);
                    return b;
                })(),
                (() => {
                    const b = el("button", {
                        class: "bg-act copy",
                        title: "复制标签到剪贴板",
                        onclick: event => { event.stopPropagation(); copyTags(item); },
                    });
                    b.innerHTML = svgIcon("copy", 13);
                    return b;
                })(),
                (() => {
                    const b = el("button", {
                        class: `bg-act star${starred ? " on" : ""}`,
                        title: starred ? "取消收藏" : "收藏（置顶）",
                        onclick: event => { event.stopPropagation(); toggleStar(item); },
                    });
                    b.innerHTML = svgIcon("star", 13, starred);
                    return b;
                })()));
        if (pinBadge && !hasImage) card.append(pinBadge);
        batch.append(card);
    }
    grid.append(batch);
}

/* ---------------------------------------------------- 悬停放大预览 */
let hoverTimer = null;
function scheduleHoverPreview(item, anchor) {
    cancelHoverPreview();
    if (!item?.image_url || !dom?.hover) return;
    hoverTimer = setTimeout(() => showHoverPreview(item, anchor), 300);
}

function showHoverPreview(item, anchor) {
    const box = dom?.hover;
    if (!box || !anchor?.isConnected) return;
    box.innerHTML = "";
    box.append(el("img", { src: item.image_url, alt: item.name }));
    box.append(el("div", { class: "bg-hover-cap" }, `${item.name_cn || item.name}${item.name_cn && item.name_cn !== item.name ? ` · ${item.name}` : ""}`));
    box.classList.add("show");
    const rect = anchor.getBoundingClientRect();
    const width = 308;
    const height = box.offsetHeight || 340;
    let left = rect.right + 10;
    if (left + width > window.innerWidth - 8) left = Math.max(8, rect.left - width - 10);
    let top = Math.min(Math.max(8, rect.top), Math.max(8, window.innerHeight - height - 8));
    box.style.left = `${Math.round(left)}px`;
    box.style.top = `${Math.round(top)}px`;
}

function cancelHoverPreview() {
    if (hoverTimer) clearTimeout(hoverTimer);
    hoverTimer = null;
    dom?.hover?.classList.remove("show");
}

function renderPager() {
    const pages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
    dom.total.textContent = `${state.total} 条`;
    dom.pageInfo.textContent = `第 ${state.page} / ${pages} 页`;
    dom.prev.disabled = state.page <= 1;
    dom.next.disabled = state.page >= pages;
    dom.pageInput.value = String(state.page);
}

/* ------------------------------------------------------------------ 布局 */

function build() {
    installStyles();

    const themeBtn = el("button", {
        class: "bg-theme",
        title: "切换昼夜",
        onclick: () => applyTheme(currentTheme() === "light" ? "dark" : "light"),
    });
    themeBtn.innerHTML = svgIcon(currentTheme() === "light" ? "sun" : "moon", 14);

    // 卡片字号：A- / A+，默认 11px（就是现在的样子）
    const fsNow = () => clampNum(Number(readLayout().cardFont) || 11, 9, 18);
    const setCardFont = value => {
        const size = clampNum(value, 9, 18);
        applyFontSize(size);
        saveLayout({ cardFont: size });
        fsLabel.textContent = `${size}`;
    };
    const fsDown = el("button", { class: "bg-fs", title: "卡片文字变小", onclick: () => setCardFont(fsNow() - 1) }, "A−");
    const fsUp = el("button", { class: "bg-fs", title: "卡片文字变大", onclick: () => setCardFont(fsNow() + 1) }, "A＋");
    const fsLabel = el("span", { style: { color: "var(--bgs-text-dim)", fontSize: "10px", minWidth: "14px", textAlign: "center" } }, String(fsNow()));
    const fsGroup = el("div", { class: "bg-fs-group" }, fsDown, fsLabel, fsUp);

    const head = el("div", { class: "bg-head" },
        el("div", { class: "bg-title" }, "魔导书 · 标签"),
        fsGroup,
        themeBtn,
        (() => {
            const b = el("button", { class: "bg-close", title: "关闭 (Esc)", onclick: close });
            b.innerHTML = svgIcon("close", 14);
            return b;
        })());

    /* 数据源列表（角色 / 画师）——照魔导书放在左侧，每行右侧带 🎲 随机 */
    const srcs = el("div", { class: "bg-srcs" });
    const sourceRefs = {};
    for (const [key, meta] of Object.entries(SOURCE_META)) {
        const count = el("span", { class: "bg-src-count" });
        const ico = el("span", { class: "bg-src-ico" });
        ico.innerHTML = svgIcon(meta.icon, 14);
        const main = el("button", { class: "bg-src-main", title: `只看${meta.label}`, onclick: () => switchSource(key) },
            ico,
            el("span", { class: "bg-src-name" }, meta.label),
            count);
        const rand = el("button", {
            class: "bg-src-rand",
            title: `把「${meta.label}」设为常驻随机：开启后每次生成都从该源随机抽一条标签`,
            onclick: event => {
                event.stopPropagation();
                toggleRandomSource(key);
            },
        });
        rand.innerHTML = SHUFFLE_SVG;
        const pick = el("button", {
            class: "bg-pick",
            title: "收藏范围：全部 → 点一下切换为「只抽收藏」",
            onclick: event => { event.stopPropagation(); cyclePick(key); },
        });
        pick.innerHTML = svgIcon("star", 12);
        const pinBadge = el("span", { class: "bg-pin-badge-inline", style: { display: "none" }, title: "该数据源下已固定的标签数" });
        const badge = el("span", { class: "bg-sub-badge", style: { display: "none" }, title: "该数据源下已开随机的分类数" });
        const row = el("div", { class: "bg-src" }, main, pinBadge, rand, pick, badge);
        srcs.append(row);
        sourceRefs[key] = { row, count, rand, badge, pick, pinBadge };
    }

    const catSearch = el("input", {
        class: "bg-cat-search",
        placeholder: "搜索分类…",
        oninput: event => {
            state.catSearch = event.target.value;
            renderSide();
        },
    });
    const catList = el("div", { class: "bg-cat-list" });
    const side = el("div", { class: "bg-side" },
        el("div", { class: "bg-side-head" }, "数据源"),
        srcs);
    // 子分类独立竖列（数据源右边）：大分类以后会更多，所以两边分开各占一列
    const catSide = el("div", { class: "bg-catside" },
        el("div", { class: "bg-side-head" }, "分类"),
        catSearch,
        catList);

    const search = el("input", {
        class: "bg-q",
        placeholder: "搜索：中文名 / 英文名 / 标签（回车搜索）",
        oninput: event => {
            state.q = event.target.value;
            clearTimeout(state.searchTimer);
            state.searchTimer = setTimeout(() => {
                state.page = 1;
                refreshData();
            }, 180);
        },
        onkeydown: event => {
            if (event.key === "Enter") {
                clearTimeout(state.searchTimer);
                state.page = 1;
                refreshData();
            }
        },
    });
    const starOnly = el("button", {
        class: "bg-btn bg-star-btn",
        title: "只看已收藏的条目",
        onclick: () => {
            state.starOnly = !state.starOnly;
            state.page = 1;
            starOnly.classList.toggle("on", state.starOnly);
            refreshData();
        },
    });
    starOnly.innerHTML = `${svgIcon("star", 12)}<span>只看收藏</span>`;
    const presetBtn = el("button", {
        class: "bg-btn",
        title: "预设：把当前的「固定 + 随机范围」存起来，以后一键套用",
        onclick: event => { event.stopPropagation(); togglePresetPop(); },
    });
    presetBtn.innerHTML = `${svgIcon("bookmark", 12)}<span>预设</span>`;

    const randomHint = el("span", { class: "bg-rand-hint" });
    const total = el("span", { class: "bg-total" });
    const tools = el("div", { class: "bg-tools", style: { position: "relative" } },
        search, randomHint, presetBtn, starOnly, total);

    const grid = el("div", { class: "bg-grid" });

    // 预设浮层（挂在 bg-main 里，absolute 定位于工具栏下方）
    const presetList = el("div", { class: "bg-preset-list" });
    const presetNameInput = el("input", {
        placeholder: "预设名…",
        onkeydown: event => { if (event.key === "Enter") savePreset(presetNameInput.value); },
    });
    const presetPop = el("div", { class: "bg-preset-pop", onclick: event => event.stopPropagation() },
        el("div", { class: "bg-preset-head" }, "预设（固定 + 随机范围）"),
        presetList,
        el("div", { class: "bg-preset-save" },
            presetNameInput,
            el("button", { onclick: () => savePreset(presetNameInput.value) }, "保存当前")));

    tools.append(presetPop);              // 浮层锚在工具栏下方，不要挂到内容区底部
    const main = el("div", { class: "bg-main" }, tools, grid);

    const prev = el("button", { class: "bg-btn", onclick: () => { if (state.page > 1) { state.page--; refreshData(); } } }, "‹ 上一页");
    const next = el("button", { class: "bg-btn", onclick: () => { state.page++; refreshData(); } }, "下一页 ›");
    const pageInput = el("input", {
        value: "1",
        onkeydown: event => {
            if (event.key !== "Enter") return;
            const page = Math.max(1, parseInt(event.target.value || "1", 10) || 1);
            state.page = page;
            refreshData();
        },
    });
    const pageInfo = el("span");
    const pager = el("div", { class: "bg-pager" }, prev, pageInfo, next, el("span", {}, "跳至"), pageInput, el("span", {}, "页"));
    // 底部只留分页（「已选区 / 插入已选」整条链已按用户要求移除）
    const foot = el("div", { class: "bg-foot" }, el("div", { class: "bg-selwrap" },
        el("span", { class: "bg-sel-hint" }, "单击卡片不写入提示词 · 悬停看大图 · 卡片下方依次为：固定 / 复制 / 收藏")), pager);

    const body = el("div", { class: "bg-body" }, side, catSide, main);
    const dialog = el("div", { class: "bg-dialog" }, head, body, foot);

    /* ---------------- 面板尺寸与位置：可拖动三个角 ----------------
       左下 / 右下 / 右上把手，拉起多少就多大地儿；尺寸位置记进 localStorage。 */
    const layout = readLayout();
    const applyRect = (rect, persist = true) => {
        const w = clampNum(rect.w, 620, window.innerWidth - 16);
        const h = clampNum(rect.h, 420, window.innerHeight - 16);
        const x = clampNum(rect.x, 4, Math.max(4, window.innerWidth - w - 4));
        const y = clampNum(rect.y, 4, Math.max(4, window.innerHeight - h - 4));
        dialog.style.width = `${Math.round(w)}px`;
        dialog.style.height = `${Math.round(h)}px`;
        dialog.style.left = `${Math.round(x)}px`;
        dialog.style.top = `${Math.round(y)}px`;
        if (persist) {
            saveLayout({ w, h });       // 尺寸跟着浏览器记
            sessionPos = { x, y };      // 位置只记在内存（ComfyUI 一关就重置）
        }
    };
    const initW = layout.w || Math.min(1180, window.innerWidth * 0.95);
    const initH = layout.h || Math.min(860, window.innerHeight * 0.84);
    applyRect({
        w: initW,
        h: initH,
        x: sessionPos ? sessionPos.x : (window.innerWidth - initW) / 2,
        y: sessionPos ? sessionPos.y : (window.innerHeight - initH) / 2,
    }, false);

    /* 拖标题栏移动整个面板（位置记在内存里，ComfyUI 重启重置） */
    head.addEventListener("mousedown", event => {
        if (event.button !== 0) return;
        if (event.target.closest("button")) return;   // 点按钮不算拖动
        event.preventDefault();
        const rect = dialog.getBoundingClientRect();
        const start = { px: event.clientX, py: event.clientY, x: rect.left, y: rect.top, w: rect.width, h: rect.height };
        head.classList.add("dragging");
        const onMove = moveEvent => {
            const x = start.x + (moveEvent.clientX - start.px);
            const y = start.y + (moveEvent.clientY - start.py);
            applyRect({ w: start.w, h: start.h, x, y });
        };
        const onUp = () => {
            head.classList.remove("dragging");
            window.removeEventListener("mousemove", onMove, true);
            window.removeEventListener("mouseup", onUp, true);
            const r = dialog.getBoundingClientRect();
            sessionPos = { x: r.left, y: r.top };   // 只存内存
        };
        window.addEventListener("mousemove", onMove, true);
        window.addEventListener("mouseup", onUp, true);
    });

    for (const corner of ["lb", "rb", "rt"]) {
        const grip = el("div", { class: `bg-grip ${corner}`, title: "拖动调整面板大小" });
        grip.addEventListener("mousedown", event => {
            event.preventDefault();
            event.stopPropagation();
            const start = {
                px: event.clientX, py: event.clientY,
                rect: dialog.getBoundingClientRect(),
            };
            const onMove = moveEvent => {
                const dx = moveEvent.clientX - start.px;
                const dy = moveEvent.clientY - start.py;
                let w = start.rect.width;
                let h = start.rect.height;
                let x = start.rect.left;
                let y = start.rect.top;
                if (corner.includes("r")) w = start.rect.width + dx;
                if (corner.includes("l")) { w = start.rect.width - dx; x = start.rect.left + dx; }
                if (corner.includes("b")) h = start.rect.height + dy;
                if (corner.includes("t")) { h = start.rect.height - dy; y = start.rect.top + dy; }
                applyRect({ w, h, x, y });
            };
            const onUp = () => {
                window.removeEventListener("mousemove", onMove, true);
                window.removeEventListener("mouseup", onUp, true);
                const rect = dialog.getBoundingClientRect();
                saveLayout({ w: rect.width, h: rect.height, x: rect.left, y: rect.top });
            };
            window.addEventListener("mousemove", onMove, true);
            window.addEventListener("mouseup", onUp, true);
        });
        dialog.append(grip);
    }
    const hoverBox = el("div", { class: "bg-hover" });
    const toastEl = el("div", { class: "bg-toast" });
    const overlay = el("div", {
        class: "bg-overlay",
        onclick: event => {
            // 点浮层外任意位置先收起预设面板
            if (dom?.presetPop?.classList.contains("open")) { togglePresetPop(false); return; }
            if (event.target === overlay) close();
        },
    }, dialog, hoverBox, toastEl);

    dom = {
        overlay, dialog, themeBtn, body, sources: sourceRefs, catSide, catSearch, catList, search, starOnly, total,
        grid, prev, next, pageInput, pageInfo, hover: hoverBox,
        randomHint, presetBtn, presetPop, presetList, presetNameInput, toast: toastEl,
    };
    document.body.append(overlay);
    return dom;
}

function switchSource(source) {
    if (state.source === source) return Promise.resolve();
    state.source = source;
    state.page = 1;
    state.q = "";
    state.category = "";
    state.starOnly = false;
    state.catLimit = 160;
    syncPinnedCategories();
    dom.search.value = "";
    dom.starOnly.classList.remove("on");
    renderSources();
    renderRandomHint();
    return loadCategories().then(() => {
        renderSide();
        return refreshData();
    });
}

function onKeydown(event) {
    if (event.key === "Escape" && dom?.overlay?.isConnected) {
        event.stopPropagation();
        close();
    }
}

function close() {
    const notify = state.onClose;
    cancelHoverPreview();
    window.removeEventListener("keydown", onKeydown, true);
    dom?.overlay?.remove();
    dom = null;
    state.insert = null;
    state.onRandomChange = null;
    state.onClose = null;
    state.onPinsChange = null;
    state.initialPins = null;
    try {
        notify?.();
    } catch (error) {
        console.warn("[BlackRin 魔导书] onClose 回调失败", error);
    }
}

/* ------------------------------------------------------------------ 入口 */

export function openGrimoire(options = {}) {
    installStyles();
    if (dom) close();
    state.insert = typeof options.insert === "function" ? options.insert : null;
    state.randomSources = new Set();
    state.randomCategories = new Set();
    state.randomCounts = new Map();
    state.randomPicks = new Map();
    for (const scope of Array.isArray(options.randomScopes) ? options.randomScopes : []) {
        if (!scope?.source) continue;
        const count = Math.max(1, Math.min(20, Number(scope.count) || 1));
        const pick = ["all", "starred_only", "exclude_starred"].includes(scope.pick) ? scope.pick : "all";
        if (scope.category) {
            const key = `${scope.source}::${scope.category}`;
            state.randomCategories.add(key);
            state.randomCounts.set(key, count);
            state.randomPicks.set(key, pick);
        } else {
            state.randomSources.add(scope.source);
            state.randomCounts.set(scope.source, count);
            state.randomPicks.set(scope.source, pick);
        }
    }
    // 兼容旧的两种数组式参数
    for (const key of Array.isArray(options.randomSources) ? options.randomSources : []) {
        if (!state.randomSources.has(key)) { state.randomSources.add(key); state.randomCounts.set(key, 1); }
    }
    for (const scope of Array.isArray(options.randomCategories) ? options.randomCategories : []) {
        if (!state.randomCategories.has(scope)) { state.randomCategories.add(scope); state.randomCounts.set(scope, 1); }
    }
    state.onRandomChange = typeof options.onRandomChange === "function" ? options.onRandomChange : null;
    state.onClose = typeof options.onClose === "function" ? options.onClose : null;
    state.initialPins = options.pins && typeof options.pins === "object" ? options.pins : null;
    state.onPinsChange = typeof options.onPinsChange === "function" ? options.onPinsChange : null;
    state.source = options.source === "artists" ? "artists" : "characters";
    state.q = "";
    state.category = "";
    state.starOnly = false;
    state.page = 1;
    state.items = [];
    state.total = 0;
    build();
    applyTheme(currentTheme());
    applyFontSize(Number(readLayout().cardFont) || 11);
    window.addEventListener("keydown", onKeydown, true);
    renderSources();
    renderRandomHint();
    renderCards();
    renderPager();
    dom.search.focus();
    // 三个请求并行：星标、分类、首批数据谁先回谁先渲染。
    // 串行的话首个请求要等后端把 14MB 数据读进内存，面板会空好几秒。
    const srcReady = loadSources();
    const pinsReady = loadPins();
    const starsReady = loadStars().then(() => renderCards());
    const catsReady = loadCategories().then(() => renderSide());
    refreshData();
    Promise.all([srcReady, pinsReady, starsReady, catsReady]).catch(error => console.warn("[BlackRin 魔导书] 初始化部分失败", error));
    return dom;
}

// 便于在控制台/其他脚本里直接调用
window.BlackRinGrimoire = { open: openGrimoire };

// 节点面板（blackrin_grimoire_node.js）复用同一套主题变量与图标
export { installStyles, svgIcon, applyTheme, currentTheme };
