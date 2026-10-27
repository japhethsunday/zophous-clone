# Cloudnivo Baseline Audit

Audited: 2026-10-27. Sources:
- repo `japhethsunday/zophous-clone` @ `44bc647` (main)
- Supabase project `zophous` (`gapzawavgmsnfuekqudo`, us-east-1), read-only queries and the advisor check
- live site cloudnivo.org, via REA CDP inspection and a screenshot of `/` and `/#/app`

Labels: **VERIFIED** (seen in code, DB or the live app), **INFERRED**, **UNVERIFIED**.

## 1. Stack

| Area | Finding | Status |
|---|---|---|
| Frontend | React 19 + Vite 6 + TypeScript SPA. Hash routing (`#/`, `#/about`, `#/app/<page>`). Three large files: `src/main.tsx` (marketing, 37 KB), `src/app-shell.tsx` (app, 103 KB), `src/style.css` (72 KB). No component library, no router lib. | VERIFIED |
| Hosting | `.verdentc.json` is a static deploy (`npm ci`, `npm run build`, `dist`). Vercel project `dist` exists in team `recksgreen-1232s-projects`, but MCP access to that team is not authorized yet. | VERIFIED (config) / UNVERIFIED (which host serves cloudnivo.org) |
| Auth | Supabase Auth through `@verdent/auth-js` (`src/lib/supabase.ts`). The trigger `handle_new_user` creates the profile. | VERIFIED |
| DB | Supabase Postgres 15. 24 public tables, all with RLS enabled. Policy pattern: `auth.uid() = user_id` for ALL commands. | VERIFIED |
| Backend | 3 Supabase Edge Functions in the repo, plus one orphan deployed function named `function` (slug `d6155ea1-…`) that is not in the repo. | VERIFIED |
| Storage | **No storage buckets exist.** The upload option stores only metadata; no file is stored. | VERIFIED |
| Tests | None. No test runner in `package.json`. | VERIFIED |
| CI | None in the repo. | VERIFIED |
| Monitoring / logging | None beyond Supabase defaults. | VERIFIED |
| Secrets | `.env` is committed (the repo is **public**) but holds only `VITE_SUPABASE_URL` and the publishable key, which are public by design. Server keys (`OPENAI_API_KEY`, `REPLICATE_API_TOKEN`) are read from Edge secrets. Whether they are set: UNVERIFIED. | VERIFIED |

## 2. Data model (live row counts)

profiles 6 · videos 4 · clips 7 · managers 4 · prompt_library 17. All other tables have 0 rows: generations, scripts, gen_projects, shortform_jobs/_test_parts/_moments/_variations, clip_edits, edit_templates, brand_kits, scheduled_posts, youtube_posts, tiktok_posts, posts, dna_patterns, studio_templates, advisor_conversations/_messages, feedback_responses.

Migrations exist in two places: `migrations/` (5 files, two of them both numbered `002`) and `.verdent/supabase/migrations/` (1 file). There is no single authoritative migration history. **Risk.**

## 3. Feature reality check

| Feature (UI page) | What the code actually does | Classification |
|---|---|---|
| Clips (`#/app/clips`): paste link or upload | Inserts a `videos` row, then `process-video` creates 3–6 clips from a **seeded random generator**: hard-coded titles, hooks, tones and scores (62–97) and random timestamps. No download, transcription, analysis, cutting, captions or rendering. No clip media exists. | **Implemented but broken (simulated)** |
| Studio (Creator/Marketing) | `createShortformJob` in `app-shell.tsx:1055` writes jobs, parts, 3 fixed "moments" and 2 variations **from the browser** with template text. Deducts `current_credits` client-side. No media processing. | **Simulated** |
| Gen Studio (`#/app/gen`): AI video/image | `generate-media` edge function. Real Replicate calls (seedance-1-lite/pro, kling-v2.1) and OpenAI `gpt-image-1`. Atomic credit spend and refund through RPC. Polling via `mode:"check"` from the client. GPT-4o-mini adds a virality estimate and hashtags. Images are stored as **base64 data URLs in a DB column**. 0 generations ever recorded. | **Implemented, never verified in prod** (secrets status unknown) |
| Scriptwriter | `write-script` edge function, OpenAI gpt-4o-mini, 15–90 s scripts saved to `scripts`. 0 rows. | **Implemented, unverified** |
| Posts / scheduling | Inserts a `posts` row and marks the clip as posted. **Nothing is sent to TikTok or YouTube.** | **Simulated** |
| Connections (TikTok/YouTube) | The button flips the `profiles.tiktok_connected` boolean. No OAuth. | **Simulated** |
| DNA Profile | Inserts a static `DNA_POOL` list once "TikTok connected" is true. | **Simulated** |
| Analytics | Derived from DB rows only. No platform data. | **Simulated** |
| Billing / plans | `app-shell.tsx:~2500` updates `profiles.plan`, `minutes_limit`, `credits_balance` **directly from the browser. No payment provider.** | **Broken (no payments) and a security hole** |
| Brand Kit | Real CRUD on `brand_kits` and profile fields. Not applied to any rendering, because no rendering exists. | **Implemented but incomplete** |
| Campaigns | Toast only. | **Placeholder** |
| Prompt library | 17 rows, public read. | Working |

## 4. Security findings (ordered by severity)

1. **CRITICAL: anyone can give any account free credits.** `public.refund_credits(p_user, p_amount)` and `try_spend_credits` are `SECURITY DEFINER` and executable by the `anon` and `authenticated` roles through `/rest/v1/rpc/*` (Supabase advisor 0028/0029, VERIFIED). Any visitor can call `refund_credits` with any user id and amount.
2. **CRITICAL: users can edit their own plan, limits and credits.** The `profiles` RLS policy `own profile` allows ALL commands with no column restriction. The Billing page itself writes `plan` and `credits_balance` from the client. Any user can set themselves to `pro` with unlimited credits.
3. **HIGH:** quota checks in `process-video` use the user-scoped client, so the profile counters they rely on are user-writable (see item 2).
4. **MEDIUM:** the edge function CORS setting is `*`. Acceptable with JWT auth, but should be narrowed to the app origins.
5. **MEDIUM:** leaked-password protection is disabled in Auth.
6. **LOW:** generated images are stored as data URLs in Postgres, which bloats the DB. There is no storage access control because there is no storage.
7. **LOW:** an orphan deployed edge function `function` is not in source control.
8. **INFO:** Landing copy, pricing structure, plan names and feature names closely mirror Zophous's public site (repo name `zophous-clone`). This is a brand and IP risk. See RISKS-AND-DEPENDENCIES.md.

## 5. Reusable assets

- Credit RPC pattern (atomic spend and refund). Keep the logic; lock down the grants.
- The `generations` table and `generate-media` adapter shape (create, then check), and the provider-not-configured error contract.
- The shortform_* table family matches a real repurposing pipeline (job → parts → moments → variations). Reuse it instead of new tables.
- `brand_kits`, `scheduled_posts`, `youtube_posts`, `tiktok_posts`, `clip_edits` and `edit_templates` already exist (empty). Use them when the real features land.
- The UI shell, token-based CSS (Everygen-style theme already applied in commits ui(5)–ui(7)).

## 6. Not verified (needs access)

- Which edge secrets are set (OPENAI, REPLICATE). Check in the Supabase dashboard under Edge Functions → Secrets.
- The production host for cloudnivo.org. The Vercel team `recksgreen-1232s-projects` needs MCP authorization.
- Auth providers enabled (email, Google).
