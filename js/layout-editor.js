/* ============================================================
   布局编辑注入脚本
   —— 被注入到预览 iframe 里，让用户直接拖动页面上的板块
   —— 通过 postMessage 把结果回传给编辑器
   ============================================================ */

(function () {
    "use strict";

    if (window.__layoutEditorActive) return;
    window.__layoutEditorActive = true;

    const SECTIONS = [
        { id: "home", label: "首页 Hero" },
        { id: "milestones", label: "成长里程碑" },
        { id: "works", label: "作品集" },
        { id: "notes", label: "日常记录" },
        { id: "gallery", label: "照片墙" },
        { id: "links", label: "常用链接" },
    ];

    const state = {
        order: [],
        pinned: [],
        hidden: [],
        dragId: null,
    };

    /* ---------- 工具条 ---------- */
    let bar = null;
    function ensureBar() {
        if (bar) return bar;
        bar = document.createElement("div");
        bar.id = "__layoutBar";
        bar.style.cssText = `
            position:fixed; left:50%; transform:translateX(-50%);
            top:10px; z-index:99999;
            display:flex; align-items:center; gap:8px;
            padding:8px 14px; border-radius:12px;
            background:rgba(20,18,31,.94); color:#e9e6f5;
            font:13px/1.5 "Microsoft YaHei",system-ui,sans-serif;
            box-shadow:0 10px 34px rgba(0,0,0,.5);
            border:1px solid #322d4d;
        `;
        bar.innerHTML = `
            <span style="font-weight:700;color:#a78bfa">🧩 布局编辑</span>
            <button data-act="reset" style="background:#2a2740;color:#e9e6f5;border:1px solid #322d4d;border-radius:7px;padding:4px 10px;cursor:pointer;font-size:12px">重置</button>
            <button data-act="done" style="background:linear-gradient(120deg,#7c5cf0,#a78bfa);color:#fff;border:none;border-radius:7px;padding:4px 12px;cursor:pointer;font-size:12px;font-weight:600">完成</button>
        `;
        document.body.appendChild(bar);
        bar.querySelector('[data-act="done"]').onclick = () => post("done");
        bar.querySelector('[data-act="reset"]').onclick = () => {
            state.order = SECTIONS.map(s => s.id);
            state.pinned = [];
            state.hidden = [];
            commit();
        };
        return bar;
    }

    /* ---------- 消息 ---------- */
    function post(type, extra) {
        parent.postMessage({
            __layoutEditor: true, type,
            order: state.order, pinned: state.pinned, hidden: state.hidden,
        }, "*");
    }

    /* 改完立刻应用到页面 */
    function commit() {
        applyAll();
        post("change");
    }

    /* ---------- 注入板块手柄 ---------- */
    function injectHandles() {
        SECTIONS.forEach(s => {
            const el = document.getElementById(s.id);
            if (!el) return;
            el.setAttribute("data-layout-sec", s.id);
            el.style.transition = "opacity .18s, outline-color .18s";
            el.style.outline = "2px dashed transparent";
            el.style.outlineOffset = "-2px";

            if (el.querySelector(".__lh")) return;
            const h = document.createElement("div");
            h.className = "__lh";
            h.style.cssText = `
                position:absolute; top:8px; right:8px; z-index:9998;
                display:flex; gap:4px; align-items:center;
                padding:4px 8px; border-radius:8px;
                background:rgba(20,18,31,.92); border:1px solid #322d4d;
                font:11px/1.4 "Microsoft YaHei",system-ui,sans-serif; color:#e9e6f5;
                cursor:grab; user-select:none;
            `;
            h.innerHTML = `<span style="color:#a78bfa;font-weight:700">⠿</span><span>${s.label}</span>`;
            h.title = "拖动可调整板块顺序";
            el.style.position = el.style.position || "relative";

            // 钉住 / 隐藏 按钮
            const pin = document.createElement("button");
            pin.textContent = "📌";
            pin.title = "钉住这个板块";
            pin.style.cssText = "background:none;border:none;cursor:pointer;font-size:12px;padding:0 2px;opacity:.55";
            pin.onclick = (e) => {
                e.stopPropagation();
                const i = state.pinned.indexOf(s.id);
                if (i >= 0) state.pinned.splice(i, 1); else state.pinned.push(s.id);
                commit();
                refresh();
            };

            const hide = document.createElement("button");
            hide.textContent = "👁";
            hide.title = "隐藏 / 显示这个板块";
            hide.style.cssText = "background:none;border:none;cursor:pointer;font-size:12px;padding:0 2px;opacity:.55";
            hide.onclick = (e) => {
                e.stopPropagation();
                const i = state.hidden.indexOf(s.id);
                if (i >= 0) state.hidden.splice(i, 1); else state.hidden.push(s.id);
                commit();
                refresh();
            };

            h.appendChild(pin);
            h.appendChild(hide);
            el.appendChild(h);

            // 拖拽排序
            h.addEventListener("mousedown", (e) => {
                if (e.target.tagName === "BUTTON") return;
                state.dragId = s.id;
                el.style.opacity = "0.5";
                e.preventDefault();
            });
        });
    }

    function refresh() {
        SECTIONS.forEach(s => {
            const el = document.getElementById(s.id);
            if (!el) return;
            const h = el.querySelector(".__lh");
            if (!h) return;
            const pin = h.children[1], hide = h.children[2];
            if (pin) pin.style.opacity = state.pinned.includes(s.id) ? "1" : "0.4";
            if (hide) hide.style.opacity = state.hidden.includes(s.id) ? "1" : "0.4";
        });
        applyAll();
    }

    /* ---------- 应用布局 ---------- */
    function applyAll() {
        const main = document.querySelector("main") || document.body;
        // 按 order 排序
        state.order.forEach(id => {
            const el = document.getElementById(id);
            if (el) main.appendChild(el);
        });
        // 隐藏
        SECTIONS.forEach(s => {
            const el = document.getElementById(s.id);
            if (!el) return;
            el.style.display = state.hidden.includes(s.id) ? "none" : "";
        });
        // 钉住
        SECTIONS.forEach(s => {
            const el = document.getElementById(s.id);
            if (!el) return;
            const on = state.pinned.includes(s.id);
            el.classList.toggle("pinned", on);
            el.style.outlineColor = on ? "#5fd39a" : "transparent";
            el.style.outline = on ? "2px dashed #5fd39a" : "2px dashed transparent";
        });
    }

    /* ---------- 板块直接拖动 ---------- */
    function bindSectionDrag() {
        SECTIONS.forEach(s => {
            const el = document.getElementById(s.id);
            if (!el) return;

            el.addEventListener("dragover", (e) => {
                if (!state.dragId || state.dragId === s.id) return;
                e.preventDefault();
                const r = el.getBoundingClientRect();
                const after = e.clientY > r.top + r.height / 2;
                el.style.outlineColor = "#a78bfa";
                el.style.outlineStyle = "solid";
                el.dataset.dropAfter = after ? "1" : "0";
            });

            el.addEventListener("dragleave", () => {
                el.style.outlineColor = state.pinned.includes(s.id) ? "#5fd39a" : "transparent";
                el.style.outlineStyle = "dashed";
            });

            el.addEventListener("drop", (e) => {
                if (!state.dragId || state.dragId === s.id) return;
                e.preventDefault();
                const src = state.dragId;
                const after = el.dataset.dropAfter === "1";
                const from = state.order.indexOf(src);
                state.order.splice(from, 1);
                let to = state.order.indexOf(s.id);
                if (after) to++;
                state.order.splice(to, 0, src);
                state.dragId = null;
                commit();
            });
        });
    }

    /* ---------- 初始化 ---------- */
    function init(config) {
        state.order = (config.order && config.order.length) ? config.order.slice() : SECTIONS.map(s => s.id);
        state.pinned = (config.pinned || []).slice();
        state.hidden = (config.hidden || []).slice();
        // 补齐缺失的
        SECTIONS.forEach(s => { if (!state.order.includes(s.id)) state.order.push(s.id); });

        ensureBar();
        injectHandles();
        bindSectionDrag();
        refresh();

        // 让板块本身可拖
        SECTIONS.forEach(s => {
            const el = document.getElementById(s.id);
            if (el) el.setAttribute("draggable", "false"); // 避免与内容选择冲突
        });

        // 接收来自编辑器的消息
        window.addEventListener("message", (e) => {
            const d = e.data;
            if (!d || !d.__layoutEditor) return;
            if (d.type === "config") {
                state.order = d.order || state.order;
                state.pinned = d.pinned || [];
                state.hidden = d.hidden || [];
                refresh();
            } else if (d.type === "exit") {
                cleanup();
            }
        });

        post("ready");
    }

    function cleanup() {
        if (bar) { bar.remove(); bar = null; }
        document.querySelectorAll(".__lh").forEach(h => h.remove());
        SECTIONS.forEach(s => {
            const el = document.getElementById(s.id);
            if (!el) return;
            el.style.outline = "";
            el.style.outlineColor = "";
            el.style.outlineStyle = "";
            el.style.opacity = "";
            el.classList.remove("pinned");
        });
        window.__layoutEditorActive = false;
        post("exit-done");
    }

    window.__layoutEditor = { init, cleanup, state, commit, applyAll };
})();
