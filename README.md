# Codex Workflows

Reusable Codex workflows for Empire Sports Media-style sports content production.

This repository packages the local ESM workflow patterns into repo-scoped skills and an installable Codex plugin. It is designed so another user can open the repo in Codex and ask for outputs with simple prompts like:

- `New post: Marcus Semien`
- `Make an IG carousel for Carson Benge`
- `Make a Polymarket baseball carousel for Bryce Eldridge`
- `Create a player compilation for Christian Scott`
- `Make a Facebook discussion post about the Mets bullpen`
- `Draft a WordPress article about Kodai Senga's injury update`

The workflows are built from local source files, scripts, style guides, examples, and operating rules. They do not include private Codex memory, credentials, browser sessions, paid accounts, or generated media outputs.

## What This Repo Does

- Creates stat-first MLB player compilation workflows using FanGraphs, Baseball Savant, MLB data, and local rendering scripts.
- Preserves ESM tweet/post voice for short-form social content.
- Provides Instagram carousel rules and templates for sports posts, including the Polymarket baseball carousel format.
- Provides Facebook discussion workflow guidance focused on original, debate-driven posts.
- Provides Mets/news rewrite rules for substantial rewrites with proper attribution.
- Provides WordPress draft workflow guidance and scripts with placeholder-only credential setup.
- Includes an installable Codex plugin under `plugin/esm-codex-workflows/`.

## Local Codex Usage

Open this repository in Codex. Codex should read `AGENTS.md` and the repo-scoped skills under `.agents/skills/`.

Example prompts:

```text
New post: Marcus Semien
Create a player compilation for Christian Scott
Make an IG carousel for Carson Benge
Make a Polymarket baseball carousel for Bryce Eldridge
Make a Facebook discussion post about the Mets rotation
Rewrite this Mets news for X, source is @Mets
Draft a WordPress article about Freddy Peralta's contract ask
```

## Plugin Usage

The installable plugin is in:

```text
plugin/esm-codex-workflows/
```

Install or load that folder as a local Codex plugin. The plugin includes the same skills, references, and scripts needed to reproduce the workflow behavior.

After installation, prompts such as `New post: [player name]` or `Make an IG carousel for [player]` should trigger the relevant workflow skill.

For rendered Polymarket carousels, provide a brief with team colors, post folder, cover text, slide copy, bottom stats, and local image paths in the order they should be used. The reusable JSON template is:

```text
templates/polymarket-carousel-brief.json
```

The portable renderer can be run with:

```bash
python3 scripts/polymarket-carousel.py templates/polymarket-carousel-brief.json
```

## Setup

Install Node dependencies if you plan to render compilations or run JavaScript scripts:

```bash
npm install
npx playwright install chromium
```

Install Python dependencies if you plan to render carousel assets with the Python templates:

```bash
python3 -m pip install -r requirements.txt
```

Install `ffmpeg` and `ffprobe` for video workflows.

For WordPress or Meta/Facebook API workflows, copy `.env.example` to `.env` and fill in your own credentials locally. Never commit `.env`.

## What Does Not Transfer Automatically

- Private Codex memory
- Browser sessions or logged-in accounts
- WordPress credentials
- Meta/Facebook tokens
- Paid content accounts
- IMAGN access
- MLB/team/broadcast posting rights
- Generated videos, image exports, or downloaded clips

## Safety

Generated outputs are ignored by default. Do not commit:

- `.env`
- API keys
- access tokens
- cookies
- private keys
- downloaded media
- generated videos
- local cache folders

Run `npm run safety:scan` before committing.
