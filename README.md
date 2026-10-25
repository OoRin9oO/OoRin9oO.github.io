# 🎐 Rin9's Website

个人网站 —— 记录日常 + 未来作品集。纯静态，GitHub Pages 免费托管。

---

## 目录结构

```
├── index.html        页面结构
├── css/style.css     全部样式
├── js/data.js        ⭐ 网站内容（改这个就够了）
├── js/main.js        交互逻辑
├── img/              图片
└── music/            背景音乐
```

## 怎么加内容

**所有文字内容都在 `js/data.js` 里，不用碰 HTML。**

### 加一个作品

打开 `js/data.js`，往 `works` 数组里加一段：

```js
{
    title: "我的新项目",
    desc: "一句话说明这个项目做了什么。",
    status: "wip",              // done 已完成 / wip 进行中 / plan 规划中
    tags: ["JavaScript", "CSS"], // 标签会自动汇总到筛选条
    links: [
        { label: "源码", url: "https://github.com/..." },
        { label: "演示", url: "https://example.com" }
    ]
}
```

### 加一条日常记录

往 `notes` 数组里加：

```js
{
    date: "2026-10-26",
    title: "标题",
    desc: "随手写点什么。"
}
```

### 加一张照片

往 `gallery` 数组里加（图片丢进 `img/` 目录）：

```js
{ src: "img/photo1.jpg", caption: "照片说明" }
```

### 加一个常用链接

往 `links` 数组里加：

```js
{ icon: "🎮", name: "steam", url: "https://steam.com" }
```

### 换背景音乐

把音频文件放进 `music/`，然后改 `js/data.js` 里的 `profile.bgm`。
推荐 mp3（体积小），当前用的 `music/bgm.wav` 是临时生成的合成音。

### 换头像 / 改个人信息

改 `js/data.js` 的 `profile` 字段。

## 板块增删

想加一个新板块（比如「技能」「友链」）：

1. 在 `index.html` 里加一个 `<section class="section" id="xxx">`
2. 在 `css/style.css` 里加对应样式（可以照抄 `.works-grid` 那块）
3. 在 `js/data.js` 里加数据，在 `js/main.js` 里加一个 `renderXxx()` 函数
4. 导航栏加一行 `<a href="#xxx">名字</a>`

想**删掉**一个板块：把 `index.html` 里对应的 `<section>` 整块删掉，再把 `js/main.js` 里对应的 `renderXxx()` 调用删掉即可。

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
