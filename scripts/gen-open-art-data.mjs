#!/usr/bin/env node
// Regenerates src/lib/open-art-data.ts from the REA pipeline + tool catalog.
import { readFileSync, writeFileSync } from 'node:fs';
const p = JSON.parse(readFileSync('docs/research/open-art/pipeline.json', 'utf8'));
const c = JSON.parse(readFileSync('tools/rea/catalog.slim.json', 'utf8'));
const desc = Object.fromEntries(c.tools.map((t) => [t.name, t.description]));
const slug = (n) => n.replaceAll('_', '-');
const stages = p.stages.map((s) => ({
  id: s.id,
  purpose: s.purpose,
  tools: s.tools.map((t) => ({
    name: t.tool,
    cli: slug(t.tool),
    description: (desc[t.tool] ?? t.description ?? '').slice(0, 180).trim(),
    required_inputs: t.required_inputs ?? [],
  })),
}));
const data = {
  source: 'morluto/rea v6.8.0 via tools/rea/run.mjs',
  pipeline_ref: 'docs/research/open-art/pipeline.json',
  domain: p.domain,
  stage_count: stages.length,
  stages,
};
const ts = `// AUTO-GENERATED from docs/research/open-art/pipeline.json + tools/rea/catalog.slim.json
// Regenerate with: node scripts/gen-open-art-data.mjs
export type OpenArtTool = {
  name: string;
  cli: string;
  description: string;
  required_inputs: string[];
};

export type OpenArtStage = {
  id: string;
  purpose: string;
  tools: OpenArtTool[];
};

export type OpenArtData = {
  source: string;
  pipeline_ref: string;
  domain?: string;
  stage_count: number;
  stages: OpenArtStage[];
};

export const OPEN_ART: OpenArtData = ${JSON.stringify(data, null, 2)};
`;
writeFileSync('src/lib/open-art-data.ts', ts);
console.log(`open-art-data.ts: ${stages.length} stages, ${stages.reduce((a, s) => a + s.tools.length, 0)} tools`);
