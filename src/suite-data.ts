/* ============================================================
   SUITE DATA — shared presets/formats used by the Suite home,
   the Assets library and the Director view. Kept in its own
   module so the worker pipeline (moments.py FORMATS) can stay
   in sync with the frontend one-for-one.
   ============================================================ */

export type ClipFormat = {
  id: string;            // stable id — mirrored in worker/cloudnivo_worker/moments.py FORMATS
  title: string;
  desc: string;
  format: string;        // human label shown on the badge
  prompt: string;        // instruction sent into Studio / attached to a clip job
};

export const VIRAL_PRESETS: ClipFormat[] = [
  { id: 'podcast-punchline',    title: 'Podcast Punchline',    desc: 'Best hooks cut from talking-head audio',      format: 'Hook-first clip', prompt: 'Cut the three strongest punchlines from this podcast, big captions, face centered' },
  { id: 'hot-take-monologue',   title: 'Hot-Take Monologue',   desc: 'One opinion, one vertical clip',              format: 'Talking head',    prompt: 'Isolate the most quotable opinion segment and caption it word by word' },
  { id: 'story-arc-clip',       title: 'Story Arc Clip',       desc: 'Setup → tension → payoff, auto-scored',       format: 'Narrative',       prompt: 'Find a complete mini-story with a beginning, twist and ending' },
  { id: 'listicle-cuts',        title: 'Listicle Cuts',        desc: 'Numbered segments become numbered clips',     format: 'Listicle',        prompt: 'Split the top-ten segment into individual clips with number stickers' },
  { id: 'qa-split',             title: 'Q&A Split',            desc: 'Question as hook, answer as clip',            format: 'Interview',       prompt: 'Pair every question with its best answer as its own short clip' },
  { id: 'b-roll-highlight',     title: 'B-Roll Highlight',     desc: 'Action moments, minimal captions',            format: 'Montage',         prompt: 'Pick the highest-motion moments and keep captions sparse' },
  { id: 'quote-card-clip',      title: 'Quote Card Clip',      desc: 'Shareable quote with aurora frame',           format: 'Quote',           prompt: 'Extract the most shareable quote and style it as a caption card' },
  { id: 'countdown-teaser',     title: 'Countdown Teaser',     desc: 'End-hook teaser for live streams',            format: 'Teaser',          prompt: 'Build a suspenseful teaser that ends right before the reveal' },
];

export function presetById(id: string | null | undefined): ClipFormat | undefined {
  return id ? VIRAL_PRESETS.find((p) => p.id === id) : undefined;
}

/** Worker clips carry the trending-format label in `hook` (see pipeline.py);
    map it back to the matching Suite preset. */
const PRESET_BY_LABEL: Record<string, string> = Object.fromEntries(
  VIRAL_PRESETS.map((p) => [p.format.toLowerCase(), p.id]),
);

export function presetIdFromHook(hook: string | null | undefined): string | null {
  if (!hook) return null;
  const h = String(hook).trim().toLowerCase();
  return PRESET_BY_LABEL[h] ?? VIRAL_PRESETS.find((p) => p.id === h)?.id ?? null;
}

/* ---------------- asset helpers (Suite-derived pages) ---------------- */

export type AssetKind = 'clip' | 'image' | 'audio';

export type SuiteAsset = {
  id: string;
  kind: AssetKind;
  title: string;
  url: string | null;        // playable/downloadable (signed when available)
  thumb: string | null;      // poster image
  videoId: string | null;
  score: number | null;
  duration: number | null;   // seconds
  createdAt: string;
  watermark: boolean;
  posted: boolean;
  presetId?: string | null;  // which trending format shaped this clip, if any
};

const fmtMap: Record<string, string> = {
  bold: 'Bold captions', karaoke: 'Karaoke captions', minimal: 'Minimal captions',
};

export function assetsFromClips(clips: import('./lib/supabase').Clip[]): SuiteAsset[] {
  return clips.map((c) => ({
    id: c.id,
    kind: 'clip' as AssetKind,
    title: c.title || 'Untitled clip',
    url: c.clip_url ?? null,
    thumb: c.thumb_url ?? null,
    videoId: c.video_id,
    score: c.score ?? null,
    duration: Math.max(0, (c.end_seconds ?? 0) - (c.start_seconds ?? 0)),
    createdAt: c.created_at,
    watermark: !!c.watermarked,
    posted: !!c.posted_at,
    presetId: presetIdFromHook(c.hook),
  }));
}

export function assetCaptionStyle(captionStyle: string): string {
  return fmtMap[captionStyle] ?? 'Captions';
}

export function fmtDur(sec: number | null): string {
  if (sec == null || !isFinite(sec)) return '—';
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${String(r).padStart(2, '0')}` : `${r}s`;
}
