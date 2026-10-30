# tools/rea — Cloudnivo × REA bridge

[REA (morluto/rea)](https://github.com/morluto/rea) is an MIT-licensed MCP/CLI
toolkit with **233 local analysis tools**: it captures and reverse-engineers web
apps, Electron apps, native binaries, APKs, firmwares, pcap/HAR captures and
model files, and can turn a recorded capture into a replayable **agent
environment**. We keep a working clone of it at `./rea` (gitignored; restore
with `git clone https://github.com/morluto/rea.git rea && cd rea && npm ci && npm run build`).

This folder makes that clone usable from the Cloudnivo repo without dragging
its 1.2 GB around in git:

| Path | What it is |
|---|---|
| `run.mjs` | Bridge script. Finds/installs Node ≥ 24.22.1 (REA's engine requirement), then execs the vendored REA CLI. Usage: `node tools/rea/run.mjs <rea-command> [args] --json`. |
| `catalog.slim.json` | All 233 REA MCP tools with names + descriptions (generated from `rea/dist/mcp-catalog.json`). |
| `workflows/*.md` | Curated, copy-pasteable command playbooks per target type (web-apps, javascript, electron, desktop, android, binaries, firmware, captures, environments, data-models). Examples are verbatim from REA's own docs. |
| `../../docs/research/rea/tool-catalog.json` | Full machine-readable catalog **including input schemas** for every tool. |
| `../../rea/skills/reverse-engineer-anything/` | REA's official agent skill (workflow instructions for agents, incl. connection recovery). |

## How we use it (and will keep using it)

- **Competitor research** — `capture-web-screenshot`, `inspect-web-page`,
  `analyze-web-bundle` against a debug Chrome (`--remote-debugging-port=9222`)
  on everygen.ai / tubegen.ai / zophous / ssemble (see
  `docs/research/REA-RESEARCH-INDEX.md`). Signed-in pages need a session in
  that browser first.
- **Feature cloning** — "see a feature, understand it, rebuild it": analyze a
  competitor's web bundle → trace routes/endpoints → reimplement in our stack.
- **Agent environments** — `environment-build app.har ./env` produces a
  replayable MCP env of a captured app; useful for testing our flows against a
  frozen mock of TikTok/YouTube studio UIs.
- **Asset forensics** — `inspect-artifact`/`extract-artifact` unpack archives
  (asar, zip, bundles) when auditing third-party media toolkits; 
  `inspect-model-artifact` reads GGUF/safetensors headers of candidate worker
  models (Whisper, Kokoro) without loading weights.

## Verified

```bash
$ node tools/rea/run.mjs inspect-model-artifact --help   # prints REA help via auto-installed Node 24.10.0
$ node tools/rea/run.mjs inspect-model-artifact /tmp/fake.gguf --json
{"code":"target_unavailable","category":"unsupported_target", ... }   # real canonical REA error contract
```

The wrapper caches a Node runtime under `~/.cloudnivo/tools/`; override with
`REA_NODE=/path/to/node` or point at another checkout with `REA_DIR`.

## Registering REA as an MCP server (for any agent)

```bash
cd rea && npx rea-agents setup        # official installer, registers stdio MCP
# or manually, against this vendored clone:
node tools/rea/run.mjs mcp            # stdio MCP server
node tools/rea/run.mjs mcp --http --port 8765   # HTTP listener variant
```
