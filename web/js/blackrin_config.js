/**
 * BlackRin 配置面板：服务(API) + 规则(图片/文本)
 * ================================================
 * 界面照提示词小助手的编辑器做：模态窗 + 顶部标签页；
 * 服务页是「每个服务一个标签页 + 卡片表单 + 模型标签管理」，
 * 规则页是「类型子标签 + 紧凑列表 + 编辑对话框」。
 *
 * 数据来自 /blackrin/config：
 *   own    = user/default/BlackRin/config.json（可编辑，保存时回写这里）
 *   merged = own + 提示词小助手（只读展示，同名以 own 为准）
 * 只读条目的密钥一律打码，绝不明文显示。
 */

import { api } from "/scripts/api.js";
import { app } from "/scripts/app.js";

const ROUTE = "/blackrin/config";
const SETTINGS_CATEGORY = ["✨ BlackRin", "配置", "服务与规则"];
const RULE_TABS = [
    { key: "image", label: "图片规则", hint: "给「图文优化推理」与 H3 优化器用" },
    { key: "text", label: "文本规则", hint: "给纯文本扩写/改写用" },
];

const CSS = `
.bc-overlay{position:fixed;inset:0;z-index:10060;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6);font:12px Arial,sans-serif}
.bc-dialog{display:flex;flex-direction:column;width:min(820px,calc(100vw - 30px));max-height:calc(100vh - 60px);background:#17222c;color:#d7e3ec;border:1px solid #344958;border-radius:9px;box-shadow:0 18px 50px rgba(0,0,0,.5);padding:14px;box-sizing:border-box}
.bc-head{display:flex;align-items:center;gap:8px;margin-bottom:9px}
.bc-title{font-size:13px;white-space:nowrap}
.bc-path{color:#5d7385;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:auto}
.bc-tabs{display:flex;gap:4px;border-bottom:1px solid #2d4255;margin-bottom:10px}
.bc-tab{border:1px solid transparent;border-bottom:0;border-radius:6px 6px 0 0;background:#141f29;color:#93a7b6;font:12px Arial,sans-serif;padding:6px 14px;cursor:pointer}
.bc-tab.active{background:#1d2b36;border-color:#2d4255;color:#e2eef7}
.bc-body{overflow:auto;min-height:200px;flex:1 1 auto;padding-right:4px}
.bc-svctabs{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:9px}
.bc-svc{border:1px solid #334a5d;border-radius:6px;background:#141f29;color:#93a7b6;font:11px Arial,sans-serif;padding:4px 10px;cursor:pointer;max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bc-svc.active{background:#16303f;border-color:#0aa4d6;color:#dce7ee}
.bc-svc.ro{opacity:.72}
.bc-svc.add{border-style:dashed;border-color:#2c5368;color:#08b4ed;background:#101b26}
.bc-card{border:1px solid #2d4255;border-radius:8px;background:#141f29;padding:10px}
.bc-card-head{display:flex;align-items:center;gap:7px;margin-bottom:9px}
.bc-src{font-size:10px;border-radius:4px;padding:1px 6px;border:1px solid #33505f;color:#7f97a6;white-space:nowrap}
.bc-src.own{border-color:#2f6b7f;color:#4fb6d6}
.bc-row{display:grid;grid-template-columns:82px minmax(0,1fr) auto;align-items:center;gap:8px;margin-bottom:6px}
.bc-row>span{color:#9db0be;white-space:nowrap}
.bc-input{width:100%;box-sizing:border-box;background:#1d2b36;color:#dce7ee;border:1px solid #3a4d5b;border-radius:4px;padding:5px 6px;font:12px Arial,sans-serif}
.bc-input:disabled{color:#8ea3b2;background:#182530;border-color:#2b3d4a}
.bc-input.mono{font-family:Consolas,"Courier New",monospace;font-size:11px}
.bc-sec{margin-top:11px;padding-top:9px;border-top:1px solid #263744}
.bc-sec-head{display:flex;align-items:center;gap:8px;margin-bottom:7px}
.bc-sec-title{color:#c8d8e3;font-size:12px}
.bc-sec-note{color:#667887;font-size:10px;margin-right:auto}
.bc-tags{display:flex;flex-wrap:wrap;gap:5px;align-items:center}
.bc-tag{display:inline-flex;align-items:center;gap:5px;background:#22333f;border:1px solid #33505f;border-radius:5px;padding:3px 7px;color:#cfe0ea;font-size:11px}
.bc-tag.default{border-color:#2f6b7f;box-shadow:0 0 0 1px #2f6b7f inset}
.bc-defbadge{background:#0aa4d6;color:#06131b;border-radius:3px;padding:0 4px;font-size:9px;font-weight:600}
.bc-tag .star{color:#e0b23c;cursor:pointer;font-size:11px}
.bc-tag .star.off{color:#4a5b68}
.bc-model-list{max-height:280px;overflow:auto;border:1px solid #2d4255;border-radius:6px;background:#141f29;padding:4px}
.bc-model-row{display:flex;align-items:center;gap:7px;padding:4px 6px;border-radius:4px;cursor:pointer;color:#cfe0ea;font-size:11px}
.bc-model-row:hover{background:#1b2833}
.bc-model-name{font-family:Consolas,"Courier New",monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bc-tag button{border:0;background:transparent;color:#8fa3b3;cursor:pointer;font-size:11px;padding:0 1px}
.bc-tag button:hover{color:#e0715a}
.bc-tag-main{cursor:pointer}
.bc-empty{color:#6d8494;font-size:11px;padding:4px 1px}
.bc-btn{border:1px solid #3a5363;border-radius:4px;background:#1d2b36;color:#dce7ee;padding:5px 11px;cursor:pointer;font:12px Arial,sans-serif}
.bc-btn:hover{background:#24323e}
.bc-btn.sm{padding:3px 9px;font-size:11px}
.bc-btn.primary{background:#0aa4d6;border-color:#0aa4d6;color:#06131b;font-weight:600}
.bc-btn.ghost{border-style:dashed;border-color:#2c5368;color:#08b4ed;background:#101b26}
.bc-btn.danger:hover{background:#3a2020;border-color:#7a3b34;color:#e9a79b}
.bc-actions{display:flex;align-items:center;gap:8px;margin-top:12px;padding-top:10px;border-top:1px solid #2d4255}
.bc-status{margin-left:auto;color:#7f97a6;font-size:11px}
.bc-subtabs{display:flex;gap:4px;margin-bottom:9px;align-items:center}
.bc-subtab{border:1px solid #334a5d;border-radius:5px;background:#141f29;color:#93a7b6;font-size:11px;padding:4px 11px;cursor:pointer}
.bc-subtab.active{background:#16303f;border-color:#0aa4d6;color:#dce7ee}
.bc-subhint{color:#667887;font-size:10px;margin-left:6px}
.bc-list{border:1px solid #2d4255;border-radius:8px;overflow:hidden}
.bc-li{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:9px;padding:7px 10px;border-bottom:1px solid #233340;background:#141f29}
.bc-li:last-child{border-bottom:0}
.bc-li.ro{background:#121c25}
.bc-li-name{color:#dce7ee;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bc-li-meta{color:#6d8494;font-size:10px;white-space:nowrap}
.bc-li-ops{display:flex;gap:5px;align-items:center}
.bc-switch{position:relative;display:inline-flex;width:34px;height:19px;cursor:pointer;flex:0 0 auto}
.bc-switch input{opacity:0;width:0;height:0}
.bc-switch span{position:absolute;inset:0;border-radius:11px;background:#39434d;border:1px solid #52616d;transition:.15s}
.bc-switch span:before{content:"";position:absolute;width:13px;height:13px;left:2px;top:2px;border-radius:50%;background:#c3cbd1;transition:.15s}
.bc-switch input:checked+span{background:#0aa4d6;border-color:#0aa4d6}
.bc-switch input:checked+span:before{transform:translateX(15px);background:#fff}
.bc-sub{position:fixed;inset:0;z-index:10080;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5)}
.bc-subdialog{width:min(560px,calc(100vw - 40px));max-height:calc(100vh - 80px);overflow:auto;background:#17222c;color:#d7e3ec;border:1px solid #344958;border-radius:9px;padding:14px;box-sizing:border-box;box-shadow:0 18px 50px rgba(0,0,0,.55)}
.bc-subtitle{font-size:13px;margin-bottom:10px}
.bc-textarea{width:100%;box-sizing:border-box;min-height:260px;resize:vertical;background:#1d2b36;color:#dce7ee;border:1px solid #3a4d5b;border-radius:4px;padding:7px;font:12px/1.5 Consolas,"Courier New",monospace}
.bc-hint{color:#667887;font-size:10px;margin:4px 0 9px;line-height:1.5}
`;

function injectStyle() {
    if (document.getElementById("blackrin-config-style")) return;
    const style = document.createElement("style");
    style.id = "blackrin-config-style";
    style.textContent = CSS;
    document.head.appendChild(style);
}

function make(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
}

function clone(value) {
    return JSON.parse(JSON.stringify(value ?? null));
}

function newId(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

function models(service, key) {
    service[key] = service[key] || [];
    return service[key];
}

async function fetchConfig() {
    const response = await api.fetchApi(ROUTE, { cache: "no-store" });
    if (!response.ok) throw new Error(`读取配置失败：HTTP ${response.status}`);
    return response.json();
}

async function putConfig(config) {
    const response = await api.fetchApi(ROUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
    });
    if (!response.ok) throw new Error(`保存失败：HTTP ${response.status}`);
    return response.json();
}

async function runMigration(force) {
    const response = await api.fetchApi(`${ROUTE}/migrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: Boolean(force) }),
    });
    if (!response.ok) throw new Error(`迁移失败：HTTP ${response.status}`);
    return response.json();
}

/** 向该服务查询可用模型（密钥留在服务端，只递服务名）。 */
async function fetchServiceModels(service) {
    const response = await api.fetchApi(`${ROUTE}/service-models`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name: service.name || "",
            base_url: service.base_url || "",
            api_key: service.api_key || "",
            type: service.type || "openai_compatible",
        }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
    return data.models || [];
}

// ------------------------------------------------------------ 子对话框

function openSubDialog(title, buildBody, onConfirm, confirmLabel = "确定") {
    const overlay = make("div", "bc-sub");
    const dialog = make("div", "bc-subdialog");
    dialog.append(make("div", "bc-subtitle", title));
    const body = make("div");
    dialog.append(body);
    const refs = buildBody(body) || {};
    const actions = make("div", "bc-actions");
    const cancel = make("button", "bc-btn", "取消");
    const confirm = make("button", "bc-btn primary", confirmLabel);
    const close = () => overlay.remove();
    cancel.onclick = close;
    confirm.onclick = () => {
        if (onConfirm(refs) === false) return;
        close();
    };
    actions.append(cancel, confirm);
    dialog.append(actions);
    overlay.append(dialog);
    overlay.onclick = event => { if (event.target === overlay) close(); };
    document.body.appendChild(overlay);
    return close;
}

/* 添加模型：向服务拉取可用模型 → 搜索 + 勾选（也可手输） */
function openAddModelsDialog(service, key, onDone) {
    const picked = new Map();
    const manual = [];
    const closeDialog = openSubDialog(`添加模型 · ${key === "vlm_models" ? "图片模型" : "文本模型"}`, body => {
        const status = make("div", "bc-hint", "正在向服务查询可用模型…");
        body.append(status);
        const search = make("input", "bc-input");
        search.placeholder = "搜索模型…";
        search.style.margin = "0 0 7px";
        body.append(search);
        const listBox = make("div", "bc-model-list");
        body.append(listBox);
        const manualRow = make("div", "bc-row");
        manualRow.style.marginTop = "9px";
        manualRow.append(make("span", null, "手动添加"));
        const manualInput = make("input", "bc-input mono");
        manualInput.placeholder = "列表里没有的模型名，回车加入";
        manualRow.append(manualInput, make("span"));
        body.append(manualRow);

        let known = [];
        const refresh = () => {
            const keyword = search.value.trim().toLowerCase();
            listBox.replaceChildren();
            const existing = new Set(models(service, key).map(item => String(item.name)));
            const names = [...new Set([...known, ...manual])];
            const shown = names.filter(name => !keyword || name.toLowerCase().includes(keyword));
            if (!shown.length) {
                listBox.append(make("div", "bc-empty",
                    known.length ? "没有匹配的模型" : "服务没有返回模型，可用下面的「手动添加」"));
                return;
            }
            shown.forEach(name => {
                const row = make("label", "bc-model-row");
                const box = make("input");
                box.type = "checkbox";
                box.checked = picked.has(name);
                box.onchange = () => {
                    if (box.checked) picked.set(name, true);
                    else picked.delete(name);
                    updateCount();
                };
                row.append(box, make("span", "bc-model-name", name));
                if (existing.has(name)) row.append(make("span", "bc-src", "已添加"));
                listBox.append(row);
            });
        };
        const updateCount = () => { status.textContent = `已选 ${picked.size} 个`; };
        search.oninput = refresh;
        manualInput.onkeydown = event => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            const value = manualInput.value.trim();
            if (!value) return;
            if (!manual.includes(value)) manual.push(value);
            picked.set(value, true);
            manualInput.value = "";
            refresh();
            updateCount();
        };

        fetchServiceModels(service).then(names => {
            known = names;
            refresh();
            updateCount();
            if (!names.length) status.textContent = "服务没有返回模型，可手动添加";
        }).catch(error => {
            status.textContent = `查询失败：${error.message || error}（仍可手动添加）`;
            refresh();
        });
        refresh();
        return { picked, manual };
    }, () => {
        const list = models(service, key);
        const names = [...picked.keys()];
        if (!names.length) return false;
        const hasDefault = list.some(item => item.is_default);
        names.forEach((name, index) => {
            if (list.some(item => String(item.name) === name)) return;
            list.push({
                name,
                temperature: 0.7,
                max_tokens: 1000,
                top_p: 0.9,
                is_default: !hasDefault && index === 0,
            });
        });
        onDone();
    }, "添加");
    return closeDialog;
}

/* 已有模型：改参数 / 设默认 / 改名 */
function openModelParamsDialog(service, key, model, onChange) {
    openSubDialog("编辑模型", body => {
        const field = (label, input) => {
            const row = make("div", "bc-row");
            row.append(make("span", null, label));
            row.append(input, make("span"));
            body.append(row);
        };
        const name = make("input", "bc-input mono");
        name.value = String(model.name || "");
        field("模型名", name);
        const num = (label, value, step) => {
            const input = make("input", "bc-input");
            input.type = "number";
            input.step = String(step);
            input.value = String(value ?? "");
            field(label, input);
            return input;
        };
        const temperature = num("temperature", model.temperature ?? 0.7, 0.1);
        const maxTokens = num("max_tokens", model.max_tokens ?? 1000, 100);
        const topP = num("top_p", model.top_p ?? 0.9, 0.05);
        const defRow = make("div", "bc-row");
        defRow.append(make("span", null, "默认"));
        const defBox = make("input");
        defBox.type = "checkbox";
        defBox.checked = Boolean(model.is_default);
        defRow.append(defBox, make("span"));
        body.append(defRow);
        body.append(make("div", "bc-hint",
            "参数写给图文反推节点用；H3 优化器只用模型名。默认模型是该服务未指定时的兜底。"
            + "推理型模型（deepseek / sensenova / glm 等）会先花几千 token 思考，"
            + "max_tokens 太小会导致最终答案为空——节点会自动抬到 16384 并按需翻倍，"
            + "但在这里调大能减少重试。"));
        return { name, temperature, maxTokens, topP, defBox };
    }, refs => {
        const value = refs.name.value.trim();
        if (!value) return false;
        model.name = value;
        model.temperature = Number(refs.temperature.value || 0.7);
        model.max_tokens = Number(refs.maxTokens.value || 1000);
        model.top_p = Number(refs.topP.value || 0.9);
        if (refs.defBox.checked) {
            models(service, key).forEach(item => { delete item.is_default; });
        }
        model.is_default = refs.defBox.checked;
        onChange();
    }, "保存");
}

/* 规则：名称 + 正文 */
function openRuleDialog(rule, onDone) {
    openSubDialog(rule ? "编辑规则" : "添加规则", body => {
        const row = make("div", "bc-row");
        row.append(make("span", null, "名称"));
        const name = make("input", "bc-input");
        name.value = String(rule.name || "");
        name.placeholder = "下拉里显示的名字";
        row.append(name, make("span"));
        body.append(row);
        body.append(make("div", "bc-hint",
            "正文会作为 system 内容整段发给模型。留空或过短（<10 字）的规则不会出现在下拉里。"));
        const area = make("textarea", "bc-textarea");
        area.value = String(rule.content || "");
        area.placeholder = "规则正文…";
        body.append(area);
        const counter = make("div", "bc-hint", `${area.value.length} 字`);
        area.oninput = () => { counter.textContent = `${area.value.length} 字`; };
        body.append(counter);
        return { name, area };
    }, refs => {
        const name = refs.name.value.trim();
        if (!name) return false;
        rule.name = name;
        rule.content = refs.area.value;
        onDone();
    }, "保存");
}

// ------------------------------------------------------------ 面板

export async function openBlackRinConfig(initialTab = "services") {
    injectStyle();
    let snapshot;
    try {
        snapshot = await fetchConfig();
    } catch (error) {
        console.error("[BlackRin 配置]", error);
        alert(String(error.message || error));
        return;
    }
    const own = clone(snapshot.own) || { version: 1, services: [], rules: { image: [], text: [] } };
    own.services = own.services || [];
    own.rules = own.rules || { image: [], text: [] };
    own.rules.image = own.rules.image || [];
    own.rules.text = own.rules.text || [];

    const overlay = make("div", "bc-overlay");
    const dialog = make("div", "bc-dialog");
    const head = make("div", "bc-head");
    head.append(make("span", "bc-title", "BlackRin 配置"));
    head.append(make("span", "bc-path", snapshot.path || ""));
    const closeBtn = make("button", "bc-btn", "关闭");
    closeBtn.onclick = () => overlay.remove();
    head.append(closeBtn);
    dialog.append(head);

    const tabs = make("div", "bc-tabs");
    const body = make("div", "bc-body");
    const status = make("span", "bc-status", "");
    const setStatus = text => { status.textContent = text; };

    let activeTab = initialTab === "rules" ? "rules" : "services";
    let activeRuleKind = "image";
    let activeService = 0;          // own.services 的下标；-1 = 正在看只读服务
    let readonlyView = null;

    const mergedReadonly = (snapshot.merged.services || []).filter(s => s.readonly);

    const note = text => body.append(make("div", "bc-hint", text));

    const renderServices = () => {
        note("这里的服务会出现在「图文优化推理」节点和 H3 优化器的下拉里（与小助手的同名服务以这里为准）。密钥只在自己的服务上以密码框显示。");
        const strip = make("div", "bc-svctabs");
        own.services.forEach((service, index) => {
            const btn = make("button", "bc-svc", service.name || `服务 ${index + 1}`);
            btn.classList.toggle("active", readonlyView === null && index === activeService);
            btn.onclick = () => { readonlyView = null; activeService = index; render(); };
            strip.append(btn);
        });
        mergedReadonly.forEach(service => {
            const btn = make("button", "bc-svc ro", `${service.name}（只读）`);
            btn.classList.toggle("active", readonlyView === service);
            btn.onclick = () => { readonlyView = service; render(); };
            strip.append(btn);
        });
        const add = make("button", "bc-svc add", "＋ 添加服务");
        add.onclick = () => {
            own.services.push({
                id: newId("service"), name: "新服务", type: "openai_compatible",
                base_url: "", api_key: "", vlm_models: [], llm_models: [],
            });
            readonlyView = null;
            activeService = own.services.length - 1;
            render();
        };
        strip.append(add);
        body.append(strip);

        const service = readonlyView || own.services[activeService];
        if (!service) {
            body.append(make("div", "bc-empty", "还没有服务，点「＋ 添加服务」开始"));
            return;
        }
        const readonly = Boolean(readonlyView);
        body.append(buildServiceCard(service, readonly));
    };

    const buildServiceCard = (service, readonly) => {
        const card = make("div", "bc-card");
        const headRow = make("div", "bc-card-head");
        headRow.append(make("span", `bc-src${readonly ? "" : " own"}`,
            readonly ? "来自小助手（只读）" : "BlackRin（可编辑）"));
        if (!readonly) {
            const del = make("button", "bc-btn sm danger", "删除服务");
            del.style.marginLeft = "auto";
            del.onclick = () => {
                if (!confirm(`删除服务「${service.name}」？`)) return;
                own.services.splice(activeService, 1);
                activeService = Math.max(0, activeService - 1);
                render();
            };
            headRow.append(del);
        }
        card.append(headRow);

        const field = (label, key, options = {}) => {
            const row = make("div", "bc-row");
            row.append(make("span", null, label));
            const holder = make("div");
            holder.style.minWidth = "0";
            let input;
            if (readonly && key === "api_key") {
                input = make("input", "bc-input mono");
                input.value = service.has_key ? "已配置（隐藏）" : "（未设置）";
                input.disabled = true;
            } else {
                input = make("input", "bc-input");
                input.type = options.password ? "password" : "text";
                input.value = String(service[key] || "");
                input.placeholder = options.placeholder || "";
                input.disabled = readonly;
                input.oninput = () => { service[key] = input.value; };
            }
            holder.append(input);
            row.append(holder);
            if (options.password && !readonly) {
                const eye = make("button", "bc-btn sm", "👁");
                eye.title = "显示/隐藏密钥";
                eye.onclick = () => { input.type = input.type === "password" ? "text" : "password"; };
                row.append(eye);
            } else {
                row.append(make("span"));
            }
            card.append(row);
        };
        field("名称", "name", { placeholder: "例如 LM studio" });
        field("地址", "base_url", { placeholder: "https://... 或 http://127.0.0.1:9292/v1" });
        field("密钥", "api_key", { password: true, placeholder: "本地服务可留空" });

        [["vlm_models", "图片模型"], ["llm_models", "文本模型"]].forEach(([key, label]) => {
            const sec = make("div", "bc-sec");
            const secHead = make("div", "bc-sec-head");
            secHead.append(make("span", "bc-sec-title", label));
            const count = make("span", "bc-sec-note", `${models(service, key).length} 个`);
            secHead.append(count);
            if (!readonly) {
                const add = make("button", "bc-btn sm ghost", "＋ 添加模型");
                add.onclick = () => openAddModelsDialog(service, key, render);
                secHead.append(add);
            }
            sec.append(secHead);

            const tags = make("div", "bc-tags");
            const list = models(service, key);
            if (!list.length) tags.append(make("div", "bc-empty", "（无）"));
            list.forEach(model => {
                const tag = make("span", `bc-tag${model.is_default ? " default" : ""}`);
                const main = make("span", "bc-tag-main", String(model.name || ""));
                main.title = readonly ? "" : "点击编辑该模型的采样参数";
                if (!readonly) {
                    main.onclick = () => openModelParamsDialog(service, key, model, render);
                }
                tag.append(main);
                if (model.is_default) tag.append(make("span", "bc-defbadge", "默认"));
                if (!readonly) {
                    const setDefault = make("button", null, "☆");
                    setDefault.title = "设为默认模型";
                    setDefault.onclick = () => {
                        list.forEach(item => { delete item.is_default; });
                        model.is_default = true;
                        render();
                    };
                    const del = make("button", null, "×");
                    del.title = "移除该模型";
                    del.onclick = () => {
                        service[key] = list.filter(item => item !== model);
                        render();
                    };
                    tag.append(setDefault, del);
                }
                tags.append(tag);
            });
            sec.append(tags);
            card.append(sec);
        });
        return card;
    };

    const renderRules = () => {
        const subtabs = make("div", "bc-subtabs");
        RULE_TABS.forEach(def => {
            const btn = make("button", "bc-subtab", def.label);
            btn.classList.toggle("active", def.key === activeRuleKind);
            btn.onclick = () => { activeRuleKind = def.key; render(); };
            subtabs.append(btn);
        });
        subtabs.append(make("span", "bc-subhint",
            RULE_TABS.find(t => t.key === activeRuleKind)?.hint || ""));
        body.append(subtabs);

        const add = make("button", "bc-btn ghost", "＋ 添加规则");
        add.style.marginBottom = "9px";
        add.onclick = () => {
            const rule = { id: newId(activeRuleKind), name: "新规则", content: "", enabled: true };
            own.rules[activeRuleKind].push(rule);
            openRuleDialog(rule, render);
        };
        body.append(add);

        const listBox = make("div", "bc-list");
        const ownRules = own.rules[activeRuleKind];
        const roRules = (snapshot.merged.rules[activeRuleKind] || []).filter(r => r.readonly);
        if (!ownRules.length && !roRules.length) {
            body.append(make("div", "bc-empty", "还没有规则"));
            return;
        }
        ownRules.forEach(rule => {
            const row = make("div", "bc-li");
            row.append(make("div", "bc-li-name", String(rule.name || "（未命名）")));
            const ops = make("div", "bc-li-ops");
            const sw = make("label", "bc-switch");
            const box = make("input");
            box.type = "checkbox";
            box.checked = rule.enabled !== false;
            box.title = "是否出现在节点下拉里";
            box.onchange = () => { rule.enabled = box.checked; };
            sw.append(box, make("span"));
            ops.append(sw);
            const edit = make("button", "bc-btn sm", "编辑");
            edit.onclick = () => openRuleDialog(rule, render);
            const del = make("button", "bc-btn sm danger", "删除");
            del.onclick = () => {
                own.rules[activeRuleKind] = ownRules.filter(item => item !== rule);
                render();
            };
            ops.append(edit, del);
            row.append(make("div", "bc-li-meta",
                `BlackRin · ${String(rule.content || "").length} 字`), ops);
            listBox.append(row);
        });
        roRules.forEach(rule => {
            const row = make("div", "bc-li ro");
            row.append(make("div", "bc-li-name", String(rule.name || "")));
            const ops = make("div", "bc-li-ops");
            ops.append(make("span", "bc-src", "只读"));
            row.append(make("div", "bc-li-meta",
                `小助手 · ${String(rule.content || "").length} 字`), ops);
            listBox.append(row);
        });
        body.append(listBox);
    };

    const render = () => {
        for (const tab of tabs.children) tab.classList.toggle("active", tab.dataset.key === activeTab);
        body.replaceChildren();
        if (activeTab === "services") renderServices();
        else renderRules();
    };

    [["services", "服务 / API"], ["rules", "规则"]].forEach(([key, label]) => {
        const btn = make("button", "bc-tab", label);
        btn.dataset.key = key;
        btn.onclick = () => { activeTab = key; render(); };
        tabs.append(btn);
    });
    dialog.append(tabs, body);

    const actions = make("div", "bc-actions");
    const migrate = make("button", "bc-btn", "从小助手重新迁移");
    migrate.title = "用提示词小助手的当前配置覆盖本文件的种子内容";
    migrate.onclick = async () => {
        if (!confirm("用提示词小助手的配置覆盖 BlackRin 自己的服务与规则？手改过的内容会丢失。")) return;
        setStatus("迁移中…");
        try {
            const result = await runMigration(true);
            setStatus(`已重新迁移：${result.services} 服务 / ${result.rules_image} 图片规则 / ${result.rules_text} 文本规则`);
            snapshot = await fetchConfig();
            own.services = clone(snapshot.own.services);
            own.rules = clone(snapshot.own.rules);
            readonlyView = null;
            activeService = 0;
            render();
        } catch (error) {
            setStatus(String(error.message || error));
        }
    };
    const save = make("button", "bc-btn primary", "保存");
    save.onclick = async () => {
        setStatus("保存中…");
        try {
            snapshot = await putConfig(own);
            setStatus("已保存（节点下拉下次打开时刷新）");
        } catch (error) {
            setStatus(String(error.message || error));
        }
    };
    actions.append(migrate, save, status);
    dialog.append(actions);

    overlay.append(dialog);
    overlay.onclick = event => { if (event.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
    render();
}

// ---- 注册到 ComfyUI 设置面板（同提示词小助手：一行一个按钮）----

function buttonRow(label, tooltip, tab) {
    const row = document.createElement("tr");
    row.className = "blackrin-settings-row";
    const labelCell = document.createElement("td");
    labelCell.className = "comfy-menu-label";
    labelCell.title = tooltip;
    row.appendChild(labelCell);
    const buttonCell = document.createElement("td");
    const button = document.createElement("button");
    button.textContent = label;
    button.title = tooltip;
    button.style.cssText = "padding:6px 14px;cursor:pointer;border-radius:4px;"
        + "border:1px solid #3a5363;background:#1d2b36;color:#dce7ee;font:12px Arial,sans-serif";
    button.onclick = () => openBlackRinConfig(tab);
    buttonCell.appendChild(button);
    row.appendChild(buttonCell);
    return row;
}

app.registerExtension({
    name: "BlackRin.ConfigPanel",
    settings: [
        {
            id: "BlackRin.Config.Services",
            name: "服务 / API 管理",
            category: SETTINGS_CATEGORY,
            tooltip: "增删改 BlackRin 自己的服务（地址/密钥/模型）；与提示词小助手的服务合并后出现在节点下拉里",
            type: () => buttonRow("API管理器", "增删改服务与模型", "services"),
        },
        {
            id: "BlackRin.Config.Rules",
            name: "图片 / 文本规则管理",
            category: SETTINGS_CATEGORY,
            tooltip: "增删改 BlackRin 自己的提示词规则（图片规则给图文反推与 H3 优化器，文本规则给纯文本用途）",
            type: () => buttonRow("规则管理器", "增删改图片/文本规则", "rules"),
        },
    ],
});
