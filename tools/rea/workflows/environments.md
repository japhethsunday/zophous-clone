# REA workflow · environments

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

- `rea environment-build grafana.har ./grafana --json`
- `rea environment-serve manifest.json --evidence capture.json --port 8765`
- `rea environment-export manifest.json --evidence capture.json ./grafana-example --json`
- `rea environment-compare manifest.json --evidence capture.json  --probe probe-crud.json --probe probe-reads.json --json`
- `rea evidence-export /absolute/path/to/evidence/bundle.json /absolute/path/to/evidence/canonical.json`
- `rea evidence-import /absolute/path/to/evidence/bundle.json`
- `rea inspect-analysis-view /tmp/metadata-query.json --json`
