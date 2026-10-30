# REA workflow · captures

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

- `rea inspect-pcap-capture /captures/session.pcapng --json`
- `rea inspect-packet-capture /artifacts/device.pcapng  --fields ip.addr --fields udp.port --fields data.data  --display_filter 'udp' --format json`
- `rea inspect-packet-fields --query usb`
- `rea capture-process ./scenario.json --json > capture.json`
- `rea compare-process-captures authority.json reconstruction.json`
- `rea inspect-recorded-crash ./crash.core --json`
- `rea inspect-apple-ips /absolute/path/to/report.ips --json`
- `rea decode-signal-recording /artifacts/uart.vcd  --decoders uart:rx=RX:baudrate=9600 --input_format vcd  --annotations uart=rx-data --format json`
- `rea inspect-signal-decoders --query uart`
