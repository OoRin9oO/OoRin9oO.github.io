/* ============================================================
   galaxy 主题 —— 星图
   中心一颗主星（主要项目），作品沿环星带分布，可旋转缩放，
   点星星弹出信息卡。
   Three.js 只在选中这个界面时才加载。
   ============================================================ */

(function () {
    "use strict";

    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
    const D = () => window.SITE_DATA || {};

    const STATUS = { done: "已完成", wip: "进行中", plan: "规划中" };

    /* 星体配色：中心用主题主色，其余按序取色 */
    const PALETTE = ["#8fb4ff", "#b48bff", "#5fd3c0", "#ff9ecb", "#ffc46b", "#8fd3ff", "#c9a0ff"];
    const RING_R = [6.0, 8.8, 11.6];

    /* Three.js 优先用仓库内的本地副本（js/vendor），
       不依赖外部 CDN —— 国内访问 jsdelivr 经常直接超时。
       CDN 只作为本地文件缺失时的兜底，且每次都带超时，
       避免某一个源挂住导致星图永远停在加载中。 */
    let CACHED_THREE = null;

    function importWithTimeout(url, ms) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("超时：" + url)), ms);
            import(url).then(
                m => { clearTimeout(timer); resolve(m); },
                e => { clearTimeout(timer); reject(e); }
            );
        });
    }

    async function loadThree() {
        if (CACHED_THREE) return CACHED_THREE;
        const sources = [
            { url: "js/vendor/three.module.min.js", ms: 12000 },
            { url: "https://unpkg.com/three@0.160.0/build/three.module.min.js", ms: 15000 },
            { url: "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js", ms: 8000 },
        ];
        let lastErr = null;
        for (const s of sources) {
            try {
                CACHED_THREE = await importWithTimeout(s.url, s.ms);
                return CACHED_THREE;
            } catch (e) {
                lastErr = e;
                console.warn("Three.js 源不可用：", s.url, e.message);
            }
        }
        throw lastErr || new Error("Three.js 加载失败");
    }

    window.RinThemes.register({
        id: "galaxy",

        mount(root, ctx) {
            const LS_CENTER = "rin9-galaxy-center";

            /* ---------- 界面骨架 ---------- */
            root.innerHTML = `
            <div class="gx-wrap">
                <canvas class="gx-canvas"></canvas>

                <div class="gx-loading">
                    <div class="gx-spin"></div>
                    <div>正在铺设星图…</div>
                </div>

                <div class="gx-nav">
                    <button class="gx-nav-item" data-gx-go="works">
                        <span class="dot"></span>作品集 · 恒星
                    </button>
                    <button class="gx-nav-item soon" data-gx-soon="里程碑">
                        <span class="dot"></span>里程碑 · 行星（接入中）
                    </button>
                    <button class="gx-nav-item soon" data-gx-soon="日常记录">
                        <span class="dot"></span>日常 · 小行星（接入中）
                    </button>
                    <button class="gx-nav-item soon" data-gx-soon="照片墙">
                        <span class="dot"></span>照片墙 · 星云（接入中）
                    </button>
                </div>

                <div class="gx-hint">拖拽旋转 · 滚轮缩放 · 点星星查看</div>

                <div class="gx-panel" id="gxPanel"></div>
            </div>`;

            const canvas = $(".gx-canvas", root);
            const loading = $(".gx-loading", root);
            const hint = $(".gx-hint", root);
            const panel = $("#gxPanel", root);

            let disposed = false;
            let raf = null;
            let THREE = null;
            let renderer = null, scene = null, camera = null, group = null;
            let raycaster = null, pointerNdc = null;
            let glowTex = null, starTex = null;
            let bodies = [];        // { key, work, mesh, glow, target, baseScale, curScale, targetScale, baseColor }
            let ringLines = [];
            let starfield = null;

            const cam = {
                zoom: 21, zoomT: 21,
                pitch: -0.12, pitchT: -0.12,
                theta: 0.6, thetaT: 0.6,
            };
            let dragging = false, moved = 0, lastX = 0, lastY = 0;
            let idleUntil = 0;
            let selectedKey = null;

            let centerKey = localStorage.getItem(LS_CENTER) || "";

            /* ---------- 小工具 ---------- */
            function accentColor() {
                const v = getComputedStyle(document.documentElement)
                    .getPropertyValue("--accent").trim();
                return v || "#a78bfa";
            }

            /* 颜色工具：把偏灰的主色提成鲜艳的星光色 */
            function hexToRgb(h) {
                h = String(h).replace("#", "");
                if (h.length === 3) h = h.split("").map(c => c + c).join("");
                const n = parseInt(h, 16);
                if (isNaN(n)) return [167, 139, 250];
                return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
            }

            function rgbToHex(r, g, b) {
                return "#" + [r, g, b].map(v =>
                    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")
                ).join("");
            }

            /* 向白色靠拢，做炽热核心 */
            function mixWhite(hex, t) {
                const [r, g, b] = hexToRgb(hex);
                return rgbToHex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t);
            }

            /* 提高饱和度与亮度，避免用户选的灰色主色做成死气沉沉的星 */
            function vivid(hex) {
                let [r, g, b] = hexToRgb(hex).map(v => v / 255);
                const max = Math.max(r, g, b), min = Math.min(r, g, b);
                let h = 0, sat = 0;
                const l = (max + min) / 2;
                if (max !== min) {
                    const d = max - min;
                    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
                    else if (max === g) h = ((b - r) / d + 2) / 6;
                    else h = ((r - g) / d + 4) / 6;
                }
                sat = Math.max(sat, 0.62);
                const lum = Math.max(0.58, Math.min(0.72, l));
                const hue2rgb = (p, q, t) => {
                    if (t < 0) t += 1;
                    if (t > 1) t -= 1;
                    if (t < 1 / 6) return p + (q - p) * 6 * t;
                    if (t < 1 / 2) return q;
                    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                    return p;
                };
                const q = lum < 0.5 ? lum * (1 + sat) : lum + sat - lum * sat;
                const pp = 2 * lum - q;
                return rgbToHex(
                    hue2rgb(pp, q, h + 1 / 3) * 255,
                    hue2rgb(pp, q, h) * 255,
                    hue2rgb(pp, q, h - 1 / 3) * 255
                );
            }

            function makeGlowTexture() {
                const c = document.createElement("canvas");
                c.width = c.height = 128;
                const g = c.getContext("2d");
                const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
                grd.addColorStop(0, "rgba(255,255,255,1)");
                grd.addColorStop(0.18, "rgba(255,255,255,0.75)");
                grd.addColorStop(0.45, "rgba(255,255,255,0.22)");
                grd.addColorStop(1, "rgba(255,255,255,0)");
                g.fillStyle = grd;
                g.fillRect(0, 0, 128, 128);
                return new THREE.CanvasTexture(c);
            }

            /* ---------- 场景 ---------- */
            function initScene() {
                renderer = new THREE.WebGLRenderer({
                    canvas, antialias: true, alpha: true,
                    powerPreference: "high-performance",
                });
                renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
                renderer.setSize(canvas.clientWidth || window.innerWidth,
                                 canvas.clientHeight || window.innerHeight, false);

                scene = new THREE.Scene();
                camera = new THREE.PerspectiveCamera(
                    52,
                    (canvas.clientWidth || 1) / (canvas.clientHeight || 1),
                    0.1, 400
                );

                group = new THREE.Group();
                scene.add(group);

                raycaster = new THREE.Raycaster();
                pointerNdc = new THREE.Vector2();

                glowTex = makeGlowTexture();
                starTex = glowTex;

                buildStarfield();
                buildBodies();
                layoutBodies();
                updateCamera(1);

                loading.classList.add("gone");
                // 淡出结束后直接移除，避免文字残留在星星上
                setTimeout(() => { if (loading.parentNode) loading.remove(); }, 700);
                setTimeout(() => { if (hint) hint.classList.add("fade"); }, 6500);

                animate();
            }

            function buildStarfield() {
                const COUNT = 1400;
                const pos = new Float32Array(COUNT * 3);
                for (let i = 0; i < COUNT; i++) {
                    // 球壳分布，避免中间太密
                    const r = 34 + Math.random() * 62;
                    const t = Math.random() * Math.PI * 2;
                    const p = Math.acos(2 * Math.random() - 1);
                    pos[i * 3] = r * Math.sin(p) * Math.cos(t);
                    pos[i * 3 + 1] = r * Math.cos(p) * 0.7;
                    pos[i * 3 + 2] = r * Math.sin(p) * Math.sin(t);
                }
                const geo = new THREE.BufferGeometry();
                geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
                const mat = new THREE.PointsMaterial({
                    size: 0.55,
                    map: starTex,
                    color: 0xcfd6ff,
                    transparent: true,
                    opacity: 0.75,
                    depthWrite: false,
                    sizeAttenuation: true,
                });
                starfield = new THREE.Points(geo, mat);
                scene.add(starfield);
            }

            /* ---------- 星体 ---------- */
            function importanceOf(w) {
                // 目前按状态推导；以后编辑器里可写 w.starSize 覆盖
                if (typeof w.starSize === "number" && w.starSize > 0) return w.starSize;
                const base = { done: 1.25, wip: 1.0, plan: 0.78 };
                return base[w.status] || 1.0;
            }

            function clearBodies() {
                bodies.forEach(b => {
                    group.remove(b.mesh);
                    group.remove(b.glow);
                    b.mesh.geometry.dispose();
                    b.mesh.material.dispose();
                    b.glow.material.dispose();
                    if (b.halo) {
                        group.remove(b.halo);
                        b.halo.material.dispose();
                    }
                    if (b.picker) {
                        group.remove(b.picker);
                        b.picker.geometry.dispose();
                        b.picker.material.dispose();
                    }
                });
                bodies = [];
                ringLines.forEach(l => {
                    group.remove(l);
                    l.geometry.dispose();
                    l.material.dispose();
                });
                ringLines = [];
            }

            function buildBodies() {
                clearBodies();
                const works = (D().works || []).slice();
                if (!works.length) return;

                // 中心项
                let ci = works.findIndex(w => w.title === centerKey);
                if (ci < 0) ci = 0;
                centerKey = works[ci].title;

                const others = works.filter((w, i) => i !== ci);
                const baseColor = accentColor();

                // 环星带
                RING_R.forEach((r, i) => {
                    const pts = [];
                    const N = 128;
                    for (let k = 0; k < N; k++) {
                        const a = (k / N) * Math.PI * 2;
                        pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
                    }
                    const geo = new THREE.BufferGeometry().setFromPoints(pts);
                    const mat = new THREE.LineBasicMaterial({
                        color: baseColor,
                        transparent: true,
                        opacity: i === 0 ? 0.22 : 0.13,
                    });
                    const line = new THREE.LineLoop(geo, mat);
                    group.add(line);
                    ringLines.push(line);
                });

                // 中心星
                bodies.push(makeBody(works[ci], baseColor, 2.75, true));

                // 其他星：按环分组，组内均匀铺角，避免互相遮挡
                others.forEach((w, i) => {
                    // 组内序号与组号稍后由 layout 决定，这里先按顺序给颜色与大小
                    const color = PALETTE[i % PALETTE.length];
                    const scale = 0.46 * importanceOf(w) + 0.26;
                    bodies.push(makeBody(w, color, scale, false));
                });
            }

            function makeBody(w, color, scale, isCenter) {
                const star = vivid(color);
                const core = mixWhite(star, 0.72);

                // 炽热核心
                const geo = new THREE.SphereGeometry(1, 24, 18);
                const mat = new THREE.MeshBasicMaterial({
                    color: core, transparent: true, opacity: 1,
                });
                const mesh = new THREE.Mesh(geo, mat);
                mesh.userData.key = w.title;
                mesh.scale.setScalar(scale * 0.3);
                group.add(mesh);

                // 内层光晕
                const gmat = new THREE.SpriteMaterial({
                    map: glowTex,
                    color: star,
                    transparent: true,
                    opacity: isCenter ? 0.95 : 0.62,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                });
                const glow = new THREE.Sprite(gmat);
                glow.scale.setScalar(scale * 2.3);
                group.add(glow);

                // 外层弥散辉光，制造大气感
                const hmat = new THREE.SpriteMaterial({
                    map: glowTex,
                    color: star,
                    transparent: true,
                    opacity: isCenter ? 0.16 : 0.09,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                });
                const halo = new THREE.Sprite(hmat);
                halo.scale.setScalar(scale * 5.4);
                group.add(halo);

                // 不可见的命中球：星星本身很小，靠它把可点范围放大
                const pickGeo = new THREE.SphereGeometry(1, 12, 10);
                const pickMat = new THREE.MeshBasicMaterial({
                    transparent: true, opacity: 0, depthWrite: false,
                });
                const picker = new THREE.Mesh(pickGeo, pickMat);
                picker.userData.key = w.title;
                picker.scale.setScalar(scale * 1.5);
                group.add(picker);

                return {
                    key: w.title,
                    work: w,
                    mesh, glow, halo, picker,
                    isCenter,
                    baseScale: scale,
                    curScale: scale,
                    targetScale: scale,
                    targetPos: new THREE.Vector3(),
                    baseColor: star,
                    baseOpacity: isCenter ? 1 : 0.95,
                    baseGlow: isCenter ? 0.95 : 0.62,
                    baseHalo: isCenter ? 0.16 : 0.09,
                };
            }

            /* 计算每颗星的目标位置：中心在原点，其余按环分布 */
            function layoutBodies() {
                bodies.forEach((b, i) => {
                    if (b.isCenter) {
                        b.targetPos.set(0, 0, 0);
                        b.targetScale = b.baseScale;
                        return;
                    }
                    const idx = i - 1;
                    const total = bodies.length - 1;

                    // 角度均匀铺开（每颗占一格），半径交错取环 ——
                    // 这样任意两颗都不会落在同一条视线上，不会互相遮挡
                    const ang = (idx / Math.max(1, total)) * Math.PI * 2 + 0.45;
                    const r = RING_R[idx % RING_R.length];

                    b.targetPos.set(
                        Math.cos(ang) * r,
                        Math.sin(ang * 2 + idx) * 1.5,
                        Math.sin(ang) * r
                    );
                    b.targetScale = b.baseScale;
                });
            }

            /* ---------- 相机 ---------- */
            function updateCamera(lerp) {
                cam.zoom += (cam.zoomT - cam.zoom) * (lerp || 0.12);
                cam.pitch += (cam.pitchT - cam.pitch) * (lerp || 0.12);
                cam.theta += (cam.thetaT - cam.theta) * (lerp || 0.12);

                const r = cam.zoom;
                camera.position.set(
                    r * Math.cos(cam.pitch) * Math.sin(cam.theta),
                    r * Math.sin(cam.pitch),
                    r * Math.cos(cam.pitch) * Math.cos(cam.theta)
                );
                camera.lookAt(0, 0, 0);
            }

            /* ---------- 动画 ---------- */
            const clock = { t: 0 };

            function animate() {
                if (disposed) return;
                raf = requestAnimationFrame(animate);

                const now = performance.now();
                if (!dragging && now > idleUntil) {
                    cam.thetaT += 0.00085;   // 静置时缓慢自转
                }
                updateCamera();

                bodies.forEach(b => {
                    b.curScale += (b.targetScale - b.curScale) * 0.14;
                    b.mesh.position.lerp(b.targetPos, 0.09);

                    b.mesh.scale.setScalar(b.curScale * 0.3);
                    b.glow.position.copy(b.mesh.position);
                    b.glow.scale.setScalar(b.curScale * 2.3);
                    b.halo.position.copy(b.mesh.position);
                    b.halo.scale.setScalar(b.curScale * 5.4);
                    b.picker.position.copy(b.mesh.position);
                    b.picker.scale.setScalar(b.curScale * 1.5);

                    // 选中的星更亮，其余压暗
                    const dim = selectedKey && selectedKey !== b.key;
                    const k = dim ? 0.55 : 1;
                    b.mesh.material.opacity += (b.baseOpacity * k - b.mesh.material.opacity) * 0.12;
                    b.glow.material.opacity += (b.baseGlow * k - b.glow.material.opacity) * 0.12;
                    b.halo.material.opacity += (b.baseHalo * k - b.halo.material.opacity) * 0.12;
                });

                if (starfield) starfield.rotation.y += 0.00018;

                clock.t += 0.016;
                const pulse = 1 + Math.sin(clock.t * 1.6) * 0.045;
                const c = bodies.find(b => b.isCenter);
                if (c) {
                    c.glow.scale.setScalar(c.curScale * 2.3 * pulse);
                    c.halo.scale.setScalar(c.curScale * 5.4 * pulse);
                }

                renderer.render(scene, camera);
            }

            /* ---------- 交互 ---------- */
            function onPointerDown(e) {
                dragging = true;
                moved = 0;
                lastX = e.clientX;
                lastY = e.clientY;
                idleUntil = performance.now() + 2600;
                try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
            }

            function onPointerMove(e) {
                if (!dragging) return;
                const dx = e.clientX - lastX;
                const dy = e.clientY - lastY;
                lastX = e.clientX;
                lastY = e.clientY;
                moved += Math.abs(dx) + Math.abs(dy);

                cam.thetaT -= dx * 0.005;
                cam.pitchT = Math.max(-1.15, Math.min(1.15, cam.pitchT + dy * 0.004));
                idleUntil = performance.now() + 2600;
            }

            function onPointerUp(e) {
                if (!dragging) return;
                dragging = false;
                idleUntil = performance.now() + 2600;
                if (moved < 7) pickAt(e.clientX, e.clientY);
            }

            function onWheel(e) {
                e.preventDefault();
                cam.zoomT = Math.max(7.5, Math.min(34, cam.zoomT + e.deltaY * 0.016));
                idleUntil = performance.now() + 2600;
            }

            function pickAt(cx, cy) {
                if (!raycaster) return;
                const r = canvas.getBoundingClientRect();
                pointerNdc.x = ((cx - r.left) / r.width) * 2 - 1;
                pointerNdc.y = -((cy - r.top) / r.height) * 2 + 1;
                raycaster.setFromCamera(pointerNdc, camera);
                const hits = raycaster.intersectObjects(bodies.map(b => b.picker), false);
                if (!hits.length) { closePanel(); return; }

                const key = hits[0].object.userData.key;
                selectBody(key);
            }

            function selectBody(key) {
                const b = bodies.find(x => x.key === key);
                if (!b) return;
                selectedKey = key;
                bodies.forEach(x => {
                    x.targetScale = (x.key === key) ? x.baseScale * 1.6 : x.baseScale;
                });
                // 把选中的星转到正面
                const ang = Math.atan2(b.targetPos.x, b.targetPos.z);
                cam.thetaT = -ang + 0.35;
                cam.pitchT = Math.max(-0.5, cam.pitchT);
                openPanel(b);
            }

            function closePanel() {
                selectedKey = null;
                bodies.forEach(x => { x.targetScale = x.baseScale; });
                panel.classList.remove("open");
            }

            /* ---------- 信息卡 ---------- */
            function openPanel(b) {
                const w = b.work;
                const isCenter = b.isCenter || b.key === centerKey;
                panel.innerHTML = `
                    <div class="gx-panel-head">
                        <div class="gx-cover" style="${w.cover ? `background-image:url('${w.cover}')` : ""}"></div>
                        <div class="gx-meta">
                            <div class="gx-title">${w.title || "未命名"}</div>
                            <div class="gx-tags">
                                <span class="gx-tag">${STATUS[w.status] || w.status || ""}</span>
                                ${(w.tags || []).slice(0, 3).map(t => `<span class="gx-tag">${t}</span>`).join("")}
                            </div>
                        </div>
                        <button class="gx-close" data-gx-close aria-label="关闭">✕</button>
                    </div>
                    <div class="gx-desc">${w.desc || ""}</div>
                    <div class="gx-actions">
                        <button class="gx-btn ${isCenter ? "" : "primary"}" data-gx-center="${encodeURIComponent(b.key)}"
                            ${isCenter ? "disabled" : ""}>${isCenter ? "已在中心" : "设为中心"}</button>
                        ${(w.links || []).map(l => `<a class="gx-btn" href="${l.url}" target="_blank" rel="noopener">${l.label} ↗</a>`).join("")}
                    </div>`;
                panel.classList.add("open");
            }

            panel.addEventListener("click", (e) => {
                if (e.target.closest("[data-gx-close]")) { closePanel(); return; }
                const c = e.target.closest("[data-gx-center]");
                if (c) {
                    const key = decodeURIComponent(c.dataset.gxCenter);
                    centerKey = key;
                    localStorage.setItem(LS_CENTER, key);
                    buildBodies();
                    layoutBodies();
                    selectedKey = null;
                    closePanel();
                    cam.zoomT = Math.max(cam.zoomT, 19);
                }
            });

            /* ---------- 板块入口 ---------- */
            $$("[data-gx-go]", root).forEach(btn => {
                btn.addEventListener("click", () => {
                    const first = bodies.find(b => b.isCenter);
                    if (first) selectBody(first.key);
                });
            });
            $$("[data-gx-soon]", root).forEach(btn => {
                btn.addEventListener("click", () => {
                    const name = btn.dataset.gxSoon;
                    btn.textContent = `${name} · 下一步接入`;
                    setTimeout(() => {
                        btn.innerHTML = `<span class="dot"></span>${name} · 接入中`;
                    }, 1600);
                });
            });

            /* ---------- 顶部导航拦截 ---------- */
            function onNavClick(e) {
                const a = e.target.closest("#navLinks a");
                if (!a) return;
                e.preventDefault();
                const id = (a.getAttribute("href") || "").slice(1);
                if (id === "works" || id === "home") {
                    const c = bodies.find(b => b.isCenter);
                    if (c) selectBody(c.key);
                } else {
                    const line = $(".gx-hint", root);
                    if (line) {
                        line.textContent = "这个板块的星体正在接入，先用「作品集」看看";
                        line.classList.remove("fade");
                        setTimeout(() => line.classList.add("fade"), 2400);
                    }
                }
            }
            const navBox = $("#navLinks");
            navBox?.addEventListener("click", onNavClick);

            function onKey(e) {
                if (e.key === "Escape") closePanel();
            }
            document.addEventListener("keydown", onKey);

            function onResize() {
                if (!renderer || !camera) return;
                const w = canvas.clientWidth || window.innerWidth;
                const h = canvas.clientHeight || window.innerHeight;
                renderer.setSize(w, h, false);
                camera.aspect = w / h;
                camera.updateProjectionMatrix();
            }
            window.addEventListener("resize", onResize);

            canvas.addEventListener("pointerdown", onPointerDown);
            canvas.addEventListener("pointermove", onPointerMove);
            canvas.addEventListener("pointerup", onPointerUp);
            canvas.addEventListener("pointercancel", onPointerUp);
            canvas.addEventListener("wheel", onWheel, { passive: false });

            /* ---------- 启动 ---------- */
            // 超过 3.5 秒还没好，给个交代，别让人以为卡死了
            const slowTip = setTimeout(() => {
                const t = $(".gx-loading div:last-child", root);
                if (t && !loading.classList.contains("gone")) {
                    t.textContent = "3D 引擎有点大，正在加载…";
                }
            }, 3500);

            (async () => {
                try {
                    THREE = await loadThree();
                    clearTimeout(slowTip);
                    if (disposed) return;
                    initScene();
                } catch (e) {
                    if (disposed) return;
                    loading.innerHTML = `
                        <div style="max-width:420px;text-align:center;line-height:1.8">
                            <div style="font-size:1.1rem;color:#e9e6f7;margin-bottom:8px">星图没能点亮</div>
                            <div style="font-size:.82rem">
                                3D 引擎加载失败（可能是网络问题）。<br>
                                换个界面看看，或者刷新重试。
                            </div>
                        </div>`;
                    console.error(e);
                }
            })();

            /* ---------- 对外 ---------- */
            return {
                update() {
                    if (!THREE || !group) return;
                    buildBodies();
                    layoutBodies();
                },
                unmount() {
                    disposed = true;
                    if (raf) cancelAnimationFrame(raf);
                    canvas.removeEventListener("pointerdown", onPointerDown);
                    canvas.removeEventListener("pointermove", onPointerMove);
                    canvas.removeEventListener("pointerup", onPointerUp);
                    canvas.removeEventListener("pointercancel", onPointerUp);
                    canvas.removeEventListener("wheel", onWheel);
                    window.removeEventListener("resize", onResize);
                    document.removeEventListener("keydown", onKey);
                    navBox?.removeEventListener("click", onNavClick);

                    clearBodies();
                    if (ringLines.length) {
                        ringLines.forEach(l => {
                            group.remove(l);
                            l.geometry.dispose();
                            l.material.dispose();
                        });
                        ringLines = [];
                    }
                    if (starfield) {
                        scene.remove(starfield);
                        starfield.geometry.dispose();
                        starfield.material.dispose();
                        starfield = null;
                    }
                    if (glowTex) { glowTex.dispose(); glowTex = null; }
                    if (renderer) {
                        renderer.dispose();
                        renderer.forceContextLoss?.();
                        renderer = null;
                    }
                    scene = null; camera = null; group = null;
                    bodies = [];
                },
            };
        },
    });
})();
