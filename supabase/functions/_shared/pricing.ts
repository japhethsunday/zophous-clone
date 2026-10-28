// Credit prices. Pure functions so the browser, edge functions and tests share one source.

export type MediaKind = 'image' | 'video' | 'audio';

export function creditCost(kind: MediaKind, resolution: string, durationSeconds: number | null): number {
  if (kind === 'image') return 3;
  if (kind === 'audio') return 1;
  const base = resolution === '1080p' ? 32 : 16;
  const spans = Math.max(1, Math.ceil((durationSeconds ?? 5) / 5));
  return base * spans;
}

/** Free open models run on shared GPUs (no provider bill), so they cost few credits. */
export const FREE_MODELS: Record<string, { kind: MediaKind; credits: number; name: string }> = {
  'flux-free': { kind: 'image', credits: 1, name: 'FLUX schnell (free)' },
  'wan-free': { kind: 'video', credits: 6, name: 'Wan 2.2 (free)' },
  'story-free': { kind: 'video', credits: 15, name: 'Story video (free)' },
  // Kokoro text to speech on the worker CPU. Charged per started 1,000 characters (see voiceCredits).
  'voice-kokoro': { kind: 'audio', credits: 1, name: 'Voiceover' },
  // Cloudflare Workers AI free tier (falls back to FLUX on Hugging Face when Cloudflare isn't configured).
  'flux-schnell-cf': { kind: 'image', credits: 1, name: 'FLUX schnell, fast (free)' },
  'lucid-origin-cf': { kind: 'image', credits: 2, name: 'Lucid Origin (free)' },
};

export function clampVideoSeconds(n: unknown): number {
  const v = Number(n ?? 5);
  if (!Number.isFinite(v)) return 5;
  return Math.max(5, Math.min(10, Math.round(v)));
}

/** Voiceover limits and price: 1 credit per started 1,000 characters. */
export const VOICE_MAX_CHARS = 5000;
export function voiceCredits(chars: number): number {
  return Math.max(1, Math.ceil(Math.min(chars, VOICE_MAX_CHARS) / 1000));
}
