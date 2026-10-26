#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
serve.py —— 本地服务器 + 自动开浏览器 + 发布接口

用法：
    python tools/serve.py            # 启动并打开 http://localhost:8123
    python tools/serve.py --port 9000
    python tools/serve.py --no-open  # 不自动开浏览器
"""

import http.server
import json
import os
import socketserver
import subprocess
import sys
import threading
import webbrowser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8123
OPEN = True

for i, a in enumerate(sys.argv):
    if a == "--port" and i + 1 < len(sys.argv):
        PORT = int(sys.argv[i + 1])
    if a == "--no-open":
        OPEN = False


# ============================================================
#  发布接口
#  编辑器把改好的 data.js / 图片 / 音频 POST 过来，
#  由本地服务写盘并执行 git 提交推送。
#  这样不需要用户手动配置 Personal Access Token，
#  直接复用本机 git 已经登录好的凭据。
# ============================================================

def _safe_join(base, rel):
    """把相对路径拼到 base 下，并确保不越界"""
    p = os.path.normpath(os.path.join(base, rel))
    if not p.startswith(os.path.normpath(base)):
        raise ValueError("路径越界: " + rel)
    return p


def _run_git(args, timeout=120):
    try:
        r = subprocess.run(
            ["git"] + args,
            cwd=ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
        )
        return r.returncode, (r.stdout or "").strip(), (r.stderr or "").strip()
    except FileNotFoundError:
        return 127, "", "找不到 git 命令，请确认已安装 Git 并加入 PATH"
    except subprocess.TimeoutExpired:
        return 124, "", "git 命令超时"


def do_publish(payload):
    """写文件 + git 提交推送"""
    result = {"ok": False, "steps": []}

    # 1. 写 data.js
    data_js = payload.get("dataJs")
    if data_js:
        p = os.path.join(ROOT, "js", "data.js")
        with open(p, "w", encoding="utf-8", newline="") as f:
            f.write(data_js)
        result["steps"].append("已写入 js/data.js")

    # 2. 写图片
    imgs = payload.get("images") or []
    for it in imgs:
        name = it.get("name")
        b64 = it.get("data")
        if not name or not b64:
            continue
        import base64
        raw = base64.b64decode(b64)
        p = _safe_join(os.path.join(ROOT, "img"), name)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "wb") as f:
            f.write(raw)
        result["steps"].append("已写入 img/" + name)

    # 3. 写音频
    auds = payload.get("audio") or []
    for it in auds:
        name = it.get("name")
        b64 = it.get("data")
        if not name or not b64:
            continue
        import base64
        raw = base64.b64decode(b64)
        p = _safe_join(os.path.join(ROOT, "music"), name)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "wb") as f:
            f.write(raw)
        result["steps"].append("已写入 music/" + name)

    # 4. git 提交
    msg = (payload.get("message") or "更新网站内容").strip()
    code, out, err = _run_git(["add", "-A"])
    if code != 0:
        result["error"] = "git add 失败：" + (err or out)
        return result

    # 没有改动就不提交
    code, out, err = _run_git(["status", "--porcelain"])
    if code != 0:
        result["error"] = "git status 失败：" + (err or out)
        return result
    if not out.strip():
        result["ok"] = True
        result["message"] = "本地内容与线上已一致，无需提交"
        return result

    code, out, err = _run_git(["commit", "-m", msg])
    if code != 0:
        # 没有变化也算成功
        if "nothing to commit" in (out + err).lower() or "无文件要提交" in (out + err):
            result["ok"] = True
            result["message"] = "内容无变化"
            return result
        result["error"] = "git commit 失败：" + (err or out)
        return result
    result["steps"].append("已提交：" + out.splitlines()[0] if out else "已提交")

    # 5. 推送
    branch = payload.get("branch") or "main"
    code, out, err = _run_git(["push", "origin", branch], timeout=180)
    if code != 0:
        result["error"] = "git push 失败：" + (err or out)
        result["hint"] = ("如果提示需要登录，说明本机 git 还没配置凭据。"
                         "可以先在终端跑一次 git push 完成登录，或改用「保存到本地」后手动提交。")
        return result
    result["steps"].append("已推送到 origin/" + branch)

    result["ok"] = True
    result["message"] = "发布成功"
    return result


def do_git_status():
    """给编辑器看当前 git 状态"""
    code, out, err = _run_git(["status", "--porcelain"])
    if code != 0:
        return {"ok": False, "error": err or out}
    code2, branch, _ = _run_git(["rev-parse", "--abbrev-ref", "HEAD"])
    code3, remote, _ = _run_git(["remote", "get-url", "origin"])
    return {
        "ok": True,
        "changes": out.splitlines(),
        "branch": branch if code2 == 0 else "",
        "remote": remote if code3 == 0 else "",
    }


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # 改完存盘后刷新页面必须拿到最新文件，不能吃缓存
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

    def handle_one_request(self):
        # 浏览器会复用/中断连接，遇到 ConnectionReset 不该刷一屏栈回溯
        try:
            super().handle_one_request()
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            self.close_connection = True

    def log_message(self, fmt, *args):
        pass  # 安静一点

    # ---------- API 路由 ----------
    def _send_json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_POST(self):
        path = self.path.split("?")[0]
        if path != "/api/publish":
            self._send_json({"ok": False, "error": "未知接口"}, 404)
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if length > 200 * 1024 * 1024:
                self._send_json({"ok": False, "error": "内容太大"}, 413)
                return
            raw = self.rfile.read(length)
            payload = json.loads(raw.decode("utf-8"))
        except Exception as e:
            self._send_json({"ok": False, "error": "请求解析失败：" + str(e)}, 400)
            return

        try:
            result = do_publish(payload)
        except Exception as e:
            result = {"ok": False, "error": "发布异常：" + str(e)}
        self._send_json(result)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/gitstatus":
            self._send_json(do_git_status())
            return
        super().do_GET()


class Server(socketserver.ThreadingTCPServer):
    # 多线程处理，否则浏览器并发请求多个资源时会排队卡死
    daemon_threads = True
    allow_reuse_address = True


if __name__ == "__main__":
    try:
        httpd = Server(("127.0.0.1", PORT), Handler)
    except OSError:
        print(f"端口 {PORT} 被占用，换一个：python tools/serve.py --port {PORT+1}")
        sys.exit(1)

    url = f"http://localhost:{PORT}/admin.html"
    print("=" * 52)
    print("  Rin9 网站本地编辑器")
    print("=" * 52)
    print(f"  编辑器   {url}")
    print(f"  站点预览 http://localhost:{PORT}/")
    print(f"  根目录   {ROOT}")
    print("-" * 52)
    print("  发布功能已启用：直接点「保存并发布」即可，")
    print("  会用本机 git 凭据提交推送，不需要配置 Token。")
    print("-" * 52)
    print("  Ctrl+C 停止")
    print("=" * 52)

    if OPEN:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")
        httpd.server_close()
