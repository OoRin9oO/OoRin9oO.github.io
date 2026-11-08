/* 余火之境：独立于编辑器的探索式浏览主题。内容仍来自 SITE_DATA。 */
(function () {
    "use strict";

    const ZONES = [
        { id: "home", name: "余火祭坛", icon: "✦", x: 800, y: 620, kind: "bonfire" },
        { id: "works", name: "锻造庭院", icon: "⚒", x: 1120, y: 450, kind: "forge" },
        { id: "milestones", name: "回忆墓园", icon: "✧", x: 460, y: 400, kind: "grave" },
        { id: "notes", name: "旅人手记", icon: "✎", x: 390, y: 850, kind: "journal" },
        { id: "gallery", name: "幻影画廊", icon: "▧", x: 1210, y: 830, kind: "gallery" },
        { id: "links", name: "传送门", icon: "◇", x: 810, y: 200, kind: "portal" },
    ];
    const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
    const safeUrl = (value) => {
        const url = String(value || "").trim();
        return /^(https?:\/\/|mailto:|(?:\.\.?\/)?(?:img|music)\/)/i.test(url) ? url : "#";
    };

    window.RinThemes.register({
        id: "souls",
        mount(root, ctx) {
            const esc = ctx.esc;
            const data = () => window.SITE_DATA || {};
            const hidden = () => new Set((data().layout || {}).hidden || []);
            const available = () => ZONES.filter(zone => !hidden().has(zone.id));
            const position = { x: 800, y: 680 };
            const keys = new Set();
            let frame = 0, last = 0, active = null, near = null;

            root.innerHTML = `<main class="souls" aria-label="余火之境探索模式">
                <div class="souls-vignette"></div>
                <div class="souls-head"><span class="souls-kicker">RIN9 · 另一种浏览方式</span>
                    <h1>余火之境</h1><p>每段旅程，都有值得拾起的故事。</p></div>
                <div class="souls-viewport" id="soulsViewport">
                    <div class="souls-world" id="soulsWorld">
                        <div class="souls-path path-a"></div><div class="souls-path path-b"></div>
                        <div class="souls-path path-c"></div><div class="souls-path path-d"></div>
                        <div class="souls-ruin ruin-a"></div><div class="souls-ruin ruin-b"></div>
                        <div class="souls-ruin ruin-c"></div><div class="souls-ruin ruin-d"></div>
                        <div class="souls-player" id="soulsPlayer"><span></span></div>
                        <div id="soulsNodes"></div>
                    </div>
                </div>
                <div class="souls-hud"><span class="souls-hp-label">旅人</span><div class="souls-hp"><i></i></div>
                    <span class="souls-place" id="soulsPlace">余火祭坛</span></div>
                <div class="souls-prompt" id="soulsPrompt" aria-live="polite"></div>
                <div class="souls-help">W A S D / 方向键移动 · E 互动 · 点击地标直接查看</div>
                <div class="souls-map" id="soulsMap" aria-label="快速前往"></div>
                <div class="souls-pad" aria-label="触屏移动">
                    <button data-dir="up" aria-label="向上">▲</button><div>
                    <button data-dir="left" aria-label="向左">◀</button>
                    <button data-dir="down" aria-label="向下">▼</button>
                    <button data-dir="right" aria-label="向右">▶</button></div>
                </div>
                <aside class="souls-panel" id="soulsPanel" aria-hidden="true" aria-label="地标内容">
                    <button class="souls-close" id="soulsClose" aria-label="关闭内容">×</button>
                    <div id="soulsPanelBody"></div>
                </aside>
            </main>`;

            const $ = (selector) => root.querySelector(selector);
            const world = $("#soulsWorld");
            const player = $("#soulsPlayer");
            const panel = $("#soulsPanel");
            const list = (items, render) => items.length ? items.map(render).join("") : '<p class="souls-empty">这里还没有留下痕迹。</p>';

            function renderNodes() {
                $("#soulsNodes").innerHTML = available().map(z => `<button class="souls-node ${z.kind}" data-zone="${z.id}"
                    style="left:${z.x}px;top:${z.y}px" aria-label="查看${z.name}">
                    <span class="souls-node-icon">${z.icon}</span><span class="souls-node-name">${z.name}</span></button>`).join("");
                $("#soulsMap").innerHTML = available().map(z => `<button data-zone="${z.id}" title="前往${z.name}">${z.icon}<span>${z.name}</span></button>`).join("");
            }

            function content(id) {
                const d = data();
                const p = d.profile || {};
                const link = (url, label) => `<a href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;
                if (id === "home") return `<p>${esc(p.intro || p.tagline || "欢迎来到这里。")}</p><p class="souls-flavor">篝火尚未熄灭。沿着道路，拾起散落的故事。</p>`;
                if (id === "works") return list(d.works || [], w => `<article class="souls-entry">
                    ${w.cover ? `<img src="${esc(safeUrl(w.cover))}" alt="" loading="lazy">` : ""}
                    <div><small>${esc(w.status || "作品")}</small><h3>${esc(w.title)}</h3><p>${esc(w.desc)}</p>
                    <div class="souls-tags">${(w.tags || []).map(t => `<span>${esc(t)}</span>`).join("")}</div>
                    <div class="souls-links">${(w.links || []).map(l => link(l.url, l.label)).join("")}</div></div></article>`);
                if (id === "milestones") return list(d.milestones || [], m => `<article class="souls-entry"><div>
                    <small>${esc(m.date)}</small><h3>${esc(m.icon || "✧")} ${esc(m.title)}</h3><p>${esc(m.desc)}</p></div></article>`);
                if (id === "notes") return list(d.notes || [], n => `<article class="souls-entry"><div><small>${esc(n.date)}</small>
                    <h3>${esc(n.title)}</h3><p>${esc(n.desc)}</p><div class="souls-photos">${(n.images || []).map(src =>
                    `<button data-photo="${esc(safeUrl(src))}" aria-label="放大记录照片"><img src="${esc(safeUrl(src))}" alt="" loading="lazy"></button>`).join("")}</div></div></article>`);
                if (id === "gallery") return `<div class="souls-gallery">${list(d.gallery || [], g => `<button data-photo="${esc(safeUrl(g.src))}" data-caption="${esc(g.caption)}">
                    <img src="${esc(safeUrl(g.src))}" alt="${esc(g.caption)}" loading="lazy"><span>${esc(g.caption)}</span></button>`)}</div>`;
                return list(d.links || [], l => `<article class="souls-entry"><div><h3>${esc(l.icon || "◇")} ${esc(l.name)}</h3>
                    <div class="souls-links">${link(l.url, "开启传送门")}</div></div></article>`);
            }

            function open(id) {
                const zone = available().find(z => z.id === id);
                if (!zone) return;
                active = id;
                keys.clear();
                const custom = ((data().sections || {})[id] || {}).title;
                $("#soulsPanelBody").innerHTML = `<div class="souls-panel-title"><span>${zone.icon}</span><small>拾起记忆 · ${zone.name}</small>
                    <h2>${esc(custom || zone.name)}</h2></div>${content(id)}`;
                panel.classList.add("open");
                panel.setAttribute("aria-hidden", "false");
                $("#soulsClose").focus();
            }

            function close() {
                panel.classList.remove("open");
                panel.setAttribute("aria-hidden", "true");
                active = null;
            }

            function updateView() {
                player.style.left = position.x + "px";
                player.style.top = position.y + "px";
                const viewport = $("#soulsViewport");
                world.style.transform = `translate(${viewport.clientWidth / 2 - position.x}px, ${viewport.clientHeight / 2 - position.y}px)`;
                const nearest = available().map(z => ({ z, distance: Math.hypot(z.x - position.x, z.y - position.y) }))
                    .sort((a, b) => a.distance - b.distance)[0];
                near = nearest && nearest.distance < 130 ? nearest.z : null;
                $("#soulsPrompt").textContent = near ? `E · ${near.name} · 互动` : "沿路探索，寻找发光的地标";
                $("#soulsPlace").textContent = nearest ? nearest.z.name : "余火之境";
                root.querySelectorAll(".souls-node").forEach(el => el.classList.toggle("near", !!near && el.dataset.zone === near.id));
            }

            function tick(now) {
                const dt = Math.min((now - (last || now)) / 1000, 0.05);
                last = now;
                if (!active) {
                    const dx = Number(keys.has("right")) - Number(keys.has("left"));
                    const dy = Number(keys.has("down")) - Number(keys.has("up"));
                    if (dx || dy) {
                        const speed = 230 * dt / Math.hypot(dx, dy);
                        position.x = clamp(position.x + dx * speed, 80, 1520);
                        position.y = clamp(position.y + dy * speed, 80, 1120);
                        player.classList.add("walking");
                        player.classList.toggle("facing-left", dx < 0);
                        updateView();
                    } else player.classList.remove("walking");
                }
                frame = keys.size && !active ? requestAnimationFrame(tick) : 0;
            }

            const directions = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
                w: "up", s: "down", a: "left", d: "right" };
            function keydown(e) {
                if (!root.isConnected || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
                const dir = directions[e.key] || directions[e.key.toLowerCase()];
                if (dir && !active) {
                    e.preventDefault();
                    keys.add(dir);
                    if (!frame) { last = 0; frame = requestAnimationFrame(tick); }
                }
                if ((e.key === "e" || e.key === "E") && near && !active) open(near.id);
                if (e.key === "Escape" && active) close();
            }
            function keyup(e) { const dir = directions[e.key] || directions[e.key.toLowerCase()]; if (dir) keys.delete(dir); }
            function blur() { keys.clear(); }
            function navClick(e) {
                const a = e.target.closest("#navLinks a, .nav-brand");
                if (!a) return;
                const id = (a.getAttribute("href") || "").slice(1);
                if (!ZONES.some(z => z.id === id)) return;
                e.preventDefault(); open(id);
            }
            function rootClick(e) {
                const photo = e.target.closest("[data-photo]");
                if (photo) { ctx.openLightbox(photo.dataset.photo, photo.dataset.caption || ""); return; }
                const zone = e.target.closest("[data-zone]");
                if (zone) open(zone.dataset.zone);
                if (e.target.closest("#soulsClose")) close();
            }
            function resize() { updateView(); }

            renderNodes();
            updateView();
            document.addEventListener("keydown", keydown);
            document.addEventListener("keyup", keyup);
            document.addEventListener("click", navClick);
            window.addEventListener("blur", blur);
            window.addEventListener("resize", resize);
            root.addEventListener("click", rootClick);
            root.querySelectorAll("[data-dir]").forEach(button => {
                const dir = button.dataset.dir;
                button.addEventListener("pointerdown", e => {
                    e.preventDefault(); keys.add(dir); button.setPointerCapture(e.pointerId);
                    if (!frame) { last = 0; frame = requestAnimationFrame(tick); }
                });
                button.addEventListener("pointerup", () => keys.delete(dir));
                button.addEventListener("pointercancel", () => keys.delete(dir));
                button.addEventListener("lostpointercapture", () => keys.delete(dir));
            });

            return {
                update() { renderNodes(); if (active) open(active); updateView(); },
                unmount() {
                    cancelAnimationFrame(frame);
                    document.removeEventListener("keydown", keydown);
                    document.removeEventListener("keyup", keyup);
                    document.removeEventListener("click", navClick);
                    window.removeEventListener("blur", blur);
                    window.removeEventListener("resize", resize);
                    root.innerHTML = "";
                },
            };
        },
    });
})();
