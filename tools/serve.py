#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
serve.py —— 本地服务器 + 自动开浏览器

用法：
    python tools/serve.py            # 启动并打开 http://localhost:8123
    python tools/serve.py --port 9000
    python tools/serve.py --no-open  # 不自动开浏览器
"""

import http.server
import os
import socketserver
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
    print("  Ctrl+C 停止")
    print("=" * 52)

    if OPEN:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")
        httpd.server_close()
