from playwright.sync_api import sync_playwright
from pathlib import Path
from datetime import date
import json

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist" / "index.html"
PROOFS = ROOT / "proofs"
PROOFS.mkdir(parents=True, exist_ok=True)
TODAY = date.today().isoformat()
PREFIX = "m4"

VIEWPORTS = [
    ("1280x800", 1280, 800),
    ("1440x900", 1440, 900),
    ("2560x1440", 2560, 1440),
]

# Combat-inspection scenario: North infantry + artillery vs South artillery on
# the i-file. Both sides are in communication via relays on their home rows.
SAVE = {
    "version": 3,
    "board": {"cols": 25, "rows": 20},
    "selectedId": None,
    "moveCount": 0,
    "preset": "m4-combat-inspection",
    "rulesStatus": "rules: 92.7% verified",
    "sandbox": False,
    "showAllComms": False,
    "settings": {"sfx": True, "music": False, "reducedEffects": False},
    "turn": "North",
    "turnNumber": 1,
    "movedThisTurn": [],
    "hasAttacked": False,
    "pendingRetreats": [],
    "retreatedThisTurn": [],
    "log": [],
    "history": [],
    "gameOver": None,
    "combatPreview": None,
    "pieces": [
        {"id": "nr1", "side": "North", "cls": "Foot Relay", "x": 8, "y": 18},
        {"id": "ni1", "side": "North", "cls": "Infantry", "x": 8, "y": 4},
        {"id": "na1", "side": "North", "cls": "Foot Artillery", "x": 8, "y": 5},
        {"id": "sr1", "side": "South", "cls": "Foot Relay", "x": 8, "y": 1},
        {"id": "sa1", "side": "South", "cls": "Foot Artillery", "x": 8, "y": 2},
    ]
}


def click(page, coord):
    page.evaluate(f'''() => {{
      const el = document.querySelector('[data-coord="{coord}"]');
      if (el) el.dispatchEvent(new MouseEvent('click', {{ bubbles: true }}));
    }}''')
    page.wait_for_timeout(150)


def hover(page, coord):
    center = page.evaluate(f'''() => {{
      const el = document.querySelector('[data-coord="{coord}"]');
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {{ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }};
    }}''')
    if center:
        page.mouse.move(center['x'], center['y'])
    page.wait_for_timeout(600)


def stabilize_panel(page):
    # The file chooser can scroll the panel; reset to top and force a reflow
    # so the updated card contents are captured by the screenshot.
    page.evaluate('''() => {
      const panel = document.querySelector('aside.panel');
      panel.scrollTop = 0;
      void panel.offsetHeight;
    }''')
    page.wait_for_timeout(200)


def load_save(page, save_path):
    with page.expect_file_chooser() as fc_info:
        page.locator('button:has-text("Load File")').first.click()
    file_chooser = fc_info.value
    file_chooser.set_files(str(save_path))
    page.wait_for_timeout(500)


with sync_playwright() as p:
    browser = p.chromium.launch()
    save_path = PROOFS / f"{PREFIX}-combat-scenario-{TODAY}.json"
    save_path.write_text(json.dumps(SAVE), encoding="utf-8")

    for name, w, h in VIEWPORTS:
        page = browser.new_page(viewport={"width": w, "height": h})
        page.goto(f"file://{DIST}")
        page.wait_for_selector(".board-svg")
        load_save(page, save_path)
        click(page, "i5")  # select North infantry
        hover(page, "i3")  # preview attack on South artillery
        stabilize_panel(page)
        path = PROOFS / f"{PREFIX}-{name}-{TODAY}.png"
        page.screenshot(path=str(path))
        print(f"Captured {path}")
        page.close()

    # Dedicated combat-inspection proof at 1280x800.
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    page.goto(f"file://{DIST}")
    page.wait_for_selector(".board-svg")
    load_save(page, save_path)
    click(page, "i5")
    hover(page, "i3")
    stabilize_panel(page)
    path = PROOFS / f"{PREFIX}-combat-inspection-{TODAY}.png"
    page.screenshot(path=str(path))
    print(f"Captured {path}")
    page.close()

    browser.close()
