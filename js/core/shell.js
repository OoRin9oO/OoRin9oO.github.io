/* ============================================================
   shell.js —— 站点外壳
   职责：主题加载与切换、外观变量注入、导航、灯箱、回到顶部
   主题只负责「怎么画」，这里负责「画什么、怎么换」
   ============================================================ */

(function () {
    "use strict";

    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

    const esc = (s) => String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    /* ---------- 主题清单 ----------
       以后加 3D 主题，只要在这里加一行 + 建两个文件 */
    const THEMES = {
        classic: {
            name: "经典",
            icon: "▦",
            desc: "干净、安静、看得清",
            css: "css/themes/classic.css",
            js: "js/themes/classic.js",
        },
        motion: {
            name: "流动",
            icon: "≈",
            desc: "会动的排版，滚动时有层次",
            css: "css/themes/motion.css",
            js: "js/themes/motion.js",
        },
    };

    const LS_SKIN = "rin9-skin";
    const LS_MODE = "rin9-mode";

    /* ---------- 主题注册表 ----------
       主题脚本在这里登记自己，shell 负责调用 */
    const registry = {};
    window.RinThemes = {
        register(def) {
            if (def && def.id) registry[def.id] = def;
        },
        get(id) { return registry[id] || null; },
        has(id) { return !!registry[id]; },
    };

    const state = {
        skin: null,
        instance: null,
        loading: false,
    };

    const getData = () => window.SITE_DATA || {};

    /* ============================================================
       一、外观：把 data.appearance 变成 CSS 变量
       ============================================================ */
    const FONT_STACKS = {
        system: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
        serif: '"Songti SC", "SimSun", Georgia, "Times New Roman", serif',
        rounded: '"Nunito", "Quicksand", "PingFang SC", "Microsoft YaHei", sans-serif',
        mono: '"JetBrains Mono", "Cascadia Code", Consolas, "Courier New", monospace',
    };

    function hexToRgba(hex, alpha) {
        let h = String(hex || "").replace("#", "").trim();
        if (h.length === 3) h = h.split("").map(c => c + c).join("");
        if (h.length !== 6) return null;
        const n = parseInt(h, 16);
        if (isNaN(n)) return null;
        const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    function applyAppearance() {
        const a = getData().appearance || {};
        const root = document.documentElement.style;

        if (a.accent) {
            root.setProperty("--accent", a.accent);
            const soft = hexToRgba(a.accent, 0.14);
            const soft2 = hexToRgba(a.accent, 0.22);
            if (soft) root.setProperty("--accent-soft", soft);
            if (soft2) root.setProperty("--accent-glow", soft2);
        }
        if (a.accent2) root.setProperty("--accent-2", a.accent2);

        if (typeof a.radius === "number") {
            root.setProperty("--radius", a.radius + "px");
            root.setProperty("--radius-sm", Math.max(4, Math.round(a.radius * 0.66)) + "px");
        }
        if (typeof a.maxw === "number" && a.maxw > 0) {
            root.setProperty("--maxw", a.maxw + "px");
        }
        if (typeof a.blur === "number") {
            root.setProperty("--blur", "blur(" + a.blur + "px)");
        }
        if (a.font && FONT_STACKS[a.font]) {
            root.setProperty("--font-sans", FONT_STACKS[a.font]);
        }
        // 疏密：整体节奏
        const DENSITY = { compact: "0.72", normal: "1", loose: "1.3" };
        root.setProperty("--gap-scale", DENSITY[a.density] || "1");
    }

    /* ============================================================
       二、深浅色
       ============================================================ */
    function applyMode(m) {
        document.documentElement.setAttribute("data-theme", m);
        const btn = $("#themeBtn");
        if (btn) {
            btn.textContent = m === "light" ? "🌙" : "☀️";
            btn.title = m === "light" ? "切到深色" : "切到浅色";
        }
    }

    function initMode() {
        const saved = localStorage.getItem(LS_MODE)
            || (getData().appearance || {}).mode
            || "dark";
        applyMode(saved);
        $("#themeBtn")?.addEventListener("click", () => {
            const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
            applyMode(next);
            localStorage.setItem(LS_MODE, next);
        });
    }

    /* ============================================================
       三、导航
       ============================================================ */
    const SEC_NAMES = {
        home: "首页", milestones: "里程碑", works: "作品集",
        notes: "日常记录", gallery: "照片墙", links: "链接",
    };

    function buildNav() {
        const box = $("#navLinks");
        if (!box) return;
        const L = getData().layout || {};
        const order = (L.order && L.order.length) ? L.order : ["home", "milestones", "works", "notes", "gallery", "links"];
        const hidden = L.hidden || [];

        box.innerHTML = order
            .filter(id => SEC_NAMES[id])
            .map(id => `<a href="#${id}"${hidden.includes(id) ? ' style="display:none"' : ""}>${SEC_NAMES[id]}</a>`)
            .join("");

        const toggle = $("#navToggle");
        toggle?.addEventListener("click", () => box.classList.toggle("open"));
        box.addEventListener("click", (e) => {
            if (e.target.tagName === "A") box.classList.remove("open");
        });

        const brand = $(".nav-brand");
        if (brand) brand.textContent = "🎐 " + ((getData().profile || {}).name || "Rin9");
    }

    /* ============================================================
       四、皮肤菜单
       ============================================================ */
    function buildSkinMenu() {
        const menu = $("#skinMenu");
        if (!menu) return;

        menu.innerHTML = Object.entries(THEMES).map(([id, t]) => `
            <button class="skin-item" data-skin-id="${id}">
                <span class="skin-icon">${t.icon}</span>
                <span class="skin-info">
                    <span class="skin-name">${esc(t.name)}</span>
                    <span class="skin-desc">${esc(t.desc)}</span>
                </span>
                <span class="skin-check">✓</span>
            </button>`).join("") + `
            <div class="skin-foot">
                更多界面还在做 —— 立体空间、更强的动效
            </div>`;

        const btn = $("#skinBtn");
        let openY = 0;

        function openMenu() {
            openY = window.scrollY || 0;
            menu.classList.add("open");
            btn && btn.setAttribute("aria-expanded", "true");
        }

        function closeMenu() {
            if (!menu.classList.contains("open")) return;
            menu.classList.remove("open");
            btn && btn.setAttribute("aria-expanded", "false");
        }

        btn?.addEventListener("click", (e) => {
            e.stopPropagation();
            if (menu.classList.contains("open")) closeMenu();
            else openMenu();
        });

        // 点空白处关闭
        document.addEventListener("click", (e) => {
            if (!menu.contains(e.target) && e.target !== btn && !btn?.contains(e.target)) {
                closeMenu();
            }
        });

        // 滚动就关闭：菜单固定在视口上，页面一动它就该收起来，
        // 否则会一直浮在内容上面挡住视线
        window.addEventListener("scroll", () => {
            if (!menu.classList.contains("open")) return;
            // 留 10px 容差，避免触控板轻微抖动就关掉
            if (Math.abs((window.scrollY || 0) - openY) > 10) closeMenu();
        }, { passive: true });

        // 按 Esc 关闭
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") closeMenu();
        });

        // 窗口尺寸变化时重新对齐（菜单宽度依赖视口）
        window.addEventListener("resize", closeMenu, { passive: true });

        menu.addEventListener("click", (e) => {
            const b = e.target.closest("[data-skin-id]");
            if (!b) return;
            closeMenu();
            setSkin(b.dataset.skinId, { remember: true });
        });
    }

    function syncSkinMenu() {
        $$("#skinMenu [data-skin-id]").forEach(b => {
            b.classList.toggle("current", b.dataset.skinId === state.skin);
        });
    }

    /* ============================================================
       五、主题加载
       ============================================================ */
    /* 资源加载统一加超时：网络卡住时不能把界面吊死 */
    const LOAD_TIMEOUT = 9000;

    function withTimeout(promise, ms, label) {
        return new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error(label + " 超时")), ms);
            promise.then(v => { clearTimeout(t); resolve(v); },
                         e => { clearTimeout(t); reject(e); });
        });
    }

    function loadCSS(href, attr) {
        const p = new Promise((resolve, reject) => {
            const l = document.createElement("link");
            l.rel = "stylesheet";
            l.href = href;
            if (attr) l.setAttribute(attr, "1");
            l.onload = () => resolve(l);
            l.onerror = () => reject(new Error("样式加载失败：" + href));
            document.head.appendChild(l);
        });
        return withTimeout(p, LOAD_TIMEOUT, "样式 " + href);
    }

    function loadJS(src) {
        const p = new Promise((resolve, reject) => {
            const s = document.createElement("script");
            s.src = src;
            s.onload = () => resolve(s);
            s.onerror = () => reject(new Error("脚本加载失败：" + src));
            document.body.appendChild(s);
        });
        return withTimeout(p, LOAD_TIMEOUT, "脚本 " + src);
    }

    async function setSkin(id, opts) {
        opts = opts || {};
        const def = THEMES[id];
        if (!def) {
            console.warn("未知主题：" + id);
            return;
        }
        if (state.loading) return;

        // 已经是这个主题：也要把"记住"这件事做掉，否则点当前项不会保存选择
        if (state.skin === id && state.instance) {
            if (opts.remember) localStorage.setItem(LS_SKIN, id);
            syncSkinMenu();
            return;
        }

        state.loading = true;
        const root = $("#app");

        try {
            // 1. 先把新主题的样式与脚本准备好 —— 成功了才动现有页面。
            //    否则网络一卡用户就会看到白屏，而且回不来。
            const prevCss = $$("link[data-skin-css]");

            let cssLoaded = null;
            try {
                cssLoaded = await loadCSS(def.css, "data-skin-css");
                // 新的到位了再撤旧的，避免中间出现无样式闪烁
                prevCss.forEach(l => l.remove());
            } catch (e) {
                console.warn(e.message);
                // 样式没下来就放弃，保持原样
                if (cssLoaded) cssLoaded.remove();
                state.loading = false;
                if (state.skin) return;
                // 首次加载没有旧主题可留，只能继续
            }

            if (!window.RinThemes || !window.RinThemes.get(id)) {
                try {
                    await loadJS(def.js);
                } catch (e) {
                    console.warn(e.message);
                }
            }

            const theme = window.RinThemes && window.RinThemes.get(id);
            if (!theme) {
                console.error("主题脚本未注册：" + id);
                // 有旧主题就留着，别把页面搞空
                if (state.skin) {
                    try { await loadCSS(THEMES[state.skin].css, "data-skin-css"); } catch (e) { /* ignore */ }
                    toastMsg("界面加载失败，已保持原样");
                    return;
                }
                if (root) root.innerHTML = `<div style="padding:60px 20px;text-align:center;color:#a8a2c4">
                    界面加载失败，请刷新重试</div>`;
                return;
            }

            // 2. 淡出旧主题
            if (root && state.skin) {
                root.classList.add("skin-leaving");
                await new Promise(r => setTimeout(r, 180));
            }

            // 3. 卸载旧的
            try {
                if (state.instance && typeof state.instance.unmount === "function") {
                    state.instance.unmount();
                }
            } catch (e) { console.warn(e); }
            state.instance = null;

            // 4. 挂载新的
            if (root) {
                root.innerHTML = "";
                root.classList.remove("skin-leaving");
            }
            document.documentElement.setAttribute("data-skin", id);
            try {
                state.instance = theme.mount(root, {
                    data: getData(),
                    esc, $, $$,
                    openLightbox,
                    applyLayout,
                    applySectionTitles,
                    onReveal: setupReveal,
                }) || {};
            } catch (e) {
                console.error("主题挂载失败：", e);
            }

            state.skin = id;
            if (root) {
                root.classList.add("skin-entering");
                setTimeout(() => root && root.classList.remove("skin-entering"), 600);
            }

            // 5. 通用后处理
            applyLayout();
            applySectionTitles();
            setupReveal();
            syncSkinMenu();

            if (opts.remember) localStorage.setItem(LS_SKIN, id);
        } finally {
            state.loading = false;
        }
    }

    /* 轻量提示（不依赖编辑器） */
    function toastMsg(text) {
        let t = document.getElementById("__siteToast");
        if (!t) {
            t = document.createElement("div");
            t.id = "__siteToast";
            t.style.cssText = "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);" +
                "z-index:9999;padding:10px 18px;border-radius:999px;font-size:13px;" +
                "background:rgba(20,18,31,.94);color:#ece9f7;border:1px solid rgba(255,255,255,.14);" +
                "box-shadow:0 10px 30px rgba(0,0,0,.4);transition:opacity .3s;";
            document.body.appendChild(t);
        }
        t.textContent = text;
        t.style.opacity = "1";
        clearTimeout(t._timer);
        t._timer = setTimeout(() => { t.style.opacity = "0"; }, 2600);
    }

    /* ============================================================
       六、布局与板块标题（通用，主题不用各自实现）
       ============================================================ */
    function applyLayout() {
        const L = getData().layout;
        if (!L) return;

        const els = $$("section[id], header[id]");
        const order = (L.order && L.order.length) ? L.order : [];
        const rank = (el) => {
            const i = order.indexOf(el.id);
            return i < 0 ? 999 : i;
        };

        // 按父容器分组重排：
        // 用注释节点做锚点，把排序后的元素依次插回原位置，
        // 这样既不会跨父容器搬运，也不会把 Hero 顶到页脚后面
        const byParent = new Map();
        els.forEach(el => {
            const p = el.parentElement;
            if (!p) return;
            if (!byParent.has(p)) byParent.set(p, []);
            byParent.get(p).push(el);
        });

        byParent.forEach((list, parent) => {
            if (list.length < 2) return;
            const sorted = list.slice().sort((a, b) => rank(a) - rank(b));
            const marker = document.createComment("layout");
            parent.insertBefore(marker, list[0]);
            sorted.forEach(el => parent.insertBefore(el, marker));
            marker.remove();
        });

        // 隐藏
        const hidden = L.hidden || [];
        els.forEach(el => {
            el.style.display = hidden.includes(el.id) ? "none" : "";
            el.dataset.hidden = hidden.includes(el.id) ? "1" : "0";
        });

        // 钉住
        const pinned = L.pinned || [];
        els.forEach(el => {
            const on = pinned.includes(el.id);
            el.classList.toggle("pinned", on);
            if (on) el.dataset.pinOrder = String(pinned.indexOf(el.id));
            else delete el.dataset.pinOrder;
        });

        // 导航同步
        $$("#navLinks a").forEach(a => {
            const id = (a.getAttribute("href") || "").slice(1);
            a.style.display = hidden.includes(id) ? "none" : "";
        });
    }

    function applySectionTitles() {
        const S = getData().sections || {};
        Object.keys(S).forEach(id => {
            const sec = document.getElementById(id);
            if (!sec) return;
            const cfg = S[id] || {};
            const h2 = sec.querySelector("[data-sec-head]") || sec.querySelector("h2");
            const p = sec.querySelector("[data-sec-sub]") || sec.querySelector(".section-head p");
            if (h2 && cfg.title) h2.textContent = cfg.title;
            if (p && cfg.sub) p.textContent = cfg.sub;
        });
    }

    /* ============================================================
       七、灯箱（全局，主题只用 ctx.openLightbox）
       ============================================================ */
    function openLightbox(src, caption) {
        const lb = $("#lightbox");
        if (!lb) return;
        $("#lightboxImg").src = src;
        $("#lightboxImg").alt = caption || "";
        $("#lightboxCap").textContent = caption || "";
        lb.classList.add("open");
        document.body.style.overflow = "hidden";
    }

    function closeLightbox() {
        $("#lightbox")?.classList.remove("open");
        document.body.style.overflow = "";
    }

    function setupLightbox() {
        const lb = $("#lightbox");
        if (!lb) return;
        lb.addEventListener("click", (e) => {
            if (e.target === lb || e.target.classList.contains("lightbox-close")) closeLightbox();
        });
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") closeLightbox();
        });
    }

    /* ============================================================
       八、滚动：入场、导航高亮、回到顶部
       ============================================================ */
    let io = null;
    function setupReveal() {
        if (io) io.disconnect();
        io = new IntersectionObserver((entries) => {
            entries.forEach(en => {
                if (en.isIntersecting) {
                    en.target.classList.add("in");
                    io.unobserve(en.target);
                }
            });
        }, { threshold: 0.1, rootMargin: "0px 0px -40px 0px" });
        $$(".reveal").forEach(el => io.observe(el));
    }

    function setupScroll() {
        const toTop = $("#toTop");
        let ticking = false;

        const onScroll = () => {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(() => {
                const y = window.scrollY;
                toTop?.classList.toggle("show", y > 420);

                let current = "";
                $$("section[id]").forEach(sec => {
                    if (sec.offsetTop - 130 <= y) current = sec.id;
                });
                $$("#navLinks a").forEach(a => {
                    a.classList.toggle("active", a.getAttribute("href") === "#" + current);
                });
                document.documentElement.style.setProperty("--scroll-y", y + "px");
                ticking = false;
            });
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        onScroll();

        toTop?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    }

    /* ============================================================
       九、对外接口
       ============================================================ */
    function rerender() {
        // 数据被编辑器替换后重画
        if (state.instance && typeof state.instance.update === "function") {
            state.instance.update(getData());
            applyLayout();
            applySectionTitles();
            setupReveal();
        } else if (state.skin) {
            const id = state.skin;
            state.skin = null;
            setSkin(id);
        }
    }

    window.RinSite = {
        setSkin,
        rerender,
        openLightbox,
        closeLightbox,
        applyAppearance,
        applyLayout,
        applySectionTitles,
        get skin() { return state.skin; },
        get themes() { return THEMES; },
        get data() { return getData(); },
    };
    window.__rerender = rerender;

    /* ============================================================
       十、启动
       ============================================================ */
    async function init() {
        applyAppearance();
        initMode();
        buildNav();
        buildSkinMenu();
        setupLightbox();
        setupScroll();

        // 头像 / favicon / 标题
        const p = getData().profile || {};
        const fav = $("#faviconLink");
        if (fav && p.avatar) fav.href = p.avatar;
        if (p.name) document.title = p.name + "'s Website";

        // 默认主题：localStorage 优先，其次 data.appearance.skin
        const wanted = localStorage.getItem(LS_SKIN)
            || (getData().appearance || {}).skin
            || "classic";
        await setSkin(THEMES[wanted] ? wanted : "classic");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
