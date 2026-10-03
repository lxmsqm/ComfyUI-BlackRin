/**
 * BlackRin 自动缩放 — 实时计算分辨率显示
 * 根据上游图像宽高比 + 目标百万像素 + 对齐倍数，
 * 在节点上实时显示将要计算出的输出分辨率。
 */

import { app } from "/scripts/app.js";

const NODE_TYPE = "BlackRin_ImageResolutionCalc";

function upstreamImageSize(startNode) {
    let current = startNode;
    for (let hop = 0; hop < 3 && current; hop++) {
        const img = current.imgs?.[0];
        if (img) {
            const w = img.naturalWidth || img.width;
            const h = img.naturalHeight || img.height;
            if (w > 0 && h > 0) return [w, h];
        }
        const input = (current.inputs || []).find(inp => inp.type === "IMAGE" && inp.link != null);
        if (!input) return null;
        const graph = current.graph || app.graph;
        const link = graph?.links?.[input.link];
        if (!link) return null;
        current = graph.getNodeById(link.origin_id);
    }
    return null;
}

// 与 nodes.py BlackRin_ImageResolutionCalc.go 保持同一公式
function computedSize(width, height, megapixels, align) {
    const shortSource = Math.min(width, height);
    const longSource = Math.max(width, height);
    const ratio = shortSource / longSource;
    const targetPx = Math.max(0.05, megapixels) * 1024 * 1024;
    const n = Math.max(1, Math.round(align));
    const longSide = Math.max(n, Math.floor(Math.sqrt(targetPx / ratio) / n) * n);
    const shortSide = Math.max(n, Math.floor((longSide * ratio) / n) * n);
    return width < height ? [shortSide, longSide] : [longSide, shortSide];
}

app.registerExtension({
    name: "BlackRin.ResolutionCalcPreview",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData?.name !== NODE_TYPE) return;
        const orig = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = orig?.apply(this, arguments);
            const self = this;
            const element = document.createElement("div");
            element.style.cssText = "display:flex;justify-content:center;align-items:center;gap:6px;padding:4px 6px;margin:2px 8px;border-radius:4px;background:#1d2731;color:#0aa4d6;font:11px/1.2 Arial,sans-serif;";
            element.textContent = "计算分辨率：—（连接图像后显示）";
            self.addDOMWidget("计算分辨率", "display", element);

            const widgetValue = name => {
                const widget = (self.widgets || []).find(item => item.name === name);
                return widget ? Number(widget.value) : NaN;
            };
            const update = () => {
                const megapixels = widgetValue("目标百万像素");
                const align = widgetValue("对齐倍数");
                const size = upstreamImageSize(self);
                if (!Number.isFinite(megapixels) || !Number.isFinite(align) || !size) {
                    element.textContent = "计算分辨率：—（连接图像后显示）";
                    return;
                }
                const [w, h] = computedSize(size[0], size[1], megapixels, align);
                element.textContent = `计算分辨率：${w} × ${h}`;
            };
            for (const name of ["目标百万像素", "对齐倍数"]) {
                const widget = (self.widgets || []).find(item => item.name === name);
                if (!widget) continue;
                const originalCallback = widget.callback;
                widget.callback = function () {
                    const res = originalCallback?.apply(this, arguments);
                    update();
                    return res;
                };
            }
            const onConnectionsChange = self.onConnectionsChange;
            self.onConnectionsChange = function () {
                onConnectionsChange?.apply(this, arguments);
                update();
            };
            const timer = setInterval(update, 600);
            const onRemoved = self.onRemoved;
            self.onRemoved = function () {
                clearInterval(timer);
                onRemoved?.apply(this, arguments);
            };
            update();
            return result;
        };
    },
});
