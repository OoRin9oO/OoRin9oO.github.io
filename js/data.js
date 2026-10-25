/* ============================================================
   站点内容数据 —— 以后增删板块只需要改这个文件
   每个字段都有中文注释，照葫芦画瓢复制一份即可
   ============================================================ */

window.SITE_DATA = {

    /* ---------- 基本信息 ---------- */
    profile: {
        name: "Rin9",
        title: "日常记录 · 未来作品集",
        tagline: "写代码、看黄昏、收集碎碎念",
        intro:
            "这里存放我的日常片段与在做的作品。左手记录生活，右手慢慢造东西 —— " +
            "作品大多从小项目开始，长出来的过程比结果更有意思。",
        avatar: "img/profile.jpg",
        bgm: "music/bgm.wav",
        location: "中国",
        email: "your-mail@example.com"
    },

    /* ---------- 常用链接 ---------- */
    links: [
        { icon: "📺", name: "bilibili", url: "https://bilibili.com" },
        { icon: "🐱", name: "GitHub", url: "https://github.com/OoRin9oO" },
        { icon: "🧶", name: "yarn", url: "#" },
        { icon: "🌿", name: "catnip", url: "#" }
    ],

    /* ---------- 作品集 ----------
       status 可填: done（完成）/ wip（进行中）/ plan（规划中）
       想加一条，就复制一段 {} 往上插
    */
    works: [
        {
            title: "这个网站本身",
            desc: "纯静态的个人主页，记录日常与作品。GitHub Pages 托管，没有后端，加内容只改一个数据文件。",
            status: "wip",
            tags: ["HTML", "CSS", "JavaScript"],
            links: [
                { label: "源码", url: "https://github.com/OoRin9oO/OoRin9oO.github.io" }
            ]
        },
        {
            title: "占位作品 A",
            desc: "还没想好做什么，先占个位。以后有了真实项目，把这段替换掉即可。",
            status: "plan",
            tags: ["待定"]
        },
        {
            title: "占位作品 B",
            desc: "又一个占位。分类标签会自动汇总到作品集上方的筛选条里。",
            status: "plan",
            tags: ["待定"]
        }
    ],

    /* ---------- 日常记录 ----------
       date 用 YYYY-MM-DD，desc 写点随意的短句
    */
    notes: [
        {
            date: "2026-10-25",
            title: "网站重构",
            desc: "把原来的三张卡片拆成了导航、链接、作品集、日常记录、照片墙五个板块，背景音乐也修好了。"
        },
        {
            date: "2026-09-18",
            title: "开始整理作品",
            desc: "决定把以前写过的零散项目都整理出来，给每个都补上说明和源码链接。"
        },
        {
            date: "2026-08-02",
            title: "一个安静的日子",
            desc: "下午下了场雨，把窗户开着听了一会儿。这种时刻适合什么也不做。"
        }
    ],

    /* ---------- 照片墙 ---------- */
    gallery: [
        { src: "img/shot-01.jpg", caption: "黄昏的天空" },
        { src: "img/shot-02.jpg", caption: "窗边" },
        { src: "img/shot-03.jpg", caption: "午后" },
        { src: "img/shot-04.jpg", caption: "随手一拍" },
        { src: "img/profile.jpg", caption: "本人" }
    ]
};
