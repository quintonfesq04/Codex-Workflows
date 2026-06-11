---
name: esm-ig-carousel
description: >-
  Create ESM-style Instagram carousel concepts or assets from prompts like "Make an IG carousel for [player]", "turn this into a carousel", or "make me a Mets carousel". Use for sports carousel writing, slide structure, caption creation, image selection guidance, and template-driven carousel rendering.
---

# ESM IG Carousel

## Trigger Examples

- `Make an IG carousel for Carson Benge`
- `Turn this Mets topic into a carousel`
- `Make me a 5-slide IG post about Christian Scott`

## Workflow

1. Verify the current sports context and latest stats.
2. Pick one clear angle that can carry 4-6 slides.
3. Write a strong first slide with the player/topic as the first-viewport signal.
4. Keep slide text short, direct, and readable.
5. Use one stat cluster per carousel, not a stat dump.
6. End with a question or debate prompt.
7. Create a caption in ESM social voice.
8. If rendering assets, use approved or licensed images and verify the player/team context.

## Suggested Slide Shape

1. Hook
2. Stat proof
3. Why it matters now
4. Caveat or pressure point
5. Question/engagement slide

## Scripts

Use the carousel renderer as a reference or starting point:

```bash
node scripts/render-fireside-carousel.mjs
```

Some source carousel scripts may require local image access or paid services. Do not assume those transfer.

## Verification

- Current stats and schedule checked.
- Slide text fits mobile.
- Images match the player/current team.
- Caption is in chat.
- No source names or links inside carousel copy unless required.

## Expected Output

- Slide-by-slide copy
- Caption
- Optional rendered assets or template instructions
- Verification note

## References

- `references/style-guide.md`
- `references/output-rules.md`
- `references/examples.md`
- `templates/social-post-template.md`
