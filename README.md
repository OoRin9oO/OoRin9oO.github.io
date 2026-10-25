# 🎐 Rin9's Website

个人网站 —— 记录日常 + 成长故事 + 未来作品集。纯静态，GitHub Pages 免费托管。

---

## 目录结构

```
├── index.html        页面结构
├── css/style.css     全部样式
├── js/data.js        ⭐ 网站内容
├── js/main.js        交互逻辑
├── img/              图片（自动压缩后的产物）
├── music/            背景音乐
├── inbox/            📥 内容投递箱 —— 以后内容丢这里
└── tools/ingest.py   接料管线脚本
```

---

## 两种加内容的方式

### 方式一：丢进 inbox（推荐，省心）

你只需要做三步：

**1. 把图片丢进 `inbox/` 目录**（随便多少张）

**2. 在 `inbox/manifest.json` 里写清楚这些图配什么文案**

**3. 跑一条命令**

```bash
python tools/ingest.py
```

脚本会自动做完这些事：

- 把图片压缩成 webp（长边 1600px 内），体积通常降到原图的 1/10 甚至 1/50
- 按「日期-用途-序号-标题」规范命名，存进 `img/`
- 按 manifest 的说明合并进 `js/data.js`
- 把处理过的原始文件归档到 `inbox/_archive/`，不会重复导入
- 清空 manifest.json，可以直接写下一批

manifest.json 格式（用不到的键直接删掉）：

```json
{
  "notes": [
    {
      "date": "2026-11-01",
      "title": "标题",
      "desc": "正文，随便写",
      "images": ["IMG:IMG_0001.jpg"]
    }
  ],
  "works": [
    {
      "title": "作品名",
      "desc": "说明",
      "status": "wip",
      "cover": "IMG:IMG_0002.jpg",
      "tags": ["Python"],
      "links": [{ "label": "源码", "url": "https://..." }]
    }
  ],
  "milestones": [
    { "date": "2026-11-01", "title": "大事", "desc": "描述", "icon": "🎉" }
  ],
  "gallery": [
    { "src": "IMG:IMG_0003.jpg", "caption": "照片说明" }
  ]
}
```

`IMG:` 前缀表示"本次投递的图片"，脚本会替换成实际路径。
同一张图可以在多处引用（notes + gallery），只会处理一次。

其他参数：

```bash
python tools/ingest.py --dry-run   # 只看会做什么，不改文件
python tools/ingest.py --no-img    # 只合并文案，不处理图片
```

### 方式二：直接改 `js/data.js`

内容全是数据，改这个文件就行，不用碰 HTML。

**加一个作品** → 往 `works` 数组加：

```js
{
    title: "我的新项目",
    desc: "一句话说明这个项目做了什么。",
    status: "wip",                // done 已完成 / wip 进行中 / plan 规划中
    cover: "img/shot-01.jpg",      // 可选，封面图
    tags: ["JavaScript", "CSS"],   // 标签会自动汇总到筛选条
    links: [
        { label: "源码", url: "https://github.com/..." },
        { label: "演示", url: "https://example.com" }
    ]
}
```

**加一条日常记录** → 往 `notes` 数组加：

```js
{
    date: "2026-10-26",
    title: "标题",
    desc: "随手写点什么。",
    images: ["img/shot-02.jpg"]    // 可选，显示为小图组，可点击放大
}
```

**加一个里程碑** → 往 `milestones` 数组加（按时间倒序，最新的放最前）：

```js
{ date: "2026-10-26", title: "第一次...", desc: "描述", icon: "🎉" }
```

**加一张照片** → 往 `gallery` 数组加：

```js
{ src: "img/photo1.jpg", caption: "照片说明" }
```

**加一个常用链接** → 往 `links` 数组加：

```js
{ icon: "🎮", name: "steam", url: "https://steam.com" }
```

**换背景音乐** → 音频文件放进 `music/`，改 `js/data.js` 的 `profile.bgm`。
推荐 mp3（体积小），当前用的 `music/bgm.wav` 是临时生成的合成音。

**换头像 / 改个人信息** → 改 `js/data.js` 的 `profile` 字段。

---

## 板块增删

想加一个新板块（比如「技能」「友链」）：

1. 在 `index.html` 里加一个 `<section class="section" id="xxx">`
2. 在 `css/style.css` 里加对应样式（照抄 `.works-grid` 或 `.milestone` 那块）
3. 在 `js/data.js` 里加数据，在 `js/main.js` 里加一个 `renderXxx()` 函数
4. 在 `js/main.js` 的 `renderProfile()` 旁边调用它
5. 导航栏加一行 `<a href="#xxx">名字</a>`

想**删掉**一个板块：把 `index.html` 里对应的 `<section>` 整块删掉，
再把 `js/main.js` 里对应的 `renderXxx()` 定义和调用都删掉即可。

---

## 主题

右上角 ☀️ 按钮切换深色 / 浅色，选择会记在浏览器本地。

## 本地预览

```bash
python -m http.server 8080
```

然后访问 http://localhost:8080

（直接双击 `index.html` 也能看，但用本地服务器更接近线上效果。）

## 部署

推到 GitHub 后，在仓库 Settings → Pages → Source 选 `main` 分支根目录即可。

## 图片建议

- 长边 1600px 以内最合适，再大徒增体积
- webp 格式画质/体积比最优，脚本会自动转
- 带透明通道的 PNG 会保留为 PNG，不会被压成黑底 JPG
- 单张图控制在 200KB 以内，页面滚动会更顺
