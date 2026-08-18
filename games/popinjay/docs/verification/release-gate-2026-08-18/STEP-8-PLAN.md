# STEP 8 — deploy plan (PREPARED, NOT EXECUTED)

This session did not build-for-publish, commit, push, or deploy anything. Below is the exact
sequence a shipping session would run, plus what is genuinely unresolved.

**Step 8 must not run at all until the step-2 blocker in `CHECKLIST.md` is fixed and step 2 is
re-passed.**

## Is the target surface NEW or EXISTING? — **NEW**

Probed read-only, 2026-08-18:

| URL | HTTP |
|---|---|
| `https://lerugray.github.io/field-trials/` | 200 |
| `https://lerugray.github.io/field-trials/office-of-the-road/` | 200 |
| `https://lerugray.github.io/field-trials/capriole/` | 200 |
| **`https://lerugray.github.io/field-trials/popinjay/`** | **404** |

POPINJAY is on the release-candidate slate in `field-trials/SWEEP-REPORT-20260817.md:175`
("**Strongest.** Steps 1-7 PASS … Step 8 deploy verify; step 9 Ray") but has no shelf row and no
served path. **Publishing would create a new public surface**, and the shelf README's game table,
test-count total (currently "3,233 tests across the ten on the shelf") and roster row all change
with it.

## The repo's own build convention

POPINJAY has no deploy script of its own. Its ship artifact convention is stated in
`DESIGN-SEED.md` §Stack and `CLAUDE.md` rule 7:

```sh
cd "/Users/rayweiss/Desktop/Dev Work/popinjay"
npm test                 # must be 281/281 at the shipping commit
npm run build            # -> dist/popinjay.html, single file, boots from file://
shasum -a 256 dist/popinjay.html
```

Verified this session: the build is deterministic — rebuilding at `968b27b` reproduced
`sha256 5d247388d1db63c4c51fa89689af7119af5405893f22c36dfbc7385446cc4803` byte-identical
(28 modules, 1357.9 KB). `dist/` is gitignored in this repo, so the artifact does not travel via
popinjay's own git history.

## The field-trials vendoring convention

Sibling games live at `field-trials/games/<name>/` on branch `main`
(`github.com/lerugray/field-trials`), each with its source tree, `package.json`, `test/`, README,
`ATTRIBUTION.md`, `og.png`, and — for some — a built `index.html` beside them. Publishing POPINJAY
would mean:

```sh
cd "/Users/rayweiss/Desktop/Dev Work/field-trials"
git switch main && git pull --ff-only
mkdir -p games/popinjay
# vendor the game source + suite + the built single file, per the sibling layout
rsync -a --exclude node_modules --exclude .git --exclude dist \
  "/Users/rayweiss/Desktop/Dev Work/popinjay/" games/popinjay/
cp "/Users/rayweiss/Desktop/Dev Work/popinjay/dist/popinjay.html" games/popinjay/index.html
# collateral that does not exist yet: og.png, ATTRIBUTION.md, the shelf README row
npm --prefix games/popinjay test        # re-prove 281/281 in the shelf repo
git add games/popinjay && git commit && git push origin main
```

## UNRESOLVED — the publish mechanism must be confirmed before running anything

I could not establish, from the repo alone, how `games/<name>/` becomes
`lerugray.github.io/field-trials/<name>/`:

- `field-trials` has exactly **one** branch on origin (`main`) — no `gh-pages`.
- `main`'s root holds only `LICENSE`, `README.md`, `SWEEP-REPORT-20260817.md`, `games/` — no
  root `index.html`, no per-game root directories.
- The only workflow is `.github/workflows/ci.yml`; it builds artifacts and runs probes, but has no
  Pages deploy step.
- `gh api repos/lerugray/field-trials/pages` returns 404 (token scope or Pages configured outside
  the API's reach).
- Yet the served OOR page is live and is a ~815 KB single file carrying full OG meta — so a publish
  path exists that this repo does not describe.

**A shipping session must confirm the actual publish path with Ray (or read the Pages settings in
the browser) before deploying.** Do not guess it. Two other games on the shelf serve from entirely
different hosts (`i2-preview.pages.dev`, `ss-preview.pages.dev`, `chp-preview`), so the shelf is
not uniformly GitHub Pages and POPINJAY's host is itself a decision, not an inference.

## Once published — the step-8 verification itself

1. **Hash-diff the served file against the local build** (page-grepping is BANNED as proof):
   ```sh
   curl -sL "https://<published-url>/" -o /tmp/served-popinjay.html
   shasum -a 256 /tmp/served-popinjay.html "/Users/rayweiss/Desktop/Dev Work/popinjay/dist/popinjay.html"
   # the two digests must match
   ```
2. **Boot the public address as a stranger** — fresh browser profile, the URL only, no dev path:
   title screen, options, start a run, pause, quit, resume.
3. **OG meta wired and resolving** — the served page must carry `og:title`, `og:description`,
   `og:image`, and the `og:image` URL must itself return 200. (POPINJAY has no OG card yet — see
   step 6 finding 6b.)
4. **CI green on the public source repo** after the vendor commit lands.
5. Only then does step 9 open: Ray sees the live page and says ship or hold.
