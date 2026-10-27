// Source uploads to the private `sources` bucket (Phase 2 shared backend).
// Clips and long-form flows use this in Phase 3+.

import { supabase } from './supabase';

export const UPLOAD_MIME = [
  'video/mp4', 'video/quicktime', 'video/webm',
  'audio/mpeg', 'audio/wav', 'audio/x-wav',
  'image/png', 'image/jpeg', 'image/webp',
] as const;

const MB = 1024 * 1024;
export const UPLOAD_LIMIT_BYTES: Record<'free' | 'starter' | 'pro', number> = {
  free: 500 * MB,
  starter: 3 * 1024 * MB,
  pro: 3 * 1024 * MB,
};

export type UploadCheck = { ok: true } | { ok: false; reason: string };

export function checkUpload(file: { name: string; type: string; size: number }, plan: 'free' | 'starter' | 'pro'): UploadCheck {
  if (!(UPLOAD_MIME as readonly string[]).includes(file.type)) {
    return { ok: false, reason: `Unsupported file type (${file.type || 'unknown'}). Use MP4, MOV, WebM, MP3, WAV, PNG, JPG or WebP.` };
  }
  if (file.size <= 0) return { ok: false, reason: 'The file is empty.' };
  const limit = UPLOAD_LIMIT_BYTES[plan];
  if (file.size > limit) {
    return { ok: false, reason: `File is ${(file.size / MB).toFixed(0)} MB; your plan allows up to ${(limit / MB).toFixed(0)} MB.` };
  }
  return { ok: true };
}

export function safeObjectName(raw: string): string {
  const name = raw.split(/[\\/]/).pop() ?? '';
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) : 'bin';
  const base = (dot > 0 ? name.slice(0, dot) : name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'file';
  return `${base}.${ext}`;
}

/** Upload a file to sources/<user>/<uuid>-<name> and record it in `assets`. */
export async function uploadSource(file: File, plan: 'free' | 'starter' | 'pro') {
  const check = checkUpload(file, plan);
  if (!check.ok) throw new Error(check.reason);
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Sign in first.');
  const path = `${u.user.id}/${crypto.randomUUID()}-${safeObjectName(file.name)}`;
  const { error } = await supabase.storage.from('sources').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  const { data: asset, error: aErr } = await supabase
    .from('assets')
    .insert({ user_id: u.user.id, bucket: 'sources', path, mime: file.type, bytes: file.size })
    .select()
    .single();
  if (aErr) throw new Error(aErr.message);
  return asset as { id: string; path: string };
}
