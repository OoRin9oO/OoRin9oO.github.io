#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ingest.py —— 内容接料管线

把 inbox/ 里的图片和文案自动变成站点内容：
  1. 压缩图片（webp + jpg 双格式，体积通常降到原来的 1/20）
  2. 存进 img/ 目录，文件名带日期和用途
  3. 按 inbox/manifest.json 的说明合并进 js/data.js
  4. 处理完的原始文件归档到 inbox/_archive/

用法：
    python tools/ingest.py            # 处理并合并
    python tools/ingest.py --dry-run  # 只看会做什么，不实际改文件
    python tools/ingest.py --no-img   # 只合并文案，不处理图片
"""

import json
import os
import re
import shutil
import sys
import hashlib
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INBOX = os.path.join(ROOT, "inbox")
ARCHIVE = os.path.join(INBOX, "_archive")
IMG_DIR = os.path.join(ROOT, "img")
DATA_JS = os.path.join(ROOT, "js", "data.js")
MANIFEST = os.path.join(INBOX, "manifest.json")

DRY_RUN = "--dry-run" in sys.argv
NO_IMG = "--no-img" in sys.argv

IMG_EXT = (".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp")
MAX_EDGE = 1600      # 长边上限
JPEG_QUALITY = 82
WEBP_QUALITY = 78

CATEGORIES = ("notes", "works", "milestones", "gallery")

# 批次日期，由 manifest 顶层的 "date" 决定
BATCH_DATE = ""


# ---------- 工具 ----------

def log(msg):
    print(msg, flush=True)


def load_manifest():
    if not os.path.exists(MANIFEST):
        sys.exit("✗ 找不到 inbox/manifest.json，先照 inbox/README.md 的格式写一个")
    with open(MANIFEST, "r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError as e:
            sys.exit(f"✗ manifest.json 格式错误：{e}")


def list_inbox_images():
    """列出 inbox/ 下的图片（不含归档目录和说明文件）"""
    out = []
    if not os.path.isdir(INBOX):
        return out
    for name in sorted(os.listdir(INBOX)):
        p = os.path.join(INBOX, name)
        if not os.path.isfile(p):
            continue
        if name.lower().endswith(IMG_EXT):
            out.append(name)
    return out


def try_pillow():
    try:
        from PIL import Image
        return Image
    except ImportError:
        return None


def slug(text, maxlen=24):
    """
    把标题变成文件名前缀。
    纯 ASCII 安全：中文等非 ASCII 字符会被替换掉，
    因为中文文件名在 URL 里需要转义，某些环境（CDN、老浏览器）会出问题。
    结果为空时用哈希兜底。
    """
    s = str(text)
    # 先把连续的 CJK 字符取首字，拼成拼音首字母式的短标识意义不大，
    # 这里直接剥离非 ASCII，保留能表达内容的英文/数字
    ascii_part = re.sub(r"[^A-Za-z0-9]+", "-", s).strip("-").lower()
    if ascii_part:
        return ascii_part[:maxlen].strip("-")

    # 全中文标题：用标题内容的哈希生成稳定短名
    h = hashlib.md5(s.encode("utf-8")).hexdigest()[:8]
    return f"item-{h}"


def unique_path(base):
    """避免覆盖同名文件"""
    out = base
    i = 2
    while os.path.exists(out):
        root, ext = os.path.splitext(base)
        out = f"{root}-{i}{ext}"
        i += 1
    return out


def process_image(src_path, out_stem):
    """
    生成 out_stem.webp 和 out_stem.jpg（若原图本身是 png 且带透明，
    则额外保留 png）。返回 (webp_rel, jpg_rel)
    """
    Image = try_pillow()
    if Image is None:
        log("  ⚠ 没装 Pillow，跳过图片压缩（pip install pillow 可解决）")
        rel = os.path.relpath(src_path, ROOT).replace("\\", "/")
        return rel, rel

    im = Image.open(src_path)
    has_alpha = im.mode in ("RGBA", "LA", "P") and (
        "transparency" in im.info or im.mode in ("RGBA", "LA")
    )

    # 超大图先缩
    w, h = im.size
    if max(w, h) > MAX_EDGE:
        scale = MAX_EDGE / max(w, h)
        im = im.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    # 只输出实际会被引用的那一种格式，避免仓库里堆无用文件：
    #   - 带透明通道 → png（转 jpg 会黑底）
    #   - 不透明     → webp（体积最小，全浏览器支持）
    # 若首选格式转换失败，再退回备选
    if has_alpha:
        png_path = unique_path(os.path.join(IMG_DIR, out_stem + ".png"))
        try:
            im.convert("RGBA").save(png_path, "PNG", optimize=True)
            return None, os.path.relpath(png_path, ROOT).replace("\\", "/")
        except Exception as e:
            log(f"  ⚠ png 转换失败：{e}")
            return None, None

    webp_path = unique_path(os.path.join(IMG_DIR, out_stem + ".webp"))
    try:
        im.convert("RGB").save(webp_path, "WEBP", quality=WEBP_QUALITY, method=6)
        return os.path.relpath(webp_path, ROOT).replace("\\", "/"), None
    except Exception as e:
        log(f"  ⚠ webp 转换失败，退回 jpg：{e}")

    jpg_path = unique_path(os.path.join(IMG_DIR, out_stem + ".jpg"))
    try:
        im.convert("RGB").save(jpg_path, "JPEG", quality=JPEG_QUALITY,
                               optimize=True, progressive=True)
        return None, os.path.relpath(jpg_path, ROOT).replace("\\", "/")
    except Exception as e:
        log(f"  ⚠ jpg 转换失败：{e}")
        return None, None


def orig_size(p):
    try:
        return os.path.getsize(p)
    except OSError:
        return 0


# ---------- 修改 js/data.js ----------

def read_data_js():
    if not os.path.exists(DATA_JS):
        sys.exit("✗ 找不到 js/data.js")
    with open(DATA_JS, "r", encoding="utf-8") as f:
        return f.read()


def upsert_into_array(text, category, new_items):
    """
    把 new_items 追加到 data.js 里 window.SITE_DATA.<category> 数组末尾。
    用文本定位数组的结尾，插入格式化好的条目。
    """
    if not new_items:
        return text, 0

    key = f"{category}: ["
    idx = text.find(key)
    if idx == -1:
        log(f"  ⚠ data.js 里找不到 {category} 数组，跳过")
        return text, 0

    # 找到该数组的闭合 ']'
    start = text.index("[", idx)
    depth = 0
    end = -1
    for i in range(start, len(text)):
        if text[i] == "[":
            depth += 1
        elif text[i] == "]":
            depth -= 1
            if depth == 0:
                end = i
                break
    if end == -1:
        log(f"  ⚗ {category} 数组解析失败，跳过")
        return text, 0

    body = text[start + 1:end].rstrip()
    if body and not body.endswith(","):
        body += ","

    entries = []
    for it in new_items:
        # 紧凑数组（tags/links 之类）保持单行，其余字段按 4 空格缩进展开，
        # 与文件里手写部分的风格保持一致
        compact_keys = {"tags", "links", "images"}
        # 固定字段顺序，不依赖 manifest 里键的书写顺序
        order = ["date", "title", "desc", "icon", "status", "cover",
                 "tags", "links", "images", "src", "caption"]
        keys = [k for k in order if k in it] + [k for k in it if k not in order]

        lines = ["        {"]
        for k in keys:
            v = it[k]
            if k in compact_keys:
                lines.append(f"            {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)},")
            else:
                lines.append(f"            {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)},")
        lines.append("        }")
        entries.append("\n".join(lines))
    addition = "\n" + ",\n".join(entries) + "\n    "

    return text[:start + 1] + body + addition + text[end:], len(new_items)


# ---------- 主流程 ----------

def main():
    log("=" * 56)
    log("  内容接料管线  ingest.py")
    log("=" * 56)

    if DRY_RUN:
        log("[试运行] 不会修改任何文件\n")

    manifest = load_manifest()

    # 批次日期：manifest 顶层写 "date" 就用它（这一批内容统一日期），
    # 否则用今天。单个条目里的 date 优先级更高。
    global BATCH_DATE
    BATCH_DATE = manifest.get("date") or ""

    inbox_imgs = list_inbox_images()

    if not inbox_imgs:
        log("inbox/ 里没有图片，仅处理文案")
    else:
        log(f"inbox/ 发现 {len(inbox_imgs)} 张图片：")
        for n in inbox_imgs:
            log(f"  · {n}  ({orig_size(os.path.join(INBOX, n)) / 1024:.0f} KB)")

    # 建立 IMG:文件名 -> 站点路径 的映射
    used_files = set()
    job_stems = {}

    # 先收集所有引用了图片的条目，确定每张图该叫什么
    jobs = []   # (原始文件, 所属分类, 所属条目)
    for cat in CATEGORIES:
        for item in manifest.get(cat, []) or []:
            refs = []
            if cat == "notes":
                refs += item.get("images", []) or []
            elif cat == "works":
                if item.get("cover"):
                    refs.append(item["cover"])
            elif cat == "gallery":
                if item.get("src"):
                    refs.append(item["src"])
            for r in refs:
                if isinstance(r, str) and r.startswith("IMG:"):
                    jobs.append((r[4:], cat, item))

    # 同一张图允许在多处引用（notes + gallery），所以这里只为"首次出现"命名，
    # 后续引用复用同一个目标路径
    counters = {}
    for fname, cat, item in jobs:
        if fname not in inbox_imgs:
            log(f"  ⚠ 引用了不存在的文件：{fname}")
            continue
        if fname in job_stems:
            continue        # 已命名过，复用

        # 日期优先级：条目里的 date > 归档目录的批次日期 > 今天
        d = item.get("date") or BATCH_DATE or date.today().isoformat()
        counters[cat] = counters.get(cat, 0) + 1
        stem = f"{d}-{cat}-{counters[cat]:02d}-{slug(item.get('title') or item.get('caption') or 'img')}"
        job_stems[fname] = stem
        used_files.add(fname)

    # 处理图片
    processed = {}
    if not NO_IMG:
        for fname in sorted(used_files):
            if fname in processed:
                continue
            src = os.path.join(INBOX, fname)
            stem = job_stems.get(fname, f"{date.today().isoformat()}-upload-{fname}")
            log(f"  → 处理 {fname} → {stem}")
            if DRY_RUN:
                processed[fname] = (f"img/{stem}.webp", f"img/{stem}.jpg")
                continue
            os.makedirs(IMG_DIR, exist_ok=True)
            webp_rel, jpg_rel = process_image(src, stem)
            processed[fname] = (webp_rel, jpg_rel)
            final = webp_rel or jpg_rel
            if final:
                log(f"     {final}  ({orig_size(os.path.join(ROOT, final)) / 1024:.0f} KB)")
            else:
                log(f"     ✗ 处理失败，{fname} 将不会被引用")
    else:
        for fname in sorted(used_files):
            processed[fname] = (f"img/{fname}", f"img/{fname}")

    def resolve(ref):
        """把 IMG:xxx 换成实际路径；优先 webp（更小），其次 png/jpg"""
        if not isinstance(ref, str):
            return ref
        if not ref.startswith("IMG:"):
            return ref
        fname = ref[4:]
        pair = processed.get(fname)
        if not pair:
            return ref
        return pair[0] or pair[1]

    # 构造要写入的条目
    new_items = {}

    notes = manifest.get("notes") or []
    if notes:
        out = []
        for n in notes:
            n = dict(n)
            if n.get("images"):
                n["images"] = [resolve(x) for x in n["images"]]
            out.append(n)
        new_items["notes"] = out

    works = manifest.get("works") or []
    if works:
        out = []
        for w in works:
            w = dict(w)
            if w.get("cover"):
                w["cover"] = resolve(w["cover"])
            out.append(w)
        new_items["works"] = out

    ms = manifest.get("milestones") or []
    if ms:
        new_items["milestones"] = [dict(m) for m in ms]

    gal = manifest.get("gallery") or []
    if gal:
        out = []
        for g in gal:
            g = dict(g)
            if g.get("src"):
                g["src"] = resolve(g["src"])
            out.append(g)
        new_items["gallery"] = out

    # 合并进 data.js
    total = 0
    if not DRY_RUN:
        text = read_data_js()
        for cat in CATEGORIES:
            if cat in new_items and new_items[cat]:
                text, n = upsert_into_array(text, cat, new_items[cat])
                log(f"  ✓ 合并 {n} 条到 {cat}")
                total += n
        with open(DATA_JS, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
    else:
        for cat in CATEGORIES:
            if new_items.get(cat):
                log(f"  [试运行] 将合并 {len(new_items[cat])} 条到 {cat}")
                total += len(new_items[cat])

    # 归档
    if not DRY_RUN and used_files:
        os.makedirs(ARCHIVE, exist_ok=True)
        for fname in sorted(used_files):
            shutil.move(os.path.join(INBOX, fname), os.path.join(ARCHIVE, fname))
        log(f"  ✓ 归档 {len(used_files)} 个原始文件到 inbox/_archive/")

    # 重置 manifest
    if not DRY_RUN and total:
        with open(MANIFEST, "w", encoding="utf-8", newline="\n") as f:
            f.write(json.dumps({
                "_说明": "内容已导入并归档。可以写下一批，或直接运行 python tools/ingest.py --reset-manifest 清空此文件。",
                "notes": [], "works": [], "milestones": [], "gallery": []
            }, ensure_ascii=False, indent=2) + "\n")
        log("  ✓ manifest.json 已清空，可以写下一批")

    log("-" * 56)
    if total:
        log(f"完成：新增 {total} 条内容")
        if not DRY_RUN:
            log("下一步：本地预览 python -m http.server 8080")
    else:
        log("没有可导入的内容")
    log("=" * 56)


if __name__ == "__main__":
    main()
