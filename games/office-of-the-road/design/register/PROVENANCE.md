# PROVENANCE — jrpg register corpus

Staging area. Nothing here is committed; the orchestrator moves this into the game repo at
founding. Acquired 2026-08-09 via plain `curl` from gutenberg.org.

**Read the ⚠ on the Kafka entries before quoting from them in anything that ships.**

---

## 1. `texts/candide.txt` — CLEAN PD

| | |
|---|---|
| Work | *Candide* — Voltaire |
| Source | https://www.gutenberg.org/cache/epub/19942/pg19942.txt (PG ebook #19942) |
| Edition | The Modern Library / Boni & Liveright, Inc., New York, **1918**; introduction by Philip Littell |
| Translator | **Uncredited in the source edition.** The 1918 Modern Library printing names no translator; it reproduces an older anonymous English rendering. Do not attribute it to a named translator. |
| PD basis | US publication 1918 → copyright expired (all US works published before 1930 are public domain). Voltaire d. 1778. PG classes it as a public-domain ebook (no copyright notice in the header). |
| Size | 183,275 chars / 3,777 lines |

**Processing:** stripped PG header/footer, the "Produced by…" credit, the transcriber's note
block, the Modern Library front matter, **Littell's 1918 introduction**, the table of contents,
and the trailing typo-correction list. File begins at the `CANDIDE` half-title and ends at
`"…let us cultivate our garden."` — Voltaire's tale only, no editorial apparatus. The 30 chapter
headings are intact and are what the exemplar citations key off. Endnotes (`[1]`, `[2]`…) are
referenced in-text but the note bodies were dropped with the footnote section.

---

## 2. `texts/don-quixote.txt` — CLEAN PD

| | |
|---|---|
| Work | *Don Quixote* — Miguel de Cervantes Saavedra |
| Source | https://www.gutenberg.org/cache/epub/996/pg996.txt (PG ebook #996) |
| Translator | **John Ormsby** (as requested) — translation first published 1885 |
| PD basis | Ormsby d. 1895 → life+70 expired 1965; translation published 1885 → PD in the US and worldwide. PG classes it as a public-domain ebook. |
| Size | 2,158,624 chars / 37,753 lines |

**Processing:** stripped PG header/footer, the cover/spine block, both volume tables of
contents, and **627 image-caption artifacts** (`p003.jpg (307K)` / `Full Size` lines left over
from the illustrated HTML edition). File begins at `DEDICATION OF PART I` and ends at
`"…doubtless doomed to fall for ever. Farewell."`. All 126 chapter headings intact (52 in Part I,
74 in Part II — note the numbering **restarts** at `CHAPTER I.` for Part II, so citations must
name the part).

---

## 3. `texts/kafka-the-trial.txt` — ⚠ NOT PUBLIC DOMAIN

| | |
|---|---|
| Work | *The Trial* — Franz Kafka |
| Source | https://www.gutenberg.org/cache/epub/7849/pg7849.txt (PG ebook #7849) |
| Translator | **David Wyllie** |
| Status | ⚠ **Copyrighted.** PG's own header reads: `*** This is a COPYRIGHTED Project Gutenberg eBook. Details Below. ***`, and the text carries `Translation Copyright © by David Wyllie`. |
| Licence | Distributed under the Project Gutenberg License **with the copyright holder's permission** — freely redistributable, but the translator retains copyright. This is *not* a public-domain dedication. |
| Size | 449,723 chars / 6,676 lines |

## 4. `texts/kafka-metamorphosis.txt` — ⚠ NOT PUBLIC DOMAIN

| | |
|---|---|
| Work | *Metamorphosis* — Franz Kafka |
| Source | https://www.gutenberg.org/cache/epub/5200/pg5200.txt (PG ebook #5200) |
| Translator | **David Wyllie** |
| Status | ⚠ Same as above — PG flags it `COPYRIGHTED`, translation copyright David Wyllie, PG-licensed by permission. |
| Size | 118,416 chars / 1,863 lines |

**Processing (both Kafka files):** stripped PG header/footer and the translator's contact email.
The `Translation Copyright © by David Wyllie` line was **deliberately left in place** in
`kafka-the-trial.txt` so the attribution travels with the file.

### What this means in practice

The task brief assumed the Wyllie translations were PD. They are not — they are *freely
licensed*, which is a different thing. Consequences:

- **Fine as-is:** using these texts as internal register study material, and quoting short
  passages in an internal design document like `REGISTER-SEED-DRAFT.md` (analytical use, brief
  extracts, full attribution).
- **Needs a decision before it ships:** reproducing Wyllie's wording verbatim in shipped game
  content, or redistributing these `.txt` files in a public repo. The PG licence permits
  redistribution but carries conditions and the copyright notice must survive.
- **The register laws themselves are unaffected** — a *register* (deadpan procedural courtesy)
  is not copyrightable. Only Wyllie's specific English sentences are.

**If a genuinely PD English Kafka is ever needed:** the German originals are unambiguously PD
(Kafka d. 1924; all published pre-1930) and are on Gutenberg — *Der Prozess* #69327,
*Die Verwandlung* #22367, *In der Strafkolonie* #25791, *Ein Landarzt* #21989,
*Ein Hungerkünstler* #30655, *Das Urteil* #21593, *Betrachtung* #23532. A fresh translation
from those would be clean. That is a real cost, not a quick fix — flagging it, not proposing it.

---

## Gaps — what was NOT acquired

**The Castle (Das Schloss) — MISSING, as anticipated.** There is **no English *Castle*** on
Project Gutenberg in any form. The Willa & Edwin Muir translation (1930) is not reliably US-PD
and was excluded per instruction. The German original is not on Gutenberg either. The
institutional-menace register that *The Castle* is the purest source of is therefore
represented here **only by *The Trial***, which carries it well (the advocate's procedure
lectures and Titorelli's acquittal taxonomy in ch. VII are the strongest surviving examples).
No substitute was fabricated.

**No other English Kafka exists on Gutenberg.** The full author listing (17 entries) was
enumerated: two English prose texts (both Wyllie, both above), one English *audiobook* of
*The Metamorphosis* (#26298 — Ogg Vorbis only, no text; it 404s on every `.txt` path), one
Spanish *El proceso*, and thirteen German originals. The short-story collections Ray might
have hoped for — *Ein Landarzt*, *In der Strafkolonie*, *Ein Hungerkünstler* — are **German
only**. Nothing clean was left on the table.

**Wikisource was probed** for a public-domain English *Metamorphosis* / *In the Penal Colony*
(e.g. an Ian Johnston-style PD dedication) — the export endpoint returned no usable content.
Not pursued further; bookfinder-general was not invoked, as Gutenberg covered Voltaire and
Cervantes cleanly and bookfinder would not change Kafka's licensing situation.

---

## Working files

`raw/` holds the unmodified Gutenberg downloads (headers intact) so the strip can be re-run or
audited. `tools/extract.py` + `tools/batch.py` index each text by chapter and pull a passage
with its chapter citation — every exemplar in `REGISTER-SEED-DRAFT.md` was extracted through
them and machine-verified verbatim against the source files, not quoted from memory.

## Repo-inclusion ruling (orchestrator, 2026-08-09)
Only the PD-clean texts (Candide 1918, Quixote-Ormsby) ship in this repo. The Wyllie Kafka
translations (The Trial, Metamorphosis) are COPYRIGHTED (PG hosts by permission) and stay in
gs-private staging (state/_ideas/jrpg-register-corpus/texts/) as internal study material only.
BUILDER RULE: exemplar passages in REGISTER-SEED.md are register REFERENCE, never game text —
no exemplar (PD or not) is ever reproduced verbatim in game prose.

## Kafka enrichment (2026-08-09, from the-burrow — Ray's pointer)
brief-an-den-vater.en.txt, briefe-an-felice.en.txt, tagebuecher.en.txt are FIRST-PARTY
machine translations (the-burrow/scripts/translate_mode_a.py, style-preserving, from PD
German originals) — Ray's own work product, commercially unencumbered. These are the
UNRESTRICTED Kafka register source for game prose study; they supersede the need to lean
on the held-private Wyllie files. Builder: the M0 study draws Kafka exemplars from THESE.
