# Facebook Page Workflow Research

This brief captures the operating model for a monetized Facebook Page workflow: content strategy, monetization constraints, API setup, analytics monitoring, and the future script/workflow shape for ESM.

## Current Monetization Model

Meta is consolidating Facebook creator monetization around Facebook Content Monetization. The program can pay on multiple eligible formats, including Reels, longer videos, Stories, photos, and text posts. Meta says the program is performance-based, with newer metrics such as qualified views, earnings rate, and non-qualified views.

Important constraints:

- Facebook Content Monetization is invite-only, though creators can express interest through the Professional Dashboard > Monetization > Content Monetization.
- Originality matters. Meta says original content is prioritized in Feed and Reels, while duplicative reposts, low-value edits, stitched clips without meaningful new value, and unoriginal uploads can lose reach or monetization.
- Reels are the center of gravity. Meta reported that 60% of Facebook creator payouts in 2025 went to Reels, with the rest going to Stories, photos, and text posts.
- Creator Fast Track launched in March 2026 for established creators moving to Facebook. It offers guaranteed monthly pay and boosted reach for eligible Reels, but eligibility depends on outside-platform follower count and program terms.
- Payout setup, eligibility checks, and policy status live in Meta Business Suite or the Professional Dashboard.

## Page Operating Principles

For a sports/media page, the safest monetization posture is:

- Publish original or substantially transformed content, not simple reposts.
- Use licensed/approved clips, original edits, added analysis, custom voiceover, on-screen framing, and editorial context.
- Avoid engagement bait, misleading captions, duplicated watermarked videos, and content that only adds borders, speed changes, captions, or basic narration to someone else's clip.
- Treat Reels as the primary discovery format, then support them with text/photo posts and link posts when those formats help the editorial goal.
- Track posts by content type, topic, team/player, hook style, duration, publication time, source rights, and editorial angle so analytics can be tied back to production decisions.

## API Access Plan

The right technical route is the Meta Graph API, not browser automation. For a Page workflow, we need a Meta Developer app connected to the Page through an authorized Facebook user who has the right Page task access.

Required setup:

1. Create or use a Meta Developer app.
2. Add the Facebook Login / Graph API products needed for the workflow.
3. Generate a user access token with Page permissions, then exchange it for a Page access token.
4. Store credentials in `.env`, never in source files.
5. Use the Page token to list Pages, publish content, read post/page insights, and optionally moderate comments.
6. Move from development/testing to live access only after Meta App Review if the workflow needs advanced permissions beyond test/admin users.

Likely permissions:

- `pages_show_list`: find Pages the authorized user can access.
- `pages_read_engagement`: read Page content and engagement.
- `read_insights`: read Page and post analytics.
- `pages_manage_posts`: publish, update, or delete Page posts.
- `pages_manage_engagement`: reply to or manage comments if we add moderation.
- `pages_read_user_content`: read user-generated content on the Page if needed.

Possible API surfaces:

- Pages API: Page management, posts, comments, and Page insights.
- Video API: upload and publish Page videos and Facebook Reels.
- Page Insights / Graph insights edge: Page and post metrics.
- Marketing API / Ads Insights API: only needed if the Page runs paid campaigns or boosted posts.

## Analytics Loop

The first version should monitor organic Page performance, not ads.

Daily collection:

- Page-level views/reach style metrics available from Page Insights.
- Post-level engagement: reactions, comments, shares, clicks, saves if available, views/plays for video.
- Reel/video metrics: plays/views, watch time or retention fields where available, qualified-view and earnings fields if Meta exposes them to the account/API.
- Publishing metadata: content type, team/player, format, runtime, hook, caption, publish time, asset path, rights note, and source links.

Weekly decisions:

- Rank posts by reach, qualified views, engagement rate, watch behavior, and revenue if available.
- Compare formats: Reel vs photo/text/link, 9:16 vs 16:9 clips, short vs longer edits, player/team/topic categories.
- Identify repeatable winners: hook type, first-frame subject, caption style, posting window, player/team interest.
- Feed results back into the production workflow so future posts are chosen and edited based on measured performance.

## Proposed ESM Workflow Shape

When we build this, keep it consistent with the repo's existing workflow style:

```text
FACEBOOK_WORKFLOW.md
facebook-page.mjs
scripts/facebook-env.mjs
scripts/facebook-check.mjs
scripts/facebook-publish.mjs
scripts/facebook-insights.mjs
facebook-posts/
facebook-analytics/
```

Expected commands:

```bash
npm run fb:check
npm run fb:publish -- --file out/nfl/aj-barner-2026/compilation.mp4 --caption "..."
npm run fb:insights -- --since 2026-06-01 --until 2026-06-09
```

Expected `.env` variable names are `META_APP_ID`, `META_APP_SECRET`, `META_PAGE_ID`, and `META_PAGE_ACCESS_TOKEN`. Use `.env.example` for placeholder formatting and keep real values out of git.

The workflow should support a draft-first mode and a publish mode. Draft-first is safer for early testing; publish mode can be enabled once the Page token and permissions are verified.

## Setup Checklist

Before I can monitor analytics or publish for the Page:

- The Facebook Page must exist and be connected to Meta Business Suite.
- You need admin or sufficient task access on the Page.
- Monetization eligibility should be checked inside Meta Business Suite or Professional Dashboard.
- A Meta Developer app must be created or selected.
- We need a Page access token with the permissions above.
- If the app needs to operate beyond your own admin/test context, App Review may be required.
- We need to decide whether initial posts are drafts/manual approval or direct publish.

## Sources

- Meta Pages API: https://developers.facebook.com/docs/pages-api/
- Meta Pages API posts: https://developers.facebook.com/docs/pages-api/posts/
- Meta Page management and Page access tokens: https://developers.facebook.com/docs/pages-api/manage-pages/
- Meta permissions reference: https://developers.facebook.com/docs/permissions/
- Meta Page Insights API: https://developers.facebook.com/docs/graph-api/reference/insights/
- Meta Video API publishing: https://developers.facebook.com/docs/video-api/guides/publishing/
- Meta Reels publishing: https://developers.facebook.com/docs/video-api/guides/reels-publishing/
- Meta Creator Fast Track announcement, March 18, 2026: https://about.fb.com/news/2026/03/creator-fast-track-grow-your-audience-earn-money-on-facebook/
- Meta original creator guidance, March 13, 2026: https://about.fb.com/news/2026/03/rewarding-original-creators-on-facebook/
- Meta Content Monetization overview: https://www.facebook.com/business/help/1049081556813520
- Meta best practices for Facebook Content Monetization: https://www.facebook.com/business/help/1304108027730426
- Meta Creator Fast Track help: https://www.facebook.com/business/help/786757217805588
- Metricool monetization guide, 2026: https://metricool.com/monetize-facebook-account/
- Buffer Facebook monetization guide, 2026: https://buffer.com/resources/how-to-make-money-on-facebook/
- YouTube: Facebook monetization changes 2026: https://www.youtube.com/watch?v=3iBOJd-N1sk
- YouTube: Graph API Page insights example: https://www.youtube.com/watch?v=z7-4nNuQxq4
- YouTube: Connect Meta Graph API to n8n: https://www.youtube.com/watch?v=6XAErS9Q0oY
