# Zophous Research

Researched: 2026-10-27.

Evidence:
- https://www.zophous.ai/llms.txt
- https://www.zophous.ai/docs (official how-to)
- app.zophous.ai shell (SPA, 1.6 KB HTML)

**Authenticated app: NOT accessed.**

**Important context:** Cloudnivo's current product copy, plans, page names (Clips, Studio, Posts, DNA Profile, Analytics, Brand Kit, Billing, Settings) and pricing structure mirror Zophous almost one-to-one, and the repo is named `zophous-clone`. See RISKS-AND-DEPENDENCIES.md.

## Identity

Zophous: an AI clip maker that turns long video into 9:16 captioned clips. Positioned against OpusClip. VERIFIED.

## Integration surface

**No public API, webhook or MCP is documented.** VERIFIED as absent from llms.txt and /docs. There is therefore no supported integration path; browser automation would violate the brief's rules and likely the ToS. **Classification: Not appropriate to integrate. Build natively.**

## Workflow (VERIFIED, official docs)

1. **Import:** a YouTube, Twitch or Kick link, or an MP4/MOV upload up to 3 GB.
2. **Select the range and clip type.** "Parts" mode splits into ~1:30 chapters.
3. **Analysis:** picks the strongest moments, using YouTube's most-replayed heatmap when available.
4. **Clips appear in minutes,** each with a virality score. 1 minute of source = 1 minute of balance.
5. **Edit a clip, or Post** to TikTok/YouTube (paid).
6. **Studio** (Creator or Marketing mode plus an edit template): every found moment renders automatically with no approval step. 1 Studio clip per finished clip. "One Click Edit" templates.
7. **Posts:** connect TikTok/YouTube in Settings → Connections, post now or schedule, "Schedule all", a calendar, and edit/cancel/retry.
8. **DNA Profile:** analyzes at least 2 of the user's posted TikToks for hooks, topics, tone and visuals. Tabs: Profile/Performance/Patterns/Trends/Advisor. "Use this recipe" steers Clips.
9. **Analytics:** TikTok and YouTube performance, refreshed a few times a day.
10. **Brand Kit:** color, font, CTA text and logo, applied in Studio Marketing mode.

## Feature inventory

| # | Feature | In → Out | Plan gating | Status | Cloudnivo status | Cloudnivo plan |
|---|---|---|---|---|---|---|
| 1 | Link import (YT/Twitch/Kick) | URL → source | all | VERIFIED (docs) | UI only, no media fetch | Phase 6: official ingestion; user-owned uploads first; URL ingest only where ToS allows |
| 2 | Upload ≤3 GB | MP4/MOV → source | all | VERIFIED | **No storage bucket** | Phase 3: Storage bucket plus resumable (TUS) upload |
| 3 | Moment detection | transcript (+heatmap) → ranked moments | all | VERIFIED (behaviour), method INFERRED | Random generator | Phase 6: ASR, then LLM moment ranking, then scoring |
| 4 | Parts mode | long video → ~90 s chapters | all | VERIFIED | Missing | Phase 6 |
| 5 | Clip render 9:16 + captions | moment → MP4 | all | VERIFIED | Missing | Phase 6 render worker (FFmpeg) or Ssemble API |
| 6 | Virality score | clip → 0–100 | all | VERIFIED | Fake score | LLM rubric score with reasons (stored, explainable) |
| 7 | Watermark (free) | — | free | VERIFIED | Flag only | Render-time overlay |
| 8 | Turbo downloads (~10 s) | — | paid | VERIFIED | Counter only | Pre-render on completion |
| 9 | Studio auto-edit (Creator/Marketing) | upload → edited clips | paid | VERIFIED | Simulated | Phase 6: edit templates applied in the render |
| 10 | One Click Edit templates | settings → template | paid | VERIFIED | `edit_templates` table, unused | Phase 6 |
| 11 | Post / schedule TikTok + YouTube | clip → post | paid | VERIFIED | Simulated | Phase 8: TikTok Content Posting API plus YouTube Data API |
| 12 | Posts calendar, edit/cancel/retry | — | paid | VERIFIED | Partial (DB only) | Phase 8 |
| 13 | DNA Profile (needs ≥2 analyzed TikToks) | own posts → patterns | paid | VERIFIED | Static fake pool | Phase 8: TikTok Display API metrics plus an LLM pattern extraction |
| 14 | Advisor chat | question → answer | paid | VERIFIED | Tables exist, unused | Phase 8 |
| 15 | Analytics | platform metrics | paid | VERIFIED | Simulated | Phase 8 |
| 16 | Brand Kit | color/font/CTA/logo | all | VERIFIED | CRUD only | Apply in the render (Phase 6) |
| 17 | Workspaces (1/3/10) | — | plan | VERIFIED | `managers` table | Phase 9 |
| 18 | Plans and minutes/Studio quotas | — | — | VERIFIED | Client-writable | Phase 9: server-side entitlements plus Stripe |

## Coverage checklist

| Area | Status |
|---|---|
| Public docs and pricing | Complete |
| API/MCP/webhooks | Complete (none exist) |
| Authenticated app walk-through, editor UI, job recovery | **Blocked**: no session |
