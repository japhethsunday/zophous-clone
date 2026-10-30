#!/usr/bin/env node
/* ============================================================
   tools/rea/run.mjs — Cloudnivo's bridge to the vendored REA CLI.

   REA (github.com/morluto/rea, cloned into ./rea) ships 233 local
   analysis tools: web/Electron/binary/APK capture and reverse
   engineering. This wrapper finds a Node >=24.22.1 (REA needs one;
   zlib zstd streams), otherwise downloads it into .tools/, then runs:

     node tools/rea/run.mjs <rea-command...> [--json '<input>']

   Output is REA's own Evidence JSON on stdout — pipe it, save it, or
   feed it to an agent workflow. See tools/rea/workflows/*.md.
   ============================================================ */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REA_DIR = process.env.REA_DIR || path.join(ROOT, 'rea');
const REA_ENTRY = path.join(REA_DIR, 'scripts', 'rea.mjs');
const MIN = { major: 24, minor: 22, patch: 1 }; // REA package.json engines
const TOOLS_DIR = path.join(homedir(), '.cloudnivo', 'tools');

function versionOk(v) {
  const m = /^v(\d+)\.(\d+)\.(\d+)/.exec(v || '');
  if (!m) return false;
  const [maj, min, pat] = [+m[1], +m[2], +m[3]];
  return maj > MIN.major || (maj === MIN.major && (min > MIN.minor || (min === MIN.minor && pat >= MIN.patch)));
}

function findNode() {
  if (process.env.REA_NODE && versionOk(spawnSync(process.env.REA_NODE, ['--version']).stdout?.toString())) {
    return process.env.REA_NODE;
  }
  if (versionOk(process.version)) return process.execPath;
  for (const c of ['node', '/usr/local/bin/node', '/usr/bin/node']) {
    const r = spawnSync(c, ['--version'], { encoding: 'utf8' });
    if (!r.error && versionOk(r.stdout)) return c;
  }
  const arch = process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
  const pinned = process.env.REA_NODE_VERSION || 'v24.10.0';
  const cached = path.join(TOOLS_DIR, `node-${pinned}-${arch}`, 'bin', 'node');
  if (existsSync(cached)) return cached;
  console.error(`[tools/rea] REA needs Node >= ${MIN.major}.${MIN.minor}.${MIN.patch}; downloading ${pinned} (${arch}) into ${TOOLS_DIR} …`);
  mkdirSync(TOOLS_DIR, { recursive: true });
  const url = `https://nodejs.org/dist/${pinned}/node-${pinned}-${arch}.tar.xz`;
  const tarball = path.join(TOOLS_DIR, path.basename(url));
  const dl = spawnSync('curl', ['-fsSL', url, '-o', tarball], { stdio: 'inherit' });
  if (dl.status !== 0) throw new Error('[tools/rea] could not download Node runtime; install Node >=24.22.1 and set REA_NODE.');
  const ex = spawnSync('tar', ['-xf', tarball, '-C', TOOLS_DIR], { stdio: 'inherit' });
  if (ex.status !== 0) throw new Error('[tools/rea] failed to extract Node runtime.');
  if (!existsSync(cached)) throw new Error('[tools/rea] downloaded Node not found at ' + cached);
  return cached;
}

if (!existsSync(REA_ENTRY)) {
  console.error(`[tools/rea] vendored REA clone missing at ${REA_DIR}. Restore it with:\n` +
    `  git clone https://github.com/morluto/rea.git rea && cd rea && npm ci && npm run build`);
  process.exit(1);
}

// --evidence-file <path>: inline a saved Evidence JSON as the single positional input
const args = process.argv.slice(2);
let evidenceInline = null;
const ei = args.indexOf('--evidence-file');
if (ei !== -1) {
  evidenceInline = readFileSync(args[ei + 1], 'utf8');
  args.splice(ei, 2);
}
const ji = args.indexOf('--json');
if (ji !== -1 && args[ji + 1]) {
  // normalize: REA one-shot commands take inline JSON as positional stdin-able arg
  args.splice(ji, 1);
  args[ji] = args[ji]; // keep payload as trailing positional
}
if (!args.length || args[0].startsWith('-')) {
  console.error('Usage: node tools/rea/run.mjs <rea-command> [...rea flags] [--json \'<input>\' | --evidence-file evidence.json]');
  console.error('Catalog: docs/research/rea/tool-catalog.json · Workflows: tools/rea/workflows/*.md');
  process.exit(2);
}

const node = findNode();
const child = spawn(node, [REA_ENTRY, ...args], { stdio: 'inherit' });
if (evidenceInline) {
  child.stdin.end(evidenceInline);
}
child.on('exit', (code, sig) => process.exit(sig ? 1 : (code ?? 1)));
