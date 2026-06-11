---
name: esm-wordpress-draft
description: >-
  Draft Empire Sports Media-style WordPress articles from prompts like "Draft a WordPress article about [topic]", "make this an article", or "create a WordPress draft". Use for SEO article structure, ESM article voice, WordPress REST draft creation, and social caption handoff.
---

# ESM WordPress Draft

## Trigger Examples

- `Draft a WordPress article about Freddy Peralta's contract ask`
- `Make this Mets topic an article`
- `Create a WordPress draft about Kodai Senga`

## Workflow

1. Verify current facts, stats, injury status, quotes, and team context.
2. Build one clear sports argument.
3. Draft in ESM article style: direct, opinionated, short paragraphs.
4. Include SEO title, slug, category, tags, focus keyword, and meta description.
5. Include internal/external link guidance.
6. Include image guidance with current-team preference.
7. If credentials are configured and user asks to post, use the WordPress REST scripts.
8. Return a short social caption in chat.

## Scripts

Check WordPress credentials:

```bash
npm run wp:check
```

Create a draft:

```bash
npm run wp:draft -- --title "Article title" --file path/to/article.html --categories "New York Mets" --tags "Mets,MLB"
```

Credentials must live in `.env`, not in source files.

## Verification

- Article follows `references/style-guide.md`.
- No em dashes.
- Current facts verified.
- RankMath fields prepared.
- Comments CTA placement considered.
- Social caption included in chat.

## References

- `references/style-guide.md`
- `references/wordpress-workflow.md`
- `templates/wordpress-draft-template.html`
