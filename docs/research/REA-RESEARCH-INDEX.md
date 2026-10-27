# REA Research Index

Updated 2026-10-27.

## Method and tools actually used

- **REA** (Chrome DevTools Protocol against a local debug Chrome):
  - `list_browser_targets` and `inspect_web_page` (DOM, resources, accessibility) on everygen.ai and cloudnivo.org
  - `capture_web_screenshot` on cloudnivo.org `/` and `/#/app`
- **Official machine-readable docs**, fetched over HTTPS:
  - Everygen: `llms.txt`, `llms-full.txt`, `developers.md`, `openapi.json`, OAuth metadata
  - TubeGen: `llms.txt`, `app.tubegen.ai/llms-full.txt`
  - Zophous: `llms.txt`, `/docs`
  - Ssemble: `llms.txt`, `/docs/llms.txt`
- **Supabase MCP**, read-only, on project `gapzawavgmsnfuekqudo`: tables, policies, functions, edge functions, security advisors.
- **Repo inspection:** `japhethsunday/zophous-clone` @ 44bc647.

**Not done:** authenticated in-app sessions on the four platforms. No platform session existed in the debug Chrome, and Claude doesn't type passwords. No live provider calls were made, because that needs keys and a spend approval. No private endpoints were probed.

## Documents

| Doc | Status |
|---|---|
| [EVERYGEN-RESEARCH.md](EVERYGEN-RESEARCH.md) | Docs/MCP: complete · App: **blocked** · `tools/list`: blocked |
| [TUBEGEN-RESEARCH.md](TUBEGEN-RESEARCH.md) | Docs/API/workflow: complete · API reference schemas: incomplete · App: **blocked** |
| [ZOPHOUS-RESEARCH.md](ZOPHOUS-RESEARCH.md) | Docs: complete · API: none exists · App: **blocked** |
| [SSEMBLE-RESEARCH.md](SSEMBLE-RESEARCH.md) | API reference: complete · Rate-limit values and ToS: incomplete · App: **blocked** |
| [CLOUDNIVO-BASELINE-AUDIT.md](CLOUDNIVO-BASELINE-AUDIT.md) | Complete (code, DB, live UI). Edge secrets and deploy host: unverified |
| [../architecture/UNIFIED-INTEGRATION-ARCHITECTURE.md](../architecture/UNIFIED-INTEGRATION-ARCHITECTURE.md) | Complete (draft for review) |
| [../architecture/FEATURE-COVERAGE-MATRIX.md](../architecture/FEATURE-COVERAGE-MATRIX.md) | Complete |
| [../implementation/PHASED-INTEGRATION-PLAN.md](../implementation/PHASED-INTEGRATION-PLAN.md) | Complete: 10 phases with copy-ready prompts |
| [../implementation/ACCEPTANCE-TEST-PLAN.md](../implementation/ACCEPTANCE-TEST-PLAN.md) | Complete |
| [../implementation/RISKS-AND-DEPENDENCIES.md](../implementation/RISKS-AND-DEPENDENCIES.md) | Complete |

## Open questions

1. Are `OPENAI_API_KEY` and `REPLICATE_API_TOKEN` set in the Edge secrets? (0 generations have ever succeeded.)
2. Which host serves cloudnivo.org: Vercel `dist`, Verdent, or something else?
3. Do Ssemble's terms allow serving Cloudnivo end users with one API key? What are the hourly/daily limits?
4. Is Zophous a third party? If so, the copy and pricing must be rewritten (see the risks doc).
5. What are Everygen's MCP `tools/list` contents? This needs a signed-in OAuth connection.

## To complete the blocked sections

Sign in to each platform in the debug Chrome (port 9222), then ask Claude to "continue the in-app REA research". Each app will be walked page by page, appending findings to its doc with VERIFIED labels.
