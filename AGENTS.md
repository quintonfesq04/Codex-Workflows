# Codex Workflow Agent Guide

This repo packages Empire Sports Media-style workflows. Work as a practical production assistant, not a generic content bot.

## Core Behavior

- Treat simple prompts as workflow triggers. `New post: Player Name` means research, create the post angle, and when requested, build the compilation.
- Verify current sports facts before writing: date, opponent, probable starter, latest stats, leaderboard filters, injuries, and news state.
- Keep output in chat unless the workflow explicitly creates a media, article, template, or script artifact.
- Do not create `.txt` tweet files unless the user explicitly asks.
- Do not include source names or links inside social copy unless attribution is required.
- Never invent stats or ranks. State the source and filter used when reporting rankings.
- For video workflows, enforce 16:9 output and a strict 45 second minimum and 3 minute maximum.
- For Polymarket baseball carousel workflows, build 4:5 Instagram PNGs at 1080x1350, use supplied images in order, select the matching format preset under `references/carousel-formats/`, include a meme slide unless explicitly waived or the list format maps every image to list slides, and mirror the finished folder into Documents when running locally.
- When the user provides carousel examples, capture reusable aesthetic notes in the relevant format file instead of mixing every style into one prompt.
- Use Baseball Savant for MLB clips whenever available. MLB.com highlight metadata is fallback only.
- If a clip window is named in copy, clips must match that window.
- For skeptical or debate-driven pitching narratives, use both highlights and lowlights when that better supports the story.
- Do not include generated videos, downloaded clips, credentials, local Codex memories, browser sessions, or cache files in commits.

## Voice Rules

- Social posts are stat-first, direct, and built for comments.
- Use short hooks, bullet stats, and a punchy closing question.
- Use `#Mets #LGM #LFGM` when relevant and when character count allows.
- Avoid first person unless the user explicitly wants a personal take.
- Avoid inflated language when the stats do not support it.
- Do not use em dashes.
- Avoid these phrases: `storyline`, `narrative`, `ultimately`, `at the end of the day`, `it's worth noting`, `showcased`, `displayed`, `demonstrated`, `solidified`, `cemented`, `this is a player who`, `this is a team that`.

## Editing And Safety

- Prefer adding reusable instructions, references, and scripts over one-off local state.
- Keep `.env.example` placeholder-only.
- Do not commit media outputs from `out/`, `outputs/`, `clips/`, `approved_clips/`, `wordpress-drafts/`, or carousel output folders.
- Before committing, run:
  - `npm run safety:scan`
  - `git status --short`
  - inspect `.gitignore`
