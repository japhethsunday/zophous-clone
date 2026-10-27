# Unified Integration Architecture

Inputs: the four research docs and CLOUDNIVO-BASELINE-AUDIT.md.

Principle: **one Cloudnivo product with one job system, one asset store, one credit ledger, and provider adapters behind it.** Cloudnivo does not embed the four platforms. It uses their documented APIs only where a reseller-safe server integration exists (Ssemble), and otherwise calls the underlying model providers directly.

## 1. Integration decisions

| Capability | Decision | Why |
|---|---|---|
| Long-video clipping (detect, cut, reframe, caption) | **Ssemble REST API** via the `clipping` adapter (Phase 7, starts in Phase 6). A native FFmpeg + ASR path stays as a fallback adapter (later) | The only documented server API. It covers detection, reframe, captions, music and outros. Building this natively is months of work |
| AI video / image generation | **Existing `generate-media` + Replicate/OpenAI**, extended to a model catalog (Seedance, Kling, Veo/Gemini, Seedream, Nano Banana via Replicate or fal) | Already implemented with atomic credits. Everygen MCP is per-user OAuth on the user's own account, so it can't be resold |
| Everygen MCP | **Optional "Connect your Everygen account"** (user OAuth, PKCE, DCR). Lets users import or run Everygen generations into Cloudnivo projects using *their* Everygen credits. Low priority | The only official surface. Scope-limited. Spending is the user's own |
| Long-form YouTube pipeline (research, script, VO, visuals, music, description, render) | **Native pipeline** on shared adapters, modelled on TubeGen's documented step dependencies and hold/settle credits | TubeGen's API spends one TubeGen account's credits at $149–849/mo plan pricing; resale terms unknown |
| TubeGen API | **Not integrated now.** Revisit only if TubeGen confirms reseller terms | Cost and ToS |
| Zophous | **Not integrated** (no API). Its documented behaviour is the UX reference for the clips flow Cloudnivo already has | No supported method. Browser automation is not allowed |
| Script, titles, description, virality reasoning | Existing OpenAI path (`write-script`, `enrichGeneration`) generalised into an `llm` adapter | Already there |
| Voiceover, music | New `tts` (ElevenLabs or OpenAI TTS, with word timestamps) and `music` adapters | Needed by the long-form pipeline and captions |
| Captions on generated video | Ssemble (`captionsEnabled` + `templateId`) for clips. Native ASR (Whisper) + render worker for generated long-form | Reuse where possible |
| Render / compose | Phase 6+: a container render worker (FFmpeg) outside Edge Functions (Edge has CPU/time limits). Candidates: Supabase-triggered job, then a Fly.io/Render/Cloud Run worker | Edge Functions can't run FFmpeg for minutes |
| Publishing | **Official TikTok Content Posting API and YouTube Data API v3** with real OAuth, replacing the fake toggles | The current code only flips booleans |
| Analytics / DNA | TikTok Display API + YouTube Analytics API, then LLM pattern extraction | Replaces the static fake data |
| Payments | **Stripe Checkout + webhooks.** Entitlements are written only by the server | Billing is currently client-writable |
| Video downloader / URL ingest | User uploads first. YouTube URLs are passed to Ssemble (its documented input). No first-party scraping | ToS risk |

## 2. Service boundaries

```
Browser (React SPA)
   │  supabase-js (anon key, user JWT)
   ▼
Supabase: Auth · Postgres (RLS) · Storage · Realtime
   │
   ├── Edge Functions (thin, JWT-verified)
   │     jobs-create      → validate input, quote cost, hold credits, insert job, enqueue
   │     jobs-cancel      → cancel at provider, release hold
   │     provider-webhook → (Stripe, future providers) verify signature, update job
   │     publish-*        → OAuth callbacks, post scheduling
   │
   ├── Scheduler: pg_cron every 15–30 s → `jobs-tick` function
   │     polls provider status (Ssemble /status, Replicate predictions, render worker)
   │     advances step state, copies outputs to Storage, settles credits
   │
   └── Render worker (container, Phase 6/8): FFmpeg compose, captions burn-in, watermark
         pulls from Storage with signed URLs, writes back to Storage, reports to jobs table

Provider adapters (shared TS module in supabase/functions/_shared/providers/):
   clipping: ssemble | (native later)
   video:    replicate | fal
   image:    openai | replicate
   llm:      openai
   tts:      elevenlabs | openai
   music:    replicate/elevenlabs
   publish:  tiktok | youtube
```

## 3. Data model changes

Proposed after inspecting the schema; existing tables are reused first.

| Need | Reuse | New (minimal) |
|---|---|---|
| Generic job + steps | `generations` (single-shot), `shortform_jobs` (clipping) | `jobs` (id, user_id, workspace_id, kind, status, provider, provider_ref, input jsonb, output jsonb, progress int, error, idempotency_key unique per user, cost_quoted, cost_settled, attempts, next_poll_at, timestamps). `job_steps` for multi-step pipelines |
| Credit integrity | `try_spend_credits` / `refund_credits` logic | `credit_ledger` (append-only: hold, settle, release, grant, purchase). Balance = the sum, or a cached column updated by a trigger. **Revoke EXECUTE on the RPCs from anon and authenticated** |
| Entitlements | `profiles` plan columns | Move plan, limits and balance into `entitlements`, writable only by the service role. Profiles RLS becomes UPDATE limited to display fields |
| Assets | — | Storage buckets `sources` (private), `outputs` (private) + `assets` table (owner, bucket, path, mime, bytes, duration, sha256, origin job) |
| Projects | `gen_projects` | Add `kind` (short, long, clipset) and step state |
| Social accounts | `profiles.*_connected` booleans | `social_accounts` (provider, encrypted refresh token in Vault, scopes, expires_at) |
| Posts | `scheduled_posts`, `youtube_posts`, `tiktok_posts` | Reuse; add `status`, `error_code`, `retryable` (taken from Ssemble's posts model) |

## 4. Job lifecycle

`draft → quoted → queued → running(progress) → succeeded | failed | cancelled`

- **Idempotency:** the client sends an `Idempotency-Key` (uuid per submit). The unique index (user_id, idempotency_key) returns the existing job on retry.
- **Credits:** quote, then `hold` (fails with 402 if insufficient), then `settle(actual)` on success with the remainder released, or `release(all)` on failure or cancel. This mirrors TubeGen's documented model. All writes come from the service role.
- **Progress:** the provider progress (Ssemble `progress`, Replicate logs, worker %) is written to `jobs.progress`. The UI subscribes through Supabase Realtime, with a polling fallback.
- **Retries:** transient errors (429, 5xx, timeouts) get exponential backoff via `next_poll_at`, up to `attempts ≤ 5`. Permanent errors (400, 402 provider, invalid URL) fail immediately with a user message.
- **Timeouts:** each kind has a max wall time (clipping 60 min, video gen 15 min). Past it, the job is failed and credits released.
- **Cancellation:** `jobs-cancel` calls the provider cancel where available (Replicate cancel, Ssemble DELETE), then releases the hold.
- **Resume:** jobs persist and are polled by `jobs-tick`, not the browser, so closing the tab doesn't lose work. Multi-step pipelines resume from the last succeeded step.
- **Outputs:** the provider URL is downloaded to Storage `outputs/{user}/{job}/…` and recorded in `assets`. The UI uses short-lived signed URLs.
- **Concurrency:** per-user limits (e.g. 3 running jobs, 1 render) are enforced in `jobs-create`. The provider rate limit is tracked per adapter.

## 5. UX in the existing Cloudnivo shell

| Nav item (existing) | Becomes |
|---|---|
| Clips | Real clipping. Upload (resumable) or YouTube link, then range, length, caption template, language, layout, extras (music, hook, CTA from Brand Kit). Shows a cost preview, then a job card with live progress, then a clip grid with real video, score, reason and title |
| Studio | Clips plus an edit template applied (caption style, brand, outro) |
| Gen Studio | Model catalog picker (driven by the `models` table), cost preview, job queue, history, re-run. Adds "Ad variants" (N-up) and "Shot controls" |
| **New: Create video** (long-form) | 5-step builder: Script → Voiceover → Visuals → Music → Description, then Render, then Publish. Each step shows status, cost and regenerate |
| **New: Research** | Niche/channel research via the YouTube Data API; title ideas |
| Posts | Real scheduling via official APIs; calendar; retry with error codes |
| DNA / Analytics | Real metrics after OAuth; empty states explain the connection needed |
| Billing | Stripe Checkout; credit ledger view |
| Settings → Connections | Real OAuth for TikTok, YouTube and (optional) Everygen |

States everywhere: empty, quoting, insufficient credits (with a top-up link), queued, progress %, failed (reason + retry), succeeded.

## 6. Security requirements

- Provider keys live only in Edge/worker secrets. The frontend uses only the anon key.
- RLS: user tables are owner-only. Entitlements and the ledger are service-role only. Revoke the RPC grants.
- Input validation (zod) in every function: URL allow-list (youtube.com, youtu.be, https file URLs on our Storage), numeric bounds, enum params.
- Uploads: MIME and extension allow-list (mp4, mov, mp3, wav, png, jpg), a size cap per plan (3 GB max), checksum.
- Rate limits per user per function (Postgres counter or Upstash).
- Audit log: `audit_events` for credit grants, plan changes, admin actions and social posts.
- Social tokens are encrypted (Supabase Vault). Least scopes.
- CORS restricted to cloudnivo.org and the preview domains.
- Stripe webhook signature verification. Plan changes happen only from the webhook.
