/**
 * BlackRin 标签库节点（魔导书）
 * ================================
 * 节点只做两件事：① 一个可手改的 tags 文本框；② 一行按钮（标签库 / 清空）。
 * 点「标签库」打开魔导书弹层（blackrin_grimoire.js），选中的标签写回 tags widget，
 * 节点原样输出 STRING，接任何模型族的 CLIPTextEncode 都行——不碰编码。
 */

import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import { openGrimoire, installStyles, svgIcon } from "./blackrin_grimoire.js";

const NODE = "BlackRin_GrimoireTags";

function tagsWidget(node) {
    return (node.widgets || []).find(w => w.name === "tags");
}

function stateWidget(node) {
    return (node.widgets || []).find(w => w.name === "panel_state");
}

/** 面板状态：目前只存「哪些源是常驻随机」。后端 IS_CHANGED 靠它决定是否每次重跑。 */
function readPanelState(node) {
    const raw = stateWidget(node)?.value;
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function writePanelState(node, patch) {
    const widget = stateWidget(node);
    if (!widget) return;
    const next = { ...readPanelState(node), ...patch };
    widget.value = JSON.stringify(next);
    widget.callback?.call(widget, widget.value);
    node.setDirtyCanvas?.(true, true);
}

/** 读随机范围（新结构 random_scopes，兼容旧的 random_sources / random_categories） */
function readScopes(node) {
    const st = readPanelState(node);
    if (Array.isArray(st.random_scopes)) {
        return st.random_scopes.filter(x => x && x.source).map(x => ({
            source: x.source,
            category: x.category || "",
            count: Math.max(1, Math.min(20, Number(x.count) || 1)),
            pick: ["all", "starred_only", "exclude_starred"].includes(x.pick) ? x.pick : "all",
        }));
    }
    const out = [];
    for (const key of st.random_sources || []) out.push({ source: key, category: "", count: 1 });
    for (const scope of st.random_categories || []) {
        const [key, cat] = String(scope).split("::");
        if (key && cat) out.push({ source: key, category: cat, count: 1 });
    }
    return out;
}

function writeScopes(node, scopes) {
    writePanelState(node, { random_scopes: scopes });
}

/** 固定标签存在节点自己的 panel_state 里（随工作流保存 → 工作流之间天然隔离） */
function readPins(node) {
    const pins = readPanelState(node).pins;
    return pins && typeof pins === "object" ? pins : {};
}

function writePins(node, pins) {
    writePanelState(node, { pins: pins || {} });
}

const SOURCE_LABEL = {
    characters: "角色", artists: "画师", costume: "服装", hair: "头发",
    pose: "姿势", eyes: "眼睛", body: "体型", portrait: "人像",
};

function installStripStyles() {
    installStyles();
    if (document.getElementById("blackrin-grimoire-strip-style")) return;
    const style = document.createElement("style");
    style.id = "blackrin-grimoire-strip-style";
    style.textContent = `
/* 节点在画布上永远是深色（画布本身是深灰，跟随面板浅色主题会出现刺眼白块）。
   这里定义一组节点专用变量，不被 [data-bgs-theme=light] 覆盖。 */
:root{
  --bgn-surface:#1a1d21; --bgn-control:#262b31; --bgn-border:#33383e;
  --bgn-text:#e0e0e0; --bgn-text-sub:#9aa4ae; --bgn-text-dim:#6b7681;
  --bgn-accent:#4a9eff; --bgn-accent-soft:#1c3350; --bgn-accent-text:#8fc6ff;
  --bgn-pin:#e0a33c; --bgn-pin-soft:#2e2515; --bgn-pin-text:#ffd79a;
  --bgn-warn:#e0a33c; --bgn-danger:#e05545;
}
.bgs-chip{position:relative;flex:0 0 auto;display:flex;align-items:center;gap:4px;min-width:92px;height:34px;padding:0 7px;border-radius:6px;font:10px/1 Arial,"Microsoft YaHei",sans-serif;white-space:nowrap;box-sizing:border-box}
.bgs-chip.pin{border:1px solid var(--bgn-pin);background:var(--bgn-pin-soft);color:var(--bgn-pin-text)}
.bgs-chip.rand{border:1px solid var(--bgn-border);background:var(--bgn-control);color:var(--bgn-text)}
.bgs-chip svg{display:block;flex:0 0 auto}
.bgs-chip.rand.only-star{border-color:#c9a227;box-shadow:0 0 0 1px rgba(201,162,39,.35) inset}
.bgs-chip img{width:30px;height:30px;object-fit:cover;border-radius:4px;flex:0 0 auto;pointer-events:none}
/* hover 时整块 chip 变成操作区：内容淡出、按钮铺满内部。
   纯 opacity 切换，chip 尺寸始终不变，鼠标不会因为布局变化而抖出去。 */
.bgs-chip > *{transition:opacity .1s}
/* 常显控件：不再用 hover 显隐（那会闪）。数量和权重都是可直接输入的数字框。 */
.bgs-num{flex:0 0 auto;width:42px;height:19px;box-sizing:border-box;padding:0 2px;border:1px solid var(--bgn-border);border-radius:4px;background:var(--bgn-surface);color:var(--bgn-text);font:10px/17px Consolas,monospace;text-align:center;outline:none;-moz-appearance:textfield}
.bgs-num::-webkit-inner-spin-button,.bgs-num::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
.bgs-num:focus{border-color:var(--bgn-accent);color:var(--bgn-accent-text)}
.bgs-num.weight{color:var(--bgn-pin-text);border-color:var(--bgn-pin)}
.bgs-del{flex:0 0 auto;width:18px;height:19px;padding:0;border:0;border-radius:4px;background:transparent;color:var(--bgn-text-dim);font:13px/17px Arial,sans-serif;cursor:pointer}
.bgs-del:hover{background:var(--bgn-danger);color:#fff}
.bgs-tool{height:20px;min-width:18px;padding:0 4px;border:1px solid var(--bgn-border);border-radius:5px;background:var(--bgn-control);color:var(--bgn-text);font:11px/18px Arial,sans-serif;cursor:pointer}
.bgs-tool:hover{background:var(--bgn-control-hover);color:var(--bgn-accent)}
.bgs-tool.del{border-color:var(--bgn-danger);color:var(--bgn-danger)}
.bgs-tool.del:hover{background:var(--bgn-danger);color:#fff}
.bgs-count{padding:0 5px;border-radius:8px;background:var(--bgn-accent-soft);color:var(--bgn-accent-text);font:9px/14px Arial,sans-serif;flex:0 0 auto}
.bgs-count.multi{background:var(--bgn-accent);color:#fff;font-weight:700}
.bgs-step{width:14px;height:14px;padding:0;border:1px solid rgba(255,255,255,.28);border-radius:3px;background:#123b47;color:#bfe9f3;font:9px/12px Arial,sans-serif;cursor:pointer;opacity:0;transition:opacity .12s;display:none;align-items:center;justify-content:center}
.bgs-chip.rand:hover .bgs-step{opacity:1;display:flex}
.bgs-step:hover{background:#1a6274;color:#fff}
/* 运行结果区：只读显示上一次生成的最终提示词（含固定 + 随机抽到的词） */
.bgs-out{display:flex;align-items:flex-start;gap:6px;width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid var(--bgn-border);border-radius:8px;background:var(--bgn-surface);min-height:58px}
.bgs-out-text{flex:1 1 auto;min-width:0;color:var(--bgn-text);font:11px/1.5 Consolas,Menlo,monospace;white-space:pre-wrap;word-break:break-word;user-select:text;max-height:96px;overflow:auto}
.bgs-out-text.empty{color:var(--bgn-text-dim);font-style:italic}
.bgs-out-copy{flex:0 0 auto;width:26px;height:24px;padding:0;border:1px solid var(--bgn-border);border-radius:6px;background:var(--bgn-control);color:var(--bgn-text-sub);cursor:pointer;display:flex;align-items:center;justify-content:center}
.bgs-out-copy:hover{background:var(--bgn-control-hover);color:var(--bgn-text)}
.bgs-out-copy svg{display:block}
`;
    document.head.append(style);
}

/**
 * 节点状态条：把「当前固定的标签」和「当前随机范围」画出来。
 * 固定项有图就显示缩略图（角色/画师/服装/姿势/人像），没图（头发/眼睛/体型）用中文名。
 */
/** 取消固定：直接从节点状态里删掉这一条 */
async function removePin(node, source, name) {
    const pins = { ...readPins(node) };
    pins[source] = (pins[source] || []).filter(row => row.name !== name);
    writePins(node, pins);
    return Promise.resolve();
}

/** 直接设置某条固定标签的权重（0~5，1 = 不加权） */
async function setPinWeight(node, source, name, value) {
    const target = Math.max(0, Math.min(5, Math.round((Number(value) || 1) * 100) / 100));
    const pins = { ...readPins(node) };
    pins[source] = (pins[source] || []).map(row =>
        (row.name === name ? { ...row, weight: target } : row));
    writePins(node, pins);
    return Promise.resolve();
}

/** 直接设置某个随机范围的抽取数量（1~20） */
function setScopeCount(node, scope, value) {
    const scopes = readScopes(node);
    const index = scopes.findIndex(x =>
        x.source === scope.source && (x.category || "") === (scope.category || ""));
    if (index >= 0) {
        scopes[index].count = Math.max(1, Math.min(20, Math.round(Number(value) || 1)));
        writeScopes(node, scopes);
    }
    return Promise.resolve();
}

/** 关闭一个随机范围（category 为空 = 整源随机） */
function removeRandomScope(node, source, category) {
    const left = readScopes(node).filter(scope =>
        !(scope.source === source && (scope.category || "") === (category || "")));
    writeScopes(node, left);
    return Promise.resolve();
}

/** 切换某个随机池的收藏范围：全部 → 只抽收藏 → 排除收藏 → 全部 */
function cycleScopePick(node, scope) {
    const order = ["all", "starred_only", "exclude_starred"];
    const scopes = readScopes(node);
    const index = scopes.findIndex(x =>
        x.source === scope.source && (x.category || "") === (scope.category || ""));
    if (index < 0) return Promise.resolve();
    const current = order.indexOf(scopes[index].pick || "all");
    scopes[index].pick = order[(current + 1) % order.length];
    writeScopes(node, scopes);
    return Promise.resolve();
}

/** 调整某个随机范围每次抽几条（1~20） */
function adjustScopeCount(node, scope, delta) {
    const scopes = readScopes(node);
    const index = scopes.findIndex(x =>
        x.source === scope.source && (x.category || "") === (scope.category || ""));
    if (index < 0) return;
    scopes[index].count = Math.max(1, Math.min(20, (scopes[index].count || 1) + delta));
    writeScopes(node, scopes);
    return Promise.resolve();
}

/** 没跑过时给个预览：**分段**标出内容来自哪里（手选 / 固定 / 随机），
 *  否则手选区是隐藏的，用户会以为输出里凭空多了东西。 */
function previewText(node, pins) {
    const lines = [];
    const base = String(tagsWidget(node)?.value || "").trim();
    if (base) lines.push(`手选：${base}`);
    const pinTags = [];
    for (const rows of Object.values(pins || {})) {
        for (const row of rows || []) if (row.tags) pinTags.push(row.tags);
    }
    if (pinTags.length) lines.push(`📌 固定：${pinTags.join(", ")}`);
    const scopes = readScopes(node);
    if (scopes.length) {
        const total = scopes.reduce((sum, item) => sum + (item.count || 1), 0);
        const names = scopes.map(sc => sc.category ? `${SOURCE_LABEL[sc.source] || sc.source}/${sc.category}` : (SOURCE_LABEL[sc.source] || sc.source));
        lines.push(`🎲 待抽取 × ${total}（${names.join(" / ")}）`);
    }
    return lines.join("\n");
}

async function refreshStateStrip(node) {
    const root = node.__grimoireStripEl;
    if (!root) return;
    const pins = readPins(node);   // 直接读节点自己的状态，不用请求服务端
    const st = readPanelState(node);
    root.innerHTML = "";

    // 没跑过（或状态变了）就先显示预排文本，跑完由 executed 覆盖成实际输出
    if (!node.__lastOutput && node.__grimoireOutText) {
        const preview = previewText(node, pins);
        const box = node.__grimoireOutText;
        if (preview) {
            box.textContent = preview;
            box.classList.remove("empty");
        } else {
            box.textContent = "还没内容：点下方「标签库」选词";
            box.classList.add("empty");
        }
    }

    const chip = (text, opts = {}) => {
        const el = document.createElement("div");
        el.className = `bgs-chip ${opts.pin ? "pin" : "rand"}`;
        el.title = opts.title || text;
        if (opts.image) {
            const img = document.createElement("img");
            img.src = opts.image;
            img.onerror = () => img.remove();
            el.append(img);
        }
        if (opts.icon) {
            const ico = document.createElement("span");
            ico.style.cssText = "display:flex;align-items:center;flex:0 0 auto;";
            ico.innerHTML = svgIcon(opts.icon, 12);
            el.append(ico);
        }
        const span = document.createElement("span");
        span.textContent = text;
        el.append(span);

        const actions = opts.actions || [];
        if (actions.length) {
            const tools = document.createElement("div");
            tools.className = "bgs-tools";
            for (const action of actions) {
                const btn = document.createElement("button");
                btn.className = `bgs-tool${action.danger ? " del" : ""}`;
                btn.textContent = action.symbol;
                btn.title = action.title || "";
                btn.onclick = event => {
                    event.preventDefault();
                    event.stopPropagation();
                    Promise.resolve(action.run()).then(() => refreshStateStrip(node));
                };
                tools.append(btn);
            }
            el.append(tools);
        }
        return el;
    };

    const nodes = [];
    for (const [key, rows] of Object.entries(pins)) {
        for (const row of rows) {
            const weight = Number(row.weight ?? 1);
            const pinChip = chip(`${row.name_cn || row.name}`, {
                icon: "pin",
                pin: true,
                image: row.image_url || "",
                title: `固定（运行时强制包含）：${row.tags}\n右侧数字是提示词权重（0~5，1=不加权），可直接输入`,
            });
            // 权重输入框（常显，直接打字）
            const wInput = document.createElement("input");
            wInput.type = "number";
            wInput.className = "bgs-num weight";
            wInput.min = "0"; wInput.max = "5"; wInput.step = "0.1";
            wInput.value = String(weight);
            wInput.title = "提示词权重：1=不加权，>1 增强，<1 减弱；输出为 (标签:权重)";
            wInput.onchange = () => setPinWeight(node, key, row.name, Number(wInput.value));
            wInput.onkeydown = event => {
                if (event.key === "Enter") { wInput.blur(); }
                event.stopPropagation();
            };
            wInput.onmousedown = event => event.stopPropagation();
            pinChip.append(wInput);
            // 取消固定（常显小 ×）
            const delBtn = document.createElement("button");
            delBtn.className = "bgs-del";
            delBtn.textContent = "×";
            delBtn.title = "取消固定";
            delBtn.onclick = event => {
                event.preventDefault(); event.stopPropagation();
                Promise.resolve(removePin(node, key, row.name)).then(() => refreshStateStrip(node));
            };
            pinChip.append(delBtn);
            nodes.push(pinChip);
        }
    }
    for (const scope of readScopes(node)) {
        const key = scope.source;
        const cat = scope.category || "";
        const label = cat ? `${SOURCE_LABEL[key] || key}/${cat}` : (SOURCE_LABEL[key] || key);
        const count = scope.count || 1;
        const pick = scope.pick || "all";
        const pickMark = pick === "starred_only" ? "★" : pick === "exclude_starred" ? "☆̸" : "";
        const pickTip = pick === "starred_only" ? "只抽收藏" : pick === "exclude_starred" ? "排除收藏" : "全部";
        const el = chip(label, {
            icon: "shuffle",
            title: `常驻随机：每次从这里抽几条由右侧数字决定 · 收藏范围：${pickTip}`,
        });
        // 数量输入（常显）
        const nInput = document.createElement("input");
        nInput.type = "number";
        nInput.className = "bgs-num";
        nInput.min = "1"; nInput.max = "20"; nInput.step = "1";
        nInput.value = String(count);
        nInput.title = "每次抽几条（1~20）";
        nInput.onchange = () => setScopeCount(node, scope, Number(nInput.value));
        nInput.onkeydown = event => { if (event.key === "Enter") nInput.blur(); event.stopPropagation(); };
        nInput.onmousedown = event => event.stopPropagation();
        el.append(nInput);
        // 收藏范围切换（常显小按钮）
        const pickBtn = document.createElement("button");
        pickBtn.className = "bgs-del";
        pickBtn.textContent = pick === "starred_only" ? "★" : pick === "exclude_starred" ? "✕" : "☆";
        pickBtn.title = `收藏范围：${pickTip} —— 点一下切换（全部 → 只抽收藏 → 排除收藏）`;
        pickBtn.style.color = pick === "all" ? "var(--bgn-text-dim)" : (pick === "starred_only" ? "var(--bgn-pin)" : "var(--bgn-danger)");
        pickBtn.onclick = event => {
            event.preventDefault(); event.stopPropagation();
            Promise.resolve(cycleScopePick(node, scope)).then(() => refreshStateStrip(node));
        };
        el.append(pickBtn);
        // 删除（常显小 ×）
        const del2 = document.createElement("button");
        del2.className = "bgs-del";
        del2.textContent = "×";
        del2.title = "关闭该随机";
        del2.onclick = event => {
            event.preventDefault(); event.stopPropagation();
            Promise.resolve(removeRandomScope(node, key, cat)).then(() => refreshStateStrip(node));
        };
        el.append(del2);
        if (pick === "starred_only") el.classList.add("only-star");
        nodes.push(el);
    }

    if (!nodes.length) {
        const hint = document.createElement("span");
        hint.style.cssText = "color:#5a7183;font:10px Arial,sans-serif;padding-left:2px;";
        hint.textContent = "未固定 · 未开随机（面板里点图钉或随机图标）";
        root.append(hint);
    } else {
        root.append(...nodes);
    }
    // 状态条内容变化时，只保证「最小高度」够放（多余高度交给 flex 分给输出区），
    // 绝不按增量累加——refreshStateStrip 是 async，并发调用会把增量重复加，实测能涨到 1700+。
    requestAnimationFrame(() => {
        let contentH = 0;
        for (const child of root.children) {
            if (child.offsetParent !== root) continue;
            contentH = Math.max(contentH, child.offsetTop + child.offsetHeight);
        }
        const stripH = Math.min(320, Math.max(42, contentH + 8));
        node.__grimoireStripHeight = stripH;
        node.__grimoirePanelHeight = Math.round(72 + stripH + 34 + 24);
        const minH = node.__grimoirePanelHeight;
        if ((node.size?.[1] || 0) < minH) node.setSize([node.size[0], minH]);
        node.setDirtyCanvas?.(true, true);
    });
}

function splitTags(text) {
    return String(text || "").split(",").map(t => t.trim()).filter(Boolean);
}

/** 追加标签：与已有内容去重（固定标签会随每次插入带出，不去重会越点越长） */
function appendTags(node, text) {
    const widget = tagsWidget(node);
    if (!widget) return 0;
    const base = String(widget.value || "");
    const existing = new Set(splitTags(base).map(t => t.toLowerCase()));
    const add = [];
    for (const tag of splitTags(text)) {
        const key = tag.toLowerCase();
        if (existing.has(key)) continue;
        existing.add(key);
        add.push(tag);
    }
    if (!add.length) return 0;
    widget.value = base.trim() ? `${base.trim().replace(/,\s*$/, "")}, ${add.join(", ")}` : add.join(", ");
    widget.callback?.call(widget, widget.value);
    node.setDirtyCanvas?.(true, true);
    return add.length;
}

/** 把一次执行的结果写进节点的输出区 */
function applyRunOutput(node, text) {
    node.__lastOutput = text || "";
    const box = node.__grimoireOutText;
    if (!box) return;
    if (text) {
        box.textContent = text;
        box.classList.remove("empty");
    } else {
        box.textContent = "运行后这里显示最终提示词（含固定的词与随机抽到的词）";
        box.classList.add("empty");
    }
}

/** 清空全部：提示词 + 所有固定标签 + 所有随机池 */
async function clearEverything(node) {
    const widget = tagsWidget(node);
    if (widget) {
        widget.value = "";
        widget.callback?.call(widget, "");
    }
    writeScopes(node, []);
    writePins(node, {});
    refreshStateStrip(node);
    node.setDirtyCanvas?.(true, true);
}

app.registerExtension({
    name: "BlackRin.GrimoireNode",
    async setup() {
        // 节点执行完：ui.text 里是最终提示词，接到节点的结果区
        api.addEventListener("executed", event => {
            const detail = event?.detail;
            if (!detail?.node) return;
            const node = app.graph?.getNodeById?.(detail.node);
            if (!node || node.type !== NODE) return;
            const text = detail.output?.text?.[0];
            if (typeof text === "string") applyRunOutput(node, text);
        });
    },
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE) return;
        // ★ 切换工作流时 ComfyUI 可能复用节点对象（走 onConfigure 而不是重建），
        //   此时 widget 值被换成新工作流的数据，状态条必须跟着刷新。
        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (info) {
            const result = onConfigure?.apply(this, arguments);
            const node = this;
            const resync = () => {
                try {
                    node.__grimoireResync?.();     // 由 onNodeCreated 挂上去的组合刷新
                    refreshStateStrip(node);
                } catch (error) {
                    console.warn("[BlackRin 标签库] 配置恢复后刷新失败", error);
                }
            };
            resync();
            requestAnimationFrame(resync);        // widget 值可能下一帧才就位
            setTimeout(resync, 120);
            return result;
        };

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);
            const node = this;
            node.size = [Math.max(node.size?.[0] || 0, 520), Math.max(node.size?.[1] || 0, 300)];

            const bar = document.createElement("div");
            bar.style.cssText = "display:flex;align-items:center;gap:6px;padding:4px 2px 2px;width:100%;box-sizing:border-box;";

            const openBtn = document.createElement("button");
            openBtn.innerHTML = `${svgIcon("library", 14)}<span>标签库</span>`;
            openBtn.style.cssText = "flex:1 1 auto;height:28px;display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--bgn-accent);border-radius:7px;background:var(--bgn-accent-soft);color:var(--bgn-accent-text);font:12px Arial,'Microsoft YaHei',sans-serif;cursor:pointer;";
            openBtn.onclick = event => {
                event.preventDefault();
                event.stopPropagation();
                openGrimoire({
                    insert: text => appendTags(node, text),
                    pins: readPins(node),
                    onPinsChange: pins => { writePins(node, pins); refreshStateStrip(node); },
                    randomScopes: readScopes(node),
                    onRandomChange: ({ scopes }) => {
                        writeScopes(node, scopes || []);
                    },
                    onClose: () => {
                        refreshCount();
                        refreshStateStrip(node);
                    },
                });
            };

            const clearBtn = document.createElement("button");
            clearBtn.innerHTML = svgIcon("trash", 14);
            clearBtn.title = "清空全部：提示词 + 所有固定标签 + 所有随机池";
            clearBtn.style.cssText = "width:30px;height:28px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--bgn-border);border-radius:7px;background:var(--bgn-control);color:var(--bgn-text-sub);cursor:pointer;";
            // 全清是破坏性操作：点一次变「⚠」，2 秒内再点才真清，防误触
            let clearArmed = false;
            let clearTimer = null;
            clearBtn.onclick = event => {
                event.preventDefault();
                event.stopPropagation();
                if (!clearArmed) {
                    clearArmed = true;
                    clearBtn.innerHTML = svgIcon("trash", 14);
                    clearBtn.title = "再点一次确认：清空提示词 + 所有固定 + 所有随机池";
                    clearBtn.style.cssText = "width:30px;height:28px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--bgn-danger);border-radius:7px;background:var(--bgn-danger);color:#fff;cursor:pointer;";
                    clearTimer = setTimeout(() => {
                        clearArmed = false;
                        clearBtn.innerHTML = svgIcon("trash", 14);
                        clearBtn.title = "清空全部：提示词 + 所有固定标签 + 所有随机池";
                        clearBtn.style.cssText = "width:30px;height:28px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--bgn-border);border-radius:7px;background:var(--bgn-control);color:var(--bgn-text-sub);cursor:pointer;";
                    }, 2200);
                    return;
                }
                clearTimeout(clearTimer);
                clearArmed = false;
                clearBtn.innerHTML = svgIcon("trash", 14);
                clearBtn.title = "清空全部：提示词 + 所有固定标签 + 所有随机池";
                clearBtn.style.cssText = "width:30px;height:28px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--bgn-border);border-radius:7px;background:var(--bgn-control);color:var(--bgn-text-sub);cursor:pointer;";
                clearEverything(node);
            };

            const count = document.createElement("span");
            count.style.cssText = "color:#6f8b9c;font:10px Arial,sans-serif;white-space:nowrap;";
            const refreshCount = () => {
                const n = splitTags(tagsWidget(node)?.value).length;
                count.textContent = n ? `${n} 段` : "";
            };

            bar.append(openBtn, clearBtn, count);

            /* 运行结果区：后端 execute 会把「手选 + 固定 + 随机」拼好的最终提示词
               通过 ui.text 返回，这里接住显示出来，并带一个复制按钮。 */
            const outWrap = document.createElement("div");
            outWrap.className = "bgs-out";
            const outText = document.createElement("div");
            outText.className = "bgs-out-text empty";
            outText.textContent = "运行后这里显示最终提示词（含固定的词与随机抽到的词）";
            const outCopy = document.createElement("button");
            outCopy.className = "bgs-out-copy";
            outCopy.innerHTML = svgIcon("copy", 13);
            outCopy.title = "复制这次输出";
            outCopy.onclick = event => {
                event.preventDefault();
                event.stopPropagation();
                const value = (node.__lastOutput || "").trim();
                if (!value) return;
                if (navigator.clipboard?.writeText) navigator.clipboard.writeText(value).catch(() => {});
                else {
                    const area = document.createElement("textarea");
                    area.value = value;
                    area.style.cssText = "position:fixed;left:-9999px;opacity:0";
                    document.body.append(area);
                    area.select();
                    document.execCommand("copy");
                    area.remove();
                }
                outCopy.innerHTML = '<span style="color:var(--bgn-accent);font-size:12px">✓</span>';
                setTimeout(() => { outCopy.innerHTML = svgIcon("copy", 13); }, 900);
            };
            outWrap.append(outText, outCopy);
            node.__grimoireOutText = outText;

            // 状态条：夹在输出区与按钮行之间
            installStripStyles();
            const strip = document.createElement("div");
            strip.style.cssText = [
                "position:relative", "flex:0 0 auto",
                "display:flex", "flex-wrap:wrap", "align-items:flex-start", "gap:5px 6px",
                "overflow:hidden", "padding:6px 2px 4px",
                "width:100%", "box-sizing:border-box", "min-height:40px",
            ].join(";");
            node.__grimoireStripEl = strip;
            node.__grimoireStripHeight = 42;

            /* ★ 三个区块合并成一个 DOM widget。
               ComfyUI 会把节点多余高度均摊给每个 DOM widget（实测输出区被拉到 192、按钮行 168），
               合成一个容器后内部用 flex 分配：输出区吃掉多余高度（能显示更长的提示词），
               状态条按内容高，按钮行固定。 */
            outWrap.style.flex = "1 1 auto";
            outWrap.style.minHeight = "72px";
            bar.style.flex = "0 0 auto";
            bar.style.marginTop = "4px";
            const panelBox = document.createElement("div");
            panelBox.style.cssText = "display:flex;flex-direction:column;width:100%;height:100%;box-sizing:border-box;overflow:hidden";
            panelBox.append(outWrap, strip, bar);
            const panelWidget = node.addDOMWidget("grimoire_ui", "grimoire_ui", panelBox, {
                serialize: false,
                hideOnZoom: false,
            });
            panelWidget.computeSize = () => [0, node.__grimoirePanelHeight || 260];
            panelWidget.options = panelWidget.options || {};
            panelWidget.options.getHeight = () => "100%";

            // panel_state 只是状态载体，不占节点界面
            const ps = stateWidget(node);
            if (ps) {
                ps.hidden = true;
                ps.options = ps.options || {};
                ps.options.hidden = true;
                ps.computeSize = () => [0, -4];
            }

            // tags 只是数据载体（面板选词写进来、后端读它），界面不再显示——
            // 节点上唯一的内容展示就是下面的「输出区」。
            const tw = tagsWidget(node);
            if (tw) {
                tw.hidden = true;
                tw.options = tw.options || {};
                tw.options.hidden = true;
                tw.computeSize = () => [0, -4];
            }

            const widget = tagsWidget(node);
            if (widget) {
                const oldCallback = widget.callback;
                widget.callback = function (...args) {
                    const out = oldCallback?.apply(this, args);
                    refreshCount();
                    // 手改过就不再显示上次运行结果，改回预排
                    node.__lastOutput = "";
                    refreshStateStrip(node);
                    return out;
                };
            }
            refreshCount();
            refreshStateStrip(node);
            // 供 onConfigure（切换工作流）调用
            node.__grimoireResync = () => { refreshCount(); refreshStateStrip(node); };
            return result;
        };
    },
});
