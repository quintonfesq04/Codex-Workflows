---
name: esm-player-compilation
description: >-
  Create ESM-style MLB player social posts and 16:9 Baseball Savant compilations from prompts like "New post: [player]", "Create a player compilation for [player]", or "Make a video for [player]". Use for stat-backed player narratives, hot streaks, contract debates, game-preview starter posts, RISP clips, and highlight or lowlight compilation requests.
---

# ESM Player Compilation

## Trigger Examples

- `New post: Marcus Semien`
- `Create a player compilation for Christian Scott`
- `Make a video for Freddy Peralta`
- `Get me Marcus Semien clips with RISP`
- `Show both highlights and lowlights`

## Workflow

1. Confirm the player and sport context.
2. Verify current date, team, schedule, probable starter, and stat window when the copy uses `today`, `tonight`, `tomorrow`, `last 7 games`, or a series/opponent.
3. Research with FanGraphs, Baseball Savant, MLB Stats API, and team/game logs.
4. Choose a believable narrative before selecting clips.
5. If rankings are used, state the source and exact filter internally before writing.
6. Use Baseball Savant clips first.
7. Use only clips that match the stated window.
8. Render 16:9 at 1920x1080 with blended transitions.
9. Enforce strict duration: 45 seconds minimum, 3 minutes maximum.
10. For skeptical pitcher narratives, contract debates, or "show both" requests, include both highlights and lowlights.
11. Return the finished video path/embed and the tweet in chat.

## Scripts

Run from the repo root:

```bash
npm run mlb -- "Player Name" --season 2026 --last-games 7 --clips all --clip-seconds 10
```

Situational example:

```bash
npm run mlb -- "Marcus Semien" --season 2026 --days-back 90 --situation risp --clips all
```

Balanced pitcher example:

```bash
npm run mlb -- "Freddy Peralta" --season 2026 --last-games 7 --clips all --clip-seconds 10 --mix-results
```

Use `--dry-run` before long renders when validating clip selection.

## Verification

- Confirm output is 1920x1080 and 16:9 with `ffprobe`.
- Confirm duration is between 45 and 180 seconds.
- Confirm clip count and selected play list in `metadata.json`.
- Confirm the tweet is under the Free X character limit.
- Confirm stats/ranks are from the intended source.

## Expected Output

- Embedded or linked `compilation.mp4`
- Tweet in chat
- Short verification note: clip count, runtime, aspect ratio, stat source

## References

- `references/mlb-compilation-workflow.md`
- `references/output-rules.md`
- `references/examples.md`
- `references/banned-phrases.md`
