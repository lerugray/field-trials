# STEP 8 — DEPLOY PLAN (PREPARED, NOT EXECUTED)

**Do not run any of this until the gate passes.** The 2026-08-18 run **FAILS at step 7** (B1
brick + Q1 silent-notice regression). Step 8 is written now so it is ready the moment those close
and Ray clears step 9.

## Surface: **NEW.** MATERIAL BREACH has no public surface today.

Verified absent from `lerugray.github.io/src/pages/games.astro`, `public/field-trials/`,
`public/field-trials/devlog.json`, and the `field-trials` repo. `generalstaff-private`'s
`state/fleet/roster.yaml` carries `public: false` with the note *"Release candidate: gate dossier
steps 1-7 PASS (2026-08-15); needs step 8 deploy-verify + step 9 Ray."*

So this is a first publication, not a re-release: a new row, a new subpath, nothing to overwrite.

## The serving repo

Two repos are involved and only one actually serves:

- `lerugray.github.io` (github.com/lerugray/lerugray.github.io) — **the serving repo.**
  `.github/workflows/deploy.yml` publishes to GitHub Pages on every push to `main`.
- `field-trials` (github.com/lerugray/field-trials) — vendors each game's `src/` + design docs for
  provenance. **GitHub Pages is not enabled on it** (confirmed 404 in its own
  `SWEEP-REPORT-20260817.md`), so it is an inspection mirror, not a play surface.

## Commands, in order

Absolute paths; MB has no deploy script of its own, so the copy is explicit.

```sh
# 1. Build the artifact at the shipping commit.
cd "/Users/rayweiss/Desktop/Dev Work/material-breach"
node --test                        # must be 197/197 (or higher) at the shipping HEAD
node scripts/build-singlefile.mjs  # -> dist/index.html

# 2. Place it on the serving repo as a new field-trials subpath.
mkdir -p "/Users/rayweiss/Desktop/Dev Work/lerugray.github.io/public/field-trials/material-breach"
cp "/Users/rayweiss/Desktop/Dev Work/material-breach/dist/index.html" \
   "/Users/rayweiss/Desktop/Dev Work/lerugray.github.io/public/field-trials/material-breach/index.html"

# 3. Add the roster row in src/pages/games.astro (hardcoded `games: FieldTrialGame[]` array:
#    id, name, description, register, url, status, tests, audit, shell colors, figure) and a
#    labelArt SVG entry. Name field must read MATERIAL BREACH.

# 4. Publish.
cd "/Users/rayweiss/Desktop/Dev Work/lerugray.github.io"
git add public/field-trials/material-breach/index.html src/pages/games.astro
git commit -m "field-trials: publish MATERIAL BREACH"
git push origin main               # Pages workflow rebuilds automatically

# 5. Flip the fleet roster and regenerate the devlog feed.
#    generalstaff-private/state/fleet/roster.yaml : public: false -> true, set public_url:
cd "/Users/rayweiss/Desktop/Dev Work/generalstaff-private"
bun scripts/generate-fleet-status.ts   # regenerates lerugray.github.io/public/field-trials/devlog.json
```

Expected public URL: `https://lerugray.github.io/field-trials/material-breach/`
(confirm the exact subpath against a sibling row in `games.astro` before committing).

## Auth

The GitHub Pages path needs only `git push` — no Cloudflare token, no wrangler.

If a Cloudflare Pages preview is used instead (the `*-preview.pages.dev` pattern some siblings
follow), the documented gotcha applies: **`CLOUDFLARE_API_TOKEN` in the environment is
read-only analytics scope** and silently fails the deploy. Use the wrangler OAuth token by
unsetting it:

```sh
env -u CLOUDFLARE_API_TOKEN npx wrangler pages deploy \
  "/Users/rayweiss/Desktop/Dev Work/material-breach/dist" \
  --project-name material-breach-preview --branch=main --commit-dirty=true
```

## Blocking prerequisite the gate already found

`dist/index.html` carries **no OG/social meta at all** — only `charset` and `viewport`. Step 8
requires "OG meta wired and resolving," so `og:title` (MATERIAL BREACH), `og:description`,
`og:image` and `og:url` must be added to the build before publishing. The OG image itself must be
drawn from SHIPPED assets and cast-verified by path, per the cast-reference addendum — it does not
exist yet.

## Step 8 verification, after the push

1. **Hash-diff the served file against the local build** — page-grepping is banned as proof:
   ```sh
   shasum -a 256 "/Users/rayweiss/Desktop/Dev Work/material-breach/dist/index.html"
   curl -sL https://lerugray.github.io/field-trials/material-breach/ | shasum -a 256
   ```
   The two digests must match exactly.
2. **Boot from the public address** in a fresh profile — not a local path — and confirm the title
   screen, options and provenance all render, and that a first session plays.
3. **OG meta resolves** — fetch the URL and confirm the tags are present and the image loads.
4. **CI green** on `lerugray.github.io` (the Pages workflow run for the publishing commit).
5. Record all four in this dossier, then hand to Ray for step 9.
