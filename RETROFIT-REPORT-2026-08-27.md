# RETROFIT-REPORT-2026-08-27

Rule 1 retrofit items **2-4** (operator ADOPTED 2026-08-27). Governing doc:
`generalstaff-private/docs/internal/FLEET-DISTRIBUTION-CONVENTIONS-DRAFT-2026-08-27.md`.

Lane stopped after items 2-4. Skipped by brief: alkahest/innsmouth REDEPLOYS, Rule-2 audio embedding.

---

## Item map (user order A/B/C = doc items 4, 3, 2)

| User | Doc # | Result |
|---|---|---|
| (A) deploy-check + manifest | 4 (+ tooling) | DONE |
| (B) IMPORTED-FROM x13 | 3 | DONE |
| (C) normalize publish shapes | 2 | DONE (4 games); alkahest SKIPPED (recorded) |

---

## (A) deploy-check + deploy-manifest.json

**Where (per doc):**
- `generalstaff-private/scripts/deploy-check.mjs`
- `generalstaff-private/state/fleet/deploy-manifest.json` (13 shelf entries)
- Baseline machine out: `generalstaff-private/state/fleet/deploy-check-2026-08-27.json`
- Baseline human out: `generalstaff-private/state/fleet/deploy-check-2026-08-27.txt`
- gs-private commit: `1ffa40cb`

**Cloudflare / preview URLs recorded in the manifest:**

| Game | project | play_url |
|---|---|---|
| chapel-perilous | chp-preview | https://lerugray.github.io/chp-preview/ |
| innsmouth-2000 | i2-preview | https://i2-preview.pages.dev/ |
| stray-squadron | ss-preview | https://ss-preview.pages.dev/ |
| oddseedz | oddseedz-preview | https://oddseedz-preview.pages.dev/ |

**Baseline human summary (pre-stamp, pre-normalize):**

```
FAIL     alkahest               cert=5d9217a997c13726  C1:FAIL C2:FAIL C3:FAIL C4:FAIL C5:PASS
FAIL     capriole               cert=1f1858427b04f66c  C1:PASS C2:PASS C3:PASS C4:FAIL C5:PASS
FAIL     chapel-perilous        cert=3389bd3b733e507b  C1:SKIP C2:PASS C3:SKIP C4:FAIL C5:REVIEW
FAIL     innsmouth-2000         cert=4fbfda31b8f8ce9b  C1:SKIP C2:FAIL C3:SKIP C4:FAIL C5:FAIL
FAIL     jacquard-index         cert=5b983d533d715bbe  C1:PASS C2:PASS C3:PASS C4:FAIL C5:PASS
FAIL     lines-of-advance       cert=613d265301725eb2  C1:PASS C2:PASS C3:PASS C4:FAIL C5:PASS
FAIL     material-breach        cert=24c72e0a9396cc8b  C1:PASS C2:PASS C3:PASS C4:FAIL C5:PASS
FAIL     oddseedz               cert=1e135fc7f1657456  C1:SKIP C2:PASS C3:SKIP C4:FAIL C5:PASS
FAIL     office-of-the-road     cert=db09fa431575ff45  C1:PASS C2:PASS C3:PASS C4:FAIL C5:PASS
FAIL     popinjay               cert=06ed089cd18322bf  C1:PASS C2:PASS C3:PASS C4:FAIL C5:PASS
FAIL     shoeleather            cert=cc73eb32583f2705  C1:PASS C2:PASS C3:PASS C4:FAIL C5:PASS
REPORTED stray-squadron         cert=7e2c26085d0cdca5  C1:SKIP C2:FAIL C3:SKIP C4:FAIL C5:PASS
REPORTED adversary              cert=10daab33efa3304f  C1:FAIL C2:SKIP C3:FAIL C4:FAIL C5:PASS
```

Known non-C4 signal in the baseline (unchanged by this lane):
- **alkahest** C1/C2/C3 — published/served `007f78af…` != certified `5d9217a9…` (redeploy queued)
- **innsmouth-2000** C2 + C5 — live drift + non-data `Audio`/`fetch` loaders (redeploy + Rule 2 queued)
- **chapel-perilous** C5 REVIEW — `decodeAudioData` + sidecar path strings, no proven fetch/XHR/atob
- **stray-squadron** held — live `/game` != local certified dist
- **adversary** pulled — publish dir absent

C5 false-positive classes from the doc are handled (`A.wave` extension boundary; markdown/attribution/`__DATA` embeds; stray label filenames).

---

## (B) IMPORTED-FROM stamps (all 13)

field-trials commit `5d6fa0c`. Each `games/<id>/IMPORTED-FROM` is one token: game-repo `HEAD` at stamp time.

| Shelf id | Game repo HEAD stamped |
|---|---|
| alkahest | `2985531711958042de752bd66b6a6035c6d3cbd5` |
| capriole | `0d80e320bf23618e204751c702d122024300a731` |
| chapel-perilous | `d4292366099b484f6f3e8a701d2e393666cc76fb` |
| innsmouth-2000 | `0356c6881b94d3a27e7bc3777d1203e60dfc25d2` |
| jacquard-index | `76104785b047e9e01a711b6165ec14346c6c7a3c` |
| lines-of-advance | `b120708635d82699b3defba171ee8ff61f36c964` |
| material-breach | `97cbfeec90425ce259006db858108914aa851731` |
| oddseedz | `9c6bd6dc14ca0cb224f57b88701155e352c338b4` |
| office-of-the-road | `7ef730fd7687401100439eb8e074bb7d71cac27b` |
| popinjay | `ff4e47d4e4a6fd08e1a259443b9b3a062734be86` |
| shoeleather | `cb876d1567148b408a5b57aeaf848562a1138690` |
| stray-squadron | `fbd4b9abbd4c80c0a2e02076a812f74e67bcedb3` |
| adversary | `bfad5e5410a03329b3f5af7f0f0526e15c0264ae` (repo: adversary-game) |

Note: stamp = current HEAD currency for C4; this lane did **not** re-sync vendored shelf source.

---

## (C) Normalize publish shapes (`index.html` IS the game)

Per-game: change → push lerugray.github.io → wait Deploy to GitHub Pages → curl play URL → require served sha256 == certified dist. Mismatch → revert that game only.

### alkahest — SKIPPED

Reason: post-normalize verify requires served == certified. Live resolved artifact is still the pre-redeploy body `007f78af…` (209,734 B); certified is `5d9217a9…` (425,738 B). Promoting `alkahest.html` → `index.html` would keep those same drifted bytes and still fail the certified-hash gate. Changing shape **and** passing the gate needs the queued alkahest redeploy. Wrapper left untouched.

### Per-game live hash table

Hashes are full sha256. "Served" for wrappers is the C2-resolved body (iframe target); after normalize, play URL body IS the game.

| Game | Action | Before (served) | After (served) | Certified dist | Live verify |
|---|---|---|---|---|---|
| alkahest | SKIP (wrapper kept) | `007f78af0453654c063a6d86de406a140e152467a0bb408005927a046daebb19` (via iframe) | unchanged | `5d9217a997c1372646eb67d103506f325f0161ab2496550841a1f0a5a8c8c051` | n/a — SKIP |
| shoeleather | promote `shoeleather.html` → `index.html`; delete twin | `cc73eb32583f2705c62b0028e46fa07e336bbe9ced03bb5ad095ee7e99fa3706` | `cc73eb32583f2705c62b0028e46fa07e336bbe9ced03bb5ad095ee7e99fa3706` | same | PASS (commit `1a02814`, run 33094595925) |
| capriole | delete twin `capriole.html` | `1f1858427b04f66c4045b0a684b46c3ce61ad8fb474362648689c622df7b0180` | `1f1858427b04f66c4045b0a684b46c3ce61ad8fb474362648689c622df7b0180` | same | PASS (commit `d8c672c`, run 33094924006) |
| lines-of-advance | delete twin `loa.html` | `613d265301725eb2db4cf75d81ed24e565d747c329317500bdd1661c1bf11ed1` | `613d265301725eb2db4cf75d81ed24e565d747c329317500bdd1661c1bf11ed1` | same | PASS (commit `6592a05`, run 33095233198) |
| jacquard-index | delete twin `jacquard-index.html` | `5b983d533d715bbe96c364ecff1fb3304b356ac55a7f8d9a5f36bee988ca8d55` | `5b983d533d715bbe96c364ecff1fb3304b356ac55a7f8d9a5f36bee988ca8d55` | same | PASS (commit `d482169`, run 33095457958) |

No reverts. No URL breaks.

---

## Post-normalize deploy-check (evidence)

```
FAIL     alkahest               cert=5d9217a997c13726  C1:FAIL C2:FAIL C3:FAIL C4:PASS C5:PASS
PASS     capriole               cert=1f1858427b04f66c  C1:PASS C2:PASS C3:PASS C4:PASS C5:PASS
PASS     chapel-perilous        cert=3389bd3b733e507b  C1:SKIP C2:PASS C3:SKIP C4:PASS C5:REVIEW
FAIL     innsmouth-2000         cert=4fbfda31b8f8ce9b  C1:SKIP C2:FAIL C3:SKIP C4:PASS C5:FAIL
PASS     jacquard-index         cert=5b983d533d715bbe  C1:PASS C2:PASS C3:PASS C4:PASS C5:PASS
PASS     lines-of-advance       cert=613d265301725eb2  C1:PASS C2:PASS C3:PASS C4:PASS C5:PASS
PASS     material-breach        cert=24c72e0a9396cc8b  C1:PASS C2:PASS C3:PASS C4:PASS C5:PASS
PASS     oddseedz               cert=1e135fc7f1657456  C1:SKIP C2:PASS C3:SKIP C4:PASS C5:PASS
PASS     office-of-the-road     cert=db09fa431575ff45  C1:PASS C2:PASS C3:PASS C4:PASS C5:PASS
PASS     popinjay               cert=06ed089cd18322bf  C1:PASS C2:PASS C3:PASS C4:PASS C5:PASS
PASS     shoeleather            cert=cc73eb32583f2705  C1:PASS C2:PASS C3:PASS C4:PASS C5:PASS
REPORTED stray-squadron         cert=7e2c26085d0cdca5  C1:SKIP C2:FAIL C3:SKIP C4:PASS C5:PASS
REPORTED adversary              cert=10daab33efa3304f  C1:FAIL C2:SKIP C3:FAIL C4:PASS C5:PASS
```

Remaining live FAILs are exactly the queued redeploys / held / pulled rows — not shape work.

Also banked: `generalstaff-private/state/fleet/deploy-check-2026-08-27-post-normalize.{txt,json}`.

---

## STOP

Items 2-4 complete. Item 1 (jacquard live twin content sync) was already done before this lane (`37a49f6`); this lane only removed the twin filename. Items 5-6 + Rule 2 untouched.
