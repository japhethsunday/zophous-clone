# REA workflow · binaries

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

- `rea analyze /absolute/path/to/program --provider ghidra --snapshot /absolute/path/to/analysis/program-6.2.json`
- `rea inspect "C:\fixtures\sample.exe" --provider ghidra --format json`
- `rea decompile /absolute/path/to/program main --json`
- `rea function /absolute/path/to/program main --json`
- `rea search /absolute/path/to/legacy.exe entry --kind procedures --provider ghidra --json`
- `rea xrefs /absolute/path/to/program 0x1000 --provider ghidra --json`
- `rea trace /absolute/path/to/program "search" --provider ghidra --json`
- `rea read-bytes /absolute/path/to/legacy.exe 0x10000 --length 16 --provider ghidra --json`
- `rea address-to-file-offset /absolute/path/to/legacy.exe 0x10000 --provider ghidra --json`
- `rea match-native-functions request.json  --source_bundle left-bundle.json --source_bundle right-bundle.json  --evidence_output matching-bundle.json --json`
- `rea inspect-go-binary /absolute/path/to/program --json`
- `rea inspect-rust-binary /absolute/path/to/application --json`
- `rea inspect-python-pyc /absolute/path/to/module.pyc --json`
- `rea inspect-elf-notes /absolute/path/to/program --json`
- `rea inspect-pe-imports /absolute/path/to/application.exe --json`
- `rea inspect-byte-entropy ./firmware.bin --block-size 4096 --json`
- `rea build-reconstruction-obligation-ledger '{`
