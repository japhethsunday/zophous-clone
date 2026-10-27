# Everygen Research

Researched: 2026-10-27.

Evidence:
- REA CDP inspection of https://everygen.ai: Next.js/Turbopack app, Geist and SF Pro fonts, token CSS. A design summary exists in `everygen-design.md`.
- Official agent docs, fetched directly:
  - `/llms.txt`, `/llms-full.txt`
  - `/developers.md`, `/openapi.json`
  - `https://www.viewmax.io/.well-known/oauth-authorization-server`

**Authenticated app: NOT accessed.** No Everygen session existed in the debug Chrome, and Claude may not type passwords. Every in-app workflow below is UNVERIFIED until a user-signed-in session is inspected.

## Identity

- Everygen (formerly Viewmax), made by Viewmax LLC. Official domains: everygen.ai and viewmax.io. VERIFIED (llms.txt).
- Credit-based monthly or yearly plans. VERIFIED (llms.txt; the plan table was not captured).

## Integration surface: VERIFIED (official docs)

| Item | Value |
|---|---|
| Public REST API | **None documented.** The only agent surface is MCP. |
| MCP endpoint | `https://www.viewmax.io/api/mcp` (also `https://everygen.ai/api/mcp`); ChatGPT variant `/api/chatgpt-mcp`. Streamable HTTP, JSON-RPC 2.0. |
| Auth | OAuth 2.1 auth code + PKCE (S256) + dynamic client registration (`/api/auth/mcp/register`). Token endpoint `/api/auth/mcp/token`, refresh supported (`offline_access`). |
| Scopes | `media:upload`, `image:generate`, `video:generate`, `voice:change`, `voiceover:generate`, `audio:generate`, `generation:read` |
| Tool list | Only through `tools/list` after OAuth. **UNVERIFIED** (not connected). |
| Errors | 401 means follow the `WWW-Authenticate` resource_metadata. 403 means the scope is missing. |

**Integration implication (INFERRED):** Everygen MCP is per-user OAuth that acts on the user's own Everygen account and credits. It fits "bring your own Everygen account". It is **not** a white-label backend for Cloudnivo's users. Cloudnivo cannot resell Everygen generation without a commercial agreement. Use the same underlying model providers directly instead (see architecture doc).

## Feature inventory

Columns: Feature · Where · What it does · Inputs → outputs · Integration · Status · Proposed Cloudnivo implementation.

| # | Feature | Where | What it does | In → Out | Integration | Status | Cloudnivo plan |
|---|---|---|---|---|---|---|---|
| 1 | AI Video Generator | /tools/video-generator | Text- or image-to-video across 15 models | prompt, optional image, model, aspect, length, resolution → MP4 | MCP `video:generate` | VERIFIED (docs) / app UNVERIFIED | Extend `generate-media` with a provider-adapter registry (Replicate/fal) and a model catalog table |
| 2 | Director | /tools/director | Camera, lens, lighting, colour and camera-move controls; extendable clip | structured shot params → clip | unknown | UNVERIFIED | Phase 4: "Shot controls" panel that compiles to a prompt plus model params |
| 3 | AI Image Generator | /tools/image-generator | Nano Banana, GPT Image, Seedream; up to 4K | prompt, refs → image | MCP `image:generate` | VERIFIED (docs) | Existing gpt-image path; add Seedream/Nano Banana via an adapter; store in Storage, not data URLs |
| 4 | Shorts Studio | /tools/shorts-studio | Proven format plus direction → vertical clip | format, direction → 9:16 clip | unknown | UNVERIFIED | Map to `prompt_library` "formats" plus the video generator |
| 5 | Wizard (agent) | /tools/wizard | Plans a video, generates clips, images and VO; approval per paid step | brief → project with assets | unknown | UNVERIFIED | Phase 5: Cloudnivo "Planner" with explicit cost approval per step |
| 6 | Auto Captions | /tools/auto-captions | Animated captions on an uploaded clip | video, style → captioned MP4 | unknown | UNVERIFIED | Shared caption service (ASR + burn-in renderer), Phase 6 |
| 7 | AI Voiceover | /tools/ai-voiceover | Script to narration | text, voice → audio | MCP `voiceover:generate` | VERIFIED (scope) | TTS adapter (ElevenLabs/OpenAI TTS), Phase 5 |
| 8 | Voice Changer | /tools/voice-changer | Speech-to-speech | audio/video, voice → audio | MCP `voice:change` | VERIFIED (scope) | Optional, later (Phase 8+) |
| 9 | AI Clone | /tools/ai-clone | Photo plus reference video → 10 s motion-transfer clip | image, video → clip | unknown | UNVERIFIED | Optional; Kling motion-control model via adapter |
| 10 | Scriptwriter | /tools/script-writer | Hook plus scene-by-scene script, "send to video" | idea → script | unknown | UNVERIFIED | Existing `write-script`; add scene structure and a send-to-planner action |
| 11 | AI Ad Generator | /tools/ai-ad-generator | Product/app/creator → several UGC ad concepts | product URL or images → variants | MCP `video:generate` ("videos and ads") | VERIFIED (scope) | Phase 4: ad template that fans out N variants with a cost preview |
| 12 | Video Downloader | /tools/multi-downloader | Download from YouTube/IG/TikTok/X/FB | URL → file | MCP `media:upload` (import) | VERIFIED (scope) | **Legal review required** (platform ToS). Use only for the user's own content or the official API |
| 13 | Music / audio | (scope) | Generate music and other audio | prompt → audio | MCP `audio:generate` | VERIFIED (scope) | Music adapter, Phase 5 |
| 14 | Prompt library / viral presets | /prompt-library, /viral-presets | Ready prompts with examples | — | public pages | VERIFIED (exists) | Existing `prompt_library` |
| 15 | Model catalog | /models | Resolution, length and credits per model | — | public | VERIFIED | `models` config table driving the UI and pricing |
| 16 | Generation history and credit info | app | Status, history, credit balance | — | MCP `generation:read` | VERIFIED (scope) | Existing `generations` plus a ledger (Phase 3) |

### Video models (VERIFIED, llms-full.txt)

Starting credits = cheapest run.

| Model | Max res | Length | Audio | Start credits |
|---|---|---|---|---|
| Grok Imagine | 720p | 1–15 s | yes | 1 |
| Grok Imagine 1.5 | 720p | 1–15 s | yes | 2 |
| MiniMax H3 Max | 720p | 5–15 s | yes | 5 |
| MiniMax H3 Max Turbo | 1080p | 5–15 s | yes | 3 |
| Seedance 2.5 | 1080p | 4–30 s | optional | 7 |
| Seedance 2 | 4K | 4–15 s | optional | 5 |
| Seedance 2 Mini | 720p | 4–15 s | optional | 3 |
| Seedance 2 Fast | 720p | 4–15 s | optional | 4 |
| Gemini Omni 1.1 Flash | 4K | 3–10 s | yes | 2 |
| Kling O1 | 720p | 5–10 s | no | 7 |
| Kling O1 Pro | 720p | 5–10 s | no | 10 |
| Kling 3.0 | 720p | 3–15 s | optional | 5 |
| Kling 3.0 Pro | 720p | 3–15 s | optional | 6 |
| Kling 3.0 Turbo | 1080p | 3–15 s | yes | 6 |
| Kling 4.0 | 1080p | 3–30 s | yes | 8 |

### Image models (VERIFIED)

Nano Banana (1 credit), Nano Banana 2 (2–3), Nano Banana Pro (3–4), Nano Banana 2 Lite (1), GPT Image 2 (1–8), GPT Image 2.5 Flare and Sunburst (1–16), Seedream 5 Pro (1–2), Seedream 5 Lite (1, up to 4K, 14 refs), Seedream 5 Flash (1).

## Backend behaviour

- Auth and scopes per tool, enforced server-side. VERIFIED (developers.md).
- Async generation with status read through `generation:read`. INFERRED (the scope wording mentions "generation status").
- "You approve each paid step" in Wizard means a cost-confirmation gate before spend. VERIFIED (llms.txt wording); mechanism UNVERIFIED.
- Underlying providers (Google Veo/Gemini, Kling, ByteDance Seedance/Seedream, OpenAI, xAI Grok, MiniMax). Inferred from model names; the routing path is unknown.
- Frontend: Next.js on Vercel-style immutable chunks. VERIFIED (REA resources).

## Coverage checklist

| Area | Status |
|---|---|
| Public site and agent docs | Complete |
| Developer/MCP/OAuth surface | Complete (docs). Live `tools/list`: blocked |
| Authenticated app (all 12 tools, projects, billing, settings) | **Blocked**: needs a user sign-in in the debug Chrome |
| Pricing per plan | Incomplete (/pricing not parsed) |
| Live generation test | Blocked: needs a session and a spend approval |
