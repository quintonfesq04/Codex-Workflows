# Carousel Format Library

Use this library to route Instagram carousel briefs into a specific post structure before writing or rendering slides. The global Polymarket baseball carousel rules still apply first: 1080x1350 PNGs, supplied image order, strong cover treatment, tight copy bands, clear bottom stats, and no private/generated media committed to the repo.

## Current Presets

| Format | Use When | Reference |
| --- | --- | --- |
| Analytical | The post is a stat case, debate, or argument about one player/team. | `analytical.md` |
| Meme-Heavy | The post is built around a reaction, joke, fan panic, or internet moment. | `meme-heavy.md` |
| List/Ranking | The post has multiple players/items with one repeated slide pattern. | `list-ranking.md` |
| Trade/Rumor | The post reacts to a report, deadline name, contract issue, or market question. | `trade-rumor.md` |
| Player Report | The post is a clean player profile, rise, slump, breakout, or injury report. | `player-report.md` |

## Routing Rules

- If the brief says `Format: analytical`, `Format: meme`, `Format: list`, `Format: trade`, or `Format: player report`, use that preset.
- If no format is named, infer it from the copy:
  - stat proof, Cy Young/MVP cases, leaderboards: analytical
  - fan reaction, panic, jokes, viral discourse: meme-heavy
  - top 5, ball knowers, ranking, under-the-radar names: list/ranking
  - reports, rumors, deadline, extension, trade market: trade/rumor
  - single-player update, breakout, injury, return, role change: player report
- If two formats fit, choose the one that best matches the cover promise.
- Do not mix full layouts from multiple presets unless the user explicitly asks for a hybrid.

## Example Intake Workflow

When the user sends examples for a format:

1. Work on one format at a time.
2. Identify the format and save the aesthetic observations in that format file.
3. Capture layout rules, not private image assets.
4. Note cover typography, gradient depth, slide spacing, stat treatment, meme treatment, and logo placement.
5. Add a short "Approved Look" section with concrete measurements or relative rules.
6. Do not commit screenshots, downloaded player photos, meme-bank images, fonts, or local paths.

Use `example-intake.md` as the checklist when analyzing example slides.

## Format Contract

Each preset should define:

- Trigger examples.
- Best-use cases.
- Default slide map.
- Aesthetic direction.
- Required inputs.
- Verification checks.
- Open aesthetic questions.

The format files start as scaffolds. Update them as approved examples arrive.
