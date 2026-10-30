# REA workflow · data-models

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

- `rea inspect-sqlite-database ./application.sqlite --json`
- `rea inspect-model-artifact /absolute/path/model.gguf --json`
