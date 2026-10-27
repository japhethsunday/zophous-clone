# TubeGen Research

Researched: 2026-10-27.

Evidence:
- https://www.tubegen.ai/llms.txt
- https://app.tubegen.ai/llms-full.txt (official 110 KB user guide, including the public API, MCP status and credit table)
- sitemap

**Authenticated app: NOT accessed.** In-app behaviour below is VERIFIED only to the extent the official docs describe it. Live testing is UNVERIFIED.

## Identity

TubeGen AI: a faceless YouTube automation platform. Founder Eddie Eizner. Web app at app.tubegen.ai, API at api.tubegen.ai. VERIFIED.

Plans: Starter $149/mo (33k credits), Pro $297 (100k), Premium $849 (340k). There is also a Build-Your-Own plan from $27/mo per feature. Rollover up to one month. VERIFIED.

## Integration surface: VERIFIED (official docs)

| Item | Value |
|---|---|
| REST API | Base `https://api.tubegen.ai/api`, `Authorization: Bearer tgk_…`. **Paid plan required.** Reference: docs.tubegen.ai/reference |
| Rate limits | 120 req/min per account (all keys); 300/min for status polls |
| Scopes | `account:read`, `niche-finder:read/write`, `styles`, `voices`, `art-styles`, `characters`, `avatars`, `projects`, `titles`, `scripts`, `voiceover`, `visuals`, `stock-footage`, `soundtrack`, `descriptions`, `render`, `thumbnails`, `youtube`, `active-generations:read/write` |
| Keys | Up to 10 active, optional expiry, shown once |
| Long-running calls | SSE streams (script, voiceover, image prompts, images, animation). Poll by job id for voiceover, render, soundtrack and YouTube upload |
| Render | `POST /video/render-project` returns `renderId`. Poll `GET /video/render-project/{id}` until `done`, which gives `videoUrl` valid 7 days. 5 credits/min; max 90 min; one render per account at a time |
| Publish | `POST /youtube/upload` (projectId, connectionId, title…); poll `GET /youtube/upload/{jobId}`; `VIDEO_SOURCE_TRUNCATED` safety failure |
| Credit hold | An estimate is reserved at start, the actual cost is charged on finish, and the remainder is refunded. 402 `INSUFFICIENT_CREDITS` includes `requiredCredits`/`currentCredits` |
| Errors | 401; 403 `SCOPE_MISSING` / `FEATURE_NOT_IN_PLAN` / `OUT_OF_CREDITS` / `STOCK_FOOTAGE_EULA_REQUIRED`; 429 |
| Not in API | Billing, teams, security, connecting YouTube, the editor timeline, editing or deleting voice clones |
| MCP | Built, **not live** (`mcp.tubegen.ai` not deployed). UNVERIFIED by design |

## Workflow: idea to video (VERIFIED, docs)

The Project Builder has 5 dependent steps:

1. **Script.** Writing modes; length by plan (up to 20,000 words); regenerate a selection; history; or bring your own script.
2. **Voiceover.** Needs the script. Library voices or clones (8 languages); multi-voice; cut silences; or bring your own audio.
3. **Visuals.** Needs the voiceover timestamps. Scene planning, then image prompts (scene 0 preview), then a batch render. Optional: art style, consistent characters, smart overlays, stock footage blend (Storyblocks), animation per scene, avatar scenes.
4. **Soundtrack.** Needs the voiceover. AI auto-split into segments, then generate.
5. **Description.** Needs the title and voiceover timestamps. Description with chapters.

Then Editor/Render, then Thumbnail, then YouTube upload.

**Independent tools:** Niche Finder, Title Generator, Thumbnail Studio and Styles work without a project.

## Feature inventory

| # | Feature | What | In → Out | API scope | Cost (approx) | Status | Cloudnivo plan |
|---|---|---|---|---|---|---|---|
| 1 | Niche Finder | Search monetized channels, revenue/RPM estimates, niche score, similar channels, Copy Style, bookmarks | query/filters → channel cards | niche-finder | 100/score, 50/revenue refresh | VERIFIED (docs) | Phase 5 "Research": YouTube Data API v3 (official) plus our own scoring; no scraping |
| 2 | Title Generator | CTR titles from a topic or a channel's style | topic → titles | titles | 3–5/batch | VERIFIED | LLM function (extend `write-script`) |
| 3 | Script Writer | Long-form retention scripts, modes, web search | topic, style → script | scripts | ~75/1k words | VERIFIED | Extend `write-script`: long-form, sections, history |
| 4 | Voiceover | Library voices, clones, multi-voice, cut silences | script → audio + timestamps | voiceover | ~10/1k chars | VERIFIED | TTS adapter with word timestamps |
| 5 | Visuals: images | One image per scene, timed to the VO | scenes → images | visuals | 13–120/image | VERIFIED | Image adapter plus a scene planner |
| 6 | Art styles | One consistent style across scenes | style refs → style | art-styles | — | VERIFIED | `styles` table plus prompt conditioning |
| 7 | Consistent characters | Same character across scenes and videos | portrait, description → character | characters | — | VERIFIED | Reference-image models (Seedream/Nano Banana refs) |
| 8 | Animation | Image → short clip per scene | image → clip | visuals | 26–130/s | VERIFIED | Image-to-video adapter |
| 9 | Stock footage | Storyblocks matching and licensing | scene → stock clip | stock-footage (EULA) | B-roll 30/scene | VERIFIED | Optional: Pexels/Storyblocks official API |
| 10 | Auto overlays | Charts, maps, headers | scene → overlay | visuals | ~29/headline | VERIFIED | Later |
| 11 | Avatars | Photo or character lip-sync to VO | image + VO → video | avatars | 100/img, ~100/s | VERIFIED | Optional; lip-sync model adapter |
| 12 | Soundtrack | AI-scored music per segment | VO → music | soundtrack | 2.5/s | VERIFIED | Music adapter |
| 13 | Description | Description with chapters | title + timestamps → text | descriptions | ~8/1k words | VERIFIED | LLM function |
| 14 | Video Editor | Timeline, captions, transitions; open 120 min, export 90 | project → MP4 | render only (timeline not in API) | 5/min export | VERIFIED | Phase 8 unified editor (scene list first, not a full NLE) |
| 15 | Thumbnail Studio | Generate, Analyze score, Improve, library | title, refs → thumbnails | thumbnails | 90–97 / 20 / 60–70 | VERIFIED | Image adapter plus an LLM-vision score |
| 16 | YouTube | Connect channel, dashboard, competitors, upload | project → YouTube video | youtube | — | VERIFIED | Phase 8: YouTube Data API OAuth and upload |
| 17 | Projects | Active/archived, duplicate, resume | — | projects | — | VERIFIED | Reuse `gen_projects` |
| 18 | Credits & usage ledger | Hold, charge, refund; per-step breakdown | — | account:read | — | VERIFIED | Phase 3 ledger (model the hold/settle pattern) |
| 19 | Teams | Invite, roles, move credits | — | not in API | — | VERIFIED | Existing `managers` (workspaces); later |
| 20 | Chrome extension | Stats overlay on YouTube | — | — | — | VERIFIED (exists) | Out of scope |

## Integration implication (INFERRED)

TubeGen's API acts as a single TubeGen account and spends that account's credits. A Cloudnivo-wide integration would bill Cloudnivo's TubeGen account for every user, at $149–849/mo plan pricing. Resale terms are unknown: **check TubeGen's ToS** before relying on it. It's better to build the same pipeline natively on the shared provider adapters, and use TubeGen's design (credit hold/settle, SSE progress, step dependencies, render then publish) as the reference.

## Coverage checklist

| Area | Status |
|---|---|
| Docs, API, credits, workflow | Complete (official docs) |
| docs.tubegen.ai/reference schemas | Not fetched (incomplete) |
| Authenticated app walk-through | **Blocked**: no session |
| Live API test | Blocked: needs a paid plan and a `tgk_` key |
