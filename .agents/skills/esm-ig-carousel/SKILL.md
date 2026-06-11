---
name: esm-ig-carousel
description: >-
  Create ESM or Polymarket baseball Instagram carousel copy or rendered 1080x1350 PNG assets from prompts like "Make an IG carousel for [player]", "make a Polymarket baseball carousel", "new carousel brief", or "turn this player topic into a carousel". Use when the user provides team colors, cover text, slide copy, image paths, meme captions, or asks for carousel graphics.
---

# ESM IG Carousel

## Trigger Examples

- `Make an IG carousel for Carson Benge`
- `Make a Polymarket baseball carousel for Bryce Eldridge`
- `New carousel brief: Team: Giants...`
- `Turn this Mets topic into a carousel`
- `Make me a 5-slide IG post about Christian Scott`

## First Decision

- If the user provided final stats/copy, do not re-verify them. Build from the supplied brief.
- If the user asks for research or gives only a player/topic, verify current sports context before writing.
- If the user provides images, preserve the exact order unless they explicitly ask to reorder.
- If rendering a Polymarket carousel, read `references/polymarket-carousel-workflow.md` and route the brief through `references/carousel-formats/README.md` before building.
- If the user sends example slides for a carousel type, analyze one format at a time and update the matching `references/carousel-formats/*.md` file with aesthetic notes.

## Polymarket Baseball Render Workflow

1. Parse team, team colors, post folder, cover text, slide copy, bottom stats, meme captions, and local image paths.
2. Identify the carousel format: analytical, meme-heavy, list/ranking, trade/rumor, player-report, or a user-requested hybrid.
3. Read the matching format file under `references/carousel-formats/`.
4. Use the first supplied image as the cover image when the user labels it as cover or provides five images for a four-info-slide carousel.
5. Use the remaining slide images in order for info slides.
6. Build `01_cover.png` first.
7. Build info slides with a tight white top copy block and image-dominant lower area.
8. Add the required meme still slide unless explicitly waived or the selected list format intentionally maps every supplied image to list slides.
9. Export every slide as 1080x1350 PNG.
10. Save into a dedicated post folder and mirror to `Documents` when running locally.
11. Provide the folder link and a brief verification note.

## Writing-Only Workflow

1. Verify current sports context and latest stats unless supplied as final.
2. Pick one clear angle that can carry 4-6 slides.
3. Write a strong cover/title slide with no unnecessary subtext.
4. Keep slide copy short, direct, and readable.
5. Use one stat cluster per slide.
6. Include a meme slide concept when appropriate.
7. End with a useful debate point or caption prompt.

## Scripts

For portable Polymarket rendering:

```bash
python3 scripts/polymarket-carousel.py templates/polymarket-carousel-brief.json
```

For older Fireside-style carousel rendering:

```bash
node scripts/render-fireside-carousel.mjs
```

Do not commit rendered media, downloaded images, private meme banks, paid asset files, or local font files.

## Verification

- Output PNGs are 1080x1350.
- Slide order matches the supplied image order.
- Cover headline is readable, centered, and no more than two lines unless requested.
- Cover gradient is deep enough to carry text but not so high that it muddies the player.
- Info-slide gradients are softer than cover gradients.
- Selected format preset was followed or the hybrid was clearly requested.
- Meme slide uses a real still image.
- Folder was mirrored to `Documents` when local rendering was requested.
- No credentials, cookies, tokens, local memory, or generated cache files were added.

## Expected Output

- For rendered carousels: folder link, slide filenames, verification note, and optional contact sheet if created.
- For writing-only carousels: cover text, slide-by-slide copy, meme caption options, caption, and verification/source notes.

## References

- `references/polymarket-carousel-workflow.md`
- `references/carousel-formats/README.md`
- `references/style-guide.md`
- `references/output-rules.md`
- `references/examples.md`
- `templates/polymarket-carousel-brief.json`
- `templates/carousel-formats/`
- `templates/social-post-template.md`
