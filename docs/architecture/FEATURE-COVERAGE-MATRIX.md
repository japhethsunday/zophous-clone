# Feature Coverage Matrix

Platforms: EG = Everygen, TG = TubeGen, ZO = Zophous, SS = Ssemble. ✓ = documented feature.

Cloudnivo status uses the audit classes: **Working**, **Incomplete**, **Broken/Simulated**, **Missing**, **Blocked (external)**, **Not appropriate**, **Verify**.

| Capability | EG | TG | ZO | SS | Cloudnivo today | Decision | Phase |
|---|---|---|---|---|---|---|---|
| Credit hold/settle ledger | ✓ | ✓ | – | ✓(per request) | Broken (RPCs callable by anon; profile writable) | Fix + ledger | 1 (hotfix), 3 |
| Server-side entitlements / payments | ✓ | ✓ | ✓ | ✓ | Broken (client sets plan) | Stripe + webhook | 1 (lock), 9 |
| Asset storage | ✓ | ✓ | ✓ | hosted URLs | Missing (no buckets; data URLs) | Storage + assets table | 3 |
| Job queue / progress / resume | ✓ | ✓ (SSE, poll) | ✓ | ✓ (poll) | Incomplete (client polls generations only) | jobs + jobs-tick + Realtime | 3 |
| Upload ≤3 GB | ✓ | ✓ | ✓ | fileUrl | Missing | Resumable upload | 3 |
| YouTube link import | ✓ (downloader) | – | ✓ | ✓ | Simulated | Pass to Ssemble | 6–7 |
| Moment detection / auto-clip | – | – | ✓ | ✓ | Simulated (random) | Ssemble adapter | 6–7 |
| Reframe 9:16 / face tracking | – | – | ✓ | ✓ | Missing | Ssemble `layout` | 7 |
| Captions (templates, languages) | ✓ | ✓ | ✓ | ✓ | Missing | Ssemble templates; Whisper for long-form | 6–7, 5 |
| Virality score + reason | – | – | ✓ | ✓ | Simulated (clips); real LLM estimate (generations) | Ssemble score + LLM | 7 |
| Hook title / CTA / outro | – | – | ✓ (brand) | ✓ | Incomplete (brand kit stored only) | Map Brand Kit to Ssemble fields | 7 |
| Music / game split / meme hook | ✓ (audio) | ✓ | – | ✓ | Missing | Ssemble options | 7 |
| Edit templates (One Click Edit) | – | – | ✓ | template id | Incomplete (table unused) | Template → param preset | 6 |
| Text→video, image→video | ✓ | ✓ (animate) | – | – | Implemented, unverified (Replicate) | Extend catalog | 4 |
| Image generation | ✓ | ✓ | – | – | Implemented, unverified (gpt-image) | + Seedream/Nano Banana; Storage | 4 |
| Director / shot controls | ✓ | – | – | – | Missing | Prompt compiler UI | 4 |
| UGC ad variants | ✓ | – | ✓(marketing mode) | – | Missing | N-variant job | 4 |
| Motion clone | ✓ | – | – | – | Missing | Optional adapter | 4 (optional) |
| Scriptwriter (short) | ✓ | ✓ | – | – | Implemented, unverified | Keep | 4 |
| Long-form script (sections, history) | – | ✓ | – | – | Missing | Extend llm adapter | 5 |
| Titles / descriptions with chapters | – | ✓ | – | ✓ (titles) | Partial (meta hashtags) | llm adapter | 5 |
| Voiceover / clones | ✓ | ✓ | – | – | Missing | tts adapter (clones later) | 5 |
| Voice changer | ✓ | – | – | – | Missing | Not now | backlog |
| Scene planning + per-scene images | ✓ (Wizard) | ✓ | – | – | Missing | Pipeline step | 5 |
| Art style / consistent characters | partial | ✓ | – | – | Missing | Reference images | 5 |
| Stock footage | – | ✓ (Storyblocks) | – | – | Missing | Pexels API (free) optional | 5 (optional) |
| Avatars / lip-sync | – | ✓ | – | – | Missing | Backlog | backlog |
| Soundtrack | ✓ | ✓ | – | ✓ (library) | Missing | music adapter | 5 |
| Render long-form MP4 | – | ✓ | – | – | Missing | Render worker | 5/8 |
| Timeline editor | – | ✓ | ✓ (clip edit) | – (app only) | Missing | Scene-list editor first | 8 |
| Thumbnails + score | – | ✓ | – | – | Missing | Image + vision LLM | 5 |
| Niche finder / research | – | ✓ | – | – | Missing | YouTube Data API | 5 |
| Agent planner (Wizard) | ✓ | – | – | – | Missing | Planner with cost approvals | 5 |
| TikTok / YouTube publish + schedule | – | ✓ (YT) | ✓ | read-only API | Simulated | Official APIs | 8 |
| Post status / error codes / retry | – | ✓ | ✓ | ✓ | Missing | Port Ssemble's error model | 8 |
| DNA profile / advisor | – | – | ✓ | – | Simulated | Real metrics + LLM | 8 |
| Analytics | – | ✓ (YT) | ✓ | – | Simulated | Platform APIs | 8 |
| Workspaces / teams | – | ✓ | ✓ | – | Incomplete (`managers`) | Later | 9 |
| MCP for agents (Cloudnivo's own) | ✓ | planned | – | – | Missing | Backlog | backlog |
| Admin console | ? | ? | ? | ? | Missing | Minimal admin (jobs, ledger, users) | 9 |
| Tests / CI / monitoring | ? | ? | ? | ? | Missing | Vitest + Playwright + Sentry | 3, 10 |
| Campaigns page | – | – | – | – | Placeholder | Hide until real | 1 |

**Not appropriate to integrate:** the Zophous app (no API); the TubeGen API (resale cost/ToS until confirmed); Everygen MCP as a backend (per-user only, so offered only as an optional user connection); first-party social video downloading.
