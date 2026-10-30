# REA workflow · javascript

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

- `rea analyze-javascript-application /absolute/path/to/app --json > application-evidence.json`
- `rea recover-javascript-sources /tmp/web-scripts/app.js /tmp/recovered-app --json`
- `rea reconcile-javascript-runtime reconciliation-input.json --json`
- `rea list-javascript-runtime-targets http://127.0.0.1:9229  --json`
- `rea observe-javascript-runtime http://127.0.0.1:9229 TARGET_ID  --runtime-kind node --json`
- `rea compare-artifacts '{"left":{"kind":"evidence-file","path":"old.json"},"right":{"kind":"evidence-file","path":"new.json"}}' --json`
- `rea import-reference-source /absolute/path/to/source`
- `rea trace-application-feature ./trace-input.json --json`
