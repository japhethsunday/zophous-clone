# Open Art — clone an AI-art web app with REA

Machine-readable plan: `docs/research/open-art/pipeline.json` (20 stages, 26 tool bindings).
In-app runbook: **Open Art** page in the product (`#/app/openart`) — renders the same pipeline
with per-stage commands generated from a target URL. Regenerate app data with
`node scripts/gen-open-art-data.mjs`.

## Prerequisite
Launch Chromium with a dedicated profile and CDP open on loopback:

```bash
chromium --remote-debugging-port=9222 --user-data-dir=$HOME/.cloudnivo/rea-profile &
```

Then smoke-test the bridge:

```bash
node tools/rea/run.mjs list-browser-targets --cdp-endpoint http://127.0.0.1:9222
```

## The four phases

1. **Capture** — `discover` → `capture-passive` (`inspect-web-page --include-script-sources`) →
   `capture-scenario` (`capture-browser-scenario`; actions are exactly
   `goto|click|fill|press|select_option|check|uncheck|wait_for|request|wait_for_timeout`;
   snapshot kinds `screenshot|dom|accessibility|url|history|storage`) →
   `observe-session` / `observe-execution`.
2. **Extract** — `analyze-web-bundle`, `export-web-scripts`, import-graph tracing,
   `recover-javascript-sources` (Wakaru de-minification), static graph.
3. **Trace** — `trace-application-feature` (seed = any route, string or API seen in phase 1),
   `reconcile-javascript-runtime`, network decode, capture/app comparison.
4. **Verify** — WebMCP discovery, event listeners, source attribution,
   `compare-source-to-bundle` + `verify-reconstruction`, final screenshots.

Every stage writes Evidence JSON under `evidence/<stage-id>/`; the obligation ledger tracks
what remains unexplained. See `web-apps.md` for generic web detail and this file's
pipeline.json for the art-app-specific ordering.

## Line we do not cross
Research stops at *understanding structure* (routes, state machines, model lists, pricing
gates). Recovered sources/assets of a closed commercial app are evidence only — never ship
them. Build our own implementation from the mechanics you learned.
