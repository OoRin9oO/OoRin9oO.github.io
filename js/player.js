/* ============================================================
   音乐聚合器 — 站点端播放器
   播放 / 切歌 / 进度 / 音量 / 循环模式 / 歌单切换
   ============================================================ */

(function () {
    "use strict";

    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

    const M = {
        tracks: [],
        playlists: [],
        queue: [],        // 当前播放队列（track id 数组）
        index: -1,
        playing: false,
        loop: "all",     // all / one / none
        volume: 0.6,
        panelOpen: false,
    };

    function fmtTime(s) {
        if (!isFinite(s) || s < 0) return "0:00";
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return m + ":" + String(sec).padStart(2, "0");
    }

    const trackById = (id) => M.tracks.find(t => t.id === id);

    /* ---------- 渲染 ---------- */
    function renderPlaylists() {
        const sel = $("#musicPlaylistSel");
        if (!sel) return;
        sel.innerHTML = M.playlists.map(p =>
            `<option value="${p.id}">${p.name}</option>`).join("");
    }

    function renderList() {
        const box = $("#musicList");
        if (!box) return;
        const pl = M.playlists.find(p => p.id === $("#musicPlaylistSel").value);
        const ids = pl ? pl.tracks : M.queue;
        const items = ids.map(trackById).filter(Boolean);

        if (!items.length) {
            box.innerHTML = `<div class="music-empty">这个歌单还没有歌</div>`;
            return;
        }

        box.innerHTML = items.map(t => {
            const cur = M.tracks[M.index] && M.tracks[M.index].id === t.id;
            return `<div class="music-item${cur ? " playing" : ""}" data-id="${t.id}">
                <span class="mi-idx">${cur ? "▶" : ""}</span>
                <span class="mi-cover" style="${t.cover ? `background-image:url('${t.cover}')` : ""}"></span>
                <span class="mi-info">
                    <span class="mi-title">${t.title}</span>
                    <span class="mi-artist">${t.artist || ""}</span>
                </span>
                <span class="mi-dur">${t.duration ? fmtTime(t.duration) : ""}</span>
            </div>`;
        }).join("");

        $$(".music-item", box).forEach(el => {
            el.addEventListener("click", () => {
                const id = el.dataset.id;
                const i = M.queue.indexOf(id);
                if (i >= 0) {
                    M.index = i;
                } else {
                    M.queue.push(id);
                    M.index = M.queue.length - 1;
                }
                load(true);
            });
        });
    }

    function updateNowPlaying() {
        const t = M.tracks[M.index];
        $("#musicNowTitle").textContent = t ? t.title : "未在播放";
        $("#musicNowArtist").textContent = t ? (t.artist || "") : "选一首歌开始吧";
        const btn = $("#musicToggle");
        if (btn) btn.textContent = M.playing ? "⏸ 暂停" : "▶ 播放";
        const mb = $("#musicBtn");
        if (mb) {
            mb.textContent = M.playing ? "🎵 播放中" : "🎵 音乐";
            mb.setAttribute("aria-pressed", String(M.playing));
        }
        renderList();
    }

    /* ---------- 播放控制 ---------- */
    function load(autoplay) {
        const audio = $("#bgm");
        const t = M.tracks[M.index];
        if (!audio || !t) return;

        const src = $("#bgmSource");
        if (src) {
            src.src = t.src;
            audio.load();
        }
        audio.volume = M.volume;
        updateNowPlaying();

        if (autoplay) {
            audio.play().then(() => {
                M.playing = true;
                updateNowPlaying();
            }).catch(() => {
                M.playing = false;
                updateNowPlaying();
            });
        }
    }

    function toggle() {
        const audio = $("#bgm");
        if (!audio) return;
        if (M.playing) {
            audio.pause();
            M.playing = false;
        } else {
            // 没选歌就放第一首
            if (M.index < 0 && M.queue.length) M.index = 0;
            if (M.index < 0 && M.tracks.length) {
                M.queue = M.tracks.map(t => t.id);
                M.index = 0;
            }
            if (M.index < 0) return;
            if (!audio.src || audio.src.indexOf(M.tracks[M.index].src) < 0) {
                load(true);
                return;
            }
            audio.play().then(() => { M.playing = true; updateNowPlaying(); })
                .catch(() => { M.playing = false; updateNowPlaying(); });
        }
        updateNowPlaying();
    }

    function next(auto) {
        if (!M.queue.length) return;
        if (M.loop === "one" && auto) {
            const audio = $("#bgm");
            if (audio) { audio.currentTime = 0; audio.play(); }
            return;
        }
        M.index = (M.index + 1) % M.queue.length;
        load(true);
    }

    function prev() {
        if (!M.queue.length) return;
        const audio = $("#bgm");
        // 播放超过 3 秒，先回到开头（像主流播放器那样）
        if (audio && audio.currentTime > 3) {
            audio.currentTime = 0;
            return;
        }
        M.index = (M.index - 1 + M.queue.length) % M.queue.length;
        load(true);
    }

    /* ---------- 面板开关 ---------- */
    function openPanel() {
        M.panelOpen = true;
        $("#musicPanel")?.classList.add("open");
        $("#musicBackdrop")?.classList.add("show");
        $("#musicPanel")?.setAttribute("aria-hidden", "false");
    }

    function closePanel() {
        M.panelOpen = false;
        $("#musicPanel")?.classList.remove("open");
        $("#musicBackdrop")?.classList.remove("show");
        $("#musicPanel")?.setAttribute("aria-hidden", "true");
    }

    /* ---------- 初始化 ---------- */
    function init() {
        const D = window.SITE_DATA || {};
        const mus = D.music || {};
        M.tracks = mus.tracks || [];
        M.playlists = mus.playlists || [];
        M.queue = M.tracks.map(t => t.id);

        const audio = $("#bgm");
        const mb = $("#musicBtn");
        if (!audio || !mb) return;

        // 按钮：打开面板
        mb.addEventListener("click", () => {
            if (M.panelOpen) closePanel(); else openPanel();
        });
        $("#musicClose")?.addEventListener("click", closePanel);
        $("#musicBackdrop")?.addEventListener("click", closePanel);

        // 播放控制
        $("#musicToggle")?.addEventListener("click", toggle);
        $("#musicNext")?.addEventListener("click", () => next(false));
        $("#musicPrev")?.addEventListener("click", prev);

        // 循环模式
        const loopBtn = $("#musicLoop");
        const LOOP = { all: "🔁", one: "🔂", none: "⏹" };
        const loopNext = { all: "one", one: "none", none: "all" };
        loopBtn?.addEventListener("click", () => {
            M.loop = loopNext[M.loop];
            loopBtn.textContent = LOOP[M.loop];
            loopBtn.title = { all: "列表循环", one: "单曲循环", none: "不循环" }[M.loop];
            audio.loop = M.loop === "all";
        });
        if (loopBtn) { loopBtn.textContent = LOOP.all; loopBtn.title = "列表循环"; }

        // 音量
        const volBtn = $("#musicVolume");
        volBtn?.addEventListener("click", () => {
            M.volume = M.volume > 0 ? 0 : 0.6;
            audio.volume = M.volume;
            volBtn.textContent = M.volume > 0 ? "🔊" : "🔇";
        });
        audio.volume = M.volume;

        // 进度条
        const seek = $("#musicSeek");
        seek?.addEventListener("input", () => {
            if (audio.duration) audio.currentTime = (seek.value / 100) * audio.duration;
        });

        // 音频事件
        audio.addEventListener("timeupdate", () => {
            if (!audio.duration) return;
            seek.value = String((audio.currentTime / audio.duration) * 100);
            $("#musicCur").textContent = fmtTime(audio.currentTime);
            $("#musicDur").textContent = fmtTime(audio.duration);
        });
        audio.addEventListener("ended", () => next(true));
        audio.addEventListener("play", () => { M.playing = true; updateNowPlaying(); });
        audio.addEventListener("pause", () => { M.playing = false; updateNowPlaying(); });
        audio.addEventListener("error", () => {
            M.playing = false;
            updateNowPlaying();
        });

        // 歌单切换
        $("#musicPlaylistSel")?.addEventListener("change", () => {
            const pl = M.playlists.find(p => p.id === $("#musicPlaylistSel").value);
            M.queue = pl ? pl.tracks.slice() : M.tracks.map(t => t.id);
            M.index = -1;
            renderList();
            updateNowPlaying();
        });

        // 键盘：空格播放/暂停（不在输入框里时）
        document.addEventListener("keydown", (e) => {
            if (e.code !== "Space") return;
            const tag = (e.target.tagName || "").toLowerCase();
            if (tag === "input" || tag === "textarea" || tag === "select") return;
            e.preventDefault();
            toggle();
        });

        // Esc 关闭面板
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && M.panelOpen) closePanel();
        });

        renderPlaylists();
        renderList();
        updateNowPlaying();

        // 暴露给站点其他部分 / music.html
        window.MusicPlayer = {
            state: M,
            play: (id) => {
                const i = M.queue.indexOf(id);
                if (i >= 0) M.index = i;
                else { M.queue.push(id); M.index = M.queue.length - 1; }
                load(true);
                openPanel();
            },
            open: openPanel,
            close: closePanel,
        };
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
