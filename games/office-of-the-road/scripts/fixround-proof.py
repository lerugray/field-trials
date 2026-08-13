#!/usr/bin/env python3
"""Fix-round proof capture + browser measurements (Playwright Chromium)."""

import json
import subprocess
from datetime import date
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'docs' / 'proofs' / 'fixround2-20260811'
CHROME_ARGS = ['--single-process', '--no-zygote', '--disable-gpu', '--disable-software-rasterizer']
STATES = {
    'title': 'fresh=1&intake=1',
    'draft': 'fresh=1&ticks=400&beats=200',
    'march': 'fresh=1&ticks=1',
    'combat': 'fresh=1&ticks=10',
    'shop': 'fresh=1&shop=1',
    'route': 'fresh=1&route=1',
}
SWEEP = {
    'docket': 'fresh=1&asdocket=1', 'intake': 'fresh=1&intake=1',
    'march': 'fresh=1&ticks=1', 'combat': 'fresh=1&ticks=10',
    'draft': 'fresh=1&ticks=400&beats=200', 'camp': 'fresh=1&camp=1',
    'deck': 'fresh=1&deck=1', 'shop': 'fresh=1&shop=1',
    'route': 'fresh=1&route=1', 'defeat': 'fresh=1&dead=1',
}


def canvas_stats(page, x, y, w, h):
    return page.evaluate("""([x,y,w,h]) => {
      const c=document.querySelector('#stage'), d=c.getContext('2d').getImageData(x,y,w,h).data;
      const sats=[], lums=[];
      for(let i=0;i<d.length;i+=4){
        const r=d[i]/255,g=d[i+1]/255,b=d[i+2]/255,max=Math.max(r,g,b),min=Math.min(r,g,b);
        const l=(max+min)/2, delta=max-min;
        sats.push(delta===0?0:delta/(1-Math.abs(2*l-1))); lums.push(l*255);
      }
      sats.sort((a,b)=>a-b);
      return {meanSat:sats.reduce((a,b)=>a+b,0)/sats.length,
        p95Sat:sats[Math.floor((sats.length-1)*.95)],
        meanLum:lums.reduce((a,b)=>a+b,0)/lums.length};
    }""", [x, y, w, h])


def open_state(page, dist_url, query):
    errors = []
    page.on('pageerror', lambda err: errors.append(str(err)))
    page.goto(dist_url + '?' + query)
    page.wait_for_timeout(700)
    return errors

def report_layout_probe(page):
    data = page.evaluate('window.__office.layoutProbe()')
    return {
        'screen': data['screen'],
        'collisions': data['collisions'],
        'textBoxes': data['textBoxes'],
        'textCollisions': data.get('textCollisions', []),
        'outOfBounds': data['outOfBounds'],
    }

def truncated_texts(layout):
    return [t for t in layout['textBoxes'] if '…' in t['text']]

def ensure_no_ellipsis(label, layout):
    marks = truncated_texts(layout)
    if marks:
        raise RuntimeError(f'{label} has {len(marks)} ellipsis-truncated strings')

def ensure_no_overlaps(label, layout):
    if layout['collisions']:
        raise RuntimeError(f'{label} has {len(layout["collisions"])} text-vs-control overlaps')
    if layout['textCollisions']:
        raise RuntimeError(f'{label} has {len(layout["textCollisions"])} text-vs-text overlaps')
    if layout['outOfBounds']:
        raise RuntimeError(f'{label} has {len(layout["outOfBounds"])} out-of-bounds text boxes')

def main():
    subprocess.run(['node', str(ROOT / 'scripts' / 'build.js')], cwd=ROOT, check=True)
    if OUT.exists():
        for old in OUT.glob('*.png'):
            old.unlink()
        measurements = OUT / 'measurements-verified-20260811.json'
        if measurements.exists():
            measurements.unlink()
    OUT.mkdir(parents=True, exist_ok=True)
    dist_url = (ROOT / 'dist' / 'office-of-the-road.html').as_uri()
    report = {'date': str(date.today()), 'states': {}, 'measurements': {}}
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=CHROME_ARGS)
        page = browser.new_page(viewport={'width': 1280, 'height': 800}, device_scale_factor=1)
        for label, query in STATES.items():
            errors = open_state(page, dist_url, query)
            target = OUT / f'{label}-verified-20260811.png'
            page.screenshot(path=target)
            report['states'][label] = {'screen': page.evaluate('window.__office.ui.screen'), 'errors': errors}

        # Credits is reached through its real opening-screen control.
        errors = open_state(page, dist_url, 'fresh=1&intake=1')
        box = page.locator('#stage').bounding_box()
        scale = float(page.locator('#stage').get_attribute('data-scale'))
        page.mouse.click(box['x'] + (238 + 33) * scale, box['y'] + (176 + 8) * scale)
        page.wait_for_timeout(250)
        target = OUT / 'credits-verified-20260811.png'
        page.screenshot(path=target)
        report['states']['credits'] = {'screen': page.evaluate('window.__office.ui.screen'), 'errors': errors}

        # Actual browser-raster probe and palette samples.
        open_state(page, dist_url, 'fresh=1&ticks=1')
        report['measurements']['textProbe'] = page.evaluate('window.__office.textProbe()')
        report['measurements']['routeTiles'] = canvas_stats(page, 12, 63, 296, 16)
        march_layout = page.evaluate('window.__office.layoutProbe()')
        report['measurements']['scoreBox'] = {
            'boxes': [t for t in march_layout['textBoxes'] if t['text'].startswith('score')],
            'occludedShare': 0 if not march_layout['collisions'] else None,
        }
        open_state(page, dist_url, 'fresh=1&shop=1')
        report['measurements']['shopBand'] = canvas_stats(page, 0, 184, 320, 16)
        open_state(page, dist_url, 'fresh=1&ticks=400&beats=200')
        draft_layout = report_layout_probe(page)
        ensure_no_ellipsis('draft', draft_layout)
        ensure_no_overlaps('draft', draft_layout)
        report['measurements']['draftLayout'] = draft_layout

        # Eleven-state content/control bbox sweep (credits reached by real click).
        sweep = {}
        for label, query in SWEEP.items():
            open_state(page, dist_url, query)
            layout = report_layout_probe(page)
            ensure_no_ellipsis(label, layout)
            ensure_no_overlaps(label, layout)
            sweep[label] = layout
        open_state(page, dist_url, 'fresh=1&intake=1')
        box = page.locator('#stage').bounding_box(); scale = float(page.locator('#stage').get_attribute('data-scale'))
        page.mouse.click(box['x'] + (238 + 33) * scale, box['y'] + (176 + 8) * scale)
        page.wait_for_timeout(200)
        sweep['credits'] = page.evaluate('window.__office.layoutProbe()')
        ensure_no_ellipsis('credits', sweep['credits'])
        ensure_no_overlaps('credits', sweep['credits'])
        report['measurements']['layoutSweep'] = sweep
        browser.close()

    score_script = """import { createHash } from 'node:crypto';
import { TRACKS, probeTrack, renderTrackEventBytes } from './src/score.js';
const out = {};
for (const [name, spec] of Object.entries(TRACKS)) {
  const a = renderTrackEventBytes(spec, { start: 0, steps: 32, seed: 811 });
  const b = renderTrackEventBytes(spec, { start: 32, steps: 32, seed: 811 });
  const again = renderTrackEventBytes(spec, { start: 0, steps: 32, seed: 811 });
  const hash = (v) => createHash('sha256').update(v).digest('hex').slice(0, 16);
  out[name] = { len: spec.len, bars: spec.len / 16, notes: probeTrack(spec).notes,
    bars12Bytes: Buffer.byteLength(a), bars34Bytes: Buffer.byteLength(b),
    bars12Sha256: hash(a), bars34Sha256: hash(b), sectionsDiffer: a !== b,
    sameSeedDeterministic: a === again };
}
console.log(JSON.stringify(out));"""
    score_raw = subprocess.check_output(['node', '--input-type=module', '-e', score_script], cwd=ROOT, text=True)
    report['measurements']['scoreVariation'] = json.loads(score_raw)

    measurement_path = OUT / 'measurements-verified-20260811.json'
    measurement_path.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report['measurements'], indent=2))


if __name__ == '__main__':
    main()
