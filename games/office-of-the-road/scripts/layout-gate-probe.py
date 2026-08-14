#!/usr/bin/env python3
"""Live layout probe for GATE 7b — text bbox collisions + inter-line gaps on shipped dist."""

import json
import subprocess
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist' / 'office-of-the-road.html'
# Every string the game actually drew, per state, written for GATE 7c
# (scripts/legibility-lint.mjs) so the lint reads the SAME rendered-text dump
# this probe already extracts rather than opening a second browser.
TEXT_DUMP = ROOT / 'runs' / 'rendered-text.json'
CHROME_ARGS = ['--disable-gpu']

# Codex 2.84: a fill/layout check run only at a friendly multiple of the
# 320x200 buffer cannot fail. The probe sweeps large-desktop sizes, the
# 5x-boundary bracket, and deliberately non-integer sizes. The exact-5x
# 1600x1000 stays in as the control. Dump for GATE 7c comes from baseline.
VIEWPORTS = [
    (1280, 800),    # baseline (historical gate size)
    (1366, 768),    # hostile non-integer laptop
    (1512, 982),    # Ray's screen — the 2.84 live catch
    (1599, 999),    # just under the 5x boundary
    (1601, 1001),   # just over the 5x boundary
    (1600, 1000),   # exact 5x control
    (1920, 1080),
    (2560, 1440),
]

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

# The quartermaster reports a different party column once an item is focused
# (the purchase delta), so its focused states are probed as first-class states.
SHOP_FOCUS_STATES = {
    'shop-focus-buy': 'fresh=1&shop=1&shopfocus=buy0',
    'shop-focus-slot': 'fresh=1&shop=1&shopfocus=slot0arm',
    'shop-focus-inv': 'fresh=1&shop=1&shopfocus=inv0',
}


def collect_failures(label, data):
    failures = []
    tc = data.get('textCollisions') or []
    oob = data.get('outOfBounds') or []
    tight = data.get('tightGaps') or []
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
    if tight:
        failures.append({'state': label, 'kind': 'tight-interline', 'hits': tight[:8], 'count': len(tight)})
    return failures


def probe_state(page, dist_url, query):
    page.goto(dist_url + '?' + query)
    page.wait_for_timeout(500)
    return page.evaluate('window.__office.layoutProbe()')


def texts_of(data):
    """Every drawn string plus the stack tag that says which block drew it —
    the lint reads the tag to honour the audit's context-bound OK-list."""
    return [
        {'text': str(b.get('text', '')), 'stack': b.get('stack')}
        for b in (data.get('textBoxes') or [])
    ]


def main():
    subprocess.run(['node', str(ROOT / 'scripts' / 'build.js')], cwd=ROOT, check=True)
    dist_url = DIST.as_uri()
    failures = []
    dump = {}

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=CHROME_ARGS)
        page = browser.new_page(viewport={'width': VIEWPORTS[0][0], 'height': VIEWPORTS[0][1]}, device_scale_factor=1)

        for vw, vh in VIEWPORTS:
            page.set_viewport_size({'width': vw, 'height': vh})
            at_baseline = (vw, vh) == VIEWPORTS[0]
            vtag = f'{vw}x{vh}'

            for label, query in STATES.items():
                data = probe_state(page, dist_url, query)
                if at_baseline:
                    dump[label] = texts_of(data)
                failures.extend(collect_failures(f'{label}@{vtag}', data))

            # Credits via real control click (same path as fixround proof).
            probe_state(page, dist_url, 'fresh=1&intake=1')
            box = page.locator('#stage').bounding_box()
            scale = float(page.locator('#stage').get_attribute('data-scale'))
            page.mouse.click(box['x'] + (238 + 33) * scale, box['y'] + (176 + 8) * scale)
            page.wait_for_timeout(250)
            data = page.evaluate('window.__office.layoutProbe()')
            if at_baseline:
                dump['credits'] = texts_of(data)
            failures.extend(collect_failures(f'credits@{vtag}', data))

            # The shop's focused/hover state draws DIFFERENT strings from its rest
            # state (the party column reports the focused item's stat delta), so the
            # lint would never see them from the rest frame alone.
            for label, query in SHOP_FOCUS_STATES.items():
                data = probe_state(page, dist_url, query)
                if at_baseline:
                    dump[label] = texts_of(data)
                failures.extend(collect_failures(f'{label}@{vtag}', data))

        browser.close()

    # Written unconditionally, and BEFORE the pass/fail exit: a failing layout
    # gate must still leave the lint a dump to read.
    TEXT_DUMP.parent.mkdir(parents=True, exist_ok=True)
    TEXT_DUMP.write_text(json.dumps(dump, ensure_ascii=False, indent=1), encoding='utf-8')

    if failures:
        print('LAYOUT GATE FAILED', file=sys.stderr)
        for f in failures:
            print(json.dumps(f), file=sys.stderr)
        sys.exit(1)

    n_states = len(STATES) + 1 + len(SHOP_FOCUS_STATES)
    vlist = ', '.join(f'{w}x{h}' for w, h in VIEWPORTS)
    print(f'  layout probe: {n_states} states x {len(VIEWPORTS)} viewports ({vlist}) = {n_states * len(VIEWPORTS)} probes · text collisions 0 · control collisions 0 · tight interline 0')
    sys.exit(0)


if __name__ == '__main__':
    main()
