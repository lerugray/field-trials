Implemented findings 2 and 3 only.

Changed files:

- `src/save.js`, `src/meta.js`, `src/run.js`, `src/main.js`
- `src/soak.js`, `src/shop.js`
- `scripts/soak.mjs`, `scripts/soak-harness.mjs`
- `test/persistence-integrity.test.js`, `test/soak.test.js`
- `PROGRESS.md`
- Rebuilt `dist/office-of-the-road.html`

Results:

- Tests: **145/145 before → 157/157 after**
- `scripts/gates.mjs`: **all M2/M4/M6/M7 gates green**
- Acceptance soak: **PASS 6/6**, 1 fresh reload, 0 blockers, 0 defects
- Broken-verb proof: `--break-verb shopTxn` exited **1**, reporting **5/6**, one DEFECT and one BLOCKER; intact rerun passed 6/6
- Wipe, early return, and generic successful closure are non-resumable and idempotent
- Mid-combat and pending-draft resumes are byte-exact; v4 saves are safely invalidated

Chrome/Chromium was unavailable, so the permitted fresh-harness reboot path was used. It destroys and reboots the real game module, rereads shared storage, and resumes through the docket. No browser screenshot was produced. No commit was made. Existing untracked proof images were untouched.
