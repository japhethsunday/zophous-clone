# REA workflow · firmware

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

- `rea inspect-firmware-regions /path/to/firmware.bin`
- `rea extract-firmware /path/to/firmware.bin /path/to/new-output`
- `rea inspect-devicetree /artifacts/board.dtb --json`
- `rea inspect-kernel-module /absolute/path/to/module.ko --json`
- `rea inspect-evm-interface ./runtime.hex hex --json`
- `rea inspect-gpu-code-objects /artifacts/library.so --analysis kernels  --targets '["sm_100"]' --detail summary  --view '{"collection":"kernels","names":["kernel_name"]}'  --evidence_output /analysis/library-gpu.evidence.json --json`
