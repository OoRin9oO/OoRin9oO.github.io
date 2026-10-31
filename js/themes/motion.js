/* ============================================================
   motion 主题 —— 流动
   滚动进度、光斑视差、卡片 3D 倾斜、错落入场
   ============================================================ */

(function () {
    "use strict";

    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
    const D = () => window.SITE_DATA || {};
    const STATUS = { done: "已完成", wip: "进行中", plan: "规划中" };

    window.RinThemes.register({
        id: "motion",

        mount(root, ctx) {
            const openLightbox = ctx.openLightbox;
            let raf = null;
            let onMove = null;

            /* ---------- 骨架 ---------- */
            function skeleton() {
                return `
                <div class="m-shell">
                    <div class="m-progress"><i id="mProgress"></i></div>
                    <div class="m-bg">
                        <span class="m-orb m-orb-1"></span>
                        <span class="m-orb m-orb-2"></span>
                        <span class="m-orb m-orb-3"></span>
                    </div>

                    <div class="m-container">
                        <header class="m-hero" id="home">
                            <div class="m-avatar-wrap">
                                <img class="m-avatar" id="avatar" alt="">
                                <span class="m-avatar-ring"></span>
                            </div>
                            <div>
                                <div class="m-tag" id="mTag"></div>
                                <h1 class="m-h1">
                                    <span class="m-line"><span id="mLine1"></span></span>
                                    <span class="m-line"><span id="mLine2"></span></span>
                                </h1>
                                <p class="m-intro" id="mIntro"></p>
                                <div class="m-actions">
                                    <a class="m-btn" href="#works">看作品集 →</a>
                                    <button class="m-btn ghost" data-player-toggle>♪ 音乐</button>
                                </div>
                            </div>
                        </header>

                            <section class="m-sec" id="links">
                                <div class="m-sec-head"><h2 data-sec-head></h2><p data-sec-sub></p></div>
                                <div class="m-links" id="mLinks"></div>
                            </section>

                            <section class="m-sec" id="milestones">
                                <div class="m-sec-head"><h2 data-sec-head></h2><p data-sec-sub></p></div>
                                <div class="m-ms" id="mMilestones"></div>
                            </section>

                            <section class="m-sec" id="works">
                                <div class="m-sec-head"><h2 data-sec-head></h2><p data-sec-sub></p></div>
                                <div class="m-filters" id="mFilters"></div>
                                <div class="m-works" id="mWorks"></div>
                            </section>

                            <section class="m-sec" id="notes">
                                <div class="m-sec-head"><h2 data-sec-head></h2><p data-sec-sub></p></div>
                                <div class="m-notes" id="mNotes"></div>
                            </section>

                            <section class="m-sec" id="gallery">
                                <div class="m-sec-head"><h2 data-sec-head></h2><p data-sec-sub></p></div>
                                <div class="m-gallery" id="mGallery"></div>
                            </section>
                        <footer class="m-footer">
                            <span>© <span id="mYear"></span> <span id="mName"></span> · GitHub Pages</span>
                            <div class="m-footer-links">
                                <a href="music.html">音乐</a>
                                <a href="https://github.com/OoRin9oO" target="_blank" rel="noopener">GitHub</a>
                                <a href="mailto:" id="mMail">联系我</a>
                            </div>
                        </footer>
                    </div>
                </div>`;
            }

            /* ---------- 内容 ---------- */
            function renderContent() {
                const d = D();
                const p = d.profile || {};

                const av = $("#avatar");
                if (av && p.avatar) { av.src = p.avatar; av.alt = (p.name || "") + " 的头像"; }

                if ($("#mTag")) $("#mTag").textContent = p.tagline || "";
                if ($("#mLine1")) $("#mLine1").textContent = (p.name || "Rin9") + "'s";
                if ($("#mLine2")) {
                    const word = document.createElement("em");
                    word.textContent = "Website";
                    $("#mLine2").innerHTML = "";
                    $("#mLine2").appendChild(word);
                }
                if ($("#mIntro")) $("#mIntro").textContent = p.intro || "";

                // 链接
                const lk = $("#mLinks");
                if (lk) {
                    lk.innerHTML = (d.links || []).map((l, i) => `
                        <a class="m-link reveal" style="--i:${i}" href="${l.url}" target="_blank" rel="noopener">
                            <span class="ic">${l.icon || "🔗"}</span>
                            <span class="nm">${l.name || ""}</span>
                        </a>`).join("");
                }

                // 里程碑
                const ms = $("#mMilestones");
                if (ms) {
                    ms.innerHTML = (d.milestones || []).map((m, i) => `
                        <div class="m-ms-item reveal" style="--i:${i}">
                            <span class="m-ms-dot">${m.icon || "✦"}</span>
                            <div class="m-ms-date">${m.date || ""}</div>
                            <div class="m-ms-title">${m.title || ""}</div>
                            <div class="m-ms-desc">${m.desc || ""}</div>
                        </div>`).join("");
                }

                // 作品
                const wk = $("#mWorks");
                if (wk) {
                    wk.innerHTML = (d.works || []).map((w, i) => `
                        <article class="m-card reveal" style="--i:${i}" data-tags="${(w.tags || []).join(",")}">
                            ${w.cover ? `<div class="m-cover"><img src="${w.cover}" alt="${w.title || ""}" loading="lazy"></div>` : ""}
                            <div class="m-card-body">
                                <div class="m-card-top">
                                    <span class="m-card-title">${w.title || ""}</span>
                                    <span class="m-badge ${w.status || ""}">${STATUS[w.status] || w.status || ""}</span>
                                </div>
                                <p class="m-card-desc">${w.desc || ""}</p>
                                <div class="m-tags">
                                    ${(w.tags || []).map(t => `<span class="m-tag-i">${t}</span>`).join("")}
                                </div>
                                ${(w.links && w.links.length) ? `<div class="m-card-links">
                                    ${w.links.map(l => `<a href="${l.url}" target="_blank" rel="noopener">${l.label} ↗</a>`).join("")}
                                </div>` : ""}
                            </div>
                        </article>`).join("");
                }

                // 筛选
                const fb = $("#mFilters");
                if (fb) {
                    const cats = ["全部", ...new Set((d.works || []).flatMap(w => w.tags || []))];
                    fb.innerHTML = cats.map((c, i) =>
                        `<button class="m-filter${i === 0 ? " active" : ""}" data-cat="${c}">${c}</button>`
                    ).join("");
                }

                // 记录
                const nt = $("#mNotes");
                if (nt) {
                    nt.innerHTML = (d.notes || []).map((n, i) => `
                        <article class="m-note reveal" style="--i:${i}">
                            <div class="m-note-date">${n.date || ""}</div>
                            <div class="m-note-title">${n.title || ""}</div>
                            <div class="m-note-desc">${n.desc || ""}</div>
                            ${(n.images && n.images.length) ? `<div class="m-note-imgs">
                                ${n.images.map(src => `<img src="${src}" alt="" loading="lazy" data-zoom="${src}">`).join("")}
                            </div>` : ""}
                        </article>`).join("");
                }

                // 照片墙
                const ga = $("#mGallery");
                if (ga) {
                    ga.innerHTML = (d.gallery || []).map((g, i) => `
                        <figure class="m-gphoto reveal" style="--i:${i % 8}" data-index="${i}">
                            <img src="${g.src}" alt="${g.caption || ""}" loading="lazy">
                            <figcaption>${g.caption || ""}</figcaption>
                        </figure>`).join("");
                }

                // 页脚
                if ($("#mYear")) $("#mYear").textContent = new Date().getFullYear();
                if ($("#mName")) $("#mName").textContent = p.name || "Rin9";
                const mail = $("#mMail");
                if (mail && p.email) { mail.textContent = p.email; mail.href = "mailto:" + p.email; }

                if (p.name) document.title = p.name + "'s Website";
            }

            /* ---------- 事件 ---------- */
            function bindEvents() {
                root.addEventListener("click", (e) => {
                    const f = e.target.closest(".m-filter");
                    if (f) {
                        $$(".m-filter").forEach(b => b.classList.remove("active"));
                        f.classList.add("active");
                        const cat = f.dataset.cat;
                        $$("#mWorks .m-card").forEach(card => {
                            const show = cat === "全部" || (card.dataset.tags || "").split(",").includes(cat);
                            card.style.display = show ? "" : "none";
                        });
                        return;
                    }
                    const gp = e.target.closest(".m-gphoto");
                    if (gp) {
                        const g = (D().gallery || [])[Number(gp.dataset.index)];
                        if (g) openLightbox(g.src, g.caption);
                        return;
                    }
                    const z = e.target.closest("[data-zoom]");
                    if (z) openLightbox(z.dataset.zoom, z.alt || "");
                });

                // 卡片 3D 倾斜
                onMove = (e) => {
                    const card = e.target.closest(".m-card");
                    if (!card) return;
                    const r = card.getBoundingClientRect();
                    const px = (e.clientX - r.left) / r.width - 0.5;
                    const py = (e.clientY - r.top) / r.height - 0.5;
                    card.style.transform =
                        `perspective(900px) rotateX(${(-py * 6).toFixed(2)}deg) ` +
                        `rotateY(${(px * 8).toFixed(2)}deg) translateY(-4px)`;
                };
                const onLeave = (e) => {
                    const card = e.target.closest(".m-card");
                    if (card) card.style.transform = "";
                };
                root.addEventListener("mousemove", onMove);
                root.addEventListener("mouseleave", onLeave, true);
            }

            /* ---------- 滚动效果 ---------- */
            function setupScrollFx() {
                const bar = $("#mProgress");
                const avatar = $("#avatar");
                const orbs = $$(".m-orb");

                const tick = () => {
                    raf = null;
                    const y = window.scrollY || 0;
                    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
                    if (bar) bar.style.width = Math.min(100, (y / max) * 100) + "%";

                    // 头像轻微视差
                    if (avatar && y < 900) {
                        avatar.style.transform = `translateY(${y * 0.06}px)`;
                    }
                    // 光斑反向漂移，制造纵深
                    orbs.forEach((o, i) => {
                        const k = (i + 1) * 0.03;
                        o.style.marginTop = (-y * k) + "px";
                    });
                };

                const onScroll = () => {
                    if (raf) return;
                    raf = requestAnimationFrame(tick);
                };
                window.addEventListener("scroll", onScroll, { passive: true });
                tick();

                return () => window.removeEventListener("scroll", onScroll);
            }

            /* ---------- 挂载 ---------- */
            root.innerHTML = skeleton();
            renderContent();
            bindEvents();
            const stopScroll = setupScrollFx();

            return {
                update() {
                    renderContent();
                },
                unmount() {
                    if (raf) cancelAnimationFrame(raf);
                    stopScroll();
                    if (onMove) root.removeEventListener("mousemove", onMove);
                    root.innerHTML = "";
                },
            };
        },
    });
})();
