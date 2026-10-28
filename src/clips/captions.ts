// Caption styles + word grouping for the editor preview.
// Styles come from the worker's JSON so the preview and the burned-in render share one definition.
import data from '../../worker/cloudnivo_worker/caption_styles.json';
import type { AspectId, CaptionStyleId } from '../../supabase/functions/_shared/clip-edit';

export type Word = { start: number; end: number; text: string };

export type CaptionStyle = {
  id: CaptionStyleId;
  label: string;
  description: string;
  size: number;
  uppercase: boolean;
  words: number;
  color: string;
  highlight: string | null;
  outline: string | null;
  outlineWidth: number;
  box: string | null;
  position: number;
};

export type Aspect = { id: AspectId; label: string; width: number; height: number };

export const CAPTION_STYLES = data.styles as CaptionStyle[];
export const ASPECTS = data.aspects as Aspect[];

export function styleById(id: string): CaptionStyle {
  return CAPTION_STYLES.find((s) => s.id === id) ?? CAPTION_STYLES[0];
}

/** Same grouping as worker media.caption_groups, so line breaks match the render. */
export function groupWords(words: Word[], perLine: number, maxChars = perLine <= 3 ? 16 : 30): Word[][] {
  const limit = perLine > 1 ? maxChars : 40;
  const groups: Word[][] = [];
  let cur: Word[] = [];
  for (const w of words) {
    const text = w.text.trim();
    if (!text) continue;
    const width = cur.reduce((n, x) => n + x.text.trim().length + 1, 0) + text.length;
    if (cur.length && (cur.length >= perLine || width > limit)) {
      groups.push(cur);
      cur = [];
    }
    cur.push(w);
  }
  if (cur.length) groups.push(cur);
  return groups;
}

/** The caption group on screen at time t (source seconds), and which word in it is being spoken. */
export function activeCaption(groups: Word[][], t: number): { group: Word[]; index: number } | null {
  for (const g of groups) {
    const first = g[0];
    const last = g[g.length - 1];
    if (t < first.start || t >= last.end) continue;
    let index = 0;
    for (let k = 0; k < g.length; k++) if (t >= g[k].start) index = k;
    return { group: g, index };
  }
  return null;
}

/** Snap a time to the nearest word boundary within `tolerance` seconds. */
export function snapToWord(words: Word[], t: number, edge: 'start' | 'end', tolerance = 0.6): number {
  let best = t;
  let dist = tolerance;
  for (const w of words) {
    const v = edge === 'start' ? w.start : w.end;
    const d = Math.abs(v - t);
    if (d < dist) {
      dist = d;
      best = v;
    }
  }
  return Math.round(best * 100) / 100;
}

/** "1:05.4" style timecode for the editor. */
export function timecode(s: number, tenths = true): string {
  const sign = s < 0 ? '-' : '';
  const v = Math.abs(s);
  const m = Math.floor(v / 60);
  const sec = v - m * 60;
  const whole = Math.floor(sec);
  const frac = tenths ? `.${Math.floor((sec - whole) * 10)}` : '';
  return `${sign}${m}:${String(whole).padStart(2, '0')}${frac}`;
}
