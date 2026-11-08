/* 余火之境：第三人称 3D 探索主题，内容来自 SITE_DATA。 */
(function () {
    "use strict";
    const ZONES = [
        { id: "home", name: "余火祭坛", icon: "✦", x: 0, z: 0, color: 0xffaa55 },
        { id: "works", name: "锻造庭院", icon: "⚒", x: 15, z: -10, color: 0xff7848 },
        { id: "milestones", name: "回忆墓园", icon: "✧", x: -15, z: -12, color: 0xa9c9d0 },
        { id: "notes", name: "旅人手记", icon: "✎", x: -16, z: 12, color: 0xd4c28e },
        { id: "gallery", name: "幻影画廊", icon: "▧", x: 16, z: 13, color: 0xb6a1ed },
        { id: "links", name: "传送门", icon: "◇", x: 0, z: -23, color: 0x88cebb },
    ];
    const safeUrl = value => /^(https?:\/\/|mailto:|(?:\.\.?\/)?(?:img|music)\/)/i.test(String(value || "").trim()) ? String(value).trim() : "#";

    window.RinThemes.register({
        id: "souls",
        mount(root, ctx) {
            const esc = ctx.esc, data = () => window.SITE_DATA || {};
            const zones = () => ZONES.filter(z => !((data().layout || {}).hidden || []).includes(z.id));
            let THREE, renderer, scene, camera, hero, flame, fireLight, frame = 0, disposed = false;
            let active = null, near = null, yaw = 0, pitch = .48, dragging = false, moved = false;
            let last = 0, meshes = [], labels = [], clickable = [], pointerX = 0;
            const pos = { x: 0, z: 5 }, keys = new Set();

            root.innerHTML = `<main class="souls" aria-label="余火之境 3D 探索模式">
                <div class="souls-stage" id="soulsStage"><div class="souls-loading" id="soulsLoading">正在点燃余火…</div></div>
                <div class="souls-vignette"></div>
                <div class="souls-head"><span class="souls-kicker">RIN9 · 第三人称探索</span><h1>余火之境</h1></div>
                <div class="souls-hud"><span>旅人</span><div class="souls-hp"><i></i></div><span id="soulsPlace">余火祭坛</span></div>
                <div class="souls-prompt" id="soulsPrompt" aria-live="polite">WASD 移动 · 拖动镜头 · 靠近地标按 E</div>
                <div class="souls-map" id="soulsMap" aria-label="地标快捷入口"></div>
                <div class="souls-pad" aria-label="触屏移动"><button data-dir="up" aria-label="前进">▲</button><div>
                    <button data-dir="left" aria-label="向左">◀</button><button data-dir="down" aria-label="后退">▼</button>
                    <button data-dir="right" aria-label="向右">▶</button></div></div>
                <aside class="souls-panel" id="soulsPanel" aria-hidden="true" aria-label="地标内容">
                    <button class="souls-close" id="soulsClose" aria-label="关闭内容">×</button><div id="soulsPanelBody"></div></aside>
            </main>`;
            const $ = s => root.querySelector(s), stage = $("#soulsStage"), panel = $("#soulsPanel");
            const list = (items, fn) => items.length ? items.map(fn).join("") : '<p class="souls-empty">这里还没有留下痕迹。</p>';
            const link = (url, label) => `<a href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;
            function content(id) {
                const d = data(), p = d.profile || {};
                if (id === "home") return `<p>${esc(p.intro || p.tagline || "欢迎来到这里。")}</p><p class="souls-flavor">篝火尚未熄灭。沿着道路，拾起散落的故事。</p>`;
                if (id === "works") return list(d.works || [], w => `<article class="souls-entry">${w.cover ? `<img src="${esc(safeUrl(w.cover))}" alt="" loading="lazy">` : ""}<div><small>${esc(w.status || "作品")}</small><h3>${esc(w.title)}</h3><p>${esc(w.desc)}</p><div class="souls-tags">${(w.tags || []).map(t => `<span>${esc(t)}</span>`).join("")}</div><div class="souls-links">${(w.links || []).map(l => link(l.url, l.label)).join("")}</div></div></article>`);
                if (id === "milestones") return list(d.milestones || [], m => `<article class="souls-entry"><div><small>${esc(m.date)}</small><h3>${esc(m.icon || "✧")} ${esc(m.title)}</h3><p>${esc(m.desc)}</p></div></article>`);
                if (id === "notes") return list(d.notes || [], n => `<article class="souls-entry"><div><small>${esc(n.date)}</small><h3>${esc(n.title)}</h3><p>${esc(n.desc)}</p><div class="souls-photos">${(n.images || []).map(src => `<button data-photo="${esc(safeUrl(src))}" aria-label="放大记录照片"><img src="${esc(safeUrl(src))}" alt="" loading="lazy"></button>`).join("")}</div></div></article>`);
                if (id === "gallery") return `<div class="souls-gallery">${list(d.gallery || [], g => `<button data-photo="${esc(safeUrl(g.src))}" data-caption="${esc(g.caption)}"><img src="${esc(safeUrl(g.src))}" alt="${esc(g.caption)}" loading="lazy"><span>${esc(g.caption)}</span></button>`)}</div>`;
                return list(d.links || [], l => `<article class="souls-entry"><div><h3>${esc(l.icon || "◇")} ${esc(l.name)}</h3><div class="souls-links">${link(l.url, "开启传送门")}</div></div></article>`);
            }
            function open(id) {
                const z = zones().find(item => item.id === id); if (!z) return;
                active = id; keys.clear();
                const title = ((data().sections || {})[id] || {}).title || z.name;
                $("#soulsPanelBody").innerHTML = `<div class="souls-panel-title"><span>${z.icon}</span><small>拾起记忆 · ${z.name}</small><h2>${esc(title)}</h2></div>${content(id)}`;
                panel.classList.add("open"); panel.setAttribute("aria-hidden", "false"); $("#soulsClose").focus();
            }
            function close() { active = null; panel.classList.remove("open"); panel.setAttribute("aria-hidden", "true"); }
            function renderMap() { $("#soulsMap").innerHTML = zones().map(z => `<button data-zone="${z.id}" title="查看${z.name}">${z.icon}<span>${z.name}</span></button>`).join(""); }

            function material(color, roughness = 1) { return new THREE.MeshStandardMaterial({ color, roughness, flatShading: true }); }
            function mesh(geo, mat, x, y, z, group = scene) {
                const obj = new THREE.Mesh(geo, mat); obj.position.set(x, y, z); group.add(obj); meshes.push(obj); return obj;
            }
            function column(x, z, h, broken = false) {
                mesh(new THREE.CylinderGeometry(.65, .8, .4, 8), material(0x434b48), x, .2, z);
                mesh(new THREE.CylinderGeometry(.45, .55, h, 8), material(0x59605a), x, h / 2 + .4, z).rotation.z = broken ? .12 : 0;
                mesh(new THREE.CylinderGeometry(.7, .55, .36, 8), material(0x414945), x, h + .55, z);
            }
            function createLandmark(z) {
                const group = new THREE.Group(); group.position.set(z.x, 0, z.z); scene.add(group);
                const stone = material(0x363e3d), trim = material(0x727263), glow = new THREE.MeshBasicMaterial({ color: z.color });
                mesh(new THREE.CylinderGeometry(3.1, 3.5, .35, 10), stone, 0, .18, 0, group);
                mesh(new THREE.TorusGeometry(2.45, .07, 5, 40), trim, 0, .4, 0, group).rotation.x = Math.PI / 2;
                if (z.id === "home") {
                    mesh(new THREE.CylinderGeometry(.38, .55, 1.1, 7), stone, 0, .9, 0, group);
                    flame = mesh(new THREE.ConeGeometry(.58, 1.6, 7), glow, 0, 2.1, 0, group);
                    fireLight = new THREE.PointLight(z.color, 17, 16); fireLight.position.set(0, 2.4, 0); group.add(fireLight);
                } else if (z.id === "links") {
                    for (const side of [-1, 1]) {
                        mesh(new THREE.BoxGeometry(.8, 5.5, 1.1), stone, side * 1.5, 2.8, 0, group);
                    }
                    mesh(new THREE.BoxGeometry(3.8, .8, 1.3), stone, 0, 5.9, 0, group);
                    mesh(new THREE.PlaneGeometry(2.3, 4.8), new THREE.MeshBasicMaterial({ color: z.color, transparent: true, opacity: .34, side: THREE.DoubleSide }), 0, 3.2, 0, group);
                } else {
                    const heights = z.id === "milestones" ? [2.2, 3.6, 2.8] : [3.8, 4.7, 3.2];
                    heights.forEach((h, i) => {
                        const angle = i * Math.PI * 2 / 3;
                        mesh(new THREE.BoxGeometry(.8, h, .8), stone, Math.sin(angle) * 1.7, h / 2 + .4, Math.cos(angle) * 1.7, group);
                    });
                    mesh(new THREE.OctahedronGeometry(.8), glow, 0, 3.1, 0, group);
                }
                const light = new THREE.PointLight(z.color, 5, 9); light.position.set(0, 3, 0); group.add(light);
                group.traverse(obj => { if (obj.isMesh) { obj.userData.zone = z.id; clickable.push(obj); } });
                const label = document.createElement("button"); label.className = "souls-label"; label.textContent = `${z.icon} ${z.name}`; label.dataset.zone = z.id;
                stage.appendChild(label); labels.push({ el: label, z });
            }
            function buildScene() {
                scene = new THREE.Scene(); scene.background = new THREE.Color(0x0b1117); scene.fog = new THREE.FogExp2(0x0b1117, .026);
                camera = new THREE.PerspectiveCamera(65, 1, .1, 160);
                renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
                renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75)); renderer.outputColorSpace = THREE.SRGBColorSpace;
                stage.prepend(renderer.domElement);
                scene.add(new THREE.HemisphereLight(0x9baec2, 0x222015, 1.5));
                const moon = new THREE.DirectionalLight(0xbac9d4, 1.3); moon.position.set(-15, 25, -20); scene.add(moon);
                mesh(new THREE.PlaneGeometry(130, 130), material(0x28312d), 0, -.05, 0).rotation.x = -Math.PI / 2;
                const pathMat = material(0x4b483c);
                ZONES.slice(1).forEach(z => {
                    const length = Math.hypot(z.x, z.z), path = mesh(new THREE.PlaneGeometry(2.7, length), pathMat, z.x / 2, .01, z.z / 2);
                    path.rotation.x = -Math.PI / 2; path.rotation.z = Math.atan2(z.x, z.z);
                });
                for (let i = 0; i < 58; i++) {
                    const x = Math.sin(i * 43.7) * 31, z = Math.cos(i * 19.1) * 30;
                    if (Math.hypot(x, z) < 6 || ZONES.some(zone => Math.hypot(x - zone.x, z - zone.z) < 5)) continue;
                    if (i % 4 === 0) column(x, z, 1.8 + i % 3, i % 2 === 0);
                    else {
                        const rock = mesh(new THREE.DodecahedronGeometry(.7 + i % 4 * .23, 0), material(i % 2 ? 0x37403b : 0x424740), x, .45, z);
                        rock.scale.y = .45;
                    }
                }
                const body = new THREE.Group(); scene.add(body); hero = body;
                mesh(new THREE.CylinderGeometry(.28, .52, 1.45, 7), material(0x252a2d), 0, 1.15, 0, body);
                mesh(new THREE.SphereGeometry(.31, 8, 6), material(0xb6a58c), 0, 2.05, 0, body);
                mesh(new THREE.ConeGeometry(.65, 1.7, 6), material(0x171c22), 0, 1.1, -.18, body).rotation.x = -.2;
                mesh(new THREE.BoxGeometry(.12, 1.8, .13), material(0xb4b6ad), .7, 1.15, -.1, body).rotation.z = -.2;
                zones().forEach(createLandmark);
                resize(); $("#soulsLoading").remove(); frame = requestAnimationFrame(tick);
            }
            function resize() { if (!renderer) return; const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight); camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); }
            function tick(now) {
                const dt = Math.min((now - (last || now)) / 1000, .05); last = now;
                if (!active) {
                    const dx = Number(keys.has("right")) - Number(keys.has("left"));
                    const dz = Number(keys.has("down")) - Number(keys.has("up"));
                    if (dx || dz) {
                        const len = Math.hypot(dx, dz), speed = 6.5 * dt / len;
                        pos.x = Math.max(-32, Math.min(32, pos.x + (Math.cos(yaw) * dx + Math.sin(yaw) * dz) * speed));
                        pos.z = Math.max(-32, Math.min(32, pos.z + (-Math.sin(yaw) * dx + Math.cos(yaw) * dz) * speed));
                        hero.rotation.y = Math.atan2(Math.cos(yaw) * dx + Math.sin(yaw) * dz, Math.sin(yaw) * dx - Math.cos(yaw) * dz);
                        hero.position.y = Math.sin(now * .013) * .09;
                    } else hero.position.y *= .8;
                }
                hero.position.x = pos.x; hero.position.z = pos.z;
                const target = new THREE.Vector3(pos.x, 1.5, pos.z);
                const distance = 7.8, horizontal = Math.cos(pitch) * distance;
                camera.position.set(pos.x + Math.sin(yaw) * horizontal, 1.5 + Math.sin(pitch) * distance, pos.z + Math.cos(yaw) * horizontal);
                camera.lookAt(target);
                const nearest = zones().map(z => ({ z, d: Math.hypot(z.x - pos.x, z.z - pos.z) })).sort((a, b) => a.d - b.d)[0];
                near = nearest?.d < 4.3 ? nearest.z : null;
                $("#soulsPlace").textContent = nearest?.z.name || "余火之境";
                $("#soulsPrompt").textContent = near ? `E · ${near.name} · 互动` : "WASD 移动 · 拖动镜头 · 靠近地标按 E";
                labels.forEach(({ el, z }) => {
                    const v = new THREE.Vector3(z.x, z.id === "links" ? 6.5 : 4.4, z.z).project(camera);
                    el.hidden = v.z > 1 || v.z < -1;
                    el.style.left = `${(v.x * .5 + .5) * 100}%`; el.style.top = `${(-v.y * .5 + .5) * 100}%`;
                    el.classList.toggle("near", near?.id === z.id);
                });
                if (flame) flame.scale.y = 1 + Math.sin(now * .012) * .18;
                if (fireLight) fireLight.intensity = 15 + Math.sin(now * .014) * 2;
                renderer.render(scene, camera); frame = requestAnimationFrame(tick);
            }
            const dirs = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right" };
            function keydown(e) { if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; const dir = dirs[e.key] || dirs[e.key.toLowerCase()]; if (dir && !active) { e.preventDefault(); keys.add(dir); } if (e.key.toLowerCase() === "e" && near && !active) open(near.id); if (e.key === "Escape" && active) close(); }
            function keyup(e) { const dir = dirs[e.key] || dirs[e.key.toLowerCase()]; if (dir) keys.delete(dir); }
            function blur() { keys.clear(); dragging = false; }
            function navClick(e) { const a = e.target.closest("#navLinks a, .nav-brand"); if (!a) return; const id = (a.getAttribute("href") || "").slice(1); if (ZONES.some(z => z.id === id)) { e.preventDefault(); open(id); } }
            function click(e) { const photo = e.target.closest("[data-photo]"); if (photo) { ctx.openLightbox(photo.dataset.photo, photo.dataset.caption || ""); return; } const z = e.target.closest("[data-zone]"); if (z) open(z.dataset.zone); if (e.target.closest("#soulsClose")) close(); }
            function down(e) { if (e.target !== renderer?.domElement) return; dragging = true; moved = false; pointerX = e.clientX; stage.setPointerCapture(e.pointerId); }
            function move(e) { if (!dragging) return; const delta = e.clientX - pointerX; pointerX = e.clientX; if (Math.abs(delta) > 0) moved = true; yaw -= delta * .005; pitch = Math.max(.2, Math.min(.95, pitch + e.movementY * .003)); }
            function up(e) { if (!dragging) return; dragging = false; if (!moved && renderer) { const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(e.clientX / stage.clientWidth * 2 - 1, -(e.clientY / stage.clientHeight * 2 - 1)); ray.setFromCamera(mouse, camera); const hit = ray.intersectObjects(clickable)[0]; if (hit?.object.userData.zone) open(hit.object.userData.zone); } }
            renderMap();
            document.addEventListener("keydown", keydown); document.addEventListener("keyup", keyup); document.addEventListener("click", navClick);
            window.addEventListener("blur", blur); window.addEventListener("resize", resize);
            root.addEventListener("click", click); stage.addEventListener("pointerdown", down); stage.addEventListener("pointermove", move); stage.addEventListener("pointerup", up); stage.addEventListener("pointercancel", up);
            root.querySelectorAll("[data-dir]").forEach(button => { const dir = button.dataset.dir; button.addEventListener("pointerdown", e => { e.preventDefault(); keys.add(dir); button.setPointerCapture(e.pointerId); }); for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) button.addEventListener(event, () => keys.delete(dir)); });
            import(new URL("js/vendor/three.module.min.js", document.baseURI).href).then(mod => { if (!disposed) { THREE = mod; buildScene(); } }).catch(error => { if (!disposed) $("#soulsLoading").textContent = "3D 场景加载失败，请切换界面后重试。"; console.error(error); });
            return { update() { renderMap(); if (active) open(active); }, unmount() {
                disposed = true; cancelAnimationFrame(frame);
                document.removeEventListener("keydown", keydown); document.removeEventListener("keyup", keyup); document.removeEventListener("click", navClick);
                window.removeEventListener("blur", blur); window.removeEventListener("resize", resize);
                if (scene) scene.traverse(obj => { if (obj.geometry) obj.geometry.dispose(); if (obj.material) { const mats = Array.isArray(obj.material) ? obj.material : [obj.material]; mats.forEach(m => m.dispose()); } });
                renderer?.dispose(); renderer?.forceContextLoss?.(); root.innerHTML = "";
            } };
        },
    });
})();
