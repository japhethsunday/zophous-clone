# REA workflow · electron

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

- `rea inspect-electron-fuses /Applications/Example.app --json`
- `rea list-electron-targets http://127.0.0.1:9223 --json`
- `rea inspect-electron-page http://127.0.0.1:9223 TARGET_ID  --observation-ms 100 --json`
- `rea capture-electron-scenario scenario.json --json`
