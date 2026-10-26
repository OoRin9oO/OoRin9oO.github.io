/* ============================================================
   Rin9 网站编辑器 — 核心逻辑
   模块：状态 / 表单渲染 / 图片压缩 / 写回文件 / GitHub 发布
   ============================================================ */

(function () {
    "use strict";

    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

    const DATA_FILE = "js/data.js";
    const IMG_DIR = "img/";
    const REPO = { owner: "OoRin9oO", repo: "OoRin9oO.github.io", branch: "main" };

    /* ---------- 状态 ---------- */
    const S = {
        data: null,          // SITE_DATA 对象
        original: "",        // 原始 data.js 文本（用于 diff 提示）
        dirty: false,
        allowNav: false,     // 程序内导航时临时放开 beforeunload
        newImages: [],       // {name, blob, dataUrl}
        section: "links",
        openItems: {},       // 记住哪些条目是展开的（重绘后恢复）
        dirHandle: null,     // File System Access API 目录句柄
        token: localStorage.getItem("rin9-token") || "",
        owner: localStorage.getItem("rin9-owner") || "",
        repo: localStorage.getItem("rin9-repo") || REPO.repo,
        branch: localStorage.getItem("rin9-branch") || REPO.branch,
        compress: null,      // 图片压缩设置
    };

    /* ---------- 工具 ---------- */
    function toast(msg, kind) {
        const t = $("#toast");
        t.textContent = msg;
        t.className = "toast show" + (kind ? " " + kind : "");
        clearTimeout(t._timer);
        t._timer = setTimeout(() => { t.className = "toast"; }, 3200);
    }

    function markDirty() {
        S.dirty = true;
        $("#fileState").textContent = "● 有未保存的修改";
        $("#fileState").style.color = "var(--yellow)";
    }

    function markClean(txt) {
        S.dirty = false;
        $("#fileState").textContent = txt || "已同步";
        $("#fileState").style.color = "var(--green)";
    }

    const esc = (s) => String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    function todayStr() {
        const d = new Date();
        const p = (n) => String(n).padStart(2, "0");
        return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
    }

    /* ============================================================
       一、读取站点数据
       ============================================================ */
    async function loadData() {
        const res = await fetch(DATA_FILE + "?t=" + Date.now());
        if (!res.ok) throw new Error("读取 " + DATA_FILE + " 失败（HTTP " + res.status + "）");
        const text = await res.text();
        S.original = text;
        // data.js 是 window.SITE_DATA = {...}，安全地取出对象
        const sandbox = {};
        const fn = new Function("window", text + "\nreturn window.SITE_DATA;");
        S.data = fn(sandbox);
        if (!S.data) throw new Error("data.js 里没有找到 SITE_DATA");
    }

    /* ============================================================
       二、序列化回 data.js
       —— 保持与手写版本一致的格式风格
       ============================================================ */
    function serialize() {
        const q = (v) => JSON.stringify(v == null ? "" : v);
        const isSimpleKey = (k) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k);

        const clean = stripInternal(S.data);   // 去掉内部 __uid 字段

        function dump(val, indent) {
            const pad = " ".repeat(indent);
            const pad2 = " ".repeat(indent + 4);

            if (Array.isArray(val)) {
                if (!val.length) return "[]";
                // 纯标量数组 → 单行
                if (val.every(v => typeof v !== "object" || v === null)) {
                    return "[" + val.map(v => q(v)).join(", ") + "]";
                }
                const body = val.map(v => pad2 + dump(v, indent + 4)).join(",\n");
                return "[\n" + body + "\n" + pad + "]";
            }

            if (val && typeof val === "object") {
                const keys = Object.keys(val);
                if (!keys.length) return "{}";
                const body = keys.map(k => {
                    const key = isSimpleKey(k) ? k : q(k);
                    const v = val[k];
                    // 标量值单行；对象/数组展开
                    const vStr = (v && typeof v === "object") ? dump(v, indent + 4) : q(v);
                    return pad2 + key + ": " + vStr;
                }).join(",\n");
                return "{\n" + body + "\n" + pad + "}";
            }
            return q(val);
        }

        const header =
`/* ============================================================
   站点内容数据 —— 由 Rin9 网站编辑器生成
   也可以手改；改完记得保持下面的结构完整

   板块说明：
     profile    基本资料（名字、简介、头像、背景音乐、邮箱）
     links      常用链接
     milestones 成长里程碑（按时间倒序，最新的放最前）
     works      作品集（status: done 完成 / wip 进行中 / plan 规划中）
     notes      日常记录（images 配图可点击放大）
     gallery    照片墙（按原始比例完整显示，不裁剪）

   图片命名规范：字母-日期-字母（如 a-20261025-a.webp）
   ============================================================ */

window.SITE_DATA = `;

        // 顶层各板块前加一行说明，方便以后手改时知道每个字段干什么
        const SEC_COMMENT = {
            profile: "基本资料",
            links: "常用链接",
            milestones: "成长里程碑（按时间倒序，最新的放最前）",
            works: "作品集（status: done 完成 / wip 进行中 / plan 规划中）",
            notes: "日常记录（images 配图可点击放大）",
            gallery: "照片墙（按原始比例完整显示，不裁剪）",
        };

        function dumpTop(val, indent) {
            const pad = " ".repeat(indent);
            const parts = Object.keys(val).map(k => {
                const v = val[k];
                const vStr = (v && typeof v === "object")
                    ? dump(v, indent + 4)
                    : JSON.stringify(v == null ? "" : v);
                const cmt = SEC_COMMENT[k] ? "  /* " + SEC_COMMENT[k] + " */" : "";
                return pad + "    " + k + ": " + vStr + cmt;
            });
            return "{\n" + parts.join(",\n") + "\n" + pad + "}";
        }

        return header + dumpTop(clean, 0) + ";\n";
    }

    /* ============================================================
       三、命名：字母-日期-字母
       ============================================================ */

    /* 内容指纹，用来识别"同一张图拖了多次" */
    async function fingerprint(file) {
        const buf = await file.arrayBuffer();
        const hash = await crypto.subtle.digest("SHA-256", buf);
        return Array.from(new Uint8Array(hash).slice(0, 8))
            .map(b => b.toString(16).padStart(2, "0")).join("");
    }

    function nextName() {
        // 找出现有命名里最大的字母序号
        let max = -1;
        const scan = (src) => {
            const m = /img\/([a-z])-(\d{8})-([a-z])\./.exec(src || "");
            if (m) {
                const i = m[1].charCodeAt(0) - 97;
                if (i > max) max = i;
            }
        };
        (S.data.gallery || []).forEach(g => scan(g.src));
        (S.data.works || []).forEach(w => scan(w.cover));
        (S.data.notes || []).forEach(n => (n.images || []).forEach(scan));
        S.newImages.forEach(im => scan("img/" + im.name));

        const letter = String.fromCharCode(97 + ((max + 1) % 26));
        return `${letter}-${todayStr()}-${letter}`;
    }

    /* ============================================================
       四、图片压缩（浏览器内，Canvas）
       —— 支持格式选择、质量调节、尺寸上限
       ============================================================ */

    /* 压缩设置，存本地 */
    const DEFAULT_COMPRESS = {
        format: "webp",     // webp / jpg / png
        quality: 0.82,      // 质量
        maxEdge: 1600,      // 长边上限，0 = 不缩放
        keepAlpha: true,    // 带透明时保留 PNG
    };

    function loadCompressSettings() {
        try {
            const raw = localStorage.getItem("rin9-compress");
            if (raw) return Object.assign({}, DEFAULT_COMPRESS, JSON.parse(raw));
        } catch (e) { /* ignore */ }
        return Object.assign({}, DEFAULT_COMPRESS);
    }

    function saveCompressSettings(s) {
        S.compress = s;
        localStorage.setItem("rin9-compress", JSON.stringify(s));
    }

    async function compressImage(file, name, opts) {
        // 优先级：显式传入 > 当前会话设置 > localStorage > 默认值
        const base = S.compress || loadCompressSettings();
        const o = Object.assign({}, base, opts || {});
        const bitmap = await createImageBitmap(file);
        let { width, height } = bitmap;

        // 等比缩放（绝不裁剪）
        if (o.maxEdge > 0 && Math.max(width, height) > o.maxEdge) {
            const s = o.maxEdge / Math.max(width, height);
            width = Math.round(width * s);
            height = Math.round(height * s);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        // JPG 不支持透明，先铺白底，否则透明区域会变黑
        if (o.format === "jpg") {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, width, height);
        }
        ctx.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();

        const mime = o.format === "jpg" ? "image/jpeg"
            : o.format === "png" ? "image/png" : "image/webp";
        const blob = await new Promise(res => canvas.toBlob(res, mime, o.quality));
        if (!blob) throw new Error("图片编码失败");

        const ext = o.format === "jpg" ? "jpg" : o.format;
        // 传入的 name 可能已带扩展名，统一按当前格式重写
        const stem = name.replace(/\.(webp|jpg|jpeg|png)$/i, "");
        const finalName = stem + "." + ext;
        const dataUrl = canvas.toDataURL(mime, 0.6);
        return {
            name: finalName, blob, dataUrl,
            w: width, h: height,
            origSize: file.size, outSize: blob.size,
            origName: file.name,
            format: ext,
        };
    }

    async function handleFiles(files) {
        const list = Array.from(files).filter(f => f.type.startsWith("image/"));
        if (!list.length) return;

        toast(`正在处理 ${list.length} 张图片…`);
        let added = 0, dup = 0;
        const details = [];

        for (const file of list) {
            try {
                // 内容指纹去重：同一张图拖多次只处理一次
                const fp = await fingerprint(file);
                const exist = S.newImages.find(im => im.fp === fp);
                if (exist) {
                    dup++;
                    details.push({ dup: true, name: exist.name, origName: file.name });
                    continue;
                }

                const stem = nextName();
                const img = await compressImage(file, stem);
                img.fp = fp;
                S.newImages.push(img);
                added++;
                details.push({
                    dup: false, name: img.name, origName: file.name,
                    origSize: img.origSize, outSize: img.outSize,
                    w: img.w, h: img.h,
                });
            } catch (e) {
                toast("处理失败：" + file.name + " — " + e.message, "err");
            }
        }

        if (added) {
            markDirty();
            render();
            const totalOrig = details.filter(d => !d.dup).reduce((s, d) => s + (d.origSize || 0), 0);
            const totalOut = details.filter(d => !d.dup).reduce((s, d) => s + (d.outSize || 0), 0);
            const saved = totalOrig ? Math.round((1 - totalOut / totalOrig) * 100) : 0;
            let msg = `已处理 ${added} 张`;
            if (totalOrig) msg += `，${fmtSize(totalOrig)} → ${fmtSize(totalOut)}（省 ${saved}%）`;
            if (dup) msg += `，${dup} 张重复已复用`;
            toast(msg, "ok");
        } else if (dup) {
            toast(`${dup} 张重复图片，已复用已有文件`, "ok");
        }
    }

    function fmtSize(bytes) {
        if (!bytes) return "0B";
        if (bytes < 1024) return bytes + "B";
        if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + "KB";
        return (bytes / 1024 / 1024).toFixed(1) + "MB";
    }

    /* 把新图片挂到指定条目上 */
    function attachImage(kind, idx, images) {
        if (!images.length) return;
        if (kind === "notes") {
            S.data.notes[idx].images = S.data.notes[idx].images || [];
            images.forEach(im => S.data.notes[idx].images.push(IMG_DIR + im.name));
        } else if (kind === "works") {
            S.data.works[idx].cover = IMG_DIR + images[0].name;
        } else if (kind === "gallery") {
            S.data.gallery[idx].src = IMG_DIR + images[0].name;
        }
    }

    function imagePath(im) {
        // 已存在于站点的新图 → img/xxx.webp
        return IMG_DIR + im.name;
    }

    /* ============================================================
       五、表单渲染
       ============================================================ */
    const SECTIONS = [
        { id: "links", icon: "🔗", name: "常用链接" },
        { id: "works", icon: "🧩", name: "作品集" },
        { id: "notes", icon: "📔", name: "日常记录" },
        { id: "milestones", icon: "🏔️", name: "成长里程碑" },
        { id: "gallery", icon: "🖼️", name: "照片墙" },
    ];

    function renderSide() {
        const nav = $("#sideNav");
        nav.innerHTML = SECTIONS.map(s => {
            const count = (S.data[s.id] || []).length;
            return `<button class="side-item${S.section === s.id ? " active" : ""}" data-sec="${s.id}">
                <span>${s.icon}</span><span>${s.name}</span><span class="count">${count}</span>
            </button>`;
        }).join("");

        $$("[data-sec]", nav).forEach(b => b.addEventListener("click", () => {
            S.section = b.dataset.sec;
            renderSide();
            render();
        }));

        // 站点设置区的按钮
        $$(".side-item[data-act]").forEach(b => {
            b.classList.toggle("active", S.section === b.dataset.act);
            b.addEventListener("click", () => {
                S.section = b.dataset.act;
                renderSide();
                render();
            });
        });
    }

    function render() {
        const main = $("#main");
        if (S.section === "settings") return renderSettings(main);
        if (S.section === "images") return renderImages(main);
        if (S.section === "publish") return renderPublish(main);

        const sec = SECTIONS.find(s => s.id === S.section);
        const items = S.data[S.section] || [];

        let html = `<div class="sec-head">
            <h2>${sec.icon} ${sec.name}</h2>
            <p>共 ${items.length} 条</p>
            <div class="spacer"></div>
            <button class="btn ghost sm" id="btnAdd">＋ 新增一条</button>
        </div>
        <div data-section="${S.section}">`;

        if (!items.length) {
            html += `<div class="drop" id="emptyAdd"><div class="drop-icon">📝</div>
                <div class="drop-title">还没有内容</div>
                <div class="drop-sub">点右上角「新增一条」，或直接把图拖进来</div></div>`;
        }

        html += items.map((it, i) => renderItem(S.section, it, i)).join("");
        html += `</div>`;
        main.innerHTML = html;

        bindItemEvents(main);
        const add = $("#btnAdd");
        if (add) add.addEventListener("click", () => addItem(S.section));
        const ea = $("#emptyAdd");
        if (ea) ea.addEventListener("click", () => addItem(S.section));
    }

    /* ---------- 单条内容 ---------- */
    function renderItem(kind, it, i) {
        let head = "", body = "";

        if (kind === "links") {
            head = `<span class="item-dot"></span>
                    <span class="item-title">${esc(it.icon)} ${esc(it.name)}</span>
                    <span class="item-sub">${esc(it.url)}</span>`;
            body = `
                <div class="field"><label>图标（emoji）</label>
                    <input class="inp" data-k="icon" value="${esc(it.icon)}"></div>
                <div class="field"><label>名称</label>
                    <input class="inp" data-k="name" value="${esc(it.name)}"></div>
                <div class="field"><label>链接地址</label>
                    <input class="inp" data-k="url" value="${esc(it.url)}"></div>`;
        }

        if (kind === "works") {
            const status = it.status || "plan";
            head = `<span class="item-dot"></span>
                    <span class="item-title">${esc(it.title)}</span>
                    <span class="pill ${status}">${{ done: "已完成", wip: "进行中", plan: "规划中" }[status] || status}</span>
                    <div class="spacer"></div>`;
            body = `
                <div class="row">
                    <div class="field"><label>标题</label>
                        <input class="inp" data-k="title" value="${esc(it.title)}"></div>
                    <div class="field"><label>状态</label>
                        <select class="sel" data-k="status">
                            <option value="done"${status === "done" ? " selected" : ""}>已完成</option>
                            <option value="wip"${status === "wip" ? " selected" : ""}>进行中</option>
                            <option value="plan"${status === "plan" ? " selected" : ""}>规划中</option>
                        </select></div>
                </div>
                <div class="field"><label>说明</label>
                    <textarea class="ta" data-k="desc">${esc(it.desc)}</textarea></div>
                ${renderCoverField(it)}
                <div class="field"><label>标签（回车添加）</label>
                    <div class="taglist" data-tags>
                        ${(it.tags || []).map((t, ti) => `<span class="tagchip">${esc(t)}<button data-tag-del="${ti}">✕</button></span>`).join("")}
                    </div>
                    <input class="inp" data-tag-input placeholder="输入标签后按回车"></div>
                ${renderLinksSub(it)}`;
        }

        if (kind === "notes") {
            head = `<span class="item-dot"></span>
                    <span class="item-title">${esc(it.title)}</span>
                    <span class="item-sub">${esc(it.date)}</span>
                    <div class="spacer"></div>`;
            body = `
                <div class="row">
                    <div class="field"><label>日期</label>
                        <input class="inp" data-k="date" value="${esc(it.date)}" placeholder="2026-10-26"></div>
                    <div class="field"><label>标题</label>
                        <input class="inp" data-k="title" value="${esc(it.title)}"></div>
                </div>
                <div class="field"><label>正文</label>
                    <textarea class="ta" data-k="desc">${esc(it.desc)}</textarea></div>
                ${renderImagesField(it)}`;
        }

        if (kind === "milestones") {
            head = `<span class="item-dot"></span>
                    <span class="item-title">${esc(it.icon || "✦")} ${esc(it.title)}</span>
                    <span class="item-sub">${esc(it.date)}</span>
                    <div class="spacer"></div>`;
            body = `
                <div class="row">
                    <div class="field"><label>日期</label>
                        <input class="inp" data-k="date" value="${esc(it.date)}"></div>
                    <div class="field"><label>图标（emoji）</label>
                        <input class="inp" data-k="icon" value="${esc(it.icon || "")}"></div>
                </div>
                <div class="field"><label>标题</label>
                    <input class="inp" data-k="title" value="${esc(it.title)}"></div>
                <div class="field"><label>描述</label>
                    <textarea class="ta" data-k="desc">${esc(it.desc)}</textarea></div>`;
        }

        if (kind === "gallery") {
            head = `<span class="item-dot"></span>
                    <span class="item-title">${esc(it.caption || "(无标题)")}</span>
                    <span class="item-sub">${esc(it.src)}</span>
                    <div class="spacer"></div>`;
            body = `
                <div class="field"><label>说明文字</label>
                    <input class="inp" data-k="caption" value="${esc(it.caption)}"></div>
                <div class="field"><label>图片</label>
                    <div class="thumbs">
                        ${it.src ? `<div class="thumb">
                            <img src="${esc(it.src)}" alt="">
                            <div class="thumb-name">${esc((it.src || "").split("/").pop())}</div>
                        </div>` : ""}
                    </div>
                    <div class="drop" data-drop="gallery" data-kind="gallery" style="margin-top:8px">
                        <div class="drop-icon">📤</div>
                        <div class="drop-title">拖图到这里替换</div>
                        <div class="drop-sub">自动压缩成 webp，按「字母-日期-字母」命名</div>
                    </div>
                    <input class="inp" data-k="src" value="${esc(it.src)}" style="margin-top:8px" placeholder="img/xxx.webp">
                    <div class="tip">也可以直接填已有的图片路径</div></div>`;
        }

        return `<div class="item${S.openItems[uidOf(kind, i)] ? "" : " collapsed"}" data-kind="${kind}" data-i="${i}">
            <div class="item-head">
                <span class="chev">▾</span>
                ${head}
                <button class="icon-btn sm" data-del="${i}" title="删除">🗑</button>
            </div>
            <div class="item-body">${body}</div>
        </div>`;
    }

    /* ---------- 稳定 uid ----------
       展开状态、增删定位都靠它，不能用 title（会被改）也不能用索引（会错位）。
       给每条记录挂一个隐藏的 __uid。 */
    let uidSeq = 0;
    function uidOf(kind, i) {
        const it = S.data[kind][i];
        if (!it) return kind + ":" + i;
        if (!it.__uid) {
            it.__uid = kind + "-" + (++uidSeq) + "-" + Math.random().toString(36).slice(2, 7);
        }
        return it.__uid;
    }

    /* 序列化前剥掉内部字段 */
    function stripInternal(obj) {
        if (Array.isArray(obj)) return obj.map(stripInternal);
        if (obj && typeof obj === "object") {
            const o = {};
            Object.keys(obj).forEach(k => {
                if (k === "__uid") return;
                o[k] = stripInternal(obj[k]);
            });
            return o;
        }
        return obj;
    }

    function renderCoverField(it) {
        const cover = it.cover || "";
        return `<div class="field"><label>封面图（可选）</label>
            ${cover ? `<div class="thumbs"><div class="thumb">
                <img src="${esc(cover)}" alt="">
                <div class="thumb-name">${esc(cover.split("/").pop())}</div>
            </div></div>` : ""}
            <div class="drop" data-drop="cover" data-kind="works" style="margin-top:8px">
                <div class="drop-icon">📤</div>
                <div class="drop-title">拖图到这里设为封面</div>
                <div class="drop-sub">自动压缩成 webp</div>
            </div>
            <input class="inp" data-k="cover" value="${esc(cover)}" placeholder="img/xxx.webp" style="margin-top:8px">
            <div class="tip">也可以直接填已有的图片路径</div></div>`;
    }

    function renderImagesField(it) {
        const imgs = it.images || [];
        return `<div class="field"><label>配图（可多张，点击放大）</label>
            <div class="thumbs" data-imgs>
                ${imgs.map((src, si) => `<div class="thumb">
                    <img src="${esc(src)}" alt="">
                    <button class="thumb-x" data-img-del="${si}">✕</button>
                    <div class="thumb-name">${esc(src.split("/").pop())}</div>
                </div>`).join("")}
            </div>
            <div class="drop" data-drop="images" data-kind="notes" style="margin-top:8px">
                <div class="drop-icon">📤</div>
                <div class="drop-title">拖图到这里添加配图</div>
                <div class="drop-sub">可拖多张，自动压缩成 webp</div>
            </div></div>`;
    }

    function renderLinksSub(it) {
        const links = it.links || [];
        return `<div class="field"><label>相关链接</label>
            ${links.map((l, li) => `<div class="row" style="margin-bottom:6px">
                <input class="inp" data-link-k="label" data-li="${li}" value="${esc(l.label)}" placeholder="标签">
                <input class="inp" data-link-k="url" data-li="${li}" value="${esc(l.url)}" placeholder="https://">
                <button class="icon-btn sm" data-link-del="${li}">🗑</button>
            </div>`).join("")}
            <button class="btn ghost sm" data-link-add>＋ 加一个链接</button></div>`;
    }

    /* ---------- 事件绑定 ---------- */
    function bindItemEvents(main) {
        // 展开/收起（记住状态，重绘后恢复）
        $$(".item-head", main).forEach(h => h.addEventListener("click", (e) => {
            if (e.target.closest("button")) return;
            const item = h.parentElement;
            const key = uidOf(item.dataset.kind, Number(item.dataset.i));
            item.classList.toggle("collapsed");
            S.openItems[key] = !item.classList.contains("collapsed");
        }));

        // 字段绑定
        $$("[data-k]", main).forEach(el => {
            el.addEventListener("input", () => {
                const item = el.closest(".item");
                const kind = item.dataset.kind;
                const idx = Number(item.dataset.i);
                S.data[kind][idx][el.dataset.k] = el.value;
                markDirty();
                // 标题变化时同步列表头
                if (el.dataset.k === "title" || el.dataset.k === "name") {
                    const t = el.closest(".item").querySelector(".item-title");
                    if (t) t.textContent = (kind === "links" ? (S.data[kind][idx].icon || "") + " " : "") + el.value;
                }
            });
        });

        // 删除条目
        $$("[data-del]", main).forEach(b => b.addEventListener("click", (e) => {
            e.stopPropagation();
            const item = b.closest(".item");
            const kind = item.dataset.kind;
            const idx = Number(item.dataset.i);
            const arr = S.data[kind];
            const label = arr[idx].title || arr[idx].name || arr[idx].caption || "这一条";
            if (!confirm(`确定删除「${label}」？`)) return;
            arr.splice(idx, 1);
            markDirty();
            render();
        }));

        // 标签
        $$("[data-tag-input]", main).forEach(inp => {
            inp.addEventListener("keydown", (e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                const v = inp.value.trim();
                if (!v) return;
                const item = inp.closest(".item");
                const kind = item.dataset.kind;
                const idx = Number(item.dataset.i);
                S.data[kind][idx].tags = S.data[kind][idx].tags || [];
                S.data[kind][idx].tags.push(v);
                inp.value = "";
                markDirty();
                render();
            });
        });
        $$("[data-tag-del]", main).forEach(b => b.addEventListener("click", (e) => {
            e.stopPropagation();
            const item = b.closest(".item");
            const kind = item.dataset.kind;
            const idx = Number(item.dataset.i);
            S.data[kind][idx].tags.splice(Number(b.dataset.tagDel), 1);
            markDirty();
            render();
        }));

        // 作品链接子项
        $$("[data-link-add]", main).forEach(b => b.addEventListener("click", (e) => {
            e.stopPropagation();
            const item = b.closest(".item");
            const kind = item.dataset.kind;
            const idx = Number(item.dataset.i);
            S.data[kind][idx].links = S.data[kind][idx].links || [];
            S.data[kind][idx].links.push({ label: "源码", url: "" });
            markDirty();
            render();
        }));
        $$("[data-link-k]", main).forEach(el => el.addEventListener("input", () => {
            const item = el.closest(".item");
            const kind = item.dataset.kind;
            const idx = Number(item.dataset.i);
            S.data[kind][idx].links[Number(el.dataset.li)][el.dataset.linkK] = el.value;
            markDirty();
        }));
        $$("[data-link-del]", main).forEach(b => b.addEventListener("click", (e) => {
            e.stopPropagation();
            const item = b.closest(".item");
            const kind = item.dataset.kind;
            const idx = Number(item.dataset.i);
            S.data[kind][idx].links.splice(Number(b.dataset.linkDel), 1);
            markDirty();
            render();
        }));

        // 配图删除
        $$("[data-img-del]", main).forEach(b => b.addEventListener("click", (e) => {
            e.stopPropagation();
            const item = b.closest(".item");
            const kind = item.dataset.kind;
            const idx = Number(item.dataset.i);
            S.data[kind][idx].images.splice(Number(b.dataset.imgDel), 1);
            markDirty();
            render();
        }));

        // 拖图区的点击选择（真正的拖放由全局路由统一处理）
        $$("[data-drop]", main).forEach(dz => {
            dz.addEventListener("click", () => pickFiles(dz.closest(".item"), dz.dataset.drop));
        });
    }

    /* ============================================================
       拖放路由引擎
       —— 根据鼠标位置决定图片落到哪里
       优先级：具体 drop 区 > 条目卡片 > 板块区域 > 照片墙
       ============================================================ */

    /* 判断一个元素该接收什么样的图片，返回落点描述 */
    function resolveDropTarget(x, y) {
        const el = document.elementFromPoint(x, y);
        if (!el) return null;

        // 1) 命中具体的 drop 区
        const dz = el.closest("[data-drop]");
        if (dz) {
            const item = dz.closest(".item");
            const kind = item ? item.dataset.kind : dz.dataset.kind;
            const idx = item ? Number(item.dataset.i) : -1;
            const mode = dz.dataset.drop;
            return {
                mode, kind, idx, el: dz,
                label: {
                    cover: "设为封面",
                    images: "添加为配图",
                    gallery: "设为照片",
                }[mode] || "加入",
                field: mode === "cover" ? "封面" : mode === "images" ? "配图" : "照片",
            };
        }

        // 2) 命中条目卡片（但不在具体字段上）→ 按条目类型智能判断
        const item = el.closest(".item");
        if (item) {
            const kind = item.dataset.kind;
            const idx = Number(item.dataset.i);
            // 落在作品标题/说明上 → 意图是换封面
            // 落在配图缩略图上 → 意图是加配图
            // 落在说明文字框上 → 意图是加配图
            if (kind === "works") {
                return { mode: "cover", kind, idx, el: item,
                         label: "设为封面", field: "封面" };
            }
            if (kind === "notes") {
                return { mode: "images", kind, idx, el: item,
                         label: "添加为配图", field: "配图" };
            }
            if (kind === "gallery") {
                return { mode: "gallery", kind, idx, el: item,
                         label: "设为照片", field: "照片" };
            }
        }

        // 3) 命中某个板块区域 → 该板块的默认落点
        const sec = el.closest("[data-section]");
        if (sec) {
            const kind = sec.dataset.section;
            const defaults = {
                works: { mode: "cover", label: "加为新作品的封面", field: "封面" },
                notes: { mode: "images", label: "加为新记录的配图", field: "配图" },
                gallery: { mode: "gallery", label: "加为新照片", field: "照片" },
                milestones: { mode: "gallery", label: "加到照片墙", field: "照片" },
                links: { mode: "gallery", label: "加到照片墙", field: "照片" },
            };
            const d = defaults[kind] || { mode: "gallery", label: "加到照片墙", field: "照片" };
            return { mode: d.mode, kind: null, idx: -1, el: sec, section: kind, ...d };
        }

        // 3.5) 在主区里但不在任何条目内 → 归属当前所在板块
        // （板块内条目之间的缝隙很窄，命中 [data-section] 不现实）
        if (el.closest(".main")) {
            const cur = SECTIONS.find(s => s.id === S.section);
            const kind = cur ? cur.id : "gallery";
            const defaults = {
                works: { mode: "cover", label: "加为新作品的封面", field: "封面" },
                notes: { mode: "images", label: "加为新记录的配图", field: "配图" },
                gallery: { mode: "gallery", label: "加为新照片", field: "照片" },
                milestones: { mode: "gallery", label: "加到照片墙", field: "照片" },
                links: { mode: "gallery", label: "加到照片墙", field: "照片" },
            };
            const d = defaults[kind] || { mode: "gallery", label: "加到照片墙", field: "照片" };
            return { mode: d.mode, kind: null, idx: -1, el: null, section: kind, ...d };
        }

        // 4) 兜底 → 照片墙
        return { mode: "gallery", kind: null, idx: -1, el: null,
                 label: "加到照片墙", field: "照片" };
    }

    /* 把图片按落点描述写入数据 */
    function applyDrop(target, images) {
        if (!target || !images.length) return;

        if (target.idx >= 0 && target.kind) {
            // 落到具体条目
            const it = S.data[target.kind][target.idx];
            if (!it) return;
            if (target.mode === "images") {
                it.images = it.images || [];
                images.forEach(im => it.images.push(IMG_DIR + im.name));
            } else if (target.mode === "cover") {
                it.cover = IMG_DIR + images[0].name;
            } else if (target.mode === "gallery") {
                it.src = IMG_DIR + images[0].name;
            }
            return;
        }

        // 落到板块 → 在该板块新建一条
        if (target.section === "works") {
            S.data.works.unshift({
                title: "新作品",
                desc: "",
                status: "plan",
                cover: IMG_DIR + images[0].name,
                tags: [],
            });
        } else if (target.section === "notes") {
            S.data.notes.unshift({
                date: new Date().toISOString().slice(0, 10),
                title: "新记录",
                desc: "",
                images: images.map(im => IMG_DIR + im.name),
            });
        } else if (target.section === "gallery") {
            images.forEach(im => S.data.gallery.push({
                src: IMG_DIR + im.name, caption: ""
            }));
        } else {
            // 其他板块或兜底 → 照片墙
            images.forEach(im => S.data.gallery.push({
                src: IMG_DIR + im.name, caption: ""
            }));
        }
    }

    /* 点击选择文件（不走拖放路由，直接按传入的 mode 落位） */
    function pickFiles(item, mode) {
        const inp = document.createElement("input");
        inp.type = "file";
        inp.accept = "image/*";
        inp.multiple = true;
        inp.addEventListener("change", async () => {
            const before = S.newImages.length;
            await handleFiles(inp.files);
            const added = S.newImages.slice(before);
            if (!added.length) return;

            const kind = item ? item.dataset.kind : (mode === "cover" ? "works" : "notes");
            const idx = item ? Number(item.dataset.i) : -1;
            const it = S.data[kind] && S.data[kind][idx];

            if (it) {
                if (mode === "images") {
                    it.images = it.images || [];
                    added.forEach(im => it.images.push(IMG_DIR + im.name));
                } else if (mode === "cover") {
                    it.cover = IMG_DIR + added[0].name;
                } else if (mode === "gallery") {
                    it.src = IMG_DIR + added[0].name;
                }
            }
            markDirty();
            render();
        });
        inp.click();
    }

    /* ---------- 新增一条 ---------- */
    function addItem(kind) {
        const d = new Date();
        const iso = d.toISOString().slice(0, 10);
        const t = {
            links: { icon: "🔗", name: "新链接", url: "https://" },
            works: { title: "新作品", desc: "说明", status: "plan", tags: [] },
            notes: { date: iso, title: "新记录", desc: "", images: [] },
            milestones: { date: iso, title: "新里程碑", desc: "", icon: "✦" },
            gallery: { src: "", caption: "新照片" },
        }[kind];
        S.data[kind].unshift(t);
        markDirty();
        render();
        toast("已新增一条，展开填写内容", "ok");
    }

    /* ============================================================
       六、基本资料
       ============================================================ */
    function renderSettings(main) {
        const p = S.data.profile || {};
        main.innerHTML = `<div class="sec-head">
            <h2>⚙️ 基本资料</h2><p>头像、名字、简介、背景音乐</p></div>
            <div class="item"><div class="item-body">
                <div class="row">
                    <div class="field"><label>名字</label>
                        <input class="inp" data-p="name" value="${esc(p.name)}"></div>
                    <div class="field"><label>副标题</label>
                        <input class="inp" data-p="title" value="${esc(p.title)}"></div>
                </div>
                <div class="field"><label>一句话标语</label>
                    <input class="inp" data-p="tagline" value="${esc(p.tagline)}"></div>
                <div class="field"><label>简介</label>
                    <textarea class="ta" data-p="intro">${esc(p.intro)}</textarea></div>
                <div class="row">
                    <div class="field"><label>头像路径</label>
                        <input class="inp" data-p="avatar" value="${esc(p.avatar)}"></div>
                    <div class="field"><label>背景音乐</label>
                        <input class="inp" data-p="bgm" value="${esc(p.bgm)}"></div>
                </div>
                <div class="row">
                    <div class="field"><label>所在地</label>
                        <input class="inp" data-p="location" value="${esc(p.location)}"></div>
                    <div class="field"><label>邮箱</label>
                        <input class="inp" data-p="email" value="${esc(p.email)}"></div>
                </div>
            </div></div>`;

        $$("[data-p]", main).forEach(el => el.addEventListener("input", () => {
            S.data.profile[el.dataset.p] = el.value;
            markDirty();
        }));
    }

    /* ============================================================
       七、图片工具
       —— webp 转换、压缩参数、孤儿文件清理
       ============================================================ */
    function renderImages(main) {
        const c = S.compress || DEFAULT_COMPRESS;

        // 找出被引用的图片
        const used = new Set();
        const collect = (src) => { if (src) used.add(src.split("/").pop()); };
        (S.data.gallery || []).forEach(g => collect(g.src));
        (S.data.works || []).forEach(w => { collect(w.cover); });
        (S.data.notes || []).forEach(n => (n.images || []).forEach(collect));
        (S.data.profile ? [S.data.profile.avatar, S.data.profile.bgm] : [])
            .forEach(collect);

        const newImgs = S.newImages.map(im => ({
            name: im.name, size: im.blob.size, w: im.w, h: im.h,
            origSize: im.origSize, origName: im.origName, isNew: true,
        }));

        main.innerHTML = `<div class="sec-head">
            <h2>🖼️ 图片工具</h2>
            <p>格式转换、压缩参数、垃圾清理</p></div>

        <div class="item"><div class="item-head" style="cursor:default">
            <span class="item-dot"></span><span class="item-title">压缩与格式</span>
        </div><div class="item-body">
            <div class="row">
                <div class="field"><label>输出格式</label>
                    <select class="sel" id="cFormat">
                        <option value="webp"${c.format === "webp" ? " selected" : ""}>WebP（最小，推荐）</option>
                        <option value="jpg"${c.format === "jpg" ? " selected" : ""}>JPG（兼容性最好）</option>
                        <option value="png"${c.format === "png" ? " selected" : ""}>PNG（无损，保留透明）</option>
                    </select></div>
                <div class="field"><label>长边上限</label>
                    <select class="sel" id="cMax">
                        <option value="0"${c.maxEdge === 0 ? " selected" : ""}>不缩放（保持原尺寸）</option>
                        <option value="1200"${c.maxEdge === 1200 ? " selected" : ""}>1200px</option>
                        <option value="1600"${c.maxEdge === 1600 ? " selected" : ""}>1600px（推荐）</option>
                        <option value="2000"${c.maxEdge === 2000 ? " selected" : ""}>2000px</option>
                        <option value="3000"${c.maxEdge === 3000 ? " selected" : ""}>3000px</option>
                    </select></div>
            </div>
            <div class="field"><label>质量：<span id="cQVal">${Math.round(c.quality * 100)}</span>%</label>
                <input type="range" id="cQuality" min="30" max="100" value="${Math.round(c.quality * 100)}"
                    style="width:100%">
                <div class="tip">质量越低体积越小。WebP 建议 75-85%，JPG 建议 80-90%</div></div>
            <div style="display:flex;gap:9px">
                <button class="btn ghost sm" id="btnResetC">恢复默认</button>
                <button class="btn sm" id="btnTestC">试压一张看看效果</button>
            </div>
        </div></div>

        <div class="item"><div class="item-head" style="cursor:default">
            <span class="item-dot"></span><span class="item-title">本次会话新加的图片</span>
            <div class="spacer"></div><span class="pill">${newImgs.length}</span>
        </div><div class="item-body">
            ${newImgs.length ? newImgs.map(im => `
                <div class="thumb" style="width:100%;height:auto;display:flex;gap:12px;padding:8px;align-items:center">
                    ${im.dataUrl
                        ? `<img src="${im.dataUrl}" alt="" style="width:72px;height:72px;object-fit:cover;border-radius:6px;flex:none">`
                        : `<img src="img/${esc(im.name)}" alt="" style="width:72px;height:72px;object-fit:cover;border-radius:6px;flex:none">`}
                    <div style="flex:1;min-width:0">
                        <div style="font-size:.82rem;font-weight:600">${esc(im.name)}</div>
                        <div style="font-size:.74rem;color:var(--faint)">
                            ${im.w}×${im.h} ·
                            ${fmtSize(im.origSize)} → <span style="color:var(--green)">${fmtSize(im.size)}</span>
                            ${im.origSize ? `（省 ${Math.round((1 - im.size / im.origSize) * 100)}%）` : ""}
                        </div>
                        <div style="font-size:.72rem;color:var(--faint);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                            原文件 ${esc(im.origName || "")}
                        </div>
                    </div>
                </div>`).join("")
            : `<div class="tip">还没有新图片。直接在任意位置拖图进来就会出现在这里。</div>`}
        </div></div>

        <div class="item"><div class="item-head" style="cursor:default">
            <span class="item-dot"></span><span class="item-title">批量转换已有图片</span>
        </div><div class="item-body">
            <div class="tip" style="margin-bottom:8px">
                把 img/ 目录里已经是 jpg/png 的老图转成 webp，同步更新所有引用路径。
                转完后旧文件会留在磁盘上，确认无误可以手动删掉。
            </div>
            <button class="btn ghost sm" id="btnBatchConv">🔄 扫描并转换</button>
            <div id="batchBox"></div>
        </div></div>

        <div class="item"><div class="item-head" style="cursor:default">
            <span class="item-dot"></span><span class="item-title">图片引用检查</span>
        </div><div class="item-body">
            <div class="tip" style="margin-bottom:8px">
                扫描 img/ 目录，找出没有被任何地方引用的图片（孤儿文件）。
                拖图时如果同一张图拖了多次，会产生重复文件，这里能揪出来。
            </div>
            <button class="btn ghost sm" id="btnScanOrphan">🔍 扫描孤儿文件</button>
            <div id="orphanBox"></div>
        </div></div>`;

        // 绑定
        const upd = () => {
            saveCompressSettings({
                format: $("#cFormat").value,
                maxEdge: Number($("#cMax").value),
                quality: Number($("#cQuality").value) / 100,
            });
            $("#cQVal").textContent = $("#cQuality").value;
        };
        ["#cFormat", "#cMax", "#cQuality"].forEach(s =>
            $(s).addEventListener("input", upd));
        $("#cFormat").addEventListener("change", upd);
        $("#cMax").addEventListener("change", upd);

        $("#btnResetC").addEventListener("click", () => {
            saveCompressSettings(Object.assign({}, DEFAULT_COMPRESS));
            render();
            toast("已恢复默认参数", "ok");
        });

        $("#btnTestC").addEventListener("click", async () => {
            const inp = document.createElement("input");
            inp.type = "file";
            inp.accept = "image/*";
            inp.addEventListener("change", async () => {
                const f = inp.files[0];
                if (!f) return;
                const before = S.newImages.length;
                await compressImage(f, "test-preview", {});
                const img = S.newImages[S.newImages.length - 1] || null;
                // 试压不入库
                const tmp = await compressImage(f, "test-preview");
                if (S.newImages.length > before) S.newImages.pop();
                const saved = Math.round((1 - tmp.outSize / f.size) * 100);
                showModal("压缩效果预览", `
                    <div style="display:flex;gap:16px;align-items:flex-start">
                        <div style="flex:1">
                            <div class="tip" style="margin-bottom:6px">原图</div>
                            <img src="${URL.createObjectURL(f)}" style="width:100%;border-radius:8px;border:1px solid var(--border)">
                            <div class="tip" style="margin-top:6px">${f.name}<br>${fmtSize(f.size)}</div>
                        </div>
                        <div style="flex:1">
                            <div class="tip" style="margin-bottom:6px">压缩后（${tmp.w}×${tmp.h}）</div>
                            <img src="${tmp.dataUrl}" style="width:100%;border-radius:8px;border:1px solid var(--border)">
                            <div class="tip" style="margin-top:6px">${esc(tmp.name)}<br>
                                <span style="color:var(--green)">${fmtSize(tmp.outSize)}（省 ${saved}%）</span></div>
                        </div>
                    </div>`,
                    [{ label: "知道了", primary: true }]);
            });
            inp.click();
        });

        $("#btnBatchConv").addEventListener("click", async () => {
            const box = $("#batchBox");
            box.innerHTML = `<div class="tip">扫描中…</div>`;
            try {
                // 1. 列出 img/ 下的非 webp 文件
                const res = await fetch("img/");
                const html = await res.text();
                const all = [...html.matchAll(/href="([^"]+\.(?:webp|jpg|jpeg|png|gif))"/gi)]
                    .map(m => decodeURIComponent(m[1].split("/").pop()))
                    .filter(Boolean);
                const targets = all.filter(n => !/\.webp$/i.test(n) && n !== "favicon.ico");
                if (!targets.length) {
                    box.innerHTML = `<div class="tip" style="color:var(--green)">
                        ✓ img/ 里的图片都已经是 webp 了，没有需要转换的</div>`;
                    return;
                }

                // 2. 逐个转（用当前压缩设置）
                const results = [];
                for (const name of targets) {
                    try {
                        const r = await fetch("img/" + name);
                        if (!r.ok) throw new Error("读取失败");
                        const blob = await r.blob();
                        const file = new File([blob], name, { type: blob.type });
                        const stem = name.replace(/\.(jpg|jpeg|png|gif)$/i, "");
                        const out = await compressImage(file, stem, { format: "webp" });
                        // 新文件名与旧名一致（只是扩展名变了）→ 路径引用要跟着改
                        results.push({
                            old: name, new: out.name,
                            oldSize: blob.size, newSize: out.outSize,
                            blob: out.blob, w: out.w, h: out.h,
                        });
                    } catch (e) {
                        results.push({ old: name, error: e.message });
                    }
                }

                const ok = results.filter(r => !r.error);
                const failed = results.filter(r => r.error);

                // 3. 更新 data.js 里的引用路径
                const oldNames = ok.map(r => r.old);
                const newNames = ok.map(r => r.new);
                let replaced = 0;
                const replaceInData = (obj) => {
                    if (typeof obj === "string") {
                        for (let i = 0; i < oldNames.length; i++) {
                            if (obj.endsWith("/" + oldNames[i])) {
                                replaced++;
                                return obj.slice(0, obj.length - oldNames[i].length) + newNames[i];
                            }
                        }
                        return obj;
                    }
                    if (Array.isArray(obj)) return obj.map(replaceInData);
                    if (obj && typeof obj === "object") {
                        const o = {};
                        Object.keys(obj).forEach(k => { o[k] = replaceInData(obj[k]); });
                        return o;
                    }
                    return obj;
                };
                // 只替换 data.js 里的图片路径（profile.avatar 等）
                Object.keys(S.data).forEach(k => {
                    const before = JSON.stringify(S.data[k]);
                    const after = JSON.stringify(replaceInData(S.data[k]));
                    if (before !== after) {
                        S.data[k] = JSON.parse(after);
                    }
                });

                // 4. 转换结果加入待保存列表
                ok.forEach(r => {
                    S.newImages.push({
                        name: r.new, blob: r.blob,
                        dataUrl: null, w: r.w, h: r.h,
                        origSize: r.oldSize, outSize: r.newSize,
                        origName: r.old, fp: "batch-" + r.old,
                    });
                });
                markDirty();

                const totalOld = ok.reduce((s, r) => s + r.oldSize, 0);
                const totalNew = ok.reduce((s, r) => s + r.newSize, 0);
                const saved = totalOld ? Math.round((1 - totalNew / totalOld) * 100) : 0;

                box.innerHTML = `<div style="margin-top:10px">
                    <div class="tip" style="color:var(--green);margin-bottom:8px">
                        ✓ 转换 ${ok.length} 张：${fmtSize(totalOld)} → ${fmtSize(totalNew)}（省 ${saved}%）</div>
                    ${ok.map(r => `<div style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:.78rem">
                        <code style="flex:1;overflow:hidden;text-overflow:ellipsis">${esc(r.old)} → ${esc(r.new)}</code>
                        <span style="color:var(--faint)">${fmtSize(r.oldSize)} → ${fmtSize(r.newSize)}</span>
                    </div>`).join("")}
                    ${failed.length ? `<div class="tip" style="color:var(--red);margin-top:8px">
                        ${failed.length} 张失败：${esc(failed.map(f => f.old).join(", "))}</div>` : ""}
                    <div class="tip" style="margin-top:8px">
                        引用路径已自动更新（替换 ${replaced} 处）。点「保存到本地」写盘，
                        旧文件留在磁盘上，确认无误后可以手动删。</div>
                </div>`;
            } catch (e) {
                box.innerHTML = `<div class="tip" style="color:var(--red)">转换失败：${esc(e.message)}</div>`;
            }
        });

        $("#btnScanOrphan").addEventListener("click", async () => {
            const box = $("#orphanBox");
            box.innerHTML = `<div class="tip">扫描中…</div>`;
            try {
                // 1. 列出 img/ 下的文件
                const res = await fetch("img/");
                const html = await res.text();
                const names = [...html.matchAll(/href="([^"]+\.(?:webp|jpg|jpeg|png|gif))"/gi)]
                    .map(m => decodeURIComponent(m[1].split("/").pop()))
                    .filter(Boolean);

                // 2. 收集所有引用来源：data.js + css + html
                const refs = new Set(used);
                for (const path of ["js/data.js", "css/style.css", "index.html", "css/admin.css"]) {
                    try {
                        const r = await fetch(path + "?t=" + Date.now());
                        if (!r.ok) continue;
                        const t = await r.text();
                        [...t.matchAll(/img\/([A-Za-z0-9._-]+\.(?:webp|jpg|jpeg|png|gif))/gi)]
                            .forEach(m => refs.add(m[1]));
                    } catch (e) { /* 忽略单个文件读取失败 */ }
                }

                const orphans = names.filter(n => !refs.has(n));

                if (!orphans.length) {
                    box.innerHTML = `<div class="tip" style="color:var(--green)">
                        ✓ 没有孤儿文件，img/ 目录里的 ${names.length} 个文件都有引用</div>`;
                } else {
                    box.innerHTML = `<div style="margin-top:10px">
                        <div class="tip" style="color:var(--yellow);margin-bottom:8px">
                            发现 ${orphans.length} 个未被引用的文件（已排除 data.js / css / html 里的引用）：</div>
                        ${orphans.map(n => `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:.8rem">
                            <code style="flex:1;overflow:hidden;text-overflow:ellipsis">${esc(n)}</code>
                        </div>`).join("")}
                        <div class="tip" style="margin-top:8px">
                            这些文件在网站上不会被显示。确认无用后可以手动删掉 img/ 目录里的对应文件。</div>
                    </div>`;
                }
            } catch (e) {
                box.innerHTML = `<div class="tip" style="color:var(--red)">
                    扫描失败：${esc(e.message)}<br>
                    需要通过本地服务器访问（直接打开 admin.html 不行）</div>`;
            }
        });
    }
    /* ============================================================
       通用弹窗
       ============================================================ */
    function showModal(title, bodyHtml, buttons) {
        const m = $("#modal");
        $("#modalTitle").textContent = title;
        $("#modalBody").innerHTML = bodyHtml;
        const foot = $("#modalFoot");
        foot.innerHTML = (buttons || [{ label: "关闭", primary: true }]).map(b =>
            `<button class="btn ${b.primary ? "" : "ghost"}" data-mb="${esc(b.label)}">${esc(b.label)}</button>`
        ).join("");
        $$("[data-mb]", foot).forEach(btn => btn.addEventListener("click", () => {
            m.classList.remove("show");
            const cfg = (buttons || []).find(b => b.label === btn.dataset.mb);
            if (cfg && cfg.onClick) cfg.onClick();
        }));
        m.classList.add("show");
    }

    /* ============================================================
       八、发布设置
       ============================================================ */
    function renderPublish(main) {
        main.innerHTML = `<div class="sec-head">
            <h2>🚀 发布设置</h2><p>配置 GitHub，令牌只存在你本机浏览器</p></div>
            <div class="item"><div class="item-body">
                <div class="row">
                    <div class="field"><label>仓库所有者</label>
                        <input class="inp" id="gOwner" value="${esc(S.owner)}" placeholder="OoRin9oO"></div>
                    <div class="field"><label>仓库名</label>
                        <input class="inp" id="gRepo" value="${esc(S.repo)}" placeholder="OoRin9oO.github.io"></div>
                </div>
                <div class="field"><label>分支</label>
                    <input class="inp" id="gBranch" value="${esc(S.branch)}" placeholder="main"></div>
                <div class="field"><label>Personal Access Token</label>
                    <input class="inp" id="gToken" type="password" value="${esc(S.token)}" placeholder="github_pat_...">
                    <div class="tip">
                        在 GitHub → Settings → Developer settings → Personal access tokens 生成，
                        勾选 <code>repo</code> 权限（公开仓库勾 <code>public_repo</code> 也够）。<br>
                        令牌只保存在你本机 localStorage，不会上传到任何第三方。
                    </div></div>
                <div style="display:flex;gap:9px;margin-top:14px">
                    <button class="btn" id="btnTestToken">🔌 测试连接</button>
                    <button class="btn ghost" id="btnSaveToken">💾 记住设置</button>
                </div>
            </div></div>`;

        $("#btnSaveToken").addEventListener("click", () => {
            S.owner = $("#gOwner").value.trim();
            S.repo = $("#gRepo").value.trim();
            S.branch = $("#gBranch").value.trim() || "main";
            S.token = $("#gToken").value.trim();
            localStorage.setItem("rin9-token", S.token);
            localStorage.setItem("rin9-owner", S.owner);
            localStorage.setItem("rin9-repo", S.repo);
            localStorage.setItem("rin9-branch", S.branch);
            toast("设置已保存到本机", "ok");
        });

        $("#btnTestToken").addEventListener("click", async () => {
            const owner = $("#gOwner").value.trim() || REPO.owner;
            const repo = $("#gRepo").value.trim() || REPO.repo;
            const token = $("#gToken").value.trim();
            if (!token) return toast("先填入令牌", "err");
            toast("正在测试…");
            try {
                const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
                    headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" },
                });
                if (res.status === 401) return toast("令牌无效或已过期", "err");
                if (!res.ok) return toast("连接失败 HTTP " + res.status, "err");
                const j = await res.json();
                toast(`连接成功：${j.full_name}（★${j.stargazers_count}）`, "ok");
            } catch (e) {
                toast("网络错误：" + e.message, "err");
            }
        });
    }

    /* ============================================================
       八、保存到本地（File System Access API）
       ============================================================ */
    async function saveLocal() {
        if (!S.dirHandle) {
            if (!window.showDirectoryPicker) {
                return toast("这个浏览器不支持直接写文件，请用 Edge 或 Chrome", "err");
            }
            try {
                S.dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
            } catch (e) {
                return;   // 用户取消
            }
        }
        toast("正在写入…");
        try {
            // 1. 图片
            for (const im of S.newImages) {
                await writeFile(S.dirHandle, IMG_DIR + im.name, im.blob);
            }
            // 2. data.js
            await writeFile(S.dirHandle, DATA_FILE, new Blob([serialize()], { type: "text/javascript" }));
            // 3. README 里的图片命名说明不用改

            const n = S.newImages.length;
            S.newImages = [];
            markClean("已保存到本地" + (n ? `（${n} 张新图）` : ""));
            toast(n ? `已保存：data.js + ${n} 张图片` : "已保存 data.js", "ok");
            refreshPreview();
        } catch (e) {
            toast("保存失败：" + e.message, "err");
        }
    }

    async function writeFile(dirHandle, path, blob) {
        const parts = path.split("/");
        const name = parts.pop();
        let dir = dirHandle;
        for (const p of parts) {
            dir = await dir.getDirectoryHandle(p, { create: true });
        }
        const fh = await dir.getFileHandle(name, { create: true });
        const w = await fh.createWritable();
        await w.write(blob);
        await w.close();
    }

    /* ============================================================
       九、发布到 GitHub
       ============================================================ */
    async function publish() {
        const token = S.token;
        const owner = S.owner || REPO.owner;
        const repo = S.repo || REPO.repo;
        const branch = S.branch || REPO.branch;

        if (!token) {
            S.section = "publish";
            renderSide();
            render();
            return toast("先在「发布设置」里填令牌", "err");
        }
        if (!confirm("将提交并推送到 GitHub，Pages 会自动重新部署。\n继续？")) return;

        toast("正在提交…");
        const H = {
            Authorization: "Bearer " + token,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
        };

        try {
            // 0. 若已授权过目录，顺手把新图也写进本地仓库，保持两边一致
            if (S.dirHandle && S.newImages.length) {
                for (const im of S.newImages) {
                    await writeFile(S.dirHandle, IMG_DIR + im.name, im.blob);
                }
            }

            // 1. 取分支当前状态
            const refRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branch}`, { headers: H });
            if (!refRes.ok) throw new Error("取分支失败 HTTP " + refRes.status);
            const ref = await refRes.json();
            const baseCommit = ref.object.sha;

            const commitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits/${baseCommit}`, { headers: H });
            const baseCommitInfo = await commitRes.json();
            const baseTree = baseCommitInfo.tree.sha;

            // 2. 建 blob：data.js
            // GitHub 的 git blob API 只支持 base64 编码，统一走 base64
            const dataText = serialize();
            const dataB64 = await textToBase64(dataText);
            const dataBlob = await createBlob(H, owner, repo, dataB64, "base64");
            const treeItems = [
                { path: DATA_FILE, mode: "100644", type: "blob", sha: dataBlob.sha },
            ];

            // 3. 建 blob：新增的图片（必须一起提交，否则线上图片 404）
            for (const im of S.newImages) {
                const b64 = await blobToBase64(im.blob);
                const imgBlob = await createBlob(H, owner, repo, b64, "base64");
                treeItems.push({
                    path: IMG_DIR + im.name,
                    mode: "100644", type: "blob", sha: imgBlob.sha,
                });
            }

            const tree = await createTree(H, owner, repo, baseTree, treeItems);

            // 4. 提交
            const nImg = S.newImages.length;
            const msg = nImg
                ? `更新网站内容（${nImg} 张新图）`
                : "更新网站内容";
            const commit = await createCommit(H, owner, repo, tree.sha, baseCommit, msg);
            await updateRef(H, owner, repo, branch, commit.sha);

            S.newImages = [];
            markClean("已推送到 GitHub");
            toast("发布成功！约 1 分钟后线上更新", "ok");
        } catch (e) {
            toast("发布失败：" + e.message, "err");
        }
    }

    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(String(fr.result).split(",")[1] || "");
            fr.onerror = () => reject(new Error("图片编码失败"));
            fr.readAsDataURL(blob);
        });
    }

    /* 文本转 base64（要处理 UTF-8 中文，不能用 btoa 直接转） */
    function textToBase64(text) {
        const bytes = new TextEncoder().encode(text);
        let bin = "";
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
            bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        return btoa(bin);
    }

    async function createBlob(H, owner, repo, text, encoding) {
        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/blobs`, {
            method: "POST", headers: H,
            body: JSON.stringify({ content: text, encoding }),
        });
        if (!res.ok) throw new Error("创建 blob 失败 HTTP " + res.status);
        return res.json();
    }

    async function createTree(H, owner, repo, baseTree, items) {
        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees`, {
            method: "POST", headers: H,
            body: JSON.stringify({ base_tree: baseTree, tree: items }),
        });
        if (!res.ok) throw new Error("创建 tree 失败 HTTP " + res.status);
        return res.json();
    }

    async function createCommit(H, owner, repo, treeSha, parentSha, message) {
        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits`, {
            method: "POST", headers: H,
            body: JSON.stringify({ message, tree: treeSha, parents: [parentSha] }),
        });
        if (!res.ok) throw new Error("创建 commit 失败 HTTP " + res.status);
        return res.json();
    }

    async function updateRef(H, owner, repo, branch, sha) {
        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
            method: "PATCH", headers: H,
            body: JSON.stringify({ sha, force: false }),
        });
        if (!res.ok) throw new Error("更新分支失败 HTTP " + res.status);
        return res.json();
    }

    /* ============================================================
       十、预览
       ============================================================ */
    function refreshPreview() {
        const f = $("#previewFrame");
        f.src = "index.html?t=" + Date.now();
    }

    /* ============================================================
       启动
       ============================================================ */
    // 暴露给外部（测试 / 高级用法）
    window.Rin9Admin = {
        get data() { return S.data; },
        get dirty() { return S.dirty; },
        get newImages() { return S.newImages; },
        set allowNav(v) { S.allowNav = !!v; },
        serialize,
        nextName,
        compressImage,
        saveLocal,
        publish,
        resolveDropTarget,
        applyDrop,
        fingerprint,
        setCompress: (s) => {
            if (s === null) {
                S.compress = loadCompressSettings();
            } else {
                saveCompressSettings(Object.assign({}, S.compress || DEFAULT_COMPRESS, s));
            }
        },
        get compress() { return S.compress; },
    };

    async function init() {
        S.compress = loadCompressSettings();
        try {
            await loadData();
        } catch (e) {
            $("#main").innerHTML = `<div class="loading">❌ ${esc(e.message)}<br><br>
                <span style="font-size:.85rem;color:var(--faint)">
                请确认是通过 <code>python tools/serve.py</code> 启动的（直接双击 admin.html 会被浏览器拦截读取本地文件）</span></div>`;
            $("#fileState").textContent = "读取失败";
            return;
        }
        markClean("已同步");
        renderSide();
        render();
        refreshPreview();

        $("#btnSave").addEventListener("click", saveLocal);
        $("#btnPublish").addEventListener("click", publish);
        $("#btnRefresh").addEventListener("click", refreshPreview);
        $("#btnPreview").addEventListener("click", () => window.open("index.html", "_blank"));

        // 弹窗关闭
        $("#modalClose")?.addEventListener("click", () => $("#modal").classList.remove("show"));
        $("#modal")?.addEventListener("click", (e) => {
            if (e.target.id === "modal") $("#modal").classList.remove("show");
        });
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") $("#modal")?.classList.remove("show");
        });

        $("#btnTogglePreview").addEventListener("click", () => {
            $("#previewPane").classList.toggle("collapsed");
        });

        $("#btnTheme").addEventListener("click", () => {
            const cur = document.documentElement.getAttribute("data-theme");
            const next = cur === "light" ? "dark" : "light";
            document.documentElement.setAttribute("data-theme", next);
            localStorage.setItem("rin9-admin-theme", next);
            $("#btnTheme").textContent = next === "light" ? "🌙" : "☀️";
        });
        const th = localStorage.getItem("rin9-admin-theme");
        if (th) {
            document.documentElement.setAttribute("data-theme", th);
            $("#btnTheme").textContent = th === "light" ? "🌙" : "☀️";
        }

        // ============ 全局拖放路由 ============
        const ov = $("#dropOverlay");
        const dzTitle = ov.querySelector(".dz-title");
        const dzSub = ov.querySelector(".dz-sub");
        const dzTarget = ov.querySelector(".dz-target");
        const dzBox = ov.querySelector(".dropzone-box");
        let dragDepth = 0;
        let currentTarget = null;
        let lastHl = null;

        const clearHighlight = () => {
            if (lastHl) {
                lastHl.classList.remove("drop-target-hl");
                lastHl.classList.remove("drag-hover");
            }
            lastHl = null;
        };

        const setTarget = (t) => {
            currentTarget = t;
            if (t) {
                dzTarget.textContent = "→ " + t.label;
                dzBox.classList.add("targeted");
                clearHighlight();
                if (t.el) {
                    lastHl = t.el;
                    lastHl.classList.add(t.el.classList.contains("item") ? "drag-hover" : "drop-target-hl");
                }
            } else {
                dzTarget.textContent = "";
                dzBox.classList.remove("targeted");
                clearHighlight();
            }
        };

        // 判断这次拖拽是不是带文件的（CDP 模拟时 dataTransfer.types 可能为空，
        // 所以只要有 drag 事件就先显示，落点提示照样给）
        const hasFiles = (e) => {
            const dt = e.dataTransfer;
            if (!dt) return true;
            const types = Array.from(dt.types || []);
            if (!types.length) return true;
            return types.includes("Files");
        };

        window.addEventListener("dragenter", (e) => {
            if (!hasFiles(e)) return;
            dragDepth++;
            ov.classList.add("show");
            dzTitle.textContent = "松手就加进来";
            dzSub.textContent = "移动鼠标决定图片放在哪";
        });

        window.addEventListener("dragover", (e) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
            // overlay 是 pointer-events:none，不会挡鼠标，所以能实时算准落点
            const t = resolveDropTarget(e.clientX, e.clientY);
            setTarget(t);
        });

        window.addEventListener("dragleave", () => {
            dragDepth = Math.max(0, dragDepth - 1);
            if (!dragDepth) {
                ov.classList.remove("show");
                setTarget(null);
            }
        });

        window.addEventListener("drop", async (e) => {
            if (!e.dataTransfer || !e.dataTransfer.files ||
                !e.dataTransfer.files.length) {
                // 没有真实文件（比如拖的是文字），直接忽略
                dragDepth = 0;
                ov.classList.remove("show");
                setTarget(null);
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            dragDepth = 0;
            ov.classList.remove("show");

            // 落点优先用 drop 事件发生时的实时计算结果
            const t = resolveDropTarget(e.clientX, e.clientY) || currentTarget;
            setTarget(null);
            if (!t) return;

            const before = S.newImages.length;
            await handleFiles(e.dataTransfer.files);
            const added = S.newImages.slice(before);
            if (!added.length) return;

            applyDrop(t, added);
            markDirty();

            // 落点变了要切到对应板块
            if (t.section) {
                S.section = t.section;
                renderSide();
            } else if (t.kind) {
                S.section = t.kind;
                renderSide();
            }
            render();
            toast(`已${t.label}：${added.length} 张`, "ok");
        });

        // 离开前提醒（只在真正关闭/刷新页面时提示，不拦程序内跳转）
        window.addEventListener("beforeunload", (e) => {
            if (S.dirty && !S.allowNav) {
                e.preventDefault();
                e.returnValue = "";
            }
        });
    }

    init();
})();
