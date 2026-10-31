/* ============================================================
   classic 主题 —— 原来的 2D 版本
   干净、安静、看得清。内容一分不少，只是不折腾。
   ============================================================ */

(function () {
    "use strict";

    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
    const D = () => window.SITE_DATA || {};
    const STATUS_TEXT = { done: "已完成", wip: "进行中", plan: "规划中" };

    window.RinThemes.register({
        id: "classic",

        mount(root, ctx) {
            const openLightbox = ctx.openLightbox;

            /* ---------- 骨架 ---------- */
            function skeleton() {
                const p = (D().profile || {});
                return `
                <div class="container">
                    <header class="hero" id="home">
                        <img class="avatar" id="avatar" src="${p.avatar || ""}" alt="${p.name || ""} 的头像">
                        <div class="hero-body">
                            <span class="hero-tag" id="heroTagline">${p.tagline || ""}</span>
                            <h1 id="heroName">${p.name || "Rin9"}'s Website</h1>
                            <p id="heroIntro">${p.intro || ""}</p>
                            <div class="hero-actions">
                                <a class="btn" href="#works">看作品集</a>
                                <button class="btn ghost" data-player-toggle aria-pressed="false">🎵 音乐</button>
                            </div>
                        </div>
                    </header>

                    <section class="section" id="links">
                        <div class="section-head"><h2 data-sec-head></h2><p data-sec-sub></p></div>
                        <div class="card reveal"><div class="links-grid" id="linksGrid"></div></div>
                    </section>

                    <section class="section" id="milestones">
                        <div class="section-head"><h2 data-sec-head></h2><p data-sec-sub></p></div>
                        <div class="milestone-list" id="milestoneList"></div>
                    </section>

                    <section class="section" id="works">
                        <div class="section-head"><h2 data-sec-head></h2><p data-sec-sub></p></div>
                        <div class="filter-bar" id="filterBar"></div>
                        <div class="works-grid" id="worksGrid"></div>
                    </section>

                    <section class="section" id="notes">
                        <div class="section-head"><h2 data-sec-head></h2><p data-sec-sub></p></div>
                        <div class="timeline" id="notesList"></div>
                    </section>

                    <section class="section" id="gallery">
                        <div class="section-head"><h2 data-sec-head></h2><p data-sec-sub></p></div>
                        <div class="gallery" id="galleryGrid"></div>
                    </section>

                    <footer class="footer">
                        <div class="footer-links">
                            <a href="music.html">音乐</a>
                            <a href="https://github.com/OoRin9oO" target="_blank" rel="noopener">GitHub</a>
                            <a href="mailto:" id="mailLink">联系我</a>
                        </div>
                        <div>© <span id="year"></span> ${p.name || "Rin9"} · 用 GitHub Pages 托管</div>
                    </footer>
                </div>`;
            }

            /* ---------- 内容渲染 ---------- */
            function renderContent() {
                const d = D();
                const p = d.profile || {};

                // 头像 / 标题
                const av = $("#avatar");
                if (av && p.avatar) { av.src = p.avatar; av.alt = (p.name || "") + " 的头像"; }
                if ($("#heroName")) $("#heroName").textContent = (p.name || "Rin9") + "'s Website";
                if ($("#heroTagline")) $("#heroTagline").textContent = p.tagline || "";
                if ($("#heroIntro")) $("#heroIntro").textContent = p.intro || "";

                // 链接
                const linksBox = $("#linksGrid");
                if (linksBox) {
                    linksBox.innerHTML = (d.links || []).map(l => `
                        <a class="link-item" href="${l.url}" target="_blank" rel="noopener">
                            <div class="icon">${l.icon || "🔗"}</div>
                            <span class="name">${l.name || ""}</span>
                        </a>`).join("");
                }

                // 里程碑
                const msBox = $("#milestoneList");
                if (msBox) {
                    msBox.innerHTML = (d.milestones || []).map(m => `
                        <article class="milestone">
                            <div class="milestone-icon">${m.icon || "✦"}</div>
                            <div class="milestone-body">
                                <div class="entry-date">${m.date || ""}</div>
                                <div class="milestone-title">${m.title || ""}</div>
                                <p class="entry-text">${m.desc || ""}</p>
                            </div>
                        </article>`).join("");
                }

                // 作品集
                const grid = $("#worksGrid");
                const bar = $("#filterBar");
                if (grid) {
                    grid.innerHTML = (d.works || []).map(w => `
                        <article class="work-card" data-tags="${(w.tags || []).join(",")}">
                            ${w.cover ? `<div class="work-cover"><img src="${w.cover}" alt="${w.title || ""}" loading="lazy"></div>` : ""}
                            <div class="work-top">
                                <div class="work-title">${w.title || ""}</div>
                                <span class="badge ${w.status || ""}">${STATUS_TEXT[w.status] || w.status || ""}</span>
                            </div>
                            <p class="work-desc">${w.desc || ""}</p>
                            <div class="work-tags">
                                ${(w.tags || []).map(t => `<span class="tag">${t}</span>`).join("")}
                            </div>
                            ${(w.links && w.links.length) ? `<div class="work-links">
                                ${w.links.map(l => `<a href="${l.url}" target="_blank" rel="noopener">${l.label} ↗</a>`).join("")}
                            </div>` : ""}
                        </article>`).join("");
                }
                if (bar) {
                    const cats = ["全部", ...new Set((d.works || []).flatMap(w => w.tags || []))];
                    bar.innerHTML = cats.map((c, i) =>
                        `<button class="filter-btn${i === 0 ? " active" : ""}" data-cat="${c}">${c}</button>`
                    ).join("");
                }

                // 日常记录
                const notesBox = $("#notesList");
                if (notesBox) {
                    notesBox.innerHTML = (d.notes || []).map(n => `
                        <article class="entry">
                            <div class="entry-date">${n.date || ""}</div>
                            <div class="entry-title">${n.title || ""}</div>
                            <p class="entry-text">${n.desc || ""}</p>
                            ${(n.images && n.images.length) ? `<div class="entry-imgs">
                                ${n.images.map(src => `<img src="${src}" alt="" loading="lazy" data-zoom="${src}">`).join("")}
                            </div>` : ""}
                        </article>`).join("");
                }

                // 照片墙
                const gal = $("#galleryGrid");
                if (gal) {
                    gal.innerHTML = (d.gallery || []).map((g, i) => `
                        <figure class="gallery-item" data-index="${i}">
                            <img src="${g.src}" alt="${g.caption || ""}" loading="lazy" width="400" height="300">
                            <figcaption>${g.caption || ""}</figcaption>
                        </figure>`).join("");
                }

                // 页脚
                const yr = $("#year");
                if (yr) yr.textContent = new Date().getFullYear();
                const mail = $("#mailLink");
                if (mail && p.email) {
                    mail.textContent = p.email;
                    mail.href = "mailto:" + p.email;
                }

                if (p.name) document.title = p.name + "'s Website";
            }

            /* ---------- 事件（委托到 root，重绘后不用重绑） ---------- */
            function bindEvents() {
                root.addEventListener("click", (e) => {
                    // 分类筛选
                    const f = e.target.closest(".filter-btn");
                    if (f) {
                        const bar = f.closest("#filterBar");
                        $$(".filter-btn", bar).forEach(b => b.classList.remove("active"));
                        f.classList.add("active");
                        const cat = f.dataset.cat;
                        $$("#worksGrid .work-card").forEach(card => {
                            const show = cat === "全部" || (card.dataset.tags || "").split(",").includes(cat);
                            card.style.display = show ? "" : "none";
                        });
                        return;
                    }
                    // 照片墙 → 灯箱
                    const gi = e.target.closest(".gallery-item");
                    if (gi) {
                        const g = (D().gallery || [])[Number(gi.dataset.index)];
                        if (g) openLightbox(g.src, g.caption);
                        return;
                    }
                    // 记录配图 → 灯箱
                    const z = e.target.closest("[data-zoom]");
                    if (z) {
                        openLightbox(z.dataset.zoom, z.alt || "");
                    }
                });
            }

            /* ---------- 挂载 ---------- */
            root.innerHTML = skeleton();
            renderContent();
            bindEvents();

            return {
                update() {
                    renderContent();
                },
                unmount() {
                    root.innerHTML = "";
                },
            };
        },
    });
})();
