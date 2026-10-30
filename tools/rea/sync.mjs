#!/usr/bin/env node
/* ============================================================
   tools/rea/sync.mjs — refresh REA and regenerate our catalogs.

   Run from the repo root:  node tools/rea/sync.mjs
   1. git pull in ./rea (vendored clone of morluto/rea)
   2. npm ci && npm run build inside it (only if sources changed)
   3. regenerate:
        docs/research/rea/tool-catalog.json   (names + descriptions + input schemas)
        tools/rea/catalog.slim.json           (names + descriptions, agent-sized)
   ============================================================ */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REA = path.join(ROOT, 'rea');

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${r.status})`);
}

if (!existsSync(path.join(REA, '.git'))) {
  console.log('[rea-sync] cloning morluto/rea into ./rea …');
  run('git', ['clone', 'https://github.com/morluto/rea.git', REA], ROOT);
} else {
  console.log('[rea-sync] pulling latest REA …');
  run('git', ['-C', REA, 'pull', '--ff-only'], ROOT);
}

const catalogPath = path.join(REA, 'dist', 'mcp-catalog.json');
if (!existsSync(catalogPath)) {
  console.log('[rea-sync] building REA …');
  run('npm', ['ci'], REA);
  run('npm', ['run', 'build'], REA);
}

const d = JSON.parse(readFileSync(catalogPath, 'utf8'));
const full = {
  version: d.info?.version ?? d.version,
  generated_from: 'morluto/rea (vendored clone in rea/), dist/mcp-catalog.json',
  tool_count: d.tools.length,
  tools: d.tools.map((t) => ({ name: t.name, description: (t.description || '').trim(), inputSchema: t.inputSchema })),
};
const slim = {
  source: `morluto/rea v${full.version} (vendored clone at ./rea)`,
  tool_count: full.tool_count,
  tools: full.tools.map((t) => ({ name: t.name, description: t.description.slice(0, 200) })),
};
mkdirSync(path.join(ROOT, 'docs', 'research', 'rea'), { recursive: true });
writeFileSync(path.join(ROOT, 'docs', 'research', 'rea', 'tool-catalog.json'), JSON.stringify(full, null, 1));
writeFileSync(path.join(ROOT, 'tools', 'rea', 'catalog.slim.json'), JSON.stringify(slim, null, 1));
console.log(`[rea-sync] ok — REA v${full.version}, ${full.tool_count} tools; catalogs regenerated.`);
