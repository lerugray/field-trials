### 1. SUN-DISK CHROME  
*Warm, friendly cream-and-orange register straight from a Monster Rancher memory card menu.*  

**PALETTE**  
- `#F7E8C4` – panel base (warm cream)  
- `#FFF3D6` – panel edge light (highlight)  
- `#C8A87C` – panel edge dark (shadow)  
- `#2E1E0C` – background (deep brown vignette)  
- `#3A2A18` – text (dark chocolate)  
- `#E88C3A` – accent (sunset orange)  
- `#C04040` – warning (muted red)  
- `#FFD966` – gold/reward (harvest gold)  
- `#5A8F4A` – stat-positive green  

**CHROME VOCABULARY**  
- **Corners:** Chunky 4‑px radius, anti‑aliased with a 2‑px dither fringe.  
- **Bevel:** 2‑px outer border; top/left `#FFF3D6`, bottom/right `#C8A87C`. Creates a raised “button” panel.  
- **Gradient:** 4‑step quantized ramp from edge light to base, filled with ordered dither (Bayer 4×4) to avoid banding.  
- **Buttons:** Default raised bevel; hover/pressed inverts bevel (sunken) and adds a 1‑px inner dark line.  
- **Stat bars:** Segmented 2‑px‑tall blocks with 1‑px highlight on top; partial segments use a 50% dither pattern.  

**TYPE**  
- Bitmap pixel face (8×8 or 16×16 chunky humanist, like Monster Rancher’s menu font).  
- All‑caps labels, 1‑px black drop‑shadow offset (1,1).  

**BACKGROUNDS**  
- Radial vignette from `#F7E8C4` at center to `#2E1E0C` at edges, overlaid with a subtle 2‑px dot grid (memory‑card texture).  

**WHERE THE SPRITES SIT**  
- Painted creatures rest inside a recessed “portrait well”: a sunken panel with a 2‑px dark inner border and a 1‑px highlight on the inside top/left, giving a deep frame. A soft drop‑shadow ellipse beneath the creature grounds it.  

**RISK**  
The warm cream/orange chrome can sap contrast from similarly‑toned creature palettes, making them blend into the UI.  

---

### 2. COLD‑CORE CONSOLE  
*Cooler, tech‑teal register echoing Dragon Seeds’ metallic menus and CRT‑monitor framing.*  

**PALETTE**  
- `#2A3A4A` – panel base (dark blue‑grey)  
- `#5A7A9A` – panel edge light (steel highlight)  
- `#1A1A2A` – panel edge dark (near‑black)  
- `#0D0D1A` – background (deep monitor void)  
- `#C0D0E0` – text (icy white‑blue)  
- `#3A8A8A` – accent (teal)  
- `#C04040` – warning (muted red)  
- `#D4AF37` – gold/reward (brass)  
- `#00E5FF` – bright cyan (critical highlight)  

**CHROME VOCABULARY**  
- **Corners:** Slight 2‑px radius, hard‑edged.  
- **Bevel:** 2‑px outer border; top/left `#5A7A9A`, bottom/right `#1A1A2A`. Metallic raised panel.  
- **Gradient:** 3‑step linear ramp (dark→mid→light) with 2×2 ordered dither.  
- **Buttons:** Raised bevel; pressed state inverts bevel and adds a 1‑px inner `#0D0D1A` shadow.  
- **Stat bars:** Segmented metallic blocks (2‑px tall, 1‑px highlight). Full bar adds a 1‑px cyan glow line at the top.  

**TYPE**  
- Bitmap pixel font, chunky monospace or tech sans‑serif (like Dragon Seeds’ stat screen).  
- All‑caps, 1‑px black drop‑shadow offset (1,1).  

**BACKGROUNDS**  
- Dark CRT‑style backdrop: a dithered radial gradient from `#1A2A3A` to `#0D0D1A`, overlaid with a faint scanline pattern (alternating 1‑px lines at 50% opacity).  

**WHERE THE SPRITES SIT**  
- Creature appears inside a recessed “monitor screen”: a thick 4‑px dark border with a 1‑px inner cyan glow, mimicking a CRT display. A subtle scanline overlay sits above the sprite.  

**RISK**  
The cold, metallic palette can make the raising‑sim feel clinical and uninviting, undercutting the emotional bond with creatures.  

---

### 3. VERDANT AMBER  
*Synthesis register: warm organic amber fused with cool teal tech, like a sunset‑lit laboratory console.*  

**PALETTE**  
- `#3A3A2A` – panel base (dark olive‑brown)  
- `#8A7A5A` – panel edge light (warm sand)  
- `#1E1E0A` – panel edge dark (deep forest shadow)  
- `#1A1A0F` – background (charred earth)  
- `#E8D8A0` – text (pale gold)  
- `#2A8A8A` – accent (teal)  
- `#C04040` – warning (muted red)  
- `#D4AF37` – gold/reward (rich gold)  
- `#5A8F4A` – stat‑positive green  
- `#8A5A2A` – secondary accent (copper)  

**CHROME VOCABULARY**  
- **Corners:** Chunky 4‑px radius with a 2‑px dither fringe, blending the warm and cool edges.  
- **Bevel:** 2‑px outer border; top/left `#8A7A5A`, bottom/right `#1E1E0A`. Raised panel with a slight metallic sheen.  
- **Gradient:** 4‑step quantized ramp that shifts hue from warm sand to cool teal at the midpoint, dithered with Bayer 4×4.  
- **Buttons:** Raised bevel; pressed inverts bevel and adds a 1‑px inner `#1E1E0A` shadow.  
- **Stat bars:** Segmented blocks with a metallic top highlight; positive stats use a teal‑to‑gold gradient, negative stats a copper‑to‑red gradient.  

**TYPE**  
- Bitmap pixel font, slightly rounded humanist (like a hybrid of Monster Rancher’s warmth and Dragon Seeds’ clarity).  
- All‑caps, 1‑px black drop‑shadow offset (1,1).  

**BACKGROUNDS**  
- Dithered sky gradient from warm amber (`#8A7A5A`) at the horizon to dark teal (`#1A2A3A`) at the top, overlaid with a subtle 2‑px dot grid and a soft vignette.  

**WHERE THE SPRITES SIT**  
- Creature framed in a sunken viewing port with a warm inner glow: a 2‑px dark border, a 1‑px `#8A7A5A` highlight inside, and a soft drop‑shadow ellipse beneath. The port’s background uses a faint amber‑to‑teal dither.  

**RISK**  
The dual‑temperature palette may read as indecisive, lacking the strong, singular identity of either reference.
---

## LOCKED (Ray, 2026-08-06, refined same day): SUN-DISK CHROME v2 — classic PSX RPG system chrome

Ray's refinement after the v1 mockup: NOT cream/orange-dominant. The base is the classic
PSX RPG menu register — "almost corporate white, beige and blues" (FF/Suikoden-class
system menus): warm near-white + beige panel bases, banded royal-to-navy BLUE chrome for
frames/selection/headers, dark-navy or white-on-blue type. The Sun-Disk warm cream/orange
survives as ACCENT TINTS ONLY — stat deltas, rewards, highlights, the creature-window
warmth. Dither banding + hard bevels + big rounded corners unchanged. Mockup v2 fired.


---

## VIBE-LOCKED (Ray, 2026-08-06 night, on the v3 mockup): the v3 treatment is the register

Ray: "this look was the vibe I was looking for, if not exactly perfect mockup wise, the
vibe is." Mockup imperfections (placeholder blob, browser quirks) are non-binding; the
REGISTER is binding:
- Square-cornered BLOCKY windows, thick straight bevels (light #F8F4E8 / dark #6A748E),
  hard offset shadows only.
- PRIMARY panels: translucent deep navy (rgba(24,36,88,~0.82)) over a banded navy
  backdrop (#101A3C→#1C2A5E hard stops), WARM WHITE #F4F0E2 text.
- SECONDARY chrome (summon bar, ribbons, chips): opaque warm-white/beige #F2EFE6/#E4DCC8,
  dark navy #1E2A4A text. Header band #24387A, white type.
- ACCENTS ONLY: orange #E88C3A (deltas/active), cream-gold #F0C060 (money/reward), red
  #C04040 (warnings).
- READABILITY HARD RULE: warm-white-on-navy, navy-on-light, white-on-header-blue — no
  other text/background pairs.
- Segmented PSX stat meters (discrete cells, 1px gaps); selection = inverted blue block.
- TYPE: in-game = CODE-DRAWN BITMAP FONT in the MR/Dragon Seeds spirit (not a webfont);
  chunky, no thin weights.
- The procedural creature sprites are UNTOUCHED — Ray likes them; this is a chrome pass.
Implementation: docs/DIRECTIONS-20260806-M9-chrome.md.
