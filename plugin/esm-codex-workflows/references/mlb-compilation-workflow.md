# MLB Compilation Workflow

This workflow takes a player name, creates FanGraphs/Baseball Savant research links, summarizes the recent Savant window, pulls Baseball Savant play clips first, falls back to MLB.com highlights only when needed, renders a 16:9 compilation with blended transitions, and prints a stat-first social post in the ESM voice.

## Run It

```bash
npm run mlb -- "Shohei Ohtani"
```

Useful options:

```bash
npm run mlb -- "Aaron Judge" --season 2026 --clips 10 --clip-seconds 12 --transition 0.55
npm run mlb -- "Paul Skenes" --season 2026 --clips 4 --dry-run
npm run mlb -- "Shohei Ohtani" --days-back 14
npm run mlb -- "Marcus Semien" --days-back 90 --situation risp
npm run mlb -- "A.J. Minter" --season 2026 --days-back 90 --clips all
```

Output lands in:

```text
out/mlb/player-name-season/
```

Files created:

- `compilation.mp4`: 1920x1080 16:9 video with blended transitions.
- `brief.md`: FanGraphs/Baseball Savant links, Savant summary, selected clips, and post text.
- `metadata.json`: player, stats, research links, Savant summary, and selected source clips.
- `clips/`: normalized source clips used in the compilation.

The post text is printed in the chat/terminal output instead of being saved as a separate `tweet.txt` file.

Video duration is enforced: every rendered compilation must be at least 45 seconds and no longer than 3 minutes. Individual clips are planned in bounded segments instead of being blindly stretched: the workflow probes source duration, skips clips that are too short, and requires more real clips instead of splitting the same long clip into filler. Baseball Savant clips use an action window that skips early setup when there is enough source time, then lets the play run longer so the result is not cut off.

For situational posts, use Baseball Savant-driven filters. `--situation risp` selects plays from Savant rows with a runner on second or third, then ranks matching video clips around those exact play types instead of defaulting to home runs.

## Notes

The script uses MLB's public metadata and video URLs. MLB content carries MLB Advanced Media terms; use the generated videos only in contexts where you have the rights or permissions to post them.

If the script cannot find clips, try a different season, fewer clips, or a player with more recent MLB.com highlight tagging.
