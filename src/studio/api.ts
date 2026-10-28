// Studio data layer: Worker API calls (Cloudflare Workers AI) + saving results to Supabase.
import { supabase } from '../lib/supabase';

/** Same-origin on Cloudflare; override for local dev (e.g. VITE_STUDIO_API=https://cloudnivo.org). */
const BASE = ((import.meta.env as Record<string, string | undefined>).VITE_STUDIO_API ?? '').replace(/\/$/, '');

export type StudioImage = { b64: string; mime: string; seed?: number; width?: number; height?: number };
export type ModelKey = 'flux-schnell' | 'lucid-origin' | 'sdxl-lightning' | 'dreamshaper' | 'sdxl-base';
export type PlanAction = { type: 'none' } | { type: 'generate' | 'restyle'; prompt: string; model: ModelKey; aspect: string; count: number; strength: number };

export const MODELS: { key: ModelKey; label: string; note: string; negative: boolean; square?: boolean }[] = [
  { key: 'flux-schnell', label: 'FLUX.1 schnell', note: 'Fast, sharp all-rounder. Square output.', negative: false, square: true },
  { key: 'lucid-origin', label: 'Lucid Origin', note: 'Photoreal detail and readable text', negative: false },
  { key: 'sdxl-lightning', label: 'SDXL Lightning', note: 'Very fast drafts', negative: true },
  { key: 'dreamshaper', label: 'DreamShaper 8', note: 'Illustration, fantasy, anime', negative: true },
  { key: 'sdxl-base', label: 'SDXL 1.0', note: 'Classic SDXL, slower', negative: true },
];
export const ASPECTS = ['1:1', '3:4', '4:3', '9:16', '16:9'] as const;

export class StudioError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new StudioError('unauthorized', 'Sign in to use the Studio.');
  const r = await fetch(`${BASE}/api/studio/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let j: Record<string, unknown> = {};
  try { j = await r.json(); } catch { /* non-JSON error page */ }
  if (!r.ok) throw new StudioError(String(j.error ?? r.status), String(j.message ?? `The Studio service answered ${r.status}. Try again.`));
  return j as T;
}

export const studio = {
  usage: () => call<{ used: number; limit: number }>('usage'),
  generate: (b: { prompt: string; model: ModelKey; aspect: string; count: number; negative?: string; seed?: number | null }) =>
    call<{ images: StudioImage[]; seed: number }>('generate', b),
  inpaint: (b: { prompt: string; image: string; mask: string; strength: number; negative?: string; seed?: number | null }) =>
    call<{ images: StudioImage[] }>('inpaint', b),
  describe: (image: string) => call<{ prompt: string }>('describe', { image }),
  enhance: (prompt: string) => call<{ prompt: string }>('enhance', { prompt }),
  plan: (message: string, hasImage: boolean, history: { role: string; text: string }[]) =>
    call<{ reply: string; action: PlanAction }>('plan', { message, hasImage, history }),
};

export type Asset = { id: string; prompt: string; model: string; aspect: string; path: string; url: string | null; created_at: string; tool: string };

function b64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64.replace(/^data:[^,]+,/, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Save generated images to outputs/<uid>/studio/ and record them in the user's history. */
export async function saveImages(images: StudioImage[], meta: { prompt: string; model: string; aspect: string; tool: string }): Promise<Asset[]> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new StudioError('unauthorized', 'Sign in first.');
  const saved: Asset[] = [];
  for (const img of images) {
    const ext = img.mime === 'image/jpeg' ? 'jpg' : 'png';
    const path = `${u.user.id}/studio/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('outputs').upload(path, b64ToBlob(img.b64, img.mime), { contentType: img.mime });
    if (error) throw new StudioError('save_failed', `Couldn't save the image: ${error.message}`);
    const { data: row, error: e2 } = await supabase.from('generations').insert({
      user_id: u.user.id, kind: 'image', model: meta.model, prompt: meta.prompt.slice(0, 1500) || meta.tool,
      aspect: meta.aspect, resolution: img.width ? `${img.width}x${img.height}` : 'auto', provider: 'cloudflare',
      status: 'ready', credit_cost: 0, result_path: path, completed_at: new Date().toISOString(),
      format_key: `studio:${meta.tool}`, meta: { seed: img.seed ?? null },
    }).select('id, prompt, model, aspect, result_path, created_at, format_key').single();
    if (e2 || !row) throw new StudioError('save_failed', `Couldn't record the image: ${e2?.message ?? 'unknown error'}`);
    saved.push({ id: row.id, prompt: row.prompt, model: row.model, aspect: row.aspect, path, created_at: row.created_at,
      tool: meta.tool, url: `data:${img.mime};base64,${img.b64}` });
  }
  return saved;
}

export async function loadAssets(limit = 60): Promise<Asset[]> {
  const { data, error } = await supabase.from('generations')
    .select('id, prompt, model, aspect, result_path, created_at, format_key')
    .eq('provider', 'cloudflare').eq('kind', 'image').eq('status', 'ready')
    .order('created_at', { ascending: false }).limit(limit);
  if (error || !data) return [];
  const paths = data.map((d) => d.result_path).filter(Boolean) as string[];
  const signed = paths.length ? (await supabase.storage.from('outputs').createSignedUrls(paths, 60 * 60)).data ?? [] : [];
  const url = new Map(signed.map((s) => [s.path, s.signedUrl]));
  return data.map((d) => ({
    id: d.id, prompt: d.prompt, model: d.model, aspect: d.aspect, path: d.result_path ?? '', created_at: d.created_at,
    tool: String(d.format_key ?? 'studio:create').replace('studio:', ''), url: d.result_path ? url.get(d.result_path) ?? null : null,
  }));
}

export async function deleteAssets(assets: Asset[]) {
  const paths = assets.map((a) => a.path).filter(Boolean);
  if (paths.length) await supabase.storage.from('outputs').remove(paths);
  await supabase.from('generations').delete().in('id', assets.map((a) => a.id));
}

/** Image URL or data URL -> base64 PNG resized so the long side is <= max and both sides are multiples of 8. */
export async function toModelImage(src: string, max = 768): Promise<{ b64: string; width: number; height: number; canvas: HTMLCanvasElement }> {
  const img = await loadImage(src);
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(64, Math.round((img.naturalWidth * scale) / 8) * 8);
  const height = Math.max(64, Math.round((img.naturalHeight * scale) / 8) * 8);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
  return { b64: canvas.toDataURL('image/png').split(',')[1], width, height, canvas };
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new StudioError('bad_image', 'This image could not be opened.'));
    img.src = src;
  });
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return reject(new StudioError('bad_image', 'Use a PNG, JPG or WebP image.'));
    if (file.size > 15 * 1024 * 1024) return reject(new StudioError('bad_image', 'Images can be up to 15 MB.'));
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new StudioError('bad_image', 'This image could not be read.'));
    r.readAsDataURL(file);
  });
}

/** The inpainting model returns a square; stretch it back to the shape that was sent. */
export async function fitTo(img: StudioImage, width: number, height: number): Promise<StudioImage> {
  const el = await loadImage(`data:${img.mime};base64,${img.b64}`);
  if (el.naturalWidth === width && el.naturalHeight === height) return { ...img, width, height };
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(el, 0, 0, width, height);
  return { b64: c.toDataURL('image/png').split(',')[1], mime: 'image/png', width, height, seed: img.seed };
}
