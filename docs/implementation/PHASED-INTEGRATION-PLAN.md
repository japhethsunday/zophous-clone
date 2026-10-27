# Phased Integration Plan

Order adjusted to the evidence:

- Security hotfixes come first, because credits and plans are currently forgeable.
- Shared infrastructure comes before any provider work.
- The original Phases 1 and 2 are done: research and design are in `docs/`.
- The original Phases 4 (Everygen) and 7 (Ssemble) are re-ordered. Ssemble-backed clipping is Cloudnivo's core product and is currently fake, so it ships before generation extensions.

| # | Phase | Depends on | Size |
|---|---|---|---|
| 0 | Research + baseline (done: these docs) | — | — |
| 1 | Security hotfix and repo baseline | — | S |
| 2 | Shared backend: storage, jobs, ledger, adapters, tests | 1 | L |
| 3 | Real clipping via Ssemble (Clips + Studio) | 2 | M |
| 4 | Generation upgrade (model catalog, ad variants, shot controls, Storage outputs) | 2 | M |
| 5 | Long-form video pipeline (TubeGen-style) + render worker | 2, 4 | XL |
| 6 | Publishing, scheduling, analytics, DNA (official APIs) | 2, 3 | L |
| 7 | Payments (Stripe), entitlements, admin, workspaces, performance | 1, 2 | M |
| 8 | Optional: Everygen user connection (MCP OAuth) | 2, 4 | S |
| 9 | Full regression, production validation, release | all | M |

Every prompt assumes these shared rules:

> Repo `japhethsunday/zophous-clone` (Cloudnivo). Read `docs/research/*`, `docs/architecture/*`, `docs/implementation/ACCEPTANCE-TEST-PLAN.md` and `RISKS-AND-DEPENDENCIES.md` first.
>
> Supabase project `gapzawavgmsnfuekqudo`. Work on a feature branch, run `npm run build` and tests before every commit, and never commit secrets. Don't remove existing features. Before DDL, inspect the live schema with `list_tables` (verbose). Apply migrations through `apply_migration` with a matching file in `supabase/migrations/` (consolidate the duplicate `migrations/` folders in Phase 1).
>
> Stop and ask before destructive data changes, production secret changes, or spending money on providers.
>
> Finish with a completion report: what changed, test evidence, real-app verification, what is unverified, and how to roll back.

---

## Phase 1: Security hotfix and repo baseline

```text
OBJECTIVE: Close the forgeable-credits and forgeable-plan holes, make the repo's state recoverable, and hide fake features from users. No new features.

FINDINGS: docs/research/CLOUDNIVO-BASELINE-AUDIT.md §4 items 1–3, 5, 7; §2 migration duplication.

SCOPE:
1. Tag the current main as `baseline-2026-10-27`. Take a Supabase backup (dashboard) or record that one exists.
2. Migration: REVOKE EXECUTE on public.try_spend_credits, public.refund_credits and public.handle_new_user FROM anon, authenticated, public. GRANT EXECUTE on the credit functions TO service_role only. Confirm the edge functions call them with the service role. generate-media already does (the admin client).
3. Migration: replace the `own profile` ALL policy with a SELECT policy (own row) plus an UPDATE policy limited to user-editable columns. Use a BEFORE UPDATE trigger that rejects changes to plan, *_limit, *_used, credits_*, current_credits, turbo_left, watermark_free_left and *_connected unless current_role = 'service_role'. Keep INSERT through the existing trigger only.
4. Billing page: remove the client-side plan update. Show "Payments coming soon / contact" and keep the current plan display. (Stripe lands in Phase 7.)
5. process-video: switch quota reads/writes to the service-role client. Leave the clip logic as is, but label the UI "Preview — simulated clips" until Phase 3, so users are not misled. Do the same for the Studio job, DNA unlock and the Connections toggles: change the toggles to "Coming soon" instead of fake "Connected".
6. Consolidate migrations into supabase/migrations/ with timestamps matching what is live (use list_migrations). Delete only the duplicate copies after confirming their content is live.
7. Remove or identify the orphan edge function `function` (d6155ea1-…): download its source via get_edge_function, commit it under supabase/functions/_archive/, and ask the user before deleting the deployment.
8. Enable leaked-password protection (ask the user to toggle it in Dashboard → Auth; it isn't settable via SQL).
9. Add Vitest plus one SQL-level test script (scripts/security-check.sql) that asserts anon cannot execute the RPCs.

ACCEPTANCE:
- `curl -X POST $SUPABASE_URL/rest/v1/rpc/refund_credits -H "apikey: <anon>" -d '{"p_user":"<uuid>","p_amount":999}'` returns 401/403 (permission denied).
- A signed-in test user's `supabase.from('profiles').update({plan:'pro'})` fails. `update({display_name:'x'})` succeeds.
- get_advisors(security) shows no 0028/0029 findings for those functions.
- The generate-media happy path still works (if secrets exist), or still returns PROVIDER_NOT_CONFIGURED.
- npm run build passes. The live site loads and existing pages render.

ROLLBACK: `git revert` the commits. The SQL down-migration re-grants (stored in the migration header comment).
```

## Phase 2: Shared backend (storage, jobs, ledger, adapters, tests)

```text
OBJECTIVE: Build the shared infrastructure every later phase uses. See docs/architecture/UNIFIED-INTEGRATION-ARCHITECTURE.md §2–4.

INSPECT FIRST: the live schema (generations, shortform_*, gen_projects, profiles); generate-media's create/check flow; the credit RPCs.

SCOPE:
1. Storage buckets `sources` and `outputs` (private). RLS on storage.objects: the path prefix must equal auth.uid(). Add an `assets` table.
2. Resumable upload (tus via supabase-js Storage, or uppy-tus). MIME allow-list, size cap by plan (default 500 MB free, 3 GB paid), and the client shows progress.
3. `credit_ledger` (append-only) and SQL functions credit_hold(user, job, amount), credit_settle(job, actual) and credit_release(job), all service_role only and idempotent per job. Migrate the existing balances into opening-grant rows. Keep `profiles.credits_balance` as a cached value maintained by a trigger, so the current UI keeps working.
4. `jobs` and `job_steps` tables (fields in the architecture §3), with a unique (user_id, idempotency_key).
5. Edge functions: jobs-create, jobs-cancel and jobs-tick (pg_cron every 20 s, using pg_net to invoke). Plus supabase/functions/_shared/: http.ts (CORS allow-list, zod validation, json errors), auth.ts, credits.ts, storage.ts, and providers/{types.ts, replicate.ts, openai.ts}.
6. Refactor generate-media to create a `jobs` row through the shared code. Keep its current API contract for the existing UI (back-compat). Move image outputs from data URLs to Storage `outputs/`.
7. The UI's JobCard component subscribes to `jobs` via Realtime, with a polling fallback, and shows progress, cancel, error and retry.
8. Tests: Vitest unit tests for credit math and adapters (provider HTTP mocked), plus an integration test script against a Supabase branch (create_branch) to exercise hold → settle → release.

ACCEPTANCE: see ACCEPTANCE-TEST-PLAN.md §P2. The key checks:
- double submit with the same key gives one job
- a failed provider leaves the balance unchanged
- cancel releases the hold
- closing the tab mid-job, then reopening, shows the finished output
- user A cannot read user B's assets (signed URL and RLS test)

ROLLBACK: the feature flag `jobs_v2` in app config. The old generate-media path is kept until Phase 9.
```

## Phase 3: Real clipping via Ssemble (Clips + Studio)

```text
OBJECTIVE: Replace the simulated process-video and Studio jobs with real clipping through the Ssemble API. See docs/research/SSEMBLE-RESEARCH.md.

PREREQS (ask the user):
- An Ssemble plan and an API key (`sk_ssemble_…`), stored as the Edge secret SSEMBLE_API_KEY.
- Written confirmation that Ssemble's terms allow serving Cloudnivo end users (see the risks doc).
- A spending cap for testing.

SCOPE:
1. providers/ssemble.ts:
   - templates, music, game-videos and meme-hooks catalog calls (cached daily in a `provider_catalog` table)
   - create, status, get, delete
   - map the error codes into the shared error model, and read the rate-limit headers into adapter state
2. Clips flow: the source is a YouTube URL (validated, Shorts URLs rejected) or an uploaded file. For uploads, pass a short-lived signed Storage URL as `fileUrl`.
   - Windows: a range over 20 min is split into ≤1200 s requests, one job_step each.
   - Options: preferredLength, language/captionLanguage, templateId (mapped from Cloudnivo caption styles), layout, hookTitle, music, ctaEnabled/ctaText and outro (taken from the Brand Kit).
3. Cloudnivo credits: price clipping per source minute (keep the existing minutes model). Hold on create, settle on completion. On Ssemble failure: release, and record failureReason.
4. jobs-tick: poll /status (respect the "every 10 s" guidance, with backoff on 429). On completed, fetch the shorts and copy every video_url into Storage outputs/. Upsert into `clips`: title, reason→why_it_performed, viral_score→score, timestamps, duration, asset_id. Mark watermark per plan (Phase 7 adds the overlay).
5. Studio = Clips plus an edit template. `edit_templates` stores the Ssemble parameter preset (caption template, music, CTA, outro, layout).
6. Remove the "simulated" labels added in Phase 1 for Clips and Studio. Delete the random generator from process-video, or turn process-video into a thin wrapper that calls jobs-create.
7. UI: cost preview, progress from Ssemble `progress`, a clip grid with real <video> previews (signed URLs), download, delete (which also calls Ssemble DELETE), and a failure state with the reason and retry.

ACCEPTANCE: a real 10-minute YouTube source produces ≥1 clip, playable from Cloudnivo Storage, with the score and title stored. Credits are deducted once. A forced failure (an invalid URL) gives a clear error and no charge. Duplicate submit gives one Ssemble request. Process ≥3 sources concurrently. See the test plan §P3.

ROLLBACK: the feature flag `clipping_provider = simulated|ssemble`.
```

## Phase 4: Generation upgrade (Everygen-class capabilities)

```text
OBJECTIVE: Bring Gen Studio to Everygen-class breadth with the existing provider route (Replicate/OpenAI, optionally fal). See docs/research/EVERYGEN-RESEARCH.md (feature inventory 1–4, 10, 11, 15).

SCOPE:
1. `models` table: id, kind, provider, provider_model, max_res, lengths, audio, aspect list, credit formula, enabled. Seed it only with models available on our providers. Verify each id against the Replicate/fal API before enabling it.
2. Rewrite creditCost to use the table. Show a cost preview before submit.
3. Image-to-video (upload a reference into `sources`) and image references for image models (Seedream/Nano Banana if available).
4. Shot controls ("Director"): structured fields (camera, lens, lighting, color, move) compiled to the prompt plus model params. The UI is a collapsible panel.
5. Ad variants: a product (images plus a description) gives N concept prompts (llm), then N video jobs as one parent job, with a total cost preview and an approve step.
6. Scriptwriter: add a scene-by-scene structure and a "Send to Gen Studio" action.
7. All outputs go to Storage. History is filterable, with re-run.

ACCEPTANCE: one real image and one real 5 s video per enabled provider succeed and are stored. The cost preview matches the ledger settle. The provider-not-configured message shows when a secret is missing. See §P4.
```

## Phase 5: Long-form video pipeline + render worker

```text
OBJECTIVE: A "Create video" builder (TubeGen-style, native): Research → Title → Script → Voiceover → Visuals → Music → Description → Render → (Publish in Phase 6). See docs/research/TUBEGEN-RESEARCH.md for the step dependencies and the credit hold/settle model.

SCOPE:
1. gen_projects gets kind=long with job_steps per stage. Each stage has its own job, cost and regenerate. Stages are blocked until their dependencies succeed (script → VO → visuals/music/description).
2. Adapters: tts (with word timestamps; ElevenLabs or OpenAI), music, and llm (long script with sections, titles, description with chapters).
3. Scene planner: split the script by VO timestamps into scenes, then image prompts, then per-scene images (batch, progress per scene). Optional per-scene animation (image→video). Art style plus character reference images.
4. Render worker (container, outside Edge): an FFmpeg compose of scenes + VO + music + burned captions (Whisper/ASR from the TTS timestamps) + watermark per plan. It's deployed separately (Fly.io/Render/Cloud Run; ask the user which). It's triggered by jobs-tick, reads and writes Storage via signed URLs, and is authenticated with a shared secret.
5. Thumbnails: image generation plus an LLM-vision score (optional).
6. Research: a YouTube Data API v3 search and channel stats (user's or app API key), with a simple niche view. No scraping.
7. Planner ("Wizard"): an llm agent that drafts the step plan with costs, where the user approves each paid step.

ACCEPTANCE: a real 60–90 s video renders end to end with VO, visuals, music and captions. Resume after closing the browser works. Each step's credits are settled correctly. A cancelled render releases its credits. See §P5.
```

## Phase 6: Publishing, scheduling, analytics, DNA

```text
OBJECTIVE: Replace the fake connections, posts, analytics and DNA with official APIs.

PREREQS (user): a Google Cloud project with the YouTube Data API v3 enabled and OAuth consent (verification needed for public use). A TikTok developer app with the Content Posting API and Display API approved (an audit is needed for public posting). Redirect URLs: cloudnivo.org.

SCOPE:
1. A `social_accounts` table with tokens in Supabase Vault, plus OAuth start/callback edge functions per provider, refresh handling and revoke.
2. Publishing: a scheduler (pg_cron) that publishes due `scheduled_posts` and uploads from Storage. Status model and error codes taken from Ssemble's posts model (auth_expired, daily_cap, media_rejected, rate_limited…), with a retryable flag and retry from the UI.
3. Posts calendar: edit, cancel, retry, and "Schedule all" for a clip set.
4. Analytics: YouTube Analytics plus TikTok Display API metrics, synced a few times a day.
5. DNA Profile: analyze ≥2 posted TikToks (transcript plus metrics), then LLM pattern extraction into dna_patterns. "Use this recipe" passes the hints into Clips. The Advisor chat runs on advisor_* tables.

ACCEPTANCE: a real post to a test TikTok account (sandbox/private) and a real unlisted YouTube upload. Token refresh works. A forced failure shows the error code and retry works. See §P6.
```

## Phase 7: Payments, entitlements, admin, workspaces, performance

```text
OBJECTIVE: Real money and plan integrity.

SCOPE:
1. Stripe Checkout (subscriptions plus credit top-ups) and the Customer Portal. A stripe-webhook edge function (signature verified) is the ONLY writer of plan, limits and grants (ledger `grant`/`purchase`).
2. Entitlements table (service-role only). Monthly reset via pg_cron. Watermark and turbo flags are derived from it.
3. Admin (role in app_metadata): users, jobs (retry/cancel), ledger adjustments with a reason (audit_events), provider health, and the feature flags.
4. Workspaces: use `managers` as workspaces, with per-plan limits.
5. Performance: indexes for jobs/ledger, pagination on lists, code-split app-shell.tsx by page (React.lazy), and image/video lazy loading.
6. Observability: Sentry (frontend plus functions) and structured logs with job_id.

ACCEPTANCE: a Stripe test-mode purchase updates the plan and credits via the webhook only. A client attempt to change the plan fails. Cancelling a subscription downgrades at period end. An admin adjustment is audited. See §P7.
```

## Phase 8 (optional): Everygen account connection

```text
OBJECTIVE: Let users who own Everygen accounts connect them and run Everygen tools from Cloudnivo projects on their own Everygen credits.

SCOPE:
- OAuth 2.1 + PKCE + dynamic client registration against https://www.viewmax.io (metadata at /.well-known/oauth-authorization-server). Request the minimal scopes (video:generate, image:generate, generation:read, media:upload).
- An MCP Streamable HTTP client in an edge function. Run tools/list and store the tool schemas. Expose only the tools that are verified.
- Outputs are imported into Cloudnivo Storage. Cloudnivo credits are NOT charged; the UI makes that clear.

PREREQ: confirm Everygen's terms allow third-party apps for end users. Verify tools/list with a real account first and record the result in EVERYGEN-RESEARCH.md.
```

## Phase 9: Regression, production validation, release

```text
OBJECTIVE: Prove that everything works on production before announcing it.

SCOPE:
- Run the full ACCEPTANCE-TEST-PLAN.md on staging (a Supabase branch plus a Vercel preview), then on production with test accounts.
- Playwright e2e: signup, clip, generate, long-form short render, schedule post, purchase (Stripe test), at 375 / 768 / 1280 widths.
- Security: the advisors are clean, RLS cross-user tests pass, secrets are absent from the bundle (grep dist/ for sk_, tgk_, sk_ssemble, service_role), and CORS is set.
- Load: 20 concurrent jobs from 5 users, with no double charges.
- Remove the feature flags that are at 100%, and remove the simulated code paths.
- Release notes and a rollback plan (DB backup point plus a git tag).

ACCEPTANCE: all §P1–P8 checks pass on production. The report lists everything still unverified.
```
