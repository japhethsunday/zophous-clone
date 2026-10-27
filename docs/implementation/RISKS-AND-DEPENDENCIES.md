# Risks and Dependencies

## Critical (act now)

| Risk | Evidence | Mitigation | Phase |
|---|---|---|---|
| Anyone can grant credits through `rpc/refund_credits` | Supabase advisor 0028/0029; the function is SECURITY DEFINER, executable by anon | Revoke grants | 1 |
| Users can set their own plan/limits/credits | `own profile` ALL policy; Billing writes the plan client-side | Column guard trigger; Stripe webhook as the sole writer | 1, 7 |
| Product claims features that are simulated (clips, studio, posting, DNA, analytics) | process-video random generator; client-side fake jobs | Label or hide in Phase 1; real implementations in Phases 3–6 | 1 |

## Legal / brand

| Risk | Note |
|---|---|
| **Cloudnivo mirrors Zophous** (copy, plan names, pricing, page structure, marketing claims such as "2× OpusClip's minutes") and the repo is named `zophous-clone` | Rewrite the marketing copy and pricing in Cloudnivo's own words. Don't reuse Zophous text, claims or design. Rename the repo. Get legal advice if Zophous is a third party |
| Repurposing YouTube/Twitch content | Users must own or have rights to the source. Add a ToS clause and a rights checkbox. DMCA process (page exists) |
| Video downloading from social platforms | Not implemented first-party. Rely on Ssemble's documented inputs and user uploads |
| Provider resale terms | Ssemble, TubeGen and Everygen terms for serving third-party end users are **unverified**. Get written confirmation before launch |

## External dependencies

| Dependency | Needed for | Status | Owner action |
|---|---|---|---|
| Ssemble API key + plan | Phase 3 | Missing | Create the key in app.ssemble.com → Settings → API Keys; set it as the Edge secret |
| OpenAI key | scripts, images, LLM scoring | Unknown if set | Check the Edge secrets |
| Replicate token (or fal) | video generation | Unknown if set | Check the Edge secrets |
| TTS (ElevenLabs/OpenAI) | Phase 5 | Missing | Choose a provider |
| Render worker host | Phase 5 | Missing | Choose Fly.io, Render or Cloud Run |
| Google Cloud (YouTube Data/Analytics API, OAuth verification) | Phase 6 | Missing | Weeks of review for sensitive scopes |
| TikTok developer app (Content Posting + Display API audit) | Phase 6 | Missing | The audit can take weeks; unaudited apps post private only |
| Stripe account | Phase 7 | Missing | Create it; test mode first |
| Vercel team `recksgreen-1232s-projects` | Deploy verification | MCP not authorized | Approve team access for the Vercel connector |
| Debug-Chrome sessions for EG/TG/ZO/SS | Completing the in-app research | Not signed in | The user signs in. Claude doesn't enter passwords |

## Cost estimates (order of magnitude; verify current prices)

- Ssemble: 1 credit per create request; plans from $6/mo. Credits per plan: unverified.
- Video generation via Replicate: roughly $0.05–$0.50 per 5 s clip, depending on the model.
- TTS: around $0.15–$0.30 per minute of narration.
- Render worker: about $5–50/mo at low volume.
- TubeGen API (if ever used): $149–849/mo plans; ~75 credits per 1k script words, 5 credits/min render.

## Technical risks

| Risk | Mitigation |
|---|---|
| Edge Function time/CPU limits for long jobs | Poll-based jobs-tick; heavy work in the external worker |
| Ssemble's 20-min window and hourly/daily rate limits (values unpublished) | Split windows, a per-adapter rate limiter, a queue |
| Provider URLs expire (TubeGen 7 days; Ssemble unknown) | Copy outputs into Storage on completion |
| The large single-file frontend (`app-shell.tsx`, 103 KB) | Split it incrementally per page while touching it; no big-bang rewrite |
| No tests today | Add Vitest in Phase 1–2 and Playwright in Phase 9 |
| Two migration folders | Consolidate in Phase 1 |
