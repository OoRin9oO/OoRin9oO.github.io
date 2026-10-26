/* ============================================================
   音乐推荐页 — 渲染站内音乐 + 外链推荐
   ============================================================ */

(function () {
    "use strict";

    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

    const esc = (s) => String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    function renderTracks() {
        const grid = $("#trackGrid");
        if (!grid) return;
        const D = window.SITE_DATA || {};
        const tracks = (D.music && D.music.tracks) || [];

        if (!tracks.length) {
            grid.innerHTML = `<div class="music-empty">还没有上传音乐</div>`;
            return;
        }

        grid.innerHTML = tracks.map(t => `
            <div class="track-card" data-id="${esc(t.id)}">
                <div class="tc-cover" style="${t.cover ? `background-image:url('${esc(t.cover)}')` : ""}">
                    <span class="tc-play">▶</span>
                </div>
                <div class="tc-info">
                    <div class="tc-title">${esc(t.title)}</div>
                    <div class="tc-artist">${esc(t.artist || "")}</div>
                </div>
            </div>`).join("");

        $$(".track-card", grid).forEach(el => {
            el.addEventListener("click", () => {
                if (window.MusicPlayer) window.MusicPlayer.play(el.dataset.id);
            });
        });
    }

    function renderRecommend() {
        const box = $("#recList");
        if (!box) return;
        const D = window.SITE_DATA || {};
        const recs = (D.music && D.music.recommend) || [];

        if (!recs.length) {
            box.innerHTML = `<div class="music-empty">还没有添加推荐链接</div>`;
            return;
        }

        box.innerHTML = recs.map(r => `
            <a class="rec-card" href="${esc(r.url)}" target="_blank" rel="noopener">
                <div class="rc-icon">🔗</div>
                <div class="rc-info">
                    <div class="rc-title">${esc(r.title)}</div>
                    <div class="rc-desc">${esc(r.desc || "")}</div>
                    <div class="rc-platform">${esc(r.platform || "")}</div>
                </div>
                <div class="rc-arrow">↗</div>
            </a>`).join("");
    }

    function init() {
        renderTracks();
        renderRecommend();

        const yr = $("#year");
        if (yr) yr.textContent = new Date().getFullYear();

        // 主题切换（与主页一致）
        const btn = $("#themeBtn");
        const apply = (t) => {
            document.documentElement.setAttribute("data-theme", t);
            btn.textContent = t === "light" ? "🌙" : "☀️";
            localStorage.setItem("rin9-theme", t);
        };
        const saved = localStorage.getItem("rin9-theme") || "dark";
        apply(saved);
        btn.addEventListener("click", () => {
            apply(document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light");
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
