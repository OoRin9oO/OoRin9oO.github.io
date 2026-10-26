# 🎐 Rin9's Website

个人网站 —— 记录日常 + 成长故事 + 未来作品集。纯静态，GitHub Pages 免费托管。

---

## 🚀 最快的编辑方式：可视化编辑器

**双击 `start-editor.bat`**（或 `启动编辑器.bat`），浏览器会自动打开编辑器。

左边选板块，中间填内容，**右边实时预览**。改完点「保存到本地」写回文件，
再点「保存并发布」直接推到 GitHub，Pages 一分钟内自动上线。

### 编辑器能做什么

| 操作 | 怎么做 |
|---|---|
| 改文字 | 中间表单直接改，右侧实时更新 |
| 加一条内容 | 右上角「＋ 新增一条」 |
| 加标签 | 输入框里敲一下回车，标签会变成可删除的小圆片 |
| 加图片 | **把图拖进虚线框**，自动压缩成 webp 并按「字母-日期-字母」命名 |
| 换封面 | 作品集的「封面图」字段拖图进去 |
| 换头像/简介/音乐 | 侧栏「⚙️ 基本资料」 |
| 删除 | 每条右侧的 🗑 按钮 |

### 两个保存按钮的区别

- **💾 保存到本地** —— 写回你硬盘上的 `js/data.js` 和 `img/` 图片。
  第一次点会让你选一次文件夹（选网站根目录 `OoRin9oO.github.io`），之后浏览器记住。
  需要用 **Edge 或 Chrome**（Firefox 不支持直接写文件）。
- **🚀 保存并发布** —— 直接提交到 GitHub 并推送，线上自动更新，不用开终端敲 git。

### 首次使用「保存并发布」要先填令牌

侧栏「🚀 发布设置」→ 填 Personal Access Token：

1. GitHub → 右上角头像 → Settings
2. 左侧最下面 → Developer settings
3. Personal access tokens → Tokens (classic) → Generate new token
4. 勾选 `repo`（公开仓库勾 `public_repo` 就够），设个有效期
5. 复制那串 `github_pat_...` 粘进去，点「🔌 测试连接」验证

令牌只存在你本机浏览器的 localStorage，不会传到任何第三方。

---

## 目录结构

```
├── admin.html         📝 可视化编辑器（编辑网站用这个）
├── index.html         站点页面
├── css/style.css      站点样式
├── css/admin.css      编辑器样式
├── js/data.js         ⭐ 站点内容（编辑器会自动维护这个文件）
├── js/main.js         站点交互逻辑
├── js/admin.js        编辑器逻辑
├── img/               图片
├── music/             背景音乐
├── inbox/             📥 批量投递箱（给脚本用的老办法）
├── tools/serve.py     本地服务器（启动器调它）
├── tools/ingest.py    批量导入脚本
├── start-editor.bat   🚀 双击这个打开编辑器
└── robots.txt
```

---

## 老的办法：批量投递（需要处理很多张图时更省事）

图片丢进 `inbox/`，写 `inbox/manifest.json`，跑：

```bash
python tools/ingest.py
```

脚本自动压缩、规范命名、合并进 `js/data.js`、归档原图。
参数：`--dry-run` 预览不落盘，`--no-img` 只导文案。

单张图、少量改动，**直接用编辑器更快**，不用碰命令行。

---

## 怎么加内容（手动改 data.js）

所有内容都是数据，改 `js/data.js` 就行，不用碰 HTML。

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

## 图片命名规范

**格式：`字母-日期-字母`**，例如 `a-20261025-a.webp`

- 前一个字母 = 序号（a、b、c…按投递顺序）
- 中间日期 = 投递日期（YYYYMMDD）
- 后一个字母 = 序号重复，用于快速肉眼校验排序

这样命名的三个好处：

1. **不会撞名**——不同批次同一天投递也不会覆盖
2. **一眼看出顺序**——字母序就是展示顺序
3. **URL 安全**——纯 ASCII，GitHub Pages / CDN / 各浏览器都不用做转义

同一张图出现在多处（日常记录配图 + 照片墙）时共用同一个文件名，不会重复存。

## 图片显示规则

照片墙用 **CSS 多列瀑布流**，图片按**原始比例完整显示，绝不裁剪、不拉伸**：

- 竖图保持竖的，横图保持横的，方图保持方的
- 等比缩放只用于控制体积（长边上限 1600px），不改变宽高比
- 灯箱里同样完整显示，不会裁掉上下或左右

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

右上角 ☀️ 按钮切换深色 / 浅色，选择会记在浏览器本地。编辑器右上角也有独立的切换。

## 本地预览

```bash
python tools/serve.py
```

或者直接双击 `start-editor.bat`（等价，且会自动开浏览器）。

## 部署

推到 GitHub 后，在仓库 Settings → Pages → Source 选 `main` 分支根目录即可。

## 图片建议

- 长边 1600px 以内最合适，再大徒增体积
- webp 格式画质/体积比最优，编辑器会自动转
- 带透明通道的 PNG 会保留为 PNG，不会被压成黑底 JPG
- 单张图控制在 200KB 以内，页面滚动会更顺

