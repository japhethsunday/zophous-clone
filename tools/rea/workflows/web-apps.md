# REA workflow · web-apps

Every command below is a real `rea` CLI subcommand from the vendored clone
(`./rea`, [morluto/rea](https://github.com/morluto/rea)), with usage examples
taken verbatim from REA's own documentation. Run them through the bridge so the
Node >=24.22.1 requirement is handled automatically:

```bash
node tools/rea/run.mjs <command> <args...> --json
```

Each call prints canonical Evidence JSON to stdout — save it (`> x.json`) and
chain it into comparison/view tools, or hand it to an agent for reconstruction.
Machine-readable catalogs: `tools/rea/catalog.slim.json` (233 MCP tool names +
descriptions) and `docs/research/rea/tool-catalog.json` (with input schemas).

## Commands

- `rea list-browser-targets ws://127.0.0.1:9222/devtools/browser/<id>`
- `rea inspect-web-page http://127.0.0.1:9222 TARGET_ID  --observation-ms 1000  --json`
- `rea observe-web-session http://127.0.0.1:9222 TARGET_ID  --observation-ms 10000 --json`
- `rea observe-web-execution http://127.0.0.1:9222 TARGET_ID  --observation-ms 10000 --json`
- `rea analyze-web-bundle http://127.0.0.1:9222 TARGET_ID  --json`
- `rea capture-web-screenshot http://127.0.0.1:9222 TARGET_ID  --json`
- `rea discover-webmcp-tools http://127.0.0.1:9222 TARGET_ID  --json`
- `rea trace-web-source-location /analysis/scripts/manifest.json 0  /analysis/app.js.map 'https://example.test/maps/app.js.map?v=7#context'  1 25 --json`
- `rea inspect-web-event-listeners http://127.0.0.1:9222 TARGET_ID '#submit' --json`
- `rea inspect-web-network-capture /absolute/session.har har --format json > capture.json`
- `rea export-web-scripts /analysis/capture.json /analysis/exported-scripts --json`
- `rea capture-browser-scenario ./browser-scenario.json --json > browser-capture.json`
- `rea validate-browser-scenario ./browser-scenario.json --json`
