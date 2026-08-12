// gate-ar2-proofs.mjs — verifies the complete, non-overwritten AR2 comparison proof set.
// Usage: node scripts/gate-ar2-proofs.mjs [YYYYMMDD or YYYYMMDDx recapture stamp]

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const date = process.argv[2] && /^\d{8}[a-z]?$/.test(process.argv[2]) ? process.argv[2] : '20260808';
const dir = join(ROOT, 'docs', 'proofs', `reskin2-${date}`);
const requireGroundContact = date.localeCompare('20260808e') >= 0;
const requireAnimationStrips = date.localeCompare('20260808g') >= 0;
const expected = [
  [`ar2-s1-${date}.png`, 512, 480],
  [`ar2-s4-${date}.png`, 512, 480],
  [`ar2-s6-${date}.png`, 512, 480],
  [`ar2-combat-${date}.png`, 512, 480],
  [`ar2-hud-menu-${date}.png`, 512, 480],
  [`ar2-hud-closeup-${date}.png`, 992, 224],
  [`ar2-environment-contact-sheet-${date}.png`, 512, 240],
];
if (requireGroundContact) expected.splice(expected.length - 1, 0, [`ar2-ground-contact-${date}.png`, 512, 480]);
if (requireAnimationStrips) {
  const animationRound = date.localeCompare('20260808h') >= 0 ? 'ar3b' : 'ar3a';
  for (const kind of ['hero', 'walker', 'hopper', 'boss']) {
    expected.push([`${animationRound}-animation-${kind}-${date}.png`, 1280, 264]);
  }
}

const failures = [];
for (const [name, width, height] of expected) {
  const path = join(dir, name);
  if (!existsSync(path)) {
    failures.push(`missing ${path}`);
    continue;
  }
  const png = readFileSync(path);
  const signature = png.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') {
    failures.push(`${name}: not a PNG`);
    continue;
  }
  const actualWidth = png.readUInt32BE(16);
  const actualHeight = png.readUInt32BE(20);
  if (actualWidth !== width || actualHeight !== height) {
    failures.push(`${name}: ${actualWidth}x${actualHeight}, expected ${width}x${height}`);
  } else {
    console.log(`PASS  ${name}: ${width}x${height}`);
  }
}

if (requireGroundContact) {
const contactsName = `ar2-ground-contact-${date}.json`;
const contactsPath = join(dir, contactsName);
if (!existsSync(contactsPath)) {
  failures.push(`missing ${contactsPath}`);
} else {
  try {
    const report = JSON.parse(readFileSync(contactsPath, 'utf8'));
    if (report.stamp !== date) failures.push(`${contactsName}: stamp ${report.stamp} != ${date}`);
    const requirements = {
      stage: ['hero', 'walker', 'hopper', 'boss'],
      combat: ['hero', 'walker'],
    };
    if (requireAnimationStrips) {
      for (const kind of ['hero', 'walker', 'hopper', 'boss']) requirements[`animation-${kind}`] = [kind];
    }
    for (const [context, kinds] of Object.entries(requirements)) {
      const proofCase = report.cases?.find((item) => item.context === context);
      if (!proofCase) {
        failures.push(`${contactsName}: missing ${context} case`);
        continue;
      }
      if (!expected.some(([name]) => name === proofCase.frame)) {
        failures.push(`${contactsName}: ${context} frame ${proofCase.frame} is not gated`);
      }
      for (const kind of kinds) {
        const records = proofCase.contacts?.filter((contact) => contact.kind === kind) || [];
        if (!records.length) {
          failures.push(`${contactsName}: ${context} missing ${kind}`);
          continue;
        }
        for (const contact of records) {
          const measured = contact.surfaceRow - contact.opaqueBottomRow;
          if (![contact.surfaceRow, contact.opaqueBottomRow, contact.gap].every(Number.isInteger)) {
            failures.push(`${contactsName}: ${context}/${kind} contains non-integer rows`);
          } else if (contact.gap !== measured) {
            failures.push(`${contactsName}: ${context}/${kind} gap ${contact.gap} != measured ${measured}`);
          } else if (Math.abs(measured) > 1) {
            failures.push(`${contactsName}: ${context}/${kind} opaque bottom ${contact.opaqueBottomRow}, surface ${contact.surfaceRow}`);
          } else {
            console.log(`PASS  ${context}/${kind}: opaque bottom ${contact.opaqueBottomRow}, surface ${contact.surfaceRow}, gap ${measured}px`);
          }
        }
        if (context.startsWith('animation-')) {
          if (records.length !== 8) failures.push(`${contactsName}: ${context} has ${records.length} poses, expected 8`);
          const poses = new Set(records.map((contact) => contact.pose));
          if (poses.size !== records.length) failures.push(`${contactsName}: ${context} pose labels are not unique`);
        }
      }
    }
  } catch (error) {
    failures.push(`${contactsName}: invalid JSON (${error.message})`);
  }
}

const readmePath = join(dir, 'README.md');
const heroSelected = date.localeCompare('20260808f') >= 0;
const heroIntegrated = date.localeCompare('20260810i') >= 0;
const heroNote = heroIntegrated
  ? 'Ray-certified paint-over Variant B (bare-headed) is the selected protagonist'
  : heroSelected
  ? 'Hero candidate B (red/orange shield fighter) is the selected protagonist'
  : 'Hero remains the current big knight pending the operator pick';
if (!existsSync(readmePath)) failures.push(`missing ${readmePath}`);
else if (!readFileSync(readmePath, 'utf8').includes(heroNote)) failures.push(`README.md: missing hero-decision note`);
else if (heroIntegrated && !readFileSync(readmePath, 'utf8').includes('Willibab candidate B is retained')) {
  failures.push('README.md: missing retained Willibab backup');
} else if (heroSelected && !heroIntegrated && !readFileSync(readmePath, 'utf8').includes('candidate C (blue hooded caster) is the named backup')) {
  failures.push('README.md: missing named candidate-C backup');
} else console.log(`PASS  README.md: verification frames identify the ${heroSelected ? 'selected hero and backup' : 'pending hero pick'}`);
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL  ${failure}`);
  console.error(`AR2 PROOF GATE FAILED (${failures.length})`);
  process.exit(1);
}
console.log('AR2 PROOF GATE PASS');
