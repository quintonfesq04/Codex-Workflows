# WordPress Article Workflow

This folder contains a local workflow for creating Empire Sports Media WordPress drafts through the WordPress REST API.

## Setup

Credentials live in `.env`, which is ignored by git.

Required values:

Use `.env.example` for placeholder formatting. The required variable names are `WP_BASE_URL`, `WP_USERNAME`, and `WP_APP_PASSWORD`.

Check the connection:

```bash
npm run wp:check
```

## Create A Draft

Create a draft from an HTML or Gutenberg block file:

```bash
npm run wp:draft -- --title "Article title" --file wordpress-drafts/article.html --categories "New York Yankees" --tags "Yankees,MLB"
```

Create a placeholder draft from a topic:

```bash
npm run wp:draft -- --topic "Yankees bullpen trade targets" --categories "New York Yankees" --tags "Yankees,MLB"
```

Optional flags:

- `--status draft`, `pending`, `future`, or `publish`
- `--excerpt "Short summary"`
- `--slug "custom-url-slug"`
- `--date "2026-06-09T09:00:00"`

## How We Will Use It

When you give me a topic here, I can write the article, save it in `wordpress-drafts/`, and create the WordPress draft with title, body, categories, tags, metadata, and links. The final review and publish step can still happen inside the WordPress editor.

All articles should follow `ESM_ARTICLE_STYLE.md`.

Before handing off a draft, confirm:

- images show the player on the current article team whenever possible
- RankMath keywords use the short format, for example `Mets, Kodai Senga`
- the mid-article comment prompt is the actual WordPress Comments CTA block
- if RankMath fields are not writable through the API, set them in the editor or flag that explicitly
- include a short social media caption in the chat response
