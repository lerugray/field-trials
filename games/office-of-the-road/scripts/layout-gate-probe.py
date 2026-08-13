#!/usr/bin/env python3
"""Live layout probe for GATE 7b — text bbox collisions on shipped dist."""

import json
import subprocess
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist' / 'office-of-the-road.html'
CHROME_ARGS = ['--disable-gpu']

# Deep-link states that caught fix-round-3 blockers pre-fix.
STATES = {
    'title': 'fresh=1&title=1',
    'howto': 'fresh=1&howto=1',
    'combat': 'fresh=1&ticks=400&beats=6',
    'camp': 'fresh=1&paused=1&camp=1',
    'route': 'fresh=1&paused=1&route=1',
    'draft': 'fresh=1&ticks=400&beats=200',
    'deck': 'fresh=1&deck=1',
    'shop': 'fresh=1&shop=1',
    'march': 'fresh=1&ticks=1',
    'docket': 'fresh=1&asdocket=1',
    'intake': 'fresh=1&intake=1',
    'defeat': 'fresh=1&dead=1',
}


def probe_state(page, dist_url, query):
    page.goto(dist_url + '?' + query)
    page.wait_for_timeout(500)
    return page.evaluate('window.__office.layoutProbe()')


def main():
    subprocess.run(['node', str(ROOT / 'scripts' / 'build.js')], cwd=ROOT, check=True)
    dist_url = DIST.as_uri()
    failures = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=CHROME_ARGS)
        page = browser.new_page(viewport={'width': 1280, 'height': 800}, device_scale_factor=1)

        for label, query in STATES.items():
            data = probe_state(page, dist_url, query)
            tc = data.get('textCollisions') or []
            oob = data.get('outOfBounds') or []
            cc = []
            for hit in data.get('collisions') or []:
                tb = hit.get('textBox') or {}
                cb = hit.get('controlBox') or {}
                owned = (
                    tb.get('x', 0) >= cb.get('x', 0)
                    and tb.get('y', 0) >= cb.get('y', 0)
                    and tb.get('x', 0) + tb.get('w', 0) <= cb.get('x', 0) + cb.get('w', 0)
                    and tb.get('y', 0) + tb.get('h', 0) <= cb.get('y', 0) + cb.get('h', 0)
                )
                if not owned:
                    cc.append(hit)
            if tc:
                failures.append({'state': label, 'kind': 'text-vs-text', 'hits': tc[:5], 'count': len(tc)})
            if cc:
                failures.append({'state': label, 'kind': 'text-vs-control-unowned', 'hits': cc[:5], 'count': len(cc)})
            if oob:
                failures.append({'state': label, 'kind': 'out-of-bounds', 'hits': oob[:5], 'count': len(oob)})

        # Credits via real control click (same path as fixround proof).
        probe_state(page, dist_url, 'fresh=1&intake=1')
        box = page.locator('#stage').bounding_box()
        scale = float(page.locator('#stage').get_attribute('data-scale'))
        page.mouse.click(box['x'] + (238 + 33) * scale, box['y'] + (176 + 8) * scale)
        page.wait_for_timeout(250)
        data = page.evaluate('window.__office.layoutProbe()')
        tc = data.get('textCollisions') or []
        oob = data.get('outOfBounds') or []
        cc = []
        for hit in data.get('collisions') or []:
            tb = hit.get('textBox') or {}
            cb = hit.get('controlBox') or {}
            owned = (
                tb.get('x', 0) >= cb.get('x', 0)
                and tb.get('y', 0) >= cb.get('y', 0)
                and tb.get('x', 0) + tb.get('w', 0) <= cb.get('x', 0) + cb.get('w', 0)
                and tb.get('y', 0) + tb.get('h', 0) <= cb.get('y', 0) + cb.get('h', 0)
            )
            if not owned:
                cc.append(hit)
        for kind, hits in [('text-vs-text', tc), ('text-vs-control-unowned', cc), ('out-of-bounds', oob)]:
            if hits:
                failures.append({'state': 'credits', 'kind': kind, 'hits': hits[:5], 'count': len(hits)})

        browser.close()

    if failures:
        print('LAYOUT GATE FAILED', file=sys.stderr)
        for f in failures:
            print(json.dumps(f), file=sys.stderr)
        sys.exit(1)

    print(f'  layout probe: {len(STATES) + 1} states · text collisions 0 · control collisions 0')
    sys.exit(0)


if __name__ == '__main__':
    main()
