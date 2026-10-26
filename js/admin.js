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
   ============================================================ */

window.SITE_DATA = `;

        return header + dump(clean, 0) + ";\n";
    }

    /* ============================================================
       三、命名：字母-日期-字母
       ============================================================ */
    function nextName(index) {
        // 找出现有命名里最大的字母序号
        let max = -1;
        $$("#galleryGrid img, .thumb img").forEach(() => {});
        const existing = (S.data.gallery || []).map(g => g.src || "");
        existing.forEach(src => {
            const m = /img\/([a-z])-(\d{8})-([a-z])\.webp$/.exec(src);
            if (m) {
                const i = m[1].charCodeAt(0) - 97;
                if (i > max) max = i;
            }
        });
        S.newImages.forEach(im => {
            const m = /^([a-z])-\d{8}-[a-z]\.webp$/.exec(im.name);
            if (m) {
                const i = m[1].charCodeAt(0) - 97;
                if (i > max) max = i;
            }
        });
        const letter = String.fromCharCode(97 + ((max + 1) % 26));
        return `${letter}-${todayStr()}-${letter}.webp`;
    }

    /* ============================================================
       四、图片压缩（浏览器内，Canvas）
       ============================================================ */
    async function compressImage(file, name) {
        const bitmap = await createImageBitmap(file);
        const MAX = 1600;
        let { width, height } = bitmap;
        if (Math.max(width, height) > MAX) {
            const s = MAX / Math.max(width, height);
            width = Math.round(width * s);
            height = Math.round(height * s);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();

        const blob = await new Promise(res => canvas.toBlob(res, "image/webp", 0.82));
        if (!blob) throw new Error("图片编码失败");

        const dataUrl = canvas.toDataURL("image/webp", 0.6);
        return { name, blob, dataUrl, w: width, h: height };
    }

    async function handleFiles(files) {
        const list = Array.from(files).filter(f => f.type.startsWith("image/"));
        if (!list.length) return;

        toast(`正在压缩 ${list.length} 张图片…`);
        for (const file of list) {
            try {
                const name = nextName();
                const img = await compressImage(file, name);
                S.newImages.push(img);
                markDirty();
            } catch (e) {
                toast("处理失败：" + file.name + " — " + e.message, "err");
            }
        }
        render();
        toast(`已加入 ${list.length} 张图片，记得点「保存」`, "ok");
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
        if (S.section === "publish") return renderPublish(main);

        const sec = SECTIONS.find(s => s.id === S.section);
        const items = S.data[S.section] || [];

        let html = `<div class="sec-head">
            <h2>${sec.icon} ${sec.name}</h2>
            <p>共 ${items.length} 条</p>
            <div class="spacer"></div>
            <button class="btn ghost sm" id="btnAdd">＋ 新增一条</button>
        </div>`;

        if (!items.length) {
            html += `<div class="drop" id="emptyAdd"><div class="drop-icon">📝</div>
                <div class="drop-title">还没有内容</div>
                <div class="drop-sub">点右上角「新增一条」</div></div>`;
        }

        html += items.map((it, i) => renderItem(S.section, it, i)).join("");
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
                    <div class="drop" data-drop style="margin-top:8px">
                        <div class="drop-icon">📤</div>
                        <div class="drop-title">拖图到这里替换，或点击选择</div>
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
            <input class="inp" data-k="cover" value="${esc(cover)}" placeholder="img/xxx.webp 或拖图到此处">
            <div class="tip">留空表示没有封面</div></div>`;
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
            <div class="drop" data-drop style="margin-top:8px">
                <div class="drop-icon">📤</div>
                <div class="drop-title">拖图到这里，或点击选择</div>
                <div class="drop-sub">自动压缩成 webp</div>
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

        // 拖图区
        $$("[data-drop]", main).forEach(dz => {
            dz.addEventListener("click", () => pickFiles(dz.closest(".item")));
            dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("over"); });
            dz.addEventListener("dragleave", () => dz.classList.remove("over"));
            dz.addEventListener("drop", async (e) => {
                e.preventDefault();
                dz.classList.remove("over");
                const item = dz.closest(".item");
                const kind = item.dataset.kind;
                const idx = Number(item.dataset.i);
                const before = S.newImages.length;
                await handleFiles(e.dataTransfer.files);
                const added = S.newImages.slice(before);
                if (!added.length) return;
                if (kind === "notes") {
                    S.data[kind][idx].images = S.data[kind][idx].images || [];
                    added.forEach(im => S.data[kind][idx].images.push(IMG_DIR + im.name));
                } else if (kind === "works") {
                    S.data[kind][idx].cover = IMG_DIR + added[0].name;
                } else if (kind === "gallery") {
                    S.data[kind][idx].src = IMG_DIR + added[0].name;
                }
                markDirty();
                render();
            });
        });
    }

    function pickFiles(item) {
        const inp = document.createElement("input");
        inp.type = "file";
        inp.accept = "image/*";
        inp.multiple = true;
        inp.addEventListener("change", async () => {
            const before = S.newImages.length;
            await handleFiles(inp.files);
            const added = S.newImages.slice(before);
            if (item) {
                const kind = item.dataset.kind;
                const idx = Number(item.dataset.i);
                if (kind === "notes") {
                    S.data[kind][idx].images = S.data[kind][idx].images || [];
                    added.forEach(im => S.data[kind][idx].images.push(IMG_DIR + im.name));
                } else if (kind === "works") {
                    S.data[kind][idx].cover = added.length ? IMG_DIR + added[0].name : "";
                } else if (kind === "gallery") {
                    S.data[kind][idx].src = added.length ? IMG_DIR + added[0].name : "";
                }
                markDirty();
                render();
            }
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
       七、发布设置
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
            const dataText = serialize();
            const dataBlob = await createBlob(H, owner, repo, dataText, "utf-8");
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
        set allowNav(v) { S.allowNav = !!v; },
        serialize,
        nextName,
        compressImage,
        saveLocal,
        publish,
    };

    async function init() {
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

        // 全局拖拽 → 自动挂到照片墙
        const ov = $("#dropOverlay");
        let dragDepth = 0;
        window.addEventListener("dragenter", (e) => {
            if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes("Files")) return;
            dragDepth++;
            ov.classList.add("show");
        });
        window.addEventListener("dragover", (e) => e.preventDefault());
        window.addEventListener("dragleave", () => {
            dragDepth = Math.max(0, dragDepth - 1);
            if (!dragDepth) ov.classList.remove("show");
        });
        window.addEventListener("drop", async (e) => {
            e.preventDefault();
            dragDepth = 0;
            ov.classList.remove("show");
            // 如果是在某个具体条目的投放区里，交给条目的 handler 处理
            if (e.target.closest("[data-drop]")) return;

            const before = S.newImages.length;
            await handleFiles(e.dataTransfer.files);
            const added = S.newImages.slice(before);
            if (!added.length) return;

            // 落到照片墙，每张图一条
            added.forEach(im => {
                S.data.gallery.push({ src: IMG_DIR + im.name, caption: "" });
            });
            markDirty();
            S.section = "gallery";
            renderSide();
            render();
            toast(`已加入照片墙 ${added.length} 张`, "ok");
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
