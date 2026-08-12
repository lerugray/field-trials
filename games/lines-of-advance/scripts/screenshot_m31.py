from playwright.sync_api import sync_playwright
from pathlib import Path
from datetime import date

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist" / "index.html"
PROOFS = ROOT / "proofs"
PROOFS.mkdir(parents=True, exist_ok=True)
TODAY = date.today().isoformat()
PREFIX = "m3.1"

VIEWPORTS = [
    ("1280x800", 1280, 800),
    ("1440x900", 1440, 900),
    ("2560x1440", 2560, 1440),
]


def click(page, coord):
    # Dispatch a click directly on the square element; this avoids Playwright's
    # pointer-action waits and is robust against SVG piece overlays.
    page.evaluate(f'''() => {{
      const el = document.querySelector('[data-coord="{coord}"]');
      if (el) el.dispatchEvent(new MouseEvent('click', {{ bubbles: true }}));
    }}''')
    page.wait_for_timeout(150)


def click_button(page, label):
    page.locator(f'button:has-text("{label}")').first.click()
    page.wait_for_timeout(150)


with sync_playwright() as p:
    browser = p.chromium.launch()

    # Viewport proofs: Comms Audit preset, selected supplied North infantry.
    for name, w, h in VIEWPORTS:
        page = browser.new_page(viewport={"width": w, "height": h})
        page.goto(f"file://{DIST}")
        page.wait_for_selector(".board-svg")
        click_button(page, "Comms Audit")
        click(page, "e17")
        path = PROOFS / f"{PREFIX}-{name}-{TODAY}.png"
        page.screenshot(path=str(path))
        print(f"Captured {path}")
        page.close()

    # Cut proof: Cut Demo preset, selected disabled North infantry.
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    page.goto(f"file://{DIST}")
    page.wait_for_selector(".board-svg")
    click_button(page, "Cut Demo")
    click(page, "e17")
    path = PROOFS / f"{PREFIX}-comm-cut-{TODAY}.png"
    page.screenshot(path=str(path))
    print(f"Captured {path}")
    page.close()

    # Audit proof: Cut Demo preset, selected indirectly disabled adjacent unit.
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    page.goto(f"file://{DIST}")
    page.wait_for_selector(".board-svg")
    click_button(page, "Cut Demo")
    click(page, "f17")
    path = PROOFS / f"{PREFIX}-audit-{TODAY}.png"
    page.screenshot(path=str(path))
    print(f"Captured {path}")
    page.close()

    # Acceptance: legal moves in rules mode, including one-square destinations.
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    page.goto(f"file://{DIST}")
    page.wait_for_selector(".board-svg")
    click_button(page, "Comms Audit")
    click(page, "e17")  # supplied North infantry
    path = PROOFS / f"{PREFIX}-acceptance-legal-{TODAY}.png"
    page.screenshot(path=str(path))
    print(f"Captured {path}")
    page.close()

    # Acceptance: cut-line state.
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    page.goto(f"file://{DIST}")
    page.wait_for_selector(".board-svg")
    click_button(page, "Cut Demo")
    click(page, "e17")
    path = PROOFS / f"{PREFIX}-acceptance-cut-{TODAY}.png"
    page.screenshot(path=str(path))
    print(f"Captured {path}")
    page.close()

    # Acceptance: audit panel for indirect isolation.
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    page.goto(f"file://{DIST}")
    page.wait_for_selector(".board-svg")
    click_button(page, "Cut Demo")
    click(page, "f17")
    path = PROOFS / f"{PREFIX}-acceptance-audit-{TODAY}.png"
    page.screenshot(path=str(path))
    print(f"Captured {path}")
    page.close()

    browser.close()
