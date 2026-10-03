/**
 * BlackRin 分组总控 / 分组锚点
 * ============================
 * 锚点放进任意分组，总控面板列出所有已注册分组，
 * 每组切换：启用(0) ↔ 屏蔽(4, 节点原生 bypass 直通)。
 * 面板上"互斥绑定"把分组绑成互斥对：甲侧 1 组 ⇄ 乙侧 N 组（乙侧同开同关），
 * 开一方自动屏蔽另一方。绑定关系存总控节点 properties 随工作流保存。
 * 纯前端控制器：不参与执行。
 */

import { app } from "/scripts/app.js";

const MASTER_TYPE = "BlackRin_GroupMaster";
const ANCHOR_TYPE = "BlackRin_GroupAnchor";
const SKIP_TYPES = new Set([MASTER_TYPE, ANCHOR_TYPE]);
const STATE_MODES = { active: 0, bypass: 4 };
const STATE_COLORS = { active: "#2e9e63", bypass: "#c47f2e" };

// 模块级注册表：所有锚点节点实例（节点 id 在加载工作流时会变，不能作键）
const anchorRegistry = new Set();

const CSS_ID = "brgc-style";
function ensureCss() {
    if (document.getElementById(CSS_ID)) return;
    const style = document.createElement("style");
    style.id = CSS_ID;
    style.textContent = `
.brgc { display:flex; flex-direction:column; gap:6px; padding:2px 4px 4px; }
.brgc-row { display:flex; align-items:center; gap:8px; background:linear-gradient(135deg,#1b242f,#151c24); border:1px solid #2b3947; border-radius:10px; padding:7px 10px; }
.brgc-pairrow { background:linear-gradient(135deg,#182734,#131b25); border-color:#27455c; }
.brgc-side { flex:1; min-width:0; display:flex; align-items:center; gap:6px; }
.brgc-x { flex:0 0 auto; color:#5aa7d6; font:bold 13px/1 'Segoe UI',Arial,sans-serif; }
.brgc-unbind { flex:0 0 auto; border:0; background:transparent; color:#5c7182; font:12px/1 Arial,sans-serif; cursor:pointer; padding:2px 4px; border-radius:4px; }
.brgc-unbind:hover { color:#d95252; background:#2a1d22; }
.brgc-dot { width:8px; height:8px; border-radius:50%; flex:0 0 auto; }
.brgc-name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#d9e4ec; font:12px/1.2 'Segoe UI',Arial,sans-serif; }
.brgc-seg { flex:0 0 auto; display:flex; border:1px solid #2b3947; border-radius:999px; overflow:hidden; }
.brgc-seg button { border:0; background:transparent; color:#7f93a3; font:11px/1.4 'Segoe UI',Arial,sans-serif; padding:3px 11px; cursor:pointer; transition:background .15s,color .15s; }
.brgc-seg button.on-active { background:#2e9e63; color:#eafff3; }
.brgc-seg button.on-bypass { background:#c47f2e; color:#fff7ea; }
.brgc-seg button:hover:not(.on-active):not(.on-bypass) { color:#c9d8e4; background:#22303d; }
.brgc-pairbtn { width:100%; border:0; border-radius:8px; font:12px/1.4 'Segoe UI',Arial,sans-serif; padding:6px 10px; cursor:pointer; transition:background .15s,color .15s; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.brgc-pairbtn.on-active { background:#2e9e63; color:#eafff3; }
.brgc-pairbtn.on-bypass { background:#221a14; color:#d98b2b; }
.brgc-pairbtn.on-bypass:hover { background:#2a211a; color:#f0a040; }
.brgc-empty { color:#5c7182; font:11px/1.5 'Segoe UI',Arial,sans-serif; padding:6px 4px; }
.brgc-add { align-self:flex-start; border:1px dashed #34495c; background:transparent; color:#7fa8c9; font:11px/1.4 'Segoe UI',Arial,sans-serif; padding:5px 14px; border-radius:999px; cursor:pointer; transition:background .15s,color .15s; }
.brgc-add:hover { background:#1b2c3a; color:#a8cde8; }
.brgc-picker { display:flex; flex-direction:column; gap:6px; background:#131b24; border:1px solid #27455c; border-radius:10px; padding:8px 10px; }
.brgc-picker-title { color:#8ba7bc; font:11px/1.4 'Segoe UI',Arial,sans-serif; }
.brgc-picker-preview { color:#5aa7d6; font:11px/1.4 'Segoe UI',Arial,sans-serif; }
.brgc-tabs { display:flex; gap:4px; }
.brgc-tab { flex:1; border:1px solid #2b3947; background:#1b242f; color:#7f93a3; font:11px/1.4 'Segoe UI',Arial,sans-serif; padding:4px 0; border-radius:6px; cursor:pointer; transition:all .15s; }
.brgc-tab.cur-a { background:#7a4a1f; border-color:#d98b2b; color:#ffe9cf; }
.brgc-tab.cur-b { background:#27455c; border-color:#5aa7d6; color:#e3f3fc; }
.brgc-chips { display:flex; flex-wrap:wrap; gap:5px; }
.brgc-chip { border:1px solid #2b3947; background:#1b242f; color:#a9bccb; font:11px/1.4 'Segoe UI',Arial,sans-serif; padding:4px 12px; border-radius:999px; cursor:pointer; transition:all .15s; }
.brgc-chip:hover { border-color:#3d5a75; color:#d9e4ec; }
.brgc-chip.sel { background:#27455c; border-color:#5aa7d6; color:#e3f3fc; }
.brgc-chip.sel-a { background:#7a4a1f; border-color:#d98b2b; color:#ffe9cf; }
.brgc-picker-btns { display:flex; gap:6px; }
.brgc-picker-btns button { flex:0 0 auto; border:0; border-radius:6px; font:11px/1.4 'Segoe UI',Arial,sans-serif; padding:4px 14px; cursor:pointer; }
.brgc-ok { background:#2e9e63; color:#eafff3; }
.brgc-ok:disabled { background:#1d3a2b; color:#5c7d6b; cursor:default; }
.brgc-cancel { background:transparent; color:#7f93a3; }
.brgc-cancel:hover { color:#c9d8e4; }
.brgc-anchor { display:flex; justify-content:center; align-items:center; gap:5px; padding:5px; margin:2px 6px 4px; border-radius:8px; background:linear-gradient(135deg,#173042,#12212e); border:1px solid #274d66; color:#4db8e8; font:11px/1.2 'Segoe UI',Arial,sans-serif; }
`;
    document.head.appendChild(style);
}

// 新前端 LGraphGroup 用 Rectangle 类型的 bounds，旧前端是 [x,y,w,h] 数组的 bounding
function groupRect(group) {
    const b = group.bounds ?? group.bounding;
    if (!b) return null;
    if (Array.isArray(b)) return b;
    return [b.x, b.y, b.width, b.height];
}

function groupOf(node) {
    const graph = node.graph || app.graph;
    for (const group of graph?.groups || []) {
        const [gx, gy, gw, gh] = groupRect(group) || [0, 0, -1, -1];
        const cx = node.pos[0] + (node.size?.[0] || 0) / 2;
        const cy = node.pos[1] + (node.size?.[1] || 0) / 2;
        if (cx >= gx && cy >= gy && cx <= gx + gw && cy <= gy + gh) return group;
    }
    return null;
}

function groupMembers(group) {
    const members = [];
    const [gx, gy, gw, gh] = groupRect(group) || [0, 0, -1, -1];
    for (const node of app.graph._nodes || []) {
        if (SKIP_TYPES.has(node.type)) continue;
        // 与 ComfyUI 原生 LGraphGroup 一致：节点包围盒中心点落在组框内即算组员，
        // 节点超出组框不影响归属
        const b = node.boundingRect;
        const cx = b ? b[0] + b[2] / 2 : node.pos[0] + (node.size?.[0] || 0) / 2;
        const cy = b ? b[1] + b[3] / 2 : node.pos[1] + (node.size?.[1] || 0) / 2;
        if (cx >= gx && cy >= gy && cx <= gx + gw && cy <= gy + gh) members.push(node);
    }
    return members;
}

function applyGroupState(groupTitle, state) {
    const group = (app.graph.groups || []).find(g => g.title === groupTitle);
    if (!group) return;
    for (const node of groupMembers(group)) {
        node.mode = STATE_MODES[state] ?? 0;
    }
    app.graph.setDirtyCanvas(true, true);
}

function groupAnchors() {
    return [...anchorRegistry].filter(n => app.graph._nodes?.includes(n));
}

// 兼容旧格式 ["甲","乙"] 与新格式 {a:[...], b:[...]}
function normalizePair(entry) {
    if (Array.isArray(entry)) {
        if (typeof entry[0] === "string") return { a: [entry[0]], b: [entry[1]] };
        return null;
    }
    if (entry && Array.isArray(entry.a) && Array.isArray(entry.b) && entry.a.length && entry.b.length) {
        return { a: [...entry.a], b: [...entry.b] };
    }
    return null;
}

app.registerExtension({
    name: "BlackRin.GroupControl",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData?.name === ANCHOR_TYPE) {
            const orig = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const result = orig?.apply(this, arguments);
                const self = this;
                ensureCss();
                const element = document.createElement("div");
                element.className = "brgc-anchor";
                self.addDOMWidget("所在分组", "display", element);

                const refresh = () => {
                    const group = groupOf(self);
                    self.br_group_title = group?.title || "";
                    if (group) {
                        element.textContent = `⬓ ${group.title}`;
                        element.title = "由分组总控统一控制，可在总控面板绑定互斥";
                    } else {
                        element.textContent = "未放入分组";
                        element.title = "把本节点放进任意分组内";
                    }
                };
                anchorRegistry.add(self);
                const timer = setInterval(refresh, 600);
                const onRemoved = self.onRemoved;
                self.onRemoved = function () {
                    clearInterval(timer);
                    anchorRegistry.delete(self);
                    onRemoved?.apply(this, arguments);
                };
                refresh();
                return result;
            };
        }

        if (nodeData?.name === MASTER_TYPE) {
            const orig = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const result = orig?.apply(this, arguments);
                const self = this;
                ensureCss();
                const container = document.createElement("div");
                container.className = "brgc";
                self.addDOMWidget("分组控制", "display", container);

                const states = { ...(self.properties?.br_group_states || {}) };
                const pairs = (self.properties?.br_group_pairs || [])
                    .map(normalizePair).filter(Boolean);
                let picking = false;
                let pickSide = "a";
                let assign = { a: [], b: [] };

                const save = () => {
                    self.properties.br_group_states = { ...states };
                    self.properties.br_group_pairs = pairs.map(p => ({ a: [...p.a], b: [...p.b] }));
                };

                const applyAll = () => {
                    for (const [title, state] of Object.entries(states)) {
                        if ((app.graph.groups || []).some(g => g.title === title)) {
                            applyGroupState(title, state === "active" ? "active" : "bypass");
                        }
                    }
                    for (const p of pairs) {
                        const aActive = p.a.some(t => states[t] === "active");
                        const bActive = p.b.some(t => states[t] === "active");
                        if (aActive && bActive) {
                            p.b.forEach(t => applyGroupState(t, "bypass"));
                        } else if (aActive) {
                            p.a.forEach(t => applyGroupState(t, "active"));
                            p.b.forEach(t => applyGroupState(t, "bypass"));
                        } else if (bActive) {
                            p.b.forEach(t => applyGroupState(t, "active"));
                            p.a.forEach(t => applyGroupState(t, "bypass"));
                        }
                    }
                };

                let lastSig = "";
                const render = () => {
                    const anchors = groupAnchors();
                    const groups = [...new Set(anchors.map(n => n.br_group_title).filter(Boolean))].sort();
                    const sig = JSON.stringify([groups, pairs, states, picking, pickSide, assign]);
                    if (sig === lastSig) return;
                    lastSig = sig;
                    container.replaceChildren();
                    if (!groups.length) {
                        const hint = document.createElement("div");
                        hint.className = "brgc-empty";
                        hint.textContent = "把分组锚点放进任意分组后自动出现";
                        container.appendChild(hint);
                        return;
                    }
                    const setState = (title, st) => {
                        states[title] = st;
                        const p = pairs.find(q => q.a.includes(title) || q.b.includes(title));
                        if (p && st === "active") {
                            // 同侧联动：开一组，本侧全开、对侧全屏蔽
                            const same = p.a.includes(title) ? p.a : p.b;
                            const other = same === p.a ? p.b : p.a;
                            same.forEach(t => { states[t] = "active"; });
                            other.forEach(t => { states[t] = "bypass"; });
                        }
                        save();
                        applyAll();
                        lastSig = "";
                        render();
                    };
                    const makeSide = (title, parent) => {
                        const state = states[title] === "active" ? "active" : "bypass";
                        const dot = document.createElement("span");
                        dot.className = "brgc-dot";
                        dot.style.background = STATE_COLORS[state];
                        const name = document.createElement("span");
                        name.className = "brgc-name";
                        name.textContent = title;
                        name.title = title;
                        const seg = document.createElement("div");
                        seg.className = "brgc-seg";
                        for (const st of ["active", "bypass"]) {
                            const btn = document.createElement("button");
                            btn.textContent = st === "active" ? "启用" : "屏蔽";
                            if (state === st) btn.className = `on-${st}`;
                            btn.onclick = () => setState(title, st);
                            seg.appendChild(btn);
                        }
                        parent.append(dot, name, seg);
                    };
                    const pairBtn = (titles, onclick, parent) => {
                        const active = titles.some(t => states[t] === "active");
                        const btn = document.createElement("button");
                        btn.className = "brgc-pairbtn " + (active ? "on-active" : "on-bypass");
                        btn.textContent = titles.join(" + ");
                        btn.title = active ? "当前启用" : "点击启用本侧并自动屏蔽另一侧";
                        btn.onclick = onclick;
                        parent.appendChild(btn);
                    };

                    const bound = new Set(pairs.flatMap(p => [...p.a, ...p.b]));
                    // 互斥绑定：甲侧 1 组 ⇄ 乙侧 N 组，两边各一个开关
                    for (const p of pairs) {
                        if (![...p.a, ...p.b].every(t => groups.includes(t))) continue;
                        const row = document.createElement("div");
                        row.className = "brgc-row brgc-pairrow";
                        const sideA = document.createElement("div");
                        sideA.className = "brgc-side";
                        pairBtn(p.a, () => {
                            p.a.forEach(t => { states[t] = "active"; });
                            p.b.forEach(t => { states[t] = "bypass"; });
                            save(); applyAll(); lastSig = ""; render();
                        }, sideA);
                        const x = document.createElement("span");
                        x.className = "brgc-x";
                        x.textContent = "⇄";
                        x.title = "互斥：开一方自动屏蔽另一方";
                        const sideB = document.createElement("div");
                        sideB.className = "brgc-side";
                        pairBtn(p.b, () => {
                            p.b.forEach(t => { states[t] = "active"; });
                            p.a.forEach(t => { states[t] = "bypass"; });
                            save(); applyAll(); lastSig = ""; render();
                        }, sideB);
                        const unbind = document.createElement("button");
                        unbind.className = "brgc-unbind";
                        unbind.textContent = "✕";
                        unbind.title = `解除「${p.a.join("+")}」和「${p.b.join("+")}」的互斥绑定`;
                        unbind.onclick = () => {
                            pairs.splice(pairs.indexOf(p), 1);
                            save();
                            lastSig = "";
                            render();
                        };
                        row.append(sideA, x, sideB, unbind);
                        container.appendChild(row);
                    }
                    // 未绑定的组：普通行
                    for (const title of groups) {
                        if (bound.has(title)) continue;
                        const row = document.createElement("div");
                        row.className = "brgc-row";
                        makeSide(title, row);
                        container.appendChild(row);
                    }

                    if (picking) {
                        const available = groups.filter(t => !bound.has(t));
                        const box = document.createElement("div");
                        box.className = "brgc-picker";
                        const tabs = document.createElement("div");
                        tabs.className = "brgc-tabs";
                        for (const side of ["a", "b"]) {
                            const tab = document.createElement("button");
                            tab.className = "brgc-tab" + (pickSide === side ? (side === "a" ? " cur-a" : " cur-b") : "");
                            tab.textContent = (side === "a" ? "甲侧" : "乙侧") + `（${assign[side].length}）`;
                            tab.title = side === "a" ? "甲侧：选入这边的组同开同关，与乙侧互斥" : "乙侧：选入这边的组同开同关，与甲侧互斥";
                            tab.onclick = () => {
                                pickSide = side;
                                lastSig = "";
                                render();
                            };
                            tabs.appendChild(tab);
                        }
                        const label = document.createElement("div");
                        label.className = "brgc-picker-title";
                        label.textContent = `正在选择${pickSide === "a" ? "甲" : "乙"}侧分组，点分组加入当前侧，再点移除；两侧可各选任意多个`;
                        const preview = document.createElement("div");
                        preview.className = "brgc-picker-preview";
                        if (assign.a.length || assign.b.length) {
                            preview.textContent = `甲：${assign.a.join(" + ") || "（空）"}  ⇄  乙：${assign.b.join(" + ") || "（空）"}`;
                        }
                        const chips = document.createElement("div");
                        chips.className = "brgc-chips";
                        for (const title of available) {
                            const inA = assign.a.indexOf(title);
                            const inB = assign.b.indexOf(title);
                            const chip = document.createElement("button");
                            chip.className = "brgc-chip" + (inA >= 0 ? " sel-a" : inB >= 0 ? " sel" : "");
                            chip.textContent = title + (inA >= 0 ? " ／甲" : inB >= 0 ? " ／乙" : "");
                            chip.onclick = () => {
                                const cur = assign[pickSide];
                                const at = cur.indexOf(title);
                                if (at >= 0) cur.splice(at, 1);
                                else {
                                    // 从另一侧挪到当前侧
                                    const other = assign[pickSide === "a" ? "b" : "a"];
                                    const ot = other.indexOf(title);
                                    if (ot >= 0) other.splice(ot, 1);
                                    cur.push(title);
                                }
                                lastSig = "";
                                render();
                            };
                            chips.appendChild(chip);
                        }
                        const btns = document.createElement("div");
                        btns.className = "brgc-picker-btns";
                        const ok = document.createElement("button");
                        ok.className = "brgc-ok";
                        ok.textContent = "绑定";
                        ok.disabled = !assign.a.length || !assign.b.length;
                        ok.onclick = () => {
                            pairs.push({ a: [...assign.a], b: [...assign.b] });
                            assign = { a: [], b: [] };
                            pickSide = "a";
                            picking = false;
                            save();
                            applyAll();
                            lastSig = "";
                            render();
                        };
                        const cancel = document.createElement("button");
                        cancel.className = "brgc-cancel";
                        cancel.textContent = "取消";
                        cancel.onclick = () => {
                            assign = { a: [], b: [] };
                            pickSide = "a";
                            picking = false;
                            lastSig = "";
                            render();
                        };
                        btns.append(ok, cancel);
                        box.append(tabs, label, preview, chips, btns);
                        container.appendChild(box);
                    } else {
                        const add = document.createElement("button");
                        add.className = "brgc-add";
                        add.textContent = "＋ 互斥绑定";
                        add.title = "把分组绑成互斥：甲乙两侧各选任意多个组，同侧同开同关，开一方自动屏蔽另一方";
                        add.onclick = () => {
                            picking = true;
                            assign = { a: [], b: [] };
                            pickSide = "a";
                            lastSig = "";
                            render();
                        };
                        container.appendChild(add);
                    }
                };

                const tick = () => { applyAll(); render(); };
                const timer = setInterval(tick, 600);
                const onRemoved = self.onRemoved;
                self.onRemoved = function () {
                    clearInterval(timer);
                    onRemoved?.apply(this, arguments);
                };
                const onConfigure = self.onConfigure;
                self.onConfigure = function (info) {
                    onConfigure?.apply(this, arguments);
                    Object.assign(states, info.properties?.br_group_states || {});
                    pairs.length = 0;
                    pairs.push(...(info.properties?.br_group_pairs || []).map(normalizePair).filter(Boolean));
                    setTimeout(tick, 300);
                };
                render();
                return result;
            };
        }
    },
});
