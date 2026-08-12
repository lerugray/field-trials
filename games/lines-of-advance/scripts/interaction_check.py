from playwright.sync_api import sync_playwright
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist" / "index.html"
OUT = ROOT / "proofs" / "m2-interaction-2026-08-07.png"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    page.goto(f"file://{DIST}")
    page.wait_for_selector(".board-svg")

    # Select the North arsenal at m1.
    piece = page.locator('[data-coord="m1"] + [data-id], [data-coord="m1"] ~ [data-id]').first
    # The piece is inside a group sibling to the square; use a simpler selector.
    piece = page.locator('g[data-id]').first
    piece.click()
    page.wait_for_timeout(100)

    # Move to m5.
    page.locator('[data-coord="m5"]').click()
    page.wait_for_timeout(100)

    page.screenshot(path=str(OUT))
    print(f"Interaction check saved to {OUT}")
    browser.close()
