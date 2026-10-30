# REA workflow · desktop

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

- `rea inspect-desktop-application /artifacts/MyApplication  --detail summary --evidence_output /reports/application.evidence.json --json`
- `rea inspect-artifact /absolute/path/absent-bundles-directory/net8-compressed/Probe.exe --json`
- `rea extract-artifact /absolute/path/absent-bundles-directory/net8-compressed/Probe.exe --json`
- `rea project-apple-application-graph '{"inventory_evidence":[<inventory_artifact Evidence>]}'`
- `rea decode-interface-builder /path/to/App.app --json` — decodes compiled storyboard and nib archives.
- `rea inspect-managed-artifact /absolute/path/Assembly.dll --json`
- `rea inspect-managed-members /absolute/path/Assembly.dll --json`
- `rea inspect-il /path/to/assembly.dll --json` — disassembles .NET IL from a managed assembly.
