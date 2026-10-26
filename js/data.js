/* ============================================================
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

window.SITE_DATA = {
    layout: {
        order: ["home", "links", "milestones", "works", "notes", "gallery"],
        pinned: [],
        hidden: []
    }  /* 页面布局（板块顺序 / 钉住 / 隐藏） */,
    sections: {
        links: {
            title: "✨ 常用链接",
            sub: "常去的地方，点一下就过去"
        },
        milestones: {
            title: "🏔️ 成长里程碑",
            sub: "那些回想起来会感慨的时刻"
        },
        works: {
            title: "🧩 作品集",
            sub: "在做的和做完的东西，慢慢添"
        },
        notes: {
            title: "📔 日常记录",
            sub: "一些碎碎念，按时间往下翻"
        },
        gallery: {
            title: "🖼️ 照片墙",
            sub: "点开看大图"
        }
    },
    music: {
        tracks: [
            {
                id: "t-mvpa3np9-1",
                title: "Departures 〜あなたにおくるアイの歌〜（Acoustic Ver.） (from BE",
                artist: "",
                src: "music/Departures-歌-Acoustic-Ver-from-BE-20261026.mp3",
                cover: ""
            },
            {
                id: "t-mvpa5ntx-2",
                title: "速攻归宅",
                artist: "【Amour 】Étoile",
                src: "music/速攻归宅---Amour-toile-20261026.mp3",
                cover: ""
            }
        ],
        playlists: [
            {
                id: "p1",
                name: "默认列表",
                desc: "开站即听的那些",
                tracks: ["t-mvpa3np9-1", "t-mvpa5ntx-2"]
            }
        ],
        recommend: [
            {
                id: "r1",
                title: "在网易云发现更多",
                desc: "收藏夹里的常听列表",
                url: "https://music.163.com",
                platform: "网易云音乐"
            }
        ]
    }  /* 音乐库（tracks 歌曲 / playlists 歌单 / recommend 外链推荐） */,
    profile: {
        name: "Rin9",
        title: "日常记录 · 未来作品集",
        tagline: "写代码、看黄昏、收集碎碎念",
        intro: "这里存放我的日常片段与在做的作品。左手记录生活，右手慢慢造东西 —— 作品大多从小项目开始，长出来的过程比结果更有意思。",
        avatar: "img/profile.webp",
        bgm: "music/bgm.wav",
        location: "中国",
        email: "1738177703@qq.com"
    }  /* 基本资料 */,
    links: [
        {
            icon: "🎵❤️",
            name: "我的网易云主页",
            url: "https://music.163.com/#/user/home?id=3273844574"
        },
        {
            icon: "📺",
            name: "我的bilibili主页",
            url: "https://space.bilibili.com/501867168?spm_id_from=333.1007.0.0"
        },
        {
            icon: "🎶",
            name: "我的抖音主页",
            url: "https://www.douyin.com/user/self?from_tab_name=Rin9"
        },
        {
            icon: "🐱",
            name: "我的GitHub主页",
            url: "https://github.com/OoRin9oO"
        }
    ]  /* 常用链接 */,
    milestones: [
        {
            date: "2026-10-26",
            title: "为网站制作了一个更加便捷的编辑器",
            desc: "为自己的网站添加了更多的信息，同时制作了一个更加便捷的编辑器",
            icon: "✦"
        },
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
    ]  /* 成长里程碑（按时间倒序，最新的放最前） */,
    works: [
        {
            title: "关于本网站",
            desc: "纯静态的个人主页，记录日常与作品。GitHub Pages 托管，没有后端，加内容只改一个数据文件。",
            status: "wip",
            cover: "img/a-20261025-a.webp",
            tags: ["HTML", "CSS", "JavaScript"],
            links: [
                {
                    label: "源码",
                    url: "https://github.com/OoRin9oO/OoRin9oO.github.io"
                }
            ]
        },
        {
            title: "爱依计划",
            desc: "这是一个用来约束我自己和AI灵魂的项目，通过不断提升自我与完善AI对我的印象来得到一个对自我的更加深刻的认识。",
            status: "wip",
            tags: ["AI", "自我"],
            cover: "img/o-20261026-o.webp"
        },
        {
            title: "一个病娇小游戏",
            desc: "这是一个即兴开发的小游戏，目标是不断提升运用电脑软件工具的能力，达到人与AI一起发展的美好愿景",
            status: "wip",
            tags: ["游戏", "AI"],
            cover: "img/n-20261026-n.webp"
        },
        {
            title: "被伪装修女的创世神养大了！",
            desc: "这是一本我写的原创内容的小说，有兴趣的时候才会更新，目前已经累计写了5w字，可在番茄上直接搜索观看。",
            status: "wip",
            tags: ["小说", "轻小说"],
            cover: "img/p-20261026-p.webp"
        },
        {
            title: "Github娘-project！",
            desc: "这是一个IP企划，为Github创建了一个符合我心目中的形象，未来会不断更新她的图片与视频内容。",
            status: "wip",
            cover: "img/k-20261026-k.webp",
            tags: ["原创IP", "视频", "图片"]
        },
        {
            title: "植物大战僵尸野狗改版",
            desc: "这是一个如同笑话般的对于植物大战僵尸的改版，只是一时兴起的项目，目前不打算制作。",
            status: "plan",
            tags: ["游戏", "二创"]
        }
    ]  /* 作品集（status: done 完成 / wip 进行中 / plan 规划中） */,
    notes: [
        {
            date: "2026-10-26",
            title: "开始正式整理日子",
            desc: "昨天晚上和今天想了太多的事情，于是我下定了决心，将日常的重大事件以及做了什么都放到这个日常记录板块来。\n有可能是我的抱怨，也有可能是我的喜悦。\n报告今天做到的事情：为网站做了个可直接编辑的项目，为病娇小游戏添加了循声系统，更又创建了一个新的oc角色",
            images: ["img/k-20261026-k.webp"]
        },
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
    ]  /* 日常记录（images 配图可点击放大） */,
    gallery: [
        {
            src: "img/s-20261026-s.webp",
            caption: "我……我也要比心吗"
        },
        {
            src: "img/r-20261026-r.webp",
            caption: "suki……"
        },
        {
            src: "img/a-20261025-a.webp",
            caption: "章鱼与猫耳少女"
        },
        {
            src: "img/b-20261025-b.webp",
            caption: "楼梯上的便当"
        },
        {
            src: "img/c-20261025-c.webp",
            caption: "纸箱与章鱼精灵"
        },
        {
            src: "img/d-20261025-d.webp",
            caption: "拉章鱼"
        },
        {
            src: "img/e-20261025-e.webp",
            caption: "冬日比心"
        },
        {
            src: "img/f-20261025-f.webp",
            caption: "荆棘与红瞳"
        },
        {
            src: "img/g-20261025-g.webp",
            caption: "白发的招呼"
        },
        {
            src: "img/h-20261025-h.webp",
            caption: "粉发的兔耳"
        }
    ]  /* 照片墙（按原始比例完整显示，不裁剪） */
};
