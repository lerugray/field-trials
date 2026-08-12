> **PROVENANCE**
> - **Source URL:** https://www.classwargames.net/?p=1636 ("THE GAME OF WAR")
> - **Fetched:** 2026-08-07
> - **What this is:** Class Wargames' (Richard Barbrook / Fabian Tompsett, London situationist
>   ludic-science group, founded 2007) own landing page for their reconstruction of Debord's
>   game. It is the page that HOSTS the primary-source PDF used in
>   `debord-nicholson-smith-official-rules.md` — recorded separately here because the page
>   itself also contains framing text and links worth keeping on record.
> - **Why legitimate to hold:** publicly posted, no paywall/login; Class Wargames link to and
>   host the rules PDF specifically to be read and used by researchers/players.
> - **Not mechanically load-bearing on its own** — its numeric/mechanical content is fully
>   subsumed by the PDF it links to (already extracted in full as the primary source doc).
>   Kept here for the framing quote and the link inventory.

---

## Framing (classwargames.net/?p=1636)

Describes the game as "a Clausewitz simulator: a Napoleonic-era military strategy game where
armies must maintain their communications structure to survive – and where victory is
achieved by smashing your opponent's supply network rather than by taking their pieces."

Quotes Debord: "I have studied the logic of war. Moreover, I succeeded, a long time ago, in
presenting the basics of its movements on a rather simple board game."

## Link inventory from this page (fetched 2026-08-07)

- **English rules PDF (primary source, already captured in full):**
  https://www.classwargames.net/wp-content/uploads/2015/10/THE-RULES-OF-THE-GAME-OF-WAR1.pdf
- **Italian rules PDF (Andrea Procaccino translation) — NOT fetched, pointer only:**
  https://www.classwargames.net/wp-content/uploads/2015/10/Kriegspiel_regole.pdf
  — same rules content in Italian; would provide independent-translation cross-check if the
  English text is ever in doubt on a specific clause, but English is already the primary
  ledger language and the two translations derive from the same French original, so this was
  deprioritized. Publicly fetchable if needed later (no paywall observed).
- **Publisher catalog page (Gallimard, French original) — NOT fetched, pointer only:**
  http://www.gallimard.fr/Catalogue/GALLIMARD/Hors-serie-Connaissance/Le-Jeu-de-la-Guerre
  — Gallimard's own catalog listing for the French *Le Jeu de la Guerre* reissue. Publisher
  metadata page, not a rules source; would only matter if the operator ever needs to confirm
  print/ISBN details.
- RSG about page: http://r-s-g.org/kriegspiel/about.php (see
  `rsg-kriegspiel-official-rules.md`)
- Situationniste Blog historical post on the 1977 board game (not fetched — historical/
  provenance interest only, not mechanics):
  https://situationnisteblog.com/2017/03/24/le-jeu-de-la-game-board-game-1977/

---

# Secondary corroborating sources (Wikipedia, freeboardgames.org / iamcxds implementation)

## en.wikipedia.org/wiki/A_Game_of_War (fetched 2026-08-07)

> **Why legitimate to hold:** Wikipedia article text, freely licensed (CC BY-SA), openly
> published, no paywall. Used here as a THIRD independent corroborating source for the same
> numbers already found in the Debord primary text and the RSG secondary source — not
> load-bearing on its own, useful as a citation of last resort for a ledger row where the
> primary PDF's exact wording is ambiguous, and as confirmation of the board's coordinate
> system.

Key facts extracted:
- Board: "a 500-cell rectangular board, arrayed in 25 columns (numbered 1 through 25) and 20
  rows (lettered A through T)." Confirms the coordinate system format (e.g. "E5") used in
  RSG's worked combat example.
- Terrain: mountains (9 per half), pass (1 per half, +2 defense), forts (3 per half, +4
  defense), arsenals (2 per half).
- Unit table given by Wikipedia (their own summary, not a direct quote of Debord): Infantry
  9× Speed 1/Range 2/Def 6/Off 4; Cavalry 4× Speed 2/Range 2/Def 5/Off 7; Foot Artillery 1×
  Speed 1/Range 3/Def 8/Off 5; Mounted Artillery 1× Speed 2/Range 3/Def 8/Off 5; Communication
  Repeaters 2× (speed varies, minimal combat value).
  **Discrepancy flag:** Wikipedia's table lists cavalry "Offense 7" as a flat value, which
  collapses Debord's actual conditional rule (offense 4 normally, 7 only when charging in
  contact) into a single number. **Do not cite Wikipedia's cavalry offense value alone in the
  ledger — cite the Debord primary source's conditional wording instead.** This is exactly
  the kind of secondary-source flattening the primary source exists to catch.
- Combat: attack succeeds when offense − defense > 2 (i.e. matches Debord's "superior by two
  or more" destroy threshold, worked from the article's own paraphrase).
- Communications: units must stay connected to an arsenal or repeater via straight-line path;
  disconnected units are immobile and auto-destroyed if attacked.
- Victory: eliminate all enemy troops, or destroy their arsenals.
- Publication history: French original 1977 (4 prototypes only), mass-market French edition
  1987 (Gallimard, pulped 1991 at Debord's insistence), reissued 2006, English translation
  published by Atlas Press 2008 (the operator's paper copy).

## freeboardgames.org/en/play/kriegspiel + github.com/iamcxds/kriegspiel (fetched 2026-08-07)

> **Why legitimate to hold:** FreeBoardGames.org is an open-source board game portal; the
> Kriegspiel implementation it hosts is MIT/open-source on GitHub
> (github.com/iamcxds/kriegspiel, README fetched directly), built explicitly as "A WEB
> implementation of Guy Debord's A Game of War," citing the same RSG rules page and the same
> Class Wargames page as ITS OWN sources. This is a fourth independent re-implementation,
> useful as a cross-check but strictly downstream of the same two sources already captured
> above — not an independent primary source.

Key facts (from the repo's own README.md, quoted):
- Board: "Two armies with a limited amount of units fight on a 25⨉20 board."
- Units: Infantry, Cavalry, Artillery, Swift Artillery, Relay, Swift Relay. Strongholds:
  Arsenal, Fortress, Mountain Pass, Mountain.
- "Each player can move up to 5 units and attack 1 enemy per turn."
- Combat: "no randomness... higher Atk than its Def... if just higher than 1, the enemy has
  to retreat this unit; otherwise, it will be captured." Cavalry charge: adjacent cavalry
  triggers charge, "Atk becomes 7," aligned cavalry in the charge column also count, "up to 28
  Atk through charge" (4 cavalry × 7). Cannot charge a fort/pass occupant.
- Supply: "originally emitted by Arsenal, also in [straight-line] shape with unlimited range,
  except be blocked by enemy's units or Mountain." Relay units redirect it.
- **Explicit ambiguity/house-ruling admission** (the repo's own README, section "The
  Ambiguities of Rules (my setting)") — the author FLAGS that the following are NOT settled
  by any published rules text and were decided by the implementer:
  - "Will enemy units block fire lines? i.e. can I attack back-line units?" (implementer's
    answer: no, yes)
  - "Will offline enemy units block communication lines? will the retreating unit do?"
    (implementer's answer: no, yes)
  - "Is failed retreat count as a move?" (implementer's answer: no)
  - "Can offline units retreat?" (implementer's answer: no)
  **This is a genuine finding, not just corroboration: these four questions are real gaps
  even in the Debord/Nicholson-Smith primary text** — the primary source does not explicitly
  address whether non-attacking friendly units block enemy fire lines of sight, or whether an
  out-of-communication unit blocks enemy communication lines. Any ledger row touching these
  four points should be marked VERIFY-AT-BUILD (design decision, not sourced fact) rather
  than cited to this implementation's house rule, since the implementer explicitly labels
  these as their own unstated calls, not documented rules.
- **Deployment:** the README confirms "the game provides a default opening" in-app but that
  default is the implementer's own example setup for the digital UI, not a fixed rule from
  Debord's text — consistent with the primary source's §1, which states deployment is each
  player's free choice within their own territory (no canonical starting position exists in
  the base game).
- Visual evidence of actual RSG-app terrain layout: two screenshots pulled from this repo
  (used only as visual reference, not transcribed to exact coordinates — see SOURCES.md gap
  note) are saved alongside this doc set:
  `rsg-kriegspiel-screenshot-terrain-layout.png` (github.com/iamcxds/kriegspiel/raw/master/resource/map.png)
  and `rsg-kriegspiel-screenshot-opening-deployment.png`
  (github.com/iamcxds/kriegspiel/raw/master/resource/opening.png) — both are screenshots of
  Galloway/RSG's actual Mac/iOS app (visible player names "LORD PRIMR..." vs "ARG_IOS" in the
  UI chrome), not the iamcxds implementation itself, showing the labeled quadrants
  ("WESTERN PLAIN," "EASTERN PLAIN," "CENTRAL," "SOUTH-WEST PLAIN," "SOUTH-EAST PLAIN"),
  fortress/arsenal/mountain icon placements, and a live player deployment. Row letters (B–T)
  and column markers are visible on the image edges but were not transcribed to a precise
  coordinate table — flagged as a gap in SOURCES.md.
