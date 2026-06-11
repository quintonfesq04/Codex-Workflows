# ESM Codex Workflows Plugin

This plugin packages ESM-style Codex skills, scripts, references, and templates for repeatable sports-media workflows, including Polymarket baseball Instagram carousel production.

## Included Skills

- `esm-player-compilation`
- `esm-ig-carousel`
- `esm-facebook-discussion`
- `esm-news-rewrite`
- `esm-wordpress-draft`

## Use

Install or copy this plugin into your Codex plugin location, then use prompts like:

- `New post: Marcus Semien`
- `Create a player compilation for Freddy Peralta`
- `Make an IG carousel for Carson Benge`
- `Make a Polymarket baseball carousel for Bryce Eldridge`
- `Make a Facebook discussion post about the Mets bullpen`
- `Give me my own change so I don't copy SNY's tweet`

## Setup

Copy `.env.example` from the repo root into a local `.env` only when using WordPress or publishing integrations. Keep real credentials out of git.

For rendered Polymarket carousel graphics, install the Python dependency for the runtime you use, fill out `templates/polymarket-carousel-brief.json` with local image/font/logo paths, then run:

```bash
python3 -m pip install -r requirements.txt
```

Then render with:

```bash
python3 scripts/polymarket-carousel.py templates/polymarket-carousel-brief.json
```

Private memory, browser sessions, paid services, logged-in accounts, API keys, and generated media do not transfer with this plugin.
