/* ============================================================
   站点内容数据 —— 以后增删板块只需要改这个文件
   每个字段都有中文注释，照葫芦画瓢复制一份即可

   也可以不手改这个文件：
   把图片和文案丢进 inbox/，运行 python tools/ingest.py
   脚本会自动压图、归档、并把内容合并进这里

   图片命名规范：字母-日期-字母（如 a-20261025-a.webp）
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

    /* ---------- 成长里程碑 ----------
       记录那些"回想起来会感慨"的大事件，按时间倒序（最新的放最前）
       icon 用 emoji
    */
    milestones: [
        {
            date: "2026-10-25",
            title: "网站诞生",
            desc: "从一个只有三张卡片的页面，变成了一个真正能装下生活的地方。",
            icon: "🌱"
        },
        {
            date: "2026-09-18",
            title: "决定认真做作品",
            desc: "不再只收藏别人的代码，开始把自己的东西一个个做出来。",
            icon: "🎯"
        }
    ],

    /* ---------- 作品集 ----------
       status 可填: done（完成）/ wip（进行中）/ plan（规划中）
       cover 可选：填图片路径，卡片顶部会显示封面
       想加一条，就复制一段 {} 往上插
    */
    works: [
        {
            title: "这个网站本身",
            desc: "纯静态的个人主页，记录日常与作品。GitHub Pages 托管，没有后端，加内容只改一个数据文件。",
            status: "wip",
            cover: "img/a-20261025-a.webp",
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
       images 可选：数组，填图片路径，会在条目下方显示成小图组（可点击放大）
    */
    notes: [
        {
            date: "2026-10-25",
            title: "网站重构",
            desc: "把原来的三张卡片拆成了导航、链接、作品集、日常记录、照片墙五个板块，背景音乐也修好了。",
            images: ["img/b-20261025-b.webp", "img/c-20261025-c.webp"]
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

    /* ---------- 照片墙 ----------
       图片按原始比例完整显示，不裁剪、不拉伸
       文件名规范：字母-日期-字母（如 a-20261025-a.webp）
    */
    gallery: [
        { src: "img/a-20261025-a.webp", caption: "章鱼与猫耳少女" },
        { src: "img/b-20261025-b.webp", caption: "楼梯上的便当" },
        { src: "img/c-20261025-c.webp", caption: "纸箱与章鱼精灵" },
        { src: "img/d-20261025-d.webp", caption: "拉章鱼" },
        { src: "img/e-20261025-e.webp", caption: "冬日比心" },
        { src: "img/f-20261025-f.webp", caption: "荆棘与红瞳" },
        { src: "img/g-20261025-g.webp", caption: "白发的招呼" },
        { src: "img/h-20261025-h.webp", caption: "粉发的兔耳" }
    ]
};
