import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { decodePNG } from '../tools/png.mjs';
import { CANONICAL_FACING, loadSheetFrames } from '../tools/rig-extract.mjs';
import {
  checkNormalisedTrail, facingProblems, measureTrailAnchor,
} from '../tools/rig-facing-probe.mjs';
import { RIG_ROOT } from '../tools/rig-manifest.mjs';

// The raw-source and normalization layers read the licensed template from the local
// pixel-art-library (RIG_ROOT) and the uncommitted tools/out pipeline output. Neither
// can ship to this public repo (license: no standalone redistribution), so those layers
// certify on machines that hold the library (Mac/home-PC) and CI verifies the layers it
// can see: the recorded audit invariants and the sha-pinned shipped strips.
const RIG_SOURCE_AVAILABLE = existsSync(RIG_ROOT);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = JSON.parse(readFileSync(join(ROOT, 'assets/art/MANIFEST.json'), 'utf8'));

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

test('hero facing guard: physical dash trail stays backward through source, normalization, and ship', () => {
  const audit = MANIFEST.hero.facingAudit;

  if (RIG_SOURCE_AVAILABLE) {
    const raw = measureTrailAnchor();
    assert.equal(raw.sourceFacing, 'right', `raw trail offset ${raw.offset}px must imply source-right`);
    assert.ok(raw.offset < 0 && raw.frames === 9, 'raw trail must sit left/behind over all nine dash frames');
    assert.deepEqual(facingProblems(), [], 'all eleven source sheets must share the dash-anchored orientation');

    const normalized = checkNormalisedTrail(loadSheetFrames, CANONICAL_FACING);
    assert.equal(CANONICAL_FACING, 'left');
    assert.equal(normalized.ok, true, `normalised ${normalized.offset}px trail must sit right/behind`);
    assert.ok(normalized.offset > 0 && normalized.frames === 9);

    assert.equal(audit.rawSourceFacing, raw.sourceFacing);
    assert.equal(audit.rawDashTrailOffset, raw.offset);
    assert.equal(audit.normalisedDashTrailOffset, normalized.offset);
  }

  // Always-run layer (CI included): recorded audit invariants + certified shipped bytes.
  assert.equal(audit.rawSourceFacing, 'right');
  assert.equal(audit.normalisedTrailSide, 'right');
  assert.ok(audit.rawDashTrailOffset < 0, 'recorded raw trail must sit behind a right-facing source');
  assert.equal(audit.normalisedDashTrailOffset, -audit.rawDashTrailOffset,
    'normalisation must mirror the recorded raw offset exactly');

  for (const headgear of MANIFEST.hero.headgearOptions) {
    const record = MANIFEST.assets.find((asset) => asset.file === `player_${headgear}_dash.png`);
    assert.ok(record, `${headgear} dash strip must be manifested`);
    assert.equal(sha256(join(ROOT, 'assets/art', record.file)), record.sha256,
      `${headgear} shipped dash must remain the certified, unflipped strip`);
  }
});

test('hero ground gate: every shipped pose anchor resolves to a one-pixel surface gap', () => {
  let poses = 0;
  for (const headgear of MANIFEST.hero.headgearOptions) {
    for (const [animation, strip] of Object.entries(MANIFEST.hero.strips)) {
      const path = join(ROOT, 'assets/art', `player_${headgear}_${animation}.png`);
      const png = decodePNG(path);
      assert.equal(png.width, strip.frameW * strip.frames);
      assert.equal(png.height, strip.frameH);
      for (let frame = 0; frame < strip.frames; frame++) {
        let opaqueBottom = -1;
        for (let y = 0; y < strip.frameH; y++) {
          for (let x = 0; x < strip.frameW; x++) {
            const pixel = (y * png.width + frame * strip.frameW + x) * 4;
            if (png.data[pixel + 3]) opaqueBottom = Math.max(opaqueBottom, y);
          }
        }
        const anchor = strip.frameAnchors[frame];
        assert.equal(anchor.y, opaqueBottom, `${headgear}/${animation} f${frame} anchor follows opaque feet`);
        const surfaceY = 176;
        const drawY = surfaceY - 1 - anchor.y;
        assert.equal(surfaceY - (drawY + opaqueBottom), 1, `${headgear}/${animation} f${frame} contact gap`);
        poses++;
      }
    }
  }
  assert.equal(poses, 267, '89 certified poses across all three loadable headgear variants');
});

test('hero provenance gate: Variant B is selected and the complete Willibab backup remains', () => {
  assert.equal(MANIFEST.hero.variant, 'B');
  assert.equal(MANIFEST.hero.defaultHeadgear, 'bareheaded');
  assert.equal(MANIFEST.hero.stripCount, 11);
  assert.equal(MANIFEST.hero.frameCount, 89);
  const backups = MANIFEST.assets.filter((asset) => asset.runtime === false);
  assert.equal(backups.length, 12);
  for (const backup of backups) {
    assert.match(backup.file, /^backup\/willibab-candidate-b\/player/);
    assert.equal(existsSync(join(ROOT, 'assets/art', backup.file)), true, backup.file);
  }
});
