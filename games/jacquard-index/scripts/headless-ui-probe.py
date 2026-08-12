#!/usr/bin/env python3
"""Headless Chromium probe: boot dist, click menus, assert 0 console errors."""

from __future__ import annotations

import http.server
import socketserver
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "dist/jacquard-index.html"
if not HTML.exists():
    raise SystemExit("dist missing — run npm run build first")

BODY = HTML.read_bytes()


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(BODY)))
        self.end_headers()
        self.wfile.write(BODY)

    def log_message(self, *_args):
        return


httpd = socketserver.TCPServer(("127.0.0.1", 0), Handler)
port = httpd.server_address[1]
thread = threading.Thread(target=httpd.serve_forever, daemon=True)
thread.start()
url = f"http://127.0.0.1:{port}/"

console_messages: list[str] = []
page_errors: list[str] = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    page.on("console", lambda msg: console_messages.append(f"{msg.type}: {msg.text}"))
    page.on("pageerror", lambda err: page_errors.append(str(err)))
    page.goto(url, wait_until="load")
    page.wait_for_timeout(250)

    def click_native(nx: float, ny: float) -> None:
        box = page.evaluate(
            """({ nx, ny }) => {
              const canvas = document.getElementById('jacquard');
              const rect = canvas.getBoundingClientRect();
              const BASE_W = 640, BASE_H = 360;
              const scale = Math.min(canvas.width / BASE_W, canvas.height / BASE_H);
              const dispW = BASE_W * scale, dispH = BASE_H * scale;
              const offX = Math.floor((canvas.width - dispW) / 2);
              const offY = Math.floor((canvas.height - dispH) / 2);
              const cssScaleX = rect.width / canvas.width;
              const cssScaleY = rect.height / canvas.height;
              return {
                x: rect.left + (offX + nx * scale) * cssScaleX,
                y: rect.top + (offY + ny * scale) * cssScaleY,
              };
            }""",
            {"nx": nx, "ny": ny},
        )
        page.mouse.click(box["x"], box["y"])
        page.wait_for_timeout(100)

    # Title master-card center -> index
    click_native(320, 180)
    # THE LOOM drawer
    click_native(200, 90)
    # Teaching card
    click_native(140, 150)
    page.wait_for_timeout(150)

    with page.expect_download() as dl_info:
        page.keyboard.press("F2")
    download = dl_info.value
    log_path = ROOT / "runs" / "uiround-headless-log.txt"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    download.save_as(str(log_path))
    log_text = log_path.read_text(encoding="utf-8", errors="replace")

    state = page.evaluate(
        """() => {
          const canvas = document.getElementById('jacquard');
          return {
            canvas: !!(canvas && canvas.width > 0 && canvas.height > 0),
            cw: canvas ? canvas.width : 0,
            ch: canvas ? canvas.height : 0,
          };
        }"""
    )
    browser.close()

httpd.shutdown()

if page_errors:
    raise SystemExit("PAGE ERRORS:\n" + "\n".join(page_errors))
if console_messages:
    raise SystemExit("CONSOLE:\n" + "\n".join(console_messages))
if not state.get("canvas"):
    raise SystemExit("canvas missing after boot")
if "OPEN INDEX" not in log_text:
    raise SystemExit(f"mouse title click did not open index:\n{log_text}")
if "opened THE LOOM" not in log_text:
    raise SystemExit(f"mouse loom click did not open drawer:\n{log_text}")
if "index: open" not in log_text:
    raise SystemExit(f"mouse card click did not open a card:\n{log_text}")
if "[ERROR]" in log_text:
    raise SystemExit(f"in-game errors:\n{log_text}")

print(f"headless probe OK @ {url}")
print(f"canvas {state['cw']}x{state['ch']}; synthetic clicks: title + loom + teaching card")
print(f"console messages: {len(console_messages)}; page errors: {len(page_errors)}")
print(f"in-game log verified OPEN INDEX + opened THE LOOM + index: open ({log_path.name})")
