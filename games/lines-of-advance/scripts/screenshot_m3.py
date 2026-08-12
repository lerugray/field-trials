from playwright.sync_api import sync_playwright
from pathlib import Path
from datetime import date

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist" / "index.html"
PROOFS = ROOT / "proofs"
PROOFS.mkdir(parents=True, exist_ok=True)
TODAY = date.today().isoformat()

VIEWPORTS = [
    ("1280x800", 1280, 800),
    ("1440x900", 1440, 900),
    ("2560x1440", 2560, 1440),
]

def click(page, coord):
    page.locator(f'[data-coord="{coord}"]').first.click(force=True)
    page.wait_for_timeout(150)

with sync_playwright() as p:
    browser = p.chromium.launch()

    for name, w, h in VIEWPORTS:
        page = browser.new_page(viewport={"width": w, "height": h})
        page.goto(f"file://{DIST}")
        page.wait_for_selector(".board-svg")
        page.locator('button:has-text("Comms Drill")').first.click()
        page.wait_for_timeout(150)
        click(page, "e17")
        path = PROOFS / f"m3-{name}-{TODAY}.png"
        page.screenshot(path=str(path))
        print(f"Captured {path}")
        page.close()

    # Comms-cut proof: load the cut demo and select a disabled North unit.
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    page.goto(f"file://{DIST}")
    page.wait_for_selector(".board-svg")
    page.locator('button:has-text("Cut Demo")').first.click()
    page.wait_for_timeout(150)
    click(page, "e17")
    path = PROOFS / f"m3-comm-cut-{TODAY}.png"
    page.screenshot(path=str(path))
    print(f"Captured {path}")
    page.close()

    # Audit-panel proof: select the indirectly disabled adjacent unit.
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    page.goto(f"file://{DIST}")
    page.wait_for_selector(".board-svg")
    page.locator('button:has-text("Cut Demo")').first.click()
    page.wait_for_timeout(150)
    click(page, "f17")
    path = PROOFS / f"m3-audit-{TODAY}.png"
    page.screenshot(path=str(path))
    print(f"Captured {path}")
    page.close()

    browser.close()
