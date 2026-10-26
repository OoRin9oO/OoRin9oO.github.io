/* ============================================================
   Rin9's Website — 交互脚本
   模块：主题 / 导航 / 音乐 / 渲染 / 筛选 / 灯箱 / 滚动
   ============================================================ */

(function () {
    "use strict";

    // 数据引用，编辑器替换 SITE_DATA 后会刷新
    let D = window.SITE_DATA;
    const refreshData = () => { D = window.SITE_DATA; return D; };
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

    /* ---------- 主题切换（记忆到 localStorage） ---------- */
    const THEME_KEY = "rin9-theme";
    function applyTheme(t) {
        document.documentElement.setAttribute("data-theme", t);
        const btn = $("#themeBtn");
        if (btn) {
            btn.textContent = t === "light" ? "🌙" : "☀️";
            btn.setAttribute("aria-label", t === "light" ? "切换到深色主题" : "切换到浅色主题");
        }
    }
    applyTheme(localStorage.getItem(THEME_KEY) || "dark");

    $("#themeBtn")?.addEventListener("click", () => {
        const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
        applyTheme(next);
        localStorage.setItem(THEME_KEY, next);
    });

    /* ---------- 移动端导航 ---------- */
    const navLinks = $("#navLinks");
    $("#navToggle")?.addEventListener("click", () => navLinks.classList.toggle("open"));
    navLinks?.addEventListener("click", (e) => {
        if (e.target.tagName === "A") navLinks.classList.remove("open");
    });

    /* ---------- 背景音乐 ----------
       浏览器禁止无交互自动播放，所以延迟到首次交互再放，
       并且把播放状态记在 localStorage 里
    */
    const audio = $("#bgm");
    const musicBtn = $("#musicBtn");
    const MUSIC_KEY = "rin9-music";

    function setMusicUI(playing) {
        if (!musicBtn) return;
        musicBtn.textContent = playing ? "🔊 暂停音乐" : "🔇 播放音乐";
        musicBtn.setAttribute("aria-pressed", String(playing));
    }

    if (audio) {
        // 播放失败（例如文件缺失）时静默降级，按钮变为不可用
        audio.addEventListener("error", () => {
            if (musicBtn) {
                musicBtn.disabled = true;
                musicBtn.textContent = "🎵 音乐不可用";
                musicBtn.title = "未找到音频文件";
            }
        });

        musicBtn?.addEventListener("click", () => {
            if (audio.paused) {
                audio.play().then(() => {
                    setMusicUI(true);
                    localStorage.setItem(MUSIC_KEY, "1");
                }).catch(() => setMusicUI(false));
            } else {
                audio.pause();
                setMusicUI(false);
                localStorage.setItem(MUSIC_KEY, "0");
            }
        });

        // 首次任意交互后，若上次是"播放中"则恢复
        const resumeOnce = () => {
            if (localStorage.getItem(MUSIC_KEY) === "1") {
                audio.play().then(() => setMusicUI(true)).catch(() => {});
            }
            document.removeEventListener("pointerdown", resumeOnce);
            document.removeEventListener("keydown", resumeOnce);
        };
        document.addEventListener("pointerdown", resumeOnce);
        document.addEventListener("keydown", resumeOnce);
        setMusicUI(false);
    }

    /* ---------- 渲染：常用链接 ---------- */
    function renderLinks() {
        refreshData();
        const box = $("#linksGrid");
        if (!box) return;
        box.innerHTML = D.links.map(l => `
            <a class="link-item" href="${l.url}" target="_blank" rel="noopener">
                <div class="icon">${l.icon}</div>
                <span class="name">${l.name}</span>
            </a>`).join("");
    }

    /* ---------- 渲染：成长里程碑 ---------- */
    function renderMilestones() {
        refreshData();
        const box = $("#milestoneList");
        if (!box || !D.milestones) return;
        box.innerHTML = D.milestones.map(m => `
            <article class="milestone">
                <div class="milestone-icon">${m.icon || "✦"}</div>
                <div class="milestone-body">
                    <div class="entry-date">${m.date || ""}</div>
                    <div class="milestone-title">${m.title || ""}</div>
                    <p class="entry-text">${m.desc || ""}</p>
                </div>
            </article>`).join("");
    }

    /* ---------- 渲染：作品集 + 分类筛选 ---------- */
    const STATUS_TEXT = { done: "已完成", wip: "进行中", plan: "规划中" };

    function renderWorks() {
        refreshData();
        const grid = $("#worksGrid");
        const bar = $("#filterBar");
        if (!grid) return;

        grid.innerHTML = D.works.map(w => `
            <article class="work-card" data-tags="${w.tags.join(",")}">
                ${w.cover ? `<div class="work-cover"><img src="${w.cover}" alt="${w.title}" loading="lazy"></div>` : ""}
                <div class="work-top">
                    <div class="work-title">${w.title}</div>
                    <span class="badge ${w.status}">${STATUS_TEXT[w.status] || w.status}</span>
                </div>
                <p class="work-desc">${w.desc}</p>
                <div class="work-tags">
                    ${w.tags.map(t => `<span class="tag">${t}</span>`).join("")}
                </div>
                ${w.links && w.links.length ? `<div class="work-links">
                    ${w.links.map(l => `<a href="${l.url}" target="_blank" rel="noopener">${l.label} ↗</a>`).join("")}
                </div>` : ""}
            </article>`).join("");

        if (!bar) return;
        const cats = ["全部", ...new Set(D.works.flatMap(w => w.tags))];
        bar.innerHTML = cats.map((c, i) =>
            `<button class="filter-btn${i === 0 ? " active" : ""}" data-cat="${c}">${c}</button>`
        ).join("");

        bar.addEventListener("click", (e) => {
            const btn = e.target.closest(".filter-btn");
            if (!btn) return;
            $$(".filter-btn", bar).forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            const cat = btn.dataset.cat;
            $$(".work-card", grid).forEach(card => {
                const show = cat === "全部" || card.dataset.tags.split(",").includes(cat);
                card.style.display = show ? "" : "none";
            });
        });
    }

    /* ---------- 渲染：日常记录 ---------- */
    function renderNotes() {
        refreshData();
        const box = $("#notesList");
        if (!box) return;
        box.innerHTML = D.notes.map(n => `
            <article class="entry">
                <div class="entry-date">${n.date}</div>
                <div class="entry-title">${n.title}</div>
                <p class="entry-text">${n.desc}</p>
                ${n.images && n.images.length ? `<div class="entry-imgs">
                    ${n.images.map((src, i) => `<img src="${src}" alt="" loading="lazy" data-zoom="${src}">`).join("")}
                </div>` : ""}
            </article>`).join("");
    }

    /* ---------- 渲染：照片墙 ---------- */
    function renderGallery() {
        refreshData();
        const box = $("#galleryGrid");
        if (!box) return;
        box.innerHTML = D.gallery.map((g, i) => `
            <figure class="gallery-item" data-index="${i}">
                <img src="${g.src}" alt="${g.caption}" loading="lazy" width="400" height="300">
                <figcaption>${g.caption}</figcaption>
            </figure>`).join("");
    }

    /* ---------- 渲染：个人信息 ---------- */
    function renderProfile() {
        refreshData();
        const p = D.profile;
        if ($("#heroName")) $("#heroName").textContent = p.name + "'s Website";
        if ($("#heroTitle")) $("#heroTitle").textContent = p.title;
        if ($("#heroIntro")) $("#heroIntro").textContent = p.intro;
        if ($("#heroTagline")) $("#heroTagline").textContent = p.tagline;
        if ($("#avatar")) {
            const a = $("#avatar");
            a.src = p.avatar;
            a.alt = p.name + " 的头像";
        }
        // favicon 跟着头像走，删掉旧文件也不会 404
        const fav = $("#faviconLink");
        if (fav && p.avatar) fav.href = p.avatar;
        if (audio && p.bgm) {
            const src = $("#bgmSource");
            if (src) src.src = p.bgm;
        }
        // 页脚邮箱跟着 profile.email 走，别再硬编码在 HTML 里
        const mail = $("#mailLink");
        if (mail && p.email) {
            mail.textContent = p.email;
            mail.href = "mailto:" + p.email;
        }
        document.title = p.name + "'s Website";
    }

    /* ---------- 灯箱 ---------- */
    function setupLightbox() {
        const lb = $("#lightbox");
        const lbImg = $("#lightboxImg");
        const lbCap = $("#lightboxCap");
        if (!lb) return;

        const open = (src, caption) => {
            lbImg.src = src;
            lbImg.alt = caption || "";
            lbCap.textContent = caption || "";
            lb.classList.add("open");
            document.body.style.overflow = "hidden";
        };
        const close = () => {
            lb.classList.remove("open");
            document.body.style.overflow = "";
        };

        // 照片墙
        $("#galleryGrid")?.addEventListener("click", (e) => {
            const item = e.target.closest(".gallery-item");
            if (!item) return;
            const g = D.gallery[Number(item.dataset.index)];
            if (!g) return;
            open(g.src, g.caption);
        });

        // 日常记录配图（点击放大）
        $("#notesList")?.addEventListener("click", (e) => {
            const img = e.target.closest("[data-zoom]");
            if (!img) return;
            open(img.dataset.zoom, img.alt || "");
        });

        lb.addEventListener("click", (e) => {
            if (e.target === lb || e.target.classList.contains("lightbox-close")) close();
        });
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") close();
        });
    }

    /* ---------- 板块标题（从 data.sections 读） ---------- */
    function applySectionTitles() {
        refreshData();
        const S = D.sections || {};
        Object.keys(S).forEach(id => {
            const sec = document.getElementById(id);
            if (!sec) return;
            const cfg = S[id] || {};
            const h2 = sec.querySelector(".section-head h2");
            const p = sec.querySelector(".section-head p");
            if (h2 && cfg.title) h2.textContent = cfg.title;
            if (p && cfg.sub) p.textContent = cfg.sub;
        });
    }

    /* ---------- 布局：板块顺序 / 钉住 / 隐藏 ---------- */
    function applyLayout() {
        refreshData();
        const L = D.layout;
        if (!L) return;

        // 1. 按 order 重排板块
        const main = document.querySelector("main") || document.body;
        const home = $("#home");
        const sections = $$("section[id]");
        if (L.order && L.order.length) {
            L.order.forEach(id => {
                const el = document.getElementById(id);
                if (el) main.appendChild(el);
            });
            // order 里没有的板块补到后面
            sections.forEach(el => {
                if (!L.order.includes(el.id)) main.appendChild(el);
            });
        }

        // 2. 隐藏 / 显示
        const hidden = L.hidden || [];
        sections.forEach(el => {
            const hide = hidden.includes(el.id);
            el.style.display = hide ? "none" : "";
            el.dataset.hidden = hide ? "1" : "0";
        });

        // 3. 钉住
        const pinned = L.pinned || [];
        sections.forEach(el => {
            const on = pinned.includes(el.id);
            el.classList.toggle("pinned", on);
            if (on) {
                el.dataset.pinOrder = String(pinned.indexOf(el.id));
            } else {
                delete el.dataset.pinOrder;
            }
        });

        // 4. 导航栏也跟着走
        const links = $$("#navLinks a");
        links.forEach(a => {
            const id = a.getAttribute("href").slice(1);
            a.style.display = hidden.includes(id) ? "none" : "";
        });
    }

    /* ---------- 滚动：导航高亮 / 回到顶部 / 入场动画 ---------- */
    function setupScroll() {
        const toTop = $("#toTop");
        const sections = $$("section[id]");
        const links = $$("#navLinks a");

        const onScroll = () => {
            const y = window.scrollY;
            toTop?.classList.toggle("show", y > 420);

            let current = "";
            sections.forEach(sec => {
                if (sec.offsetTop - 120 <= y) current = sec.id;
            });
            links.forEach(a => {
                a.classList.toggle("active", a.getAttribute("href") === "#" + current);
            });
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        onScroll();

        toTop?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

        // IntersectionObserver 入场动画
        const io = new IntersectionObserver((entries) => {
            entries.forEach(en => {
                if (en.isIntersecting) {
                    en.target.classList.add("in");
                    io.unobserve(en.target);
                }
            });
        }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });

        $$(".reveal").forEach(el => io.observe(el));
    }

    /* ---------- 年份 ---------- */
    const yr = $("#year");
    if (yr) yr.textContent = new Date().getFullYear();

    /* ---------- 启动 ---------- */
    renderProfile();
    applyLayout();
    applySectionTitles();
    renderLinks();
    renderMilestones();
    renderWorks();
    renderNotes();
    renderGallery();
    setupLightbox();
    setupScroll();

    /* 供编辑器预览用：数据被替换后重新渲染 */
    window.__rerender = function () {
        renderProfile();
        applyLayout();
        applySectionTitles();
        renderLinks();
        renderMilestones();
        renderWorks();
        renderNotes();
        renderGallery();
    };
})();
