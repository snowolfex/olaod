# Plush Llama Oload Implementation Map

## Goal

Translate the plush llama direction into current Oload surfaces without needing the character to dominate every screen.

## Priority order

1. Help and PDF section mascots
2. Splash / hero studies
3. Walkthrough companion moments
4. Empty-state illustrations

## Surface map

### Help surface
- Use half-body or bust plush llama art at the top of the guide.
- Pair one calm mascot with the hero intro rather than many small competing mascots.
- Let section-specific mascots reuse the same palette with context accents only.

### PDF manual
- Use simplified bust art per major section.
- Keep the llama posed toward section content, cards, or speech bubbles.
- Avoid heavy scene detail so the PDF stays readable and printer-safe.

### Guided walkthrough
- Use the plush llama as a companion only in intro, checkpoint, and final steps.
- Keep spotlight steps mostly UI-led, with mascot reinforcement rather than mascot takeover.
- Expression should be supportive and lightly playful.

### Splash or landing art
- This is where the fullest llama scene should live.
- Use seated or bust-forward pose, soft atmospheric background, and richer lighting.
- Keep the scene premium and calm rather than loud or gamey.

### Empty states
- Use the smallest and simplest llama version here.
- One bust, seated plush, or tiny wave pose is enough.
- Large negative space should remain available for copy and actions.

## Visual consistency rules

- always non-pink
- always warm cream / oat / cocoa / espresso base
- accents can shift by context, but the core face colors must stay stable
- eyes and ears must remain readable at small sizes
- keep the forehead tuft as the main recognition cue

## Current repo alignment

- `src/components/help-panel.tsx`
  - Best target for section mascot styling and PDF illustration tone.

- `src/components/guided-walkthrough.tsx`
  - Best target for intro and completion mascot moments if artwork is added later.

- `docs/llama-splash-art-direction.md`
  - Best target for folding this plush direction into the approved splash lanes.

## Best immediate next implementation

If this moves from reference into shipped UI, start here:

1. Replace the current generic mascot vibe in Help/PDF with plush-llama-specific art direction.
2. Add one plush-llama hero illustration for the main guide or splash.
3. Add a simplified head-only plush llama for small supporting spots.
