# Ssemble Research

Researched: 2026-10-27.

Evidence:
- https://www.ssemble.com/llms.txt
- **https://www.ssemble.com/docs/llms.txt** (official API docs, full endpoint reference)
- app.ssemble.com shell

**Authenticated app: NOT accessed.** The API is fully documented. A live call is UNVERIFIED (needs an `sk_ssemble_` key from Settings → API Keys).

## Identity

Ssemble: long YouTube video into viral shorts, with auto-captions, scheduling and autopost. Claims 2.4M+ creators; plans from $6/mo. VERIFIED (self-reported).

## Integration surface: VERIFIED (official API docs)

| Item | Value |
|---|---|
| Base URL | `https://aiclipping.ssemble.com/api/v1` |
| Auth | `X-API-Key: sk_ssemble_…` or `Authorization: Bearer` |
| Rate-limit headers | `X-RateLimit-Limit/Remaining-Hour/Day`, `X-RateLimit-Reset` (limit values not published) |
| Async model | Create returns `requestId`. Poll `/status` every 10 s (queued, processing, completed, failed, cancelled). Then fetch results |
| Webhooks | **None documented.** Polling only |
| Credits | 1 credit per `POST /shorts/create` (per request, not per clip) |
| Constraints | Window ≤ 20 min (1200 s) per request; source ≤ 5 h; YouTube Shorts URLs rejected |

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | /templates | Caption templates (`templateId`, name, previews, default) |
| POST | /shorts/create | `url` or `fileUrl`, `start`, `end` (required); `preferredLength` (under30sec … under10min); `language` (50+ ISO codes), `captionLanguage`; `templateId`; `noClipping`; `captionsEnabled`; `hookTitle`; `memeHook`/`memeHookName`; `gameVideo`/`gameVideoName` (split-screen); `music`/`musicName`/`musicNames[]`/`musicVolume`; `ctaEnabled`/`ctaText`; `layout` (auto/fill/fit/square); `blurBackground`/`backgroundColor`; `outro*` (text, image, seconds, sting, handle); `includeSourceLink`/`customSourceLink` |
| GET | /shorts/:id/status | `status`, `progress`, `failureReason` |
| GET | /shorts/:id | `shorts[]`: title, reason, description, `viral_score`, `video_url`, start/end, duration, 1080×1920, `recompiling`, error, `posts[]` |
| GET | /shorts | Paginated history (status filter, sort) |
| GET | /posts | Scheduled/published posts (YT/IG/TikTok), statuses, `errorCode` (auth_expired, daily_cap, account_restricted, account_not_eligible, media_rejected, video_missing, processing_timeout, rate_limited, unknown), `retryable` |
| DELETE | /shorts/:id | Delete a request and its shorts (irreversible) |
| GET | /music, /game-videos, /meme-hooks | Asset catalogs |

Error format: `{error:{code,message,details}}`. Codes: invalid_request, invalid_youtube_url, video_too_long, invalid_api_key, insufficient_credits, subscription_required, resource_not_found, rate_limit_exceeded, internal_error.

**Not in the API:** creating posts or schedules (read-only `GET /posts`; scheduling happens in the web app), connecting social accounts, editing a clip after generation, and brand settings beyond the per-request fields.

## Feature inventory

| # | Feature | API? | Status | Cloudnivo plan |
|---|---|---|---|---|
| 1 | Auto curation (moment detection) | yes (create) | VERIFIED | **Phase 7: primary clipping backend** behind the `clipping` provider adapter |
| 2 | Face tracking reframe 9:16 | yes (`layout:auto`) | VERIFIED (param), quality UNVERIFIED | Same |
| 3 | Auto captions + 50+ languages + templates | yes | VERIFIED | Map Cloudnivo caption styles to `templateId` |
| 4 | Caption translation | yes (`captionLanguage`) | VERIFIED | Expose a "caption language" option |
| 5 | Hook title & CTA | yes | VERIFIED | Map to Brand Kit CTA |
| 6 | Game video split-screen | yes | VERIFIED | Option toggle |
| 7 | Meme hook intro | yes | VERIFIED | Option toggle |
| 8 | Music | yes | VERIFIED | Option plus picker from `/music` |
| 9 | Outro card | yes | VERIFIED | Map to Brand Kit (logo, handle) |
| 10 | Virality score + reason + title + description | yes (results) | VERIFIED | Store in `clips` (real data replaces the fake values) |
| 11 | Request history / delete | yes | VERIFIED | Admin and user history |
| 12 | Schedule & autopost | **read-only via API** | VERIFIED | Cloudnivo posts natively (Phase 8) using the `video_url` it fetched |
| 13 | Channel automation | app only | UNVERIFIED | Out of scope |

## Integration implication (INFERRED)

Ssemble is the **only researched platform with a documented, key-based REST API that can serve Cloudnivo users server-side.** One Cloudnivo key spends Ssemble credits (1 per request). Cost scales with usage: confirm the commercial/ToS terms for resale and the hourly/day limits before launch. Result `video_url`s are hosted by Ssemble, so Cloudnivo should **copy them into its own Storage** for durability and access control.

## Coverage checklist

| Area | Status |
|---|---|
| API reference | Complete |
| Rate-limit values, ToS for reseller use | Incomplete (not published) |
| Authenticated app (editor, scheduler, automation) | **Blocked**: no session |
| Live API call | Blocked: needs a key and a spend approval |
