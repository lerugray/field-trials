#!/usr/bin/env python3
"""sheet.py — turn a captured frame burst into something an eye can read.

Diffs consecutive frames to find WHERE the burst actually moves, then crops every frame to that
union region, scales it nearest-neighbour (this is a 640x360 pixel-art canvas; smooth scaling
would invent detail that is not in the shipped build), and tiles the sequence with frame numbers.

Usage: sheet.py <burstDir> <cols> <zoom> [padPx] [--full]
"""
import sys, os, json
from PIL import Image, ImageDraw

d = sys.argv[1]
cols = int(sys.argv[2])
zoom = int(sys.argv[3])
pad = int(sys.argv[4]) if len(sys.argv) > 4 and not sys.argv[4].startswith('--') else 10
full = '--full' in sys.argv

rng = [a for a in sys.argv if a.startswith('--range=')]
names = sorted(f for f in os.listdir(d) if f.endswith('.png'))
if rng:
    lo, hi = (int(v) for v in rng[0].split('=')[1].split(':'))
    names = names[lo:hi]
labels = [int(n[:-4]) for n in names]
imgs = [Image.open(os.path.join(d, n)).convert('RGB') for n in names]
W, H = imgs[0].size

# Where does this burst move? Union of the per-pixel differences across consecutive frames.
box = None
per_frame = []
for a, b in zip(imgs, imgs[1:]):
    diff = Image.new('L', (W, H))
    pa, pb = a.load(), b.load()
    px = diff.load()
    changed = 0
    for y in range(H):
        for x in range(W):
            if pa[x, y] != pb[x, y]:
                px[x, y] = 255
                changed += 1
    per_frame.append(changed)
    bb = diff.getbbox()
    if bb:
        box = bb if box is None else (min(box[0], bb[0]), min(box[1], bb[1]), max(box[2], bb[2]), max(box[3], bb[3]))

boxarg = [a for a in sys.argv if a.startswith('--box=')]
if boxarg:
    box = tuple(int(v) for v in boxarg[0].split('=')[1].split(','))
elif full or box is None:
    box = (0, 0, W, H)
else:
    box = (max(0, box[0] - pad), max(0, box[1] - pad), min(W, box[2] + pad), min(H, box[3] + pad))

print(json.dumps({'burst': os.path.basename(d), 'frames': len(imgs), 'moveBox': box,
                  'changedPxPerStep': per_frame}))

cw, ch = box[2] - box[0], box[3] - box[1]
tw, th = cw * zoom, ch * zoom + 12
rows = (len(imgs) + cols - 1) // cols
sheet = Image.new('RGB', (cols * tw, rows * th), (24, 22, 20))
dr = ImageDraw.Draw(sheet)
for i, im in enumerate(imgs):
    c = im.crop(box).resize((cw * zoom, ch * zoom), Image.NEAREST)
    x, y = (i % cols) * tw, (i // cols) * th
    sheet.paste(c, (x, y + 12))
    dr.text((x + 3, y + 2), f'{labels[i]}', fill=(255, 200, 90))
suffix = ('-%d_%d' % (labels[0], labels[-1])) if rng else ''
out = os.path.join(os.path.dirname(d), os.path.basename(d) + suffix + '-sheet.png')
sheet.save(out)
print('wrote', out, sheet.size)
