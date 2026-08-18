# GATE 5 — the legibility floor, re-measured at M7b

DESIGN-SEED §8.5. Measured on the built artifact's fixed 640x360 buffer, at 1x, and recorded as
numbers rather than asserted. Re-measured (not inherited) because the M7b art pass changed the
ground under text: the desk stopped being a flat fill and became a composed material, and the
action bar's controls stopped being filled rectangles and became composed objects.

## Minimum text size

**11px**, unchanged from M7a r2. Both faces (Not Jam Slab Serif 11, Not Jam Serif 11) are cut at
11px and nothing is drawn off their design size.

## Dwell

**Unbounded.** The administration phase is untimed by the pacing law; no readable thing is ever
removed from the screen on a clock.

## Contrast, every pairing the renderer actually draws

Floor: 4.5:1.

| pairing | foreground | background | ratio |
|---|---|---|---|
| incident-replay label on the composed desk header | `#c07c5f` | `#1d1b15` | 5.16:1 |
| ledger body ink on the paper shade | `#100f0c` | `#8f846c` | 5.19:1 |
| cornerstone label on the cutaway | `#4f9287` | `#08090b` | 5.50:1 |
| damage label on the cutaway | `#c07c5f` | `#08090b` | 5.97:1 |
| brass figures on paper | `#33270f` | `#bbac90` | 6.55:1 |
| ledger secondary ink on paper | `#2b2820` | `#bbac90` | 6.60:1 |
| stamp ink on paper | `#4c1111` | `#bbac90` | 6.75:1 |
| section title on the composed desk header | `#b1aa97` | `#1d1b15` | 7.43:1 |
| ledger body ink on paper | `#100f0c` | `#bbac90` | 8.59:1 |
| section label on the cutaway | `#b1aa97` | `#08090b` | 8.60:1 |
| ledger secondary ink on the paper highlight | `#2b2820` | `#e0d0b4` | 9.71:1 |
| light text on the lightest step of the composed desk | `#dad2bb` | `#2b2820` | 9.75:1 |
| stamp ink on the paper highlight | `#4c1111` | `#e0d0b4` | 9.92:1 |
| button text on the button face | `#ece4cc` | `#202228` | 12.52:1 |
| button text on the lightest step of the composed button field | `#ece4cc` | `#202228` | 12.52:1 |
| ledger body ink on the paper highlight | `#100f0c` | `#e0d0b4` | 12.64:1 |
| overlay text on the desk | `#dad2bb` | `#100f0c` | 12.70:1 |
| section text on the cutaway | `#dad2bb` | `#08090b` | 13.20:1 |

**Worst pairing: 5.16:1**, against a 4.5:1 floor. Pairings measured: 18, up from 14 at M7a r2.

## What the re-measurement caught

The composed desk reaches **ink[2]** across the frame. The incident-replay label is drawn in
`rustBright` on the desk header, and `rustBright` on ink[2] measures **4.41:1** — under the floor.
The gate found it; the art pass had introduced it.

**It was fixed at the ground, not at the gate.** `composeDesk` now takes a list of *quiet* bands:
regions that carry text and therefore keep a still, held-down material. The header band is clamped
to ink[1], where the same label measures **5.16:1**. This is the same finding r3 acted on when the
title block and status strip moved onto manila — a contrast ratio measures two flat colours and
cannot see a busy ground — applied to the one band where a light letterform still sits directly on
the desk.

The alternative was to keep the number and lower the gate. That is why the gate is re-measured
every milestone rather than inherited.

## What it confirmed

The composed button's bevel light is confined to its edges by design, so the field beneath the
label stays on the step the palette names. Measured: the enabled face reaches **stone[1]** in the
label area and no further, so `button text on the button face` remains **12.52:1** and the M7a
figure is still the figure that ships. A prettier control that had quietly moved its own background
would have invalidated a measured legibility number rather than improved anything.
