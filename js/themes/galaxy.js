/* ============================================================
   galaxy 主题 —— 星图

   中心一颗主星（由 data.appearance.centerWork 决定，访客不可改），
   作品是恒星沿环星带分布，里程碑是绕恒星公转的行星，
   日常是小行星带，照片是星云，链接是最外圈卫星。
   星与星之间有细线相连，像神经突触，线上有光点流动。

   点星星不拉镜头，只在它旁边挂一张名片；
   名片可拖动、可同时开好几张。

   Three.js 只在选中这个界面时才加载。
   ============================================================ */

(function () {
    "use strict";

    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
    const D = () => window.SITE_DATA || {};

    const STATUS = { done: "已完成", wip: "进行中", plan: "规划中" };
    const PALETTE = ["#8fb4ff", "#b48bff", "#5fd3c0", "#ff9ecb", "#ffc46b", "#8fd3ff", "#c9a0ff"];

    /* 恒星所在的三条环星带 */
    const RING_R = [6.0, 8.8, 11.6];
    /* 其余星体的轨道半径 */
    const ASTEROID_R = 14.8;
    const NEBULA_R = 16.2;
    const MOON_R = 17.8;

    /* ---------- Three.js：本地优先，CDN 兜底，每个源都带超时 ---------- */
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
        // 动态 import 的相对路径是相对「当前脚本」解析的（js/themes/），
        // 所以这里用 document.baseURI 拼成绝对地址，避免路径跑偏
        let localUrl = "js/vendor/three.module.min.js";
        try {
            localUrl = new URL("js/vendor/three.module.min.js", document.baseURI).href;
        } catch (e) { /* 保底用相对路径 */ }

        const sources = [
            { url: localUrl, ms: 12000 },
            { url: "https://unpkg.com/three@0.160.0/build/three.module.min.js", ms: 10000 },
            { url: "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js", ms: 6000 },
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
            /* ---------- 骨架 ---------- */
            root.innerHTML = `
            <div class="gx-wrap">
                <canvas class="gx-canvas"></canvas>

                <div class="gx-loading">
                    <div class="gx-spin"></div>
                    <div>正在铺设星图…</div>
                </div>

                <div class="gx-nav" id="gxNav"></div>
                <div class="gx-hint">拖拽旋转 · 滚轮缩放 · 点星星看名片</div>
                <div class="gx-cards" id="gxCards"></div>
            </div>`;

            const canvas = $(".gx-canvas", root);
            const loading = $(".gx-loading", root);
            const hint = $(".gx-hint", root);
            const cardLayer = $("#gxCards", root);
            const navBox = $("#gxNav", root);

            let disposed = false;
            let raf = null;
            let THREE = null;
            let renderer = null, scene = null, camera = null, group = null;
            let raycaster = null, ndc = null;
            let glowTex = null;
            let bodies = [];
            let starBodies = [];
            let ringLines = [];
            let starfield = null;
            let connLines = null, connData = null;
            let pulsePoints = null, pulseSegs = [];
            let cards = new Map();

            const cam = { zoom: 30, zoomT: 30, pitch: -0.34, pitchT: -0.34, theta: 0.6, thetaT: 0.6 };
            let dragging = false, moved = 0, lastX = 0, lastY = 0;
            let idleUntil = 0;
            let clockT = 0;

            /* ---------- 颜色工具 ---------- */
            function accentColor() {
                return getComputedStyle(document.documentElement)
                    .getPropertyValue("--accent").trim() || "#a78bfa";
            }

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

            function mixWhite(hex, t) {
                const [r, g, b] = hexToRgb(hex);
                return rgbToHex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t);
            }

            /* 提饱和度与亮度：主色可能偏灰，直接当星光会没气色 */
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
                const p2 = 2 * lum - q;
                return rgbToHex(
                    hue2rgb(p2, q, h + 1 / 3) * 255,
                    hue2rgb(p2, q, h) * 255,
                    hue2rgb(p2, q, h - 1 / 3) * 255
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
                // 先量一次尺寸再用：刚插入的 canvas 可能还没算出高度，
                // 直接拿 clientHeight 做分母会得到离谱的宽高比（曾压扁成一条线）
                const W = canvas.clientWidth || window.innerWidth || 1;
                const H = canvas.clientHeight || window.innerHeight || 1;

                renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
                renderer.setSize(W, H, false);

                scene = new THREE.Scene();
                camera = new THREE.PerspectiveCamera(52, W / H, 0.1, 400);

                group = new THREE.Group();
                scene.add(group);

                raycaster = new THREE.Raycaster();
                ndc = new THREE.Vector2();
                glowTex = makeGlowTexture();

                buildStarfield();
                rebuild();

                onResize();   // 再对齐一次，兜住布局尚未稳定的情况
                loading.classList.add("gone");
                setTimeout(() => { if (loading.parentNode) loading.remove(); }, 600);
                setTimeout(() => { if (hint) hint.classList.add("fade"); }, 7000);

                animate();
            }

            function buildStarfield() {
                const COUNT = 1400;
                const pos = new Float32Array(COUNT * 3);
                for (let i = 0; i < COUNT; i++) {
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
                    size: 0.55, map: glowTex, color: 0xcfd6ff,
                    transparent: true, opacity: 0.75,
                    depthWrite: false, sizeAttenuation: true,
                });
                starfield = new THREE.Points(geo, mat);
                scene.add(starfield);
            }

            /* ---------- 星体 ---------- */
            function importanceOf(w) {
                if (typeof w.starSize === "number" && w.starSize > 0) return w.starSize;
                const base = { done: 1.25, wip: 1.0, plan: 0.78 };
                return base[w.status] || 1.0;
            }

            function disposeObj(obj) {
                if (!obj) return;
                group.remove(obj);
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) obj.material.dispose();
            }

            function clearAll() {
                closeAllCards();
                bodies.forEach(b => {
                    disposeObj(b.mesh);
                    disposeObj(b.glow);
                    disposeObj(b.halo);
                    disposeObj(b.picker);
                    disposeObj(b.extra);
                });
                bodies = [];
                starBodies = [];
                ringLines.forEach(l => disposeObj(l));
                ringLines = [];
                if (connLines) { disposeObj(connLines); connLines = null; connData = null; }
                if (pulsePoints) { disposeObj(pulsePoints); pulsePoints = null; }
                pulseSegs = [];
            }

            function makeBody(opt) {
                const { id, kind, data, color, scale, isCenter, withHalo, glowOpacity } = opt;

                const star = vivid(color);
                const core = mixWhite(star, kind === "star" ? 0.72 : 0.55);

                const geo = new THREE.SphereGeometry(1, kind === "star" ? 24 : 14, kind === "star" ? 18 : 12);
                const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
                    color: core, transparent: true, opacity: 1,
                }));
                mesh.userData.id = id;
                mesh.scale.setScalar(scale * 0.3);
                group.add(mesh);

                const glow = new THREE.Sprite(new THREE.SpriteMaterial({
                    map: glowTex, color: star, transparent: true,
                    opacity: glowOpacity != null ? glowOpacity : (isCenter ? 0.95 : 0.6),
                    blending: THREE.AdditiveBlending, depthWrite: false,
                }));
                glow.scale.setScalar(scale * 2.3);
                group.add(glow);

                let halo = null;
                if (withHalo) {
                    halo = new THREE.Sprite(new THREE.SpriteMaterial({
                        map: glowTex, color: star, transparent: true,
                        opacity: isCenter ? 0.16 : 0.09,
                        blending: THREE.AdditiveBlending, depthWrite: false,
                    }));
                    halo.scale.setScalar(scale * 5.4);
                    group.add(halo);
                }

                // 不可见命中球：星体本身很小，靠它扩大可点范围
                const picker = new THREE.Mesh(
                    new THREE.SphereGeometry(1, 10, 8),
                    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
                );
                picker.userData.id = id;
                picker.scale.setScalar(Math.max(scale * 1.5, kind === "asteroid" ? 0.85 : 0.95));
                group.add(picker);

                return {
                    id, kind, data, color: star, isCenter: !!isCenter,
                    mesh, glow, halo, picker, extra: null,
                    baseScale: scale, curScale: scale, targetScale: scale,
                    targetPos: new THREE.Vector3(),
                    baseGlow: isCenter ? 0.95 : (glowOpacity != null ? glowOpacity : 0.6),
                    baseHalo: isCenter ? 0.16 : 0.09,
                    orbit: null,
                };
            }

            /* 里程碑归属：优先 m.work，其次标题关键词，最后挂中心星 */
            function matchOwner(m, stars) {
                if (m.work) {
                    const f = stars.find(s => s.data.title === m.work);
                    if (f) return f;
                }
                const text = (m.title || "") + " " + (m.desc || "");
                let best = null, bestLen = 0;
                stars.forEach(s => {
                    const t = String(s.data.title || "");
                    for (let len = Math.min(5, t.length); len >= 2; len--) {
                        for (let i = 0; i + len <= t.length; i++) {
                            const kw = t.slice(i, i + len);
                            if (text.includes(kw) && len > bestLen) { best = s; bestLen = len; }
                        }
                    }
                });
                return best || stars.find(s => s.isCenter) || stars[0];
            }

            /* ---------- 组装星系 ---------- */
            function rebuild() {
                clearAll();

                const d = D();
                const works = (d.works || []).slice();
                if (!works.length) return;

                const centerTitle = (d.appearance || {}).centerWork || "";
                let ci = works.findIndex(w => w.title === centerTitle);
                if (ci < 0) ci = 0;

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
                        color: baseColor, transparent: true,
                        opacity: i === 0 ? 0.2 : 0.11,
                    });
                    const line = new THREE.LineLoop(geo, mat);
                    group.add(line);
                    ringLines.push(line);
                });

                // 恒星
                bodies.push(makeBody({
                    id: "star:" + works[ci].title, kind: "star", data: works[ci],
                    color: baseColor, scale: 2.6, isCenter: true, withHalo: true,
                }));

                works.filter((w, i) => i !== ci).forEach((w, i) => {
                    bodies.push(makeBody({
                        id: "star:" + w.title, kind: "star", data: w,
                        color: PALETTE[i % PALETTE.length],
                        scale: 0.46 * importanceOf(w) + 0.26,
                        isCenter: false, withHalo: true,
                    }));
                });

                starBodies = bodies.filter(b => b.kind === "star");

                // 行星（里程碑）
                (d.milestones || []).forEach((m, i) => {
                    const owner = matchOwner(m, starBodies);
                    const b = makeBody({
                        id: "milestone:" + i, kind: "planet", data: m,
                        color: "#5fd3c0", scale: 0.19 + (i % 3) * 0.03,
                        isCenter: false, withHalo: false, glowOpacity: 0.55,
                    });
                    b.orbit = {
                        owner,
                        radius: 1.75 + (i % 3) * 0.62,
                        speed: 0.16 + (i % 4) * 0.045,
                        phase: (i * 1.9) % (Math.PI * 2),
                        tilt: 0.35 + (i % 3) * 0.2,
                    };
                    bodies.push(b);
                });

                // 小行星（日常）
                const notes = d.notes || [];
                notes.forEach((n, i) => {
                    const total = Math.max(1, notes.length);
                    const ang = (i / total) * Math.PI * 2 + 0.2;
                    const b = makeBody({
                        id: "note:" + i, kind: "asteroid", data: n,
                        color: "#ff9ecb", scale: 0.1,
                        isCenter: false, withHalo: false, glowOpacity: 0.5,
                    });
                    b.targetPos.set(
                        Math.cos(ang) * ASTEROID_R,
                        Math.sin(ang * 2.2) * 1.1 + 0.6,
                        Math.sin(ang) * ASTEROID_R
                    );
                    bodies.push(b);
                });

                // 星云（照片墙）
                const gallery = d.gallery || [];
                if (gallery.length) {
                    const neb = makeBody({
                        id: "gallery", kind: "nebula", data: { photos: gallery },
                        color: "#8fd3ff", scale: 2.2,
                        isCenter: false, withHalo: true, glowOpacity: 0.2,
                    });
                    const ang = 2.35;
                    neb.targetPos.set(Math.cos(ang) * NEBULA_R, 4.2, Math.sin(ang) * NEBULA_R);
                    neb.picker.scale.setScalar(2.2);

                    const N = 60;
                    const pos = new Float32Array(N * 3);
                    for (let k = 0; k < N; k++) {
                        const rr = Math.pow(Math.random(), 0.6) * 3.4;
                        const a1 = Math.random() * Math.PI * 2;
                        const a2 = Math.acos(2 * Math.random() - 1);
                        pos[k * 3] = rr * Math.sin(a2) * Math.cos(a1);
                        pos[k * 3 + 1] = rr * Math.cos(a2) * 0.6;
                        pos[k * 3 + 2] = rr * Math.sin(a2) * Math.sin(a1);
                    }
                    const g2 = new THREE.BufferGeometry();
                    g2.setAttribute("position", new THREE.BufferAttribute(pos, 3));
                    const dust = new THREE.Points(g2, new THREE.PointsMaterial({
                        size: 0.4, map: glowTex, color: 0xbfe6ff,
                        transparent: true, opacity: 0.5,
                        blending: THREE.AdditiveBlending, depthWrite: false,
                    }));
                    group.add(dust);
                    neb.extra = dust;
                    bodies.push(neb);
                }

                // 卫星（常用链接）
                const links = d.links || [];
                links.forEach((l, i) => {
                    const total = Math.max(1, links.length);
                    const ang = (i / total) * Math.PI * 2 + 1.1;
                    const b = makeBody({
                        id: "link:" + i, kind: "moon", data: l,
                        color: "#ffc46b", scale: 0.15,
                        isCenter: false, withHalo: false, glowOpacity: 0.55,
                    });
                    b.targetPos.set(
                        Math.cos(ang) * MOON_R,
                        Math.cos(ang * 1.7) * 1.6 - 1.2,
                        Math.sin(ang) * MOON_R
                    );
                    bodies.push(b);
                });

                layoutStars();
                buildConnections();
                buildLegend();
            }

            function layoutStars() {
                const others = starBodies.filter(b => !b.isCenter);
                const total = Math.max(1, others.length);
                others.forEach((b, i) => {
                    const ang = (i / total) * Math.PI * 2 + 0.45;
                    const r = RING_R[i % RING_R.length];
                    b.targetPos.set(
                        Math.cos(ang) * r,
                        Math.sin(ang * 2 + i) * 1.5,
                        Math.sin(ang) * r
                    );
                    b.targetScale = b.baseScale;
                });
                const c = starBodies.find(b => b.isCenter);
                if (c) { c.targetPos.set(0, 0, 0); c.targetScale = c.baseScale; }
            }

            /* ---------- 突触连线 ---------- */
            function buildConnections() {
                const center = starBodies.find(b => b.isCenter);
                const others = starBodies.filter(b => !b.isCenter);
                const segs = [];

                others.forEach(s => { if (center) segs.push({ a: center, b: s, main: true }); });
                others.forEach((s, i) => {
                    const n = others[(i + 1) % others.length];
                    if (n && n !== s) segs.push({ a: s, b: n, main: false });
                });
                bodies.filter(b => b.kind === "planet" && b.orbit).forEach(p => {
                    segs.push({ a: p.orbit.owner, b: p, main: false, thin: true });
                });

                const pos = new Float32Array(segs.length * 6);
                const geo = new THREE.BufferGeometry();
                geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
                geo.attributes.position.setUsage(THREE.DynamicDrawUsage);

                // 很细、带一点自身发光的线
                const mat = new THREE.LineBasicMaterial({
                    color: new THREE.Color(vivid(accentColor())),
                    transparent: true,
                    opacity: 0.28,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                });
                connLines = new THREE.LineSegments(geo, mat);
                group.add(connLines);
                connData = { segs, pos, geo };

                // 主干上流动的光点，做出「信号传递」的感觉
                pulseSegs = segs.filter(s => s.main);
                if (pulseSegs.length) {
                    const ppos = new Float32Array(pulseSegs.length * 3);
                    const pgeo = new THREE.BufferGeometry();
                    pgeo.setAttribute("position", new THREE.BufferAttribute(ppos, 3));
                    pgeo.attributes.position.setUsage(THREE.DynamicDrawUsage);
                    pulsePoints = new THREE.Points(pgeo, new THREE.PointsMaterial({
                        size: 0.4, map: glowTex,
                        color: new THREE.Color(vivid(accentColor())),
                        transparent: true, opacity: 0.9,
                        blending: THREE.AdditiveBlending,
                        depthWrite: false, sizeAttenuation: true,
                    }));
                    group.add(pulsePoints);
                }
            }

            function updateConnections() {
                if (!connData) return;
                const { segs, pos, geo } = connData;
                for (let i = 0; i < segs.length; i++) {
                    const a = segs[i].a.mesh.position;
                    const b = segs[i].b.mesh.position;
                    pos[i * 6] = a.x; pos[i * 6 + 1] = a.y; pos[i * 6 + 2] = a.z;
                    pos[i * 6 + 3] = b.x; pos[i * 6 + 4] = b.y; pos[i * 6 + 5] = b.z;
                }
                geo.attributes.position.needsUpdate = true;
            }

            function updatePulses() {
                if (!pulsePoints || !pulseSegs.length) return;
                const arr = pulsePoints.geometry.attributes.position.array;
                pulseSegs.forEach((s, i) => {
                    const t = (clockT * 0.3 + i * 0.21) % 1;
                    const a = s.a.mesh.position, b = s.b.mesh.position;
                    arr[i * 3] = a.x + (b.x - a.x) * t;
                    arr[i * 3 + 1] = a.y + (b.y - a.y) * t;
                    arr[i * 3 + 2] = a.z + (b.z - a.z) * t;
                });
                pulsePoints.geometry.attributes.position.needsUpdate = true;
            }

            /* ---------- 相机 ---------- */
            function updateCamera(k) {
                const f = k || 0.12;
                cam.zoom += (cam.zoomT - cam.zoom) * f;
                cam.pitch += (cam.pitchT - cam.pitch) * f;
                cam.theta += (cam.thetaT - cam.theta) * f;

                const r = cam.zoom;
                camera.position.set(
                    r * Math.cos(cam.pitch) * Math.sin(cam.theta),
                    r * Math.sin(cam.pitch),
                    r * Math.cos(cam.pitch) * Math.cos(cam.theta)
                );
                camera.lookAt(0, 0, 0);
            }

            /* ---------- 动画 ---------- */
            function animate() {
                if (disposed) return;
                raf = requestAnimationFrame(animate);

                const now = performance.now();
                if (!dragging && now > idleUntil) cam.thetaT += 0.00085;
                updateCamera();
                clockT += 0.016;

                starBodies.forEach(b => {
                    if (b.isCenter) { b.mesh.position.set(0, 0, 0); return; }
                    b.mesh.position.lerp(b.targetPos, 0.09);
                });

                bodies.forEach(b => {
                    if (b.kind === "planet" && b.orbit) {
                        const o = b.orbit;
                        const ang = clockT * o.speed + o.phase;
                        const base = o.owner.mesh.position;
                        b.mesh.position.set(
                            base.x + Math.cos(ang) * o.radius,
                            base.y + Math.sin(ang * 1.3) * o.tilt,
                            base.z + Math.sin(ang) * o.radius
                        );
                    } else if (b.kind !== "star") {
                        b.mesh.position.lerp(b.targetPos, 0.08);
                    }
                });

                bodies.forEach(b => {
                    b.curScale += (b.targetScale - b.curScale) * 0.16;
                    b.mesh.scale.setScalar(b.curScale * 0.3);
                    b.glow.position.copy(b.mesh.position);
                    b.glow.scale.setScalar(b.curScale * 2.3);
                    if (b.halo) {
                        b.halo.position.copy(b.mesh.position);
                        b.halo.scale.setScalar(b.curScale * 5.4);
                    }
                    b.picker.position.copy(b.mesh.position);
                    if (b.extra) b.extra.position.copy(b.mesh.position);
                });

                const c = starBodies.find(b => b.isCenter);
                if (c) {
                    const pulse = 1 + Math.sin(clockT * 1.6) * 0.045;
                    c.glow.scale.setScalar(c.curScale * 2.3 * pulse);
                    if (c.halo) c.halo.scale.setScalar(c.curScale * 5.4 * pulse);
                }

                updateConnections();
                updatePulses();
                if (starfield) starfield.rotation.y += 0.00018;

                positionCards();
                renderer.render(scene, camera);
            }

            /* ---------- 交互 ---------- */
            function onPointerDown(e) {
                dragging = true;
                moved = 0;
                lastX = e.clientX;
                lastY = e.clientY;
                idleUntil = performance.now() + 2800;
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
                idleUntil = performance.now() + 2800;
            }

            function onPointerUp(e) {
                if (!dragging) return;
                dragging = false;
                idleUntil = performance.now() + 2800;
                if (moved < 7) pickAt(e.clientX, e.clientY);
            }

            function onWheel(e) {
                e.preventDefault();
                cam.zoomT = Math.max(11, Math.min(52, cam.zoomT + e.deltaY * 0.016));
                idleUntil = performance.now() + 2800;
            }

            function pickAt(cx, cy) {
                if (!raycaster) return;
                const r = canvas.getBoundingClientRect();
                ndc.x = ((cx - r.left) / r.width) * 2 - 1;
                ndc.y = -((cy - r.top) / r.height) * 2 + 1;
                raycaster.setFromCamera(ndc, camera);
                const hits = raycaster.intersectObjects(bodies.map(b => b.picker), false);
                if (!hits.length) return;
                toggleCard(hits[0].object.userData.id);
            }

            /* ---------- 名片 ---------- */
            function bodyById(id) {
                return bodies.find(b => b.id === id);
            }

            function toggleCard(id) {
                if (cards.has(id)) closeCard(id);
                else openCard(id);
            }

            function openCard(id) {
                const body = bodyById(id);
                if (!body) return;

                const el = document.createElement("div");
                el.className = "gx-card";
                el.innerHTML = cardHtml(body);
                cardLayer.appendChild(el);

                const a0 = anchorFor(body, el);
                const n = cards.size;
                el.style.left = (a0.x + (n % 4) * 16) + "px";
                el.style.top = (a0.y + (n % 4) * 16) + "px";

                cards.set(id, { el, body, pinned: false });
                body.targetScale = body.baseScale * 1.18;

                requestAnimationFrame(() => el.classList.add("in"));
                bindCard(el, id);
            }

            function closeCard(id) {
                const c = cards.get(id);
                if (!c) return;
                c.el.classList.remove("in");
                const el = c.el;
                setTimeout(() => el.remove(), 220);
                cards.delete(id);
                if (c.body) c.body.targetScale = c.body.baseScale;
            }

            function closeAllCards() {
                Array.from(cards.keys()).forEach(closeCard);
            }

            function cardHtml(body) {
                const d = body.data || {};
                const kind = body.kind;

                if (kind === "nebula") {
                    const photos = d.photos || [];
                    return `
                    <div class="gx-card-head" data-drag>
                        <div class="gx-cover kind-gallery">✦</div>
                        <div class="gx-meta">
                            <div class="gx-title">照片墙</div>
                            <div class="gx-tags"><span class="gx-tag">${photos.length} 张</span></div>
                        </div>
                        <div class="gx-card-tools">
                            <button class="gx-mini" data-close title="关闭">✕</button>
                        </div>
                    </div>
                    <div class="gx-card-body">
                        <div class="gx-photos">
                            ${photos.slice(0, 9).map(g =>
                                `<img src="${g.src}" alt="${g.caption || ""}" data-photo="${g.src}" data-cap="${String(g.caption || "").replace(/"/g, "&quot;")}" loading="lazy">`
                            ).join("")}
                        </div>
                        ${photos.length > 9 ? `<div class="gx-desc">还有 ${photos.length - 9} 张。</div>` : ""}
                    </div>`;
                }

                if (kind === "moon") {
                    return `
                    <div class="gx-card-head" data-drag>
                        <div class="gx-cover kind-link">${d.icon || "🔗"}</div>
                        <div class="gx-meta">
                            <div class="gx-title">${d.name || ""}</div>
                            <div class="gx-tags"><span class="gx-tag">常用链接</span></div>
                        </div>
                        <div class="gx-card-tools">
                            <button class="gx-mini" data-close title="关闭">✕</button>
                        </div>
                    </div>
                    <div class="gx-card-body">
                        <div class="gx-card-actions" style="border:0;padding-top:0">
                            <a class="gx-btn" href="${d.url || "#"}" target="_blank" rel="noopener">打开 ↗</a>
                        </div>
                    </div>`;
                }

                if (kind === "planet") {
                    return `
                    <div class="gx-card-head" data-drag>
                        <div class="gx-cover kind-milestone">${d.icon || "✦"}</div>
                        <div class="gx-meta">
                            <div class="gx-title">${d.title || ""}</div>
                            <div class="gx-tags">
                                ${d.date ? `<span class="gx-tag">${d.date}</span>` : ""}
                                <span class="gx-tag">里程碑</span>
                            </div>
                        </div>
                        <div class="gx-card-tools">
                            <button class="gx-mini" data-close title="关闭">✕</button>
                        </div>
                    </div>
                    <div class="gx-card-body"><div class="gx-desc">${d.desc || ""}</div></div>`;
                }

                if (kind === "asteroid") {
                    return `
                    <div class="gx-card-head" data-drag>
                        <div class="gx-cover kind-note">✎</div>
                        <div class="gx-meta">
                            <div class="gx-title">${d.title || ""}</div>
                            <div class="gx-tags">
                                ${d.date ? `<span class="gx-tag">${d.date}</span>` : ""}
                                <span class="gx-tag">日常</span>
                            </div>
                        </div>
                        <div class="gx-card-tools">
                            <button class="gx-mini" data-close title="关闭">✕</button>
                        </div>
                    </div>
                    <div class="gx-card-body">
                        <div class="gx-desc">${d.desc || ""}</div>
                        ${(d.images && d.images.length) ? `<div class="gx-photos">
                            ${d.images.slice(0, 6).map(src => `<img src="${src}" alt="" data-photo="${src}" data-cap="">`).join("")}
                        </div>` : ""}
                    </div>`;
                }

                return `
                <div class="gx-card-head" data-drag>
                    <div class="gx-cover" style="${d.cover ? `background-image:url('${d.cover}')` : ""}">${d.cover ? "" : "★"}</div>
                    <div class="gx-meta">
                        <div class="gx-title">${d.title || ""}</div>
                        <div class="gx-tags">
                            <span class="gx-tag">${STATUS[d.status] || d.status || ""}</span>
                            ${(d.tags || []).slice(0, 3).map(t => `<span class="gx-tag">${t}</span>`).join("")}
                        </div>
                    </div>
                    <div class="gx-card-tools">
                        <button class="gx-mini" data-close title="关闭">✕</button>
                    </div>
                </div>
                <div class="gx-card-body">
                    <div class="gx-desc">${d.desc || ""}</div>
                    ${(d.links && d.links.length) ? `<div class="gx-card-actions">
                        ${d.links.map(l => `<a class="gx-btn" href="${l.url}" target="_blank" rel="noopener">${l.label} ↗</a>`).join("")}
                    </div>` : ""}
                </div>`;
            }

            function bindCard(el, id) {
                const head = el.querySelector("[data-drag]");
                let ox = 0, oy = 0;

                el.addEventListener("pointerdown", (e) => {
                    if (!head || !head.contains(e.target)) return;
                    if (e.target.closest("button, a")) return;
                    const r = el.getBoundingClientRect();
                    ox = e.clientX - r.left;
                    oy = e.clientY - r.top;
                    el.style.transition = "none";
                    el.style.zIndex = String(100 + cards.size);   // 抓起来的放最上层

                    // 用 document 级监听：卡片被拖出自身范围时仍能跟手
                    const onMove = (ev) => {
                        const c = cards.get(id);
                        if (c) c.pinned = true;
                        el.classList.add("pinned");
                        el.style.left = (ev.clientX - ox) + "px";
                        el.style.top = (ev.clientY - oy) + "px";
                    };
                    const onUp = () => {
                        document.removeEventListener("pointermove", onMove);
                        document.removeEventListener("pointerup", onUp);
                        document.removeEventListener("pointercancel", onUp);
                        el.style.transition = "";
                    };
                    document.addEventListener("pointermove", onMove);
                    document.addEventListener("pointerup", onUp);
                    document.addEventListener("pointercancel", onUp);
                    e.preventDefault();
                });

                el.addEventListener("click", (e) => {
                    if (e.target.closest("[data-close]")) { closeCard(id); return; }
                    const ph = e.target.closest("[data-photo]");
                    if (ph) ctx.openLightbox(ph.dataset.photo, ph.dataset.cap || "");
                });
            }

            /* 卡片挂在星星旁边，且朝「远离画面中心」的方向展开，
               免得挡住正中的主星 */
            function anchorFor(body, el) {
                const p = project(body.mesh.position);
                const w = canvas.clientWidth || 1;
                const h = canvas.clientHeight || 1;
                const cw = (el && el.offsetWidth) || 302;
                const chh = (el && el.offsetHeight) || 170;
                const gap = 44;

                const right = p.x >= w / 2;
                const down = p.y >= h / 2;

                let x = right ? p.x + gap : p.x - gap - cw;
                let y = down ? p.y - chh * 0.35 : p.y + 24;

                x = Math.max(10, Math.min(x, w - cw - 10));
                y = Math.max(70, Math.min(y, h - Math.min(chh, 240) - 10));
                return { x, y };
            }

            function project(v3) {
                const v = v3.clone().project(camera);
                const w = canvas.clientWidth || 1;
                const h = canvas.clientHeight || 1;
                return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
            }

            function positionCards() {
                if (!cards.size || !camera) return;
                const w = canvas.clientWidth || 1;
                const h = canvas.clientHeight || 1;
                cards.forEach(c => {
                    if (c.pinned) return;
                    const a = anchorFor(c.body, c.el);
                    c.el.style.left = a.x + "px";
                    c.el.style.top = a.y + "px";
                });
            }

            /* ---------- 图例 ---------- */
            function listOfKind(kind) {
                if (kind === "star") {
                    const c = starBodies.find(x => x.isCenter);
                    return c ? [c] : [];
                }
                return bodies.filter(x => x.kind === kind);
            }

            function buildLegend() {
                if (!navBox) return;
                const items = [
                    { kind: "star", label: "作品集 · 恒星" },
                    { kind: "planet", label: "里程碑 · 行星" },
                    { kind: "asteroid", label: "日常 · 小行星" },
                    { kind: "nebula", label: "照片墙 · 星云" },
                    { kind: "moon", label: "常用链接 · 卫星" },
                ];
                navBox.innerHTML = items.map(it => {
                    const n = bodies.filter(b => b.kind === it.kind).length;
                    return `<button class="gx-nav-item" data-kind="${it.kind}">
                        <span class="dot"></span>${it.label}<span class="cnt">${n}</span>
                    </button>`;
                }).join("");
            }

            navBox?.addEventListener("click", (e) => {
                const b = e.target.closest("[data-kind]");
                if (!b) return;
                const list = listOfKind(b.dataset.kind);
                if (!list.length) return;
                const target = list.find(x => !cards.has(x.id)) || list[0];
                toggleCard(target.id);
            });

            /* ---------- 顶部导航 ---------- */
            function onNavClick(e) {
                const a = e.target.closest("#navLinks a");
                if (!a) return;
                e.preventDefault();
                const id = (a.getAttribute("href") || "").slice(1);
                const map = {
                    works: "star", home: "star",
                    milestones: "planet", notes: "asteroid",
                    gallery: "nebula", links: "moon",
                };
                const kind = map[id];
                if (!kind) return;
                const list = listOfKind(kind);
                if (list.length) toggleCard(list[0].id);
            }
            const shellNav = $("#navLinks");
            shellNav?.addEventListener("click", onNavClick);

            function onKey(e) {
                if (e.key !== "Escape") return;
                const last = Array.from(cards.keys()).pop();
                if (last) closeCard(last);
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
                    clearTimeout(slowTip);
                    if (disposed) return;
                    loading.innerHTML = `
                        <div style="max-width:420px;text-align:center;line-height:1.8">
                            <div style="font-size:1.1rem;color:#e9e6f7;margin-bottom:8px">星图没能点亮</div>
                            <div style="font-size:.82rem">3D 引擎加载失败（可能是网络问题）。<br>换个界面看看，或者刷新重试。</div>
                        </div>`;
                    console.error(e);
                }
            })();

            /* ---------- 对外 ---------- */
            return {
                update() {
                    if (!THREE || !group) return;
                    rebuild();
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
                    shellNav?.removeEventListener("click", onNavClick);

                    clearAll();
                    if (starfield) { disposeObj(starfield); starfield = null; }
                    if (glowTex) { glowTex.dispose(); glowTex = null; }
                    if (renderer) {
                        renderer.dispose();
                        renderer.forceContextLoss?.();
                        renderer = null;
                    }
                    scene = null; camera = null; group = null;
                    bodies = []; starBodies = []; cards = new Map();
                },
            };
        },
    });
})();
