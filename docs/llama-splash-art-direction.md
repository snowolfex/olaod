# Llama Splash Art Direction

This document defines the approved candidate pool for the limited splash-page plush-llama system.

For a faster sign-off workflow, use `docs/llama-splash-review-board.md` alongside this file.

Technical:

- The splash system should use one shared llama design language across all themes so theme changes do not look like unrelated mascots.
- Each theme should have three approved variants, with runtime selection choosing from the active theme pool only.
- Motion has to stay light enough for desktop and mobile shells, with a reduced-motion fallback that still preserves identity.

Layman's terms:

- The llama should always feel like the same character, even when the theme changes.
- Each theme gets a small set of mascot versions so the splash feels fresh without becoming visually inconsistent.
- The animation should feel lively but never heavy, distracting, or too expensive for smaller devices.

## Goal

Technical:

- Keep a shared llama identity across themes.
- Offer three visual variants per theme.
- Randomly choose one approved llama from the active theme when the splash screen appears.
- Keep motion lightweight enough for desktop and mobile.

Layman's terms:

- Make one mascot family, not three unrelated mascots.
- Give each theme enough variety to avoid repetition.
- Show a random approved llama that matches the current theme.
- Keep the animation simple enough that it still feels smooth on phones and laptops.

## Current Approved Base

Technical:

- The shared base mascot direction is now a plush llama rather than a flat generic cartoon llama.
- The canonical palette is warm cream wool, oat face and ears, cocoa nose, espresso eyes, and muted dusty-teal accents.
- Accessories and theme accents can vary, but the plush silhouette, oversized head, forehead tuft, rounded muzzle, and short plush forelimbs should remain stable.

Layman's terms:

- The mascot should feel like a soft stuffed llama first.
- Keep the same cream-and-oat llama across themes, then change trim and mood around it.
- Do not drift into pink body tones, realistic animal fur, or hard plastic toy rendering.

## Shared Base Rules

All nine llamas should share the same base design language:

- Same body proportions.
- Same head-to-body ratio.
- Same leg length.
- Same face geometry.
- Same plush stuffed-animal silhouette.
- Same forehead tuft and rounded muzzle.
- Same overall silhouette readability at small sizes.
- Same animation budget and loop length.

Only these elements should vary by theme and variant:

- Accent colors.
- Accessories.
- Eye and eyebrow attitude.
- Wool trim details.
- Small motion flavor.

Recommended implementation constraints:

- Transparent background asset.
- Readable at mobile splash sizes.
- In-place dance only, no roaming.
- Loop length between 2.5 and 4 seconds.
- Reduced-motion fallback should become blink plus subtle breathing only.
- Base wool and face colors should stay inside the cream/oat/cocoa family.
- Avoid pink body palettes and avoid glossy plastic rendering.

Technical:

- Shared silhouette, proportion, and loop-budget rules are mandatory so runtime swaps do not cause a visible style break.
- Theme identity should come from trim, accessories, expression, and accent treatment rather than a different body plan.
- Motion must remain in-place because the splash art is decorative UI chrome rather than a navigational scene element.

Layman's terms:

- No matter which llama shows up, people should recognize it as the same mascot at a glance.
- Theme differences should come from styling details, not from redesigning the whole animal.
- The llama should dance in place, not wander around the screen.
- The mascot should still look plush and soft even in the more tech or dark variants.

## Theme Pools

Technical:

- The theme pools below define the approved variant inventory, prompt anchors, and tone boundaries for the splash system.

Layman's terms:

- These are the mascot options the app can draw from for each theme, along with the look and mood each one should carry.

### Plain Theme

#### Plain 01: Soft Bounce

- ID: `plain-soft-bounce`
- Role: safest default mascot
- Visual brief:
  - Cream or warm ivory wool.
  - Rounded face.
  - Short snout.
  - Soft peach cheeks.
  - Tiny accent scarf or ribbon.
  - Friendly, low-drama smile.
- Motion brief:
  - Gentle two-step bounce.
  - Blink.
  - Ear flick.
- Tone:
  - Warm.
  - Welcoming.
  - Product-polished.
- Prompt:

```text
A small cute cartoon llama mascot for a modern web app splash page, soft rounded body, cream wool, warm ivory fur, peach cheeks, tiny friendly smile, small accent scarf, clean vector style, minimal shapes, polished UI mascot, front three-quarter pose, charming but not childish, subtle motion-ready design, transparent background
```

#### Plain 02: Ribbon Pop

- ID: `plain-ribbon-pop`
- Role: brighter playful plain variant
- Visual brief:
  - Soft white or pale cream wool.
  - Colored ribbon collar.
  - Slightly brighter accent hooves.
  - Open, cheerful eyes.
  - Slightly perkier cheeks than Soft Bounce.
- Motion brief:
  - Sway left.
  - Sway right.
  - Tiny hoof tap.
- Tone:
  - Cheerful.
  - Bouncy.
  - Cute without becoming toy-like.
- Prompt:

```text
A small cartoon llama mascot for a premium friendly web app splash page, soft fluffy white wool, colorful ribbon collar, bright accent hooves, rounded face, cheerful expression, clean vector illustration, polished UI mascot, playful but tasteful, front three-quarter pose, transparent background
```

#### Plain 03: Marshmallow Strut

- ID: `plain-marshmallow-strut`
- Role: most mascot-heavy plain variant
- Visual brief:
  - Extra fluffy wool mass.
  - Slightly chunkier body.
  - Stubby legs.
  - Puffball tail.
  - Relaxed, confident eyes.
- Motion brief:
  - Tiny hip sway.
  - Bounce.
  - Blink.
- Tone:
  - Confident.
  - Soft.
  - Memorable.
- Prompt:

```text
A small adorable cartoon llama mascot with extra fluffy marshmallow-like wool, rounded chunky body, stubby legs, puffball tail, relaxed confident eyes, polished vector style, premium UI branding mascot, front three-quarter pose, cute but elegant, transparent background
```

### Tech Theme

#### Tech 01: Neon Circuit

- ID: `tech-neon-circuit`
- Role: primary tech-theme candidate
- Visual brief:
  - Light gray or white wool.
  - Cyan and electric blue accent lines.
  - Subtle circuit-pattern trim.
  - Tiny visor or slim glasses.
  - Clean, intelligent expression.
- Motion brief:
  - Compact bounce.
  - Head tilt.
  - Faint glow pulse.
- Tone:
  - Sharp.
  - Clever.
  - Futuristic.
- Prompt:

```text
A small cartoon llama mascot for a futuristic tech web app splash page, same friendly rounded llama body shape, light gray wool, cyan and electric blue glowing accents, subtle circuit-like trim, tiny smart visor or slim glasses, polished vector illustration, modern UI mascot, playful but intelligent, clean silhouette, front three-quarter pose, transparent background
```

#### Tech 02: Terminal Runner

- ID: `tech-terminal-runner`
- Role: developer-oriented tech variant
- Visual brief:
  - Same base llama shape.
  - Slightly more angular forelock.
  - Small floating cursor or terminal glyph.
  - Mint and electric blue trim.
  - More alert eye shape.
- Motion brief:
  - Rhythmic hoof steps.
  - Quick bounce reset.
  - Tiny head nod.
- Tone:
  - Restless.
  - Nerdy.
  - Capable.
- Prompt:

```text
A small cartoon llama mascot for a developer-focused tech splash page, rounded llama body with a slightly angular forelock, subtle floating cursor glyph, mint and electric blue accents, polished vector style, clever modern UI mascot, energetic but clean, front three-quarter pose, transparent background
```

#### Tech 03: Pixel Pulse

- ID: `tech-pixel-pulse`
- Role: playful retro-tech candidate
- Visual brief:
  - Rounded llama silhouette.
  - Pixel-edge trim.
  - Glowing ear tag.
  - Cyan, lime, and cool-screen accent colors.
  - Friendlier face than Terminal Runner.
- Motion brief:
  - Small bounce.
  - Soft glitch-pop feel.
  - Blink.
- Tone:
  - Playful.
  - Retro-tech.
  - Approachable.
- Prompt:

```text
A small playful cartoon llama mascot for a retro-tech web app splash page, rounded body, subtle pixel-edge trim, glowing ear tag, cyan and lime accent details, polished vector illustration, UI mascot, friendly tech energy, front three-quarter pose, transparent background
```

### Dark Theme

#### Dark 01: Metal Wool

- ID: `dark-metal-wool`
- Role: primary heavy-metal dark candidate
- Visual brief:
  - Charcoal or black wool.
  - Ember red accent details.
  - Tiny spiked collar.
  - Subtle silver nose ring.
  - Confident narrowed eyes.
- Motion brief:
  - Stomp bounce.
  - Mini headbang.
  - Tail flick.
- Tone:
  - Bold.
  - Mischievous.
  - Loud in a fun way.
- Prompt:

```text
A small cute-but-badass cartoon llama mascot for a dark heavy-metal web app splash page, charcoal wool, black fur, ember red accent details, tiny spiked collar, subtle silver nose ring, shaggy fringe, confident expression, polished vector style, stylish not scary, playful heavy-metal attitude, front three-quarter pose, transparent background
```

#### Dark 02: Doom Alpaca

- ID: `dark-doom-alpaca`
- Role: cooler stylish dark variant
- Visual brief:
  - Side fringe over one eye.
  - Dark coat.
  - Minimal chain or bracelet detail.
  - Deep crimson accent lines.
  - More composed expression than Metal Wool.
- Motion brief:
  - Slow swagger.
  - Two-beat nod.
  - Reset pose.
- Tone:
  - Stylish.
  - Cool.
  - Slightly dramatic.
- Prompt:

```text
A stylish dark-theme cartoon llama mascot for a premium web app splash page, dark wool, side fringe covering one eye, subtle chain accessory, deep crimson accent details, polished vector design, cool confident expression, front three-quarter pose, heavy-metal fashion attitude, transparent background
```

#### Dark 03: Stage Beast

- ID: `dark-stage-beast`
- Role: biggest theatrical dark variant
- Visual brief:
  - Ragged mini cape or back cloth.
  - Angular brows.
  - Ember glow accents.
  - Slightly more dramatic silhouette while staying readable.
  - Still cute enough to match the other eight.
- Motion brief:
  - Power-pose bounce.
  - Shoulder hit.
  - Recover pose.
- Tone:
  - Theatrical.
  - Over-the-top.
  - Fun.
- Prompt:

```text
A dramatic but cute cartoon llama mascot for a dark heavy-metal themed splash page, charcoal wool, small ragged cape, ember glow accents, angular brows, polished vector style, theatrical stage presence, playful not scary, front three-quarter pose, transparent background
```

## Approval Workflow

Each variant should be reviewed against these criteria:

- Reads clearly at small mobile sizes.
- Still feels like the same llama family.
- Looks brand-safe for a premium app.
- Does not cross into childish sticker territory.
- Carries the theme through attitude and trim, not just color.

Recommended approval states:

- Approved.
- Needs revision.
- Rejected.

Technical:

- Approval should prioritize silhouette consistency, small-size readability, and theme fit before novelty.

Layman's terms:

- Pick the versions that still look clear, on-brand, and recognizably related when they appear small on a real splash screen.

## Random Splash Selection Rule

When the splash screen appears:

1. Detect the active theme.
2. Load the approved three-llama pool for that theme.
3. Randomly choose one candidate from that pool.
4. Optionally avoid repeating the immediately previous choice for the same theme.

Suggested pool shape:

```ts
type SplashTheme = "plain" | "tech" | "dark";

type LlamaVariant = {
  id: string;
  theme: SplashTheme;
  label: string;
  approved: boolean;
};
```

Suggested candidate map:

```ts
const llamaPools = {
  plain: ["plain-soft-bounce", "plain-ribbon-pop", "plain-marshmallow-strut"],
  tech: ["tech-neon-circuit", "tech-terminal-runner", "tech-pixel-pulse"],
  dark: ["dark-metal-wool", "dark-doom-alpaca", "dark-stage-beast"],
} as const;
```

Technical:

- Runtime selection should stay scoped to the active theme and should preferably avoid immediately repeating the prior variant for that same theme.

Layman's terms:

- When the app opens, it should choose a llama that matches the current theme and try not to show the exact same one twice in a row.

## Recommended First Build Order

If implementation starts later, use this order:

1. Build one shared llama base rig.
2. Approve one visual per theme first.
3. Add the remaining two variants per theme after the first trio feels correct.
4. Add random theme-pool selection.

Technical:

- This order keeps production risk down by proving the shared rig first, then validating one representative variant per theme before expanding the asset set.

Layman's terms:

- Build the core mascot once, make sure one good version works for each theme, and only then spend time on the rest of the variants and random selection logic.
5. Add reduced-motion and mobile-size tuning last.

## Current Preferred Leads

If a fast first implementation is needed before all nine are illustrated, start with:

- Plain: `plain-soft-bounce`
- Tech: `tech-neon-circuit`
- Dark: `dark-metal-wool`

Those three are the strongest primary anchors for the family.

For all three, start from the same plush base used in the Help/PDF mascot system rather than from a flat vector-only llama.