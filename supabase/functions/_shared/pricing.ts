// Credit prices. Pure functions so the browser, edge functions and tests share one source.

export type MediaKind = 'image' | 'video';

export function creditCost(kind: MediaKind, resolution: string, durationSeconds: number | null): number {
  if (kind === 'image') return 3;
  const base = resolution === '1080p' ? 32 : 16;
  const spans = Math.max(1, Math.ceil((durationSeconds ?? 5) / 5));
  return base * spans;
}

export function clampVideoSeconds(n: unknown): number {
  const v = Number(n ?? 5);
  if (!Number.isFinite(v)) return 5;
  return Math.max(5, Math.min(10, Math.round(v)));
}
