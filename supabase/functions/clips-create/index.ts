// clips-create: queue a real clipping job for an uploaded source video.
// The self-hosted worker (worker/) picks it up, finds the best moments, renders
// 9:16 captioned clips and stores them. Minutes are reserved now and returned on failure.

import { corsHeaders, json, readJson } from '../_shared/http.ts';
import { adminClient, userFromRequest } from '../_shared/generation.ts';

const VIDEO_MIME = new Set(['video/mp4', 'video/quicktime', 'video/webm']);
const MAX_SOURCE_SECONDS = 3 * 60 * 60; // 3 hours

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405);

  const admin = adminClient();
  const user = await userFromRequest(admin, req);
  if (!user) return json(req, { error: 'unauthorized' }, 401);
  const body = await readJson(req);
  if (!body) return json(req, { error: 'invalid_json' }, 400);

  const assetId = String(body.assetId ?? '');
  const title = String(body.title ?? '').trim().slice(0, 120) || 'Untitled video';
  const duration = Number(body.durationSeconds);
  const start = Math.max(0, Number(body.startSeconds ?? 0) || 0);
  const endRaw = Number(body.endSeconds ?? duration);
  const idem = body.idempotencyKey ? String(body.idempotencyKey).slice(0, 80) : null;

  if (!assetId) return json(req, { error: 'assetId_required' }, 400);
  if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_SOURCE_SECONDS) {
    return json(req, { error: 'invalid_duration', message: 'Videos can be up to 3 hours long.' }, 400);
  }
  const end = Math.min(duration, Number.isFinite(endRaw) && endRaw > start ? endRaw : duration);
  if (end - start < 30) return json(req, { error: 'range_too_short', message: 'Pick at least 30 seconds of video.' }, 400);

  const { data: asset } = await admin.from('assets').select('*').eq('id', assetId).eq('user_id', user.id).maybeSingle();
  if (!asset || asset.bucket !== 'sources') return json(req, { error: 'asset_not_found' }, 404);
  if (!VIDEO_MIME.has(String(asset.mime))) return json(req, { error: 'not_a_video', message: 'Upload an MP4, MOV or WebM file.' }, 400);

  if (idem) {
    const { data: existing } = await admin.from('jobs').select('ref_id').eq('user_id', user.id).eq('idempotency_key', idem).maybeSingle();
    if (existing?.ref_id) {
      const { data: v } = await admin.from('videos').select('*').eq('id', existing.ref_id).single();
      if (v) return json(req, { video: v, duplicate: true });
    }
  }

  const { data: profile } = await admin.from('profiles').select('plan, watermark_free_left').eq('id', user.id).single();
  const minutes = Math.max(1, Math.ceil((end - start) / 60));

  const { data: job, error: jobErr } = await admin
    .from('jobs')
    .insert({
      user_id: user.id, kind: 'clipping', status: 'queued', provider: 'cloudnivo-worker', ref_table: 'videos',
      idempotency_key: idem,
      input: {
        source_path: asset.path, title, start_seconds: start, end_seconds: end,
        watermark: (profile?.plan ?? 'free') === 'free',
        max_clips: 6,
      },
    })
    .select()
    .single();
  if (jobErr || !job) return json(req, { error: idem ? 'duplicate_in_progress' : 'insert_failed' }, idem ? 409 : 500);

  const { data: held } = await admin.rpc('clip_minutes_hold', { p_user: user.id, p_job: job.id, p_minutes: minutes });
  if (!held) {
    await admin.from('jobs').update({ status: 'failed', error: 'OUT_OF_MINUTES', completed_at: new Date().toISOString() }).eq('id', job.id);
    return json(req, { error: 'OUT_OF_MINUTES', needed: minutes, message: `This video needs ${minutes} minutes and you don't have enough left this month.` }, 402);
  }

  const { data: video, error: vErr } = await admin
    .from('videos')
    .insert({
      user_id: user.id, title, source_type: 'upload', source_path: asset.path, mode: 'clips',
      status: 'queued', duration_seconds: Math.round(end - start), job_id: job.id,
    })
    .select()
    .single();
  if (vErr || !video) {
    await admin.rpc('clip_minutes_release', { p_job: job.id });
    await admin.from('jobs').update({ status: 'failed', error: 'insert_failed' }).eq('id', job.id);
    return json(req, { error: 'insert_failed' }, 500);
  }
  await admin.from('jobs').update({ ref_id: video.id }).eq('id', job.id);
  return json(req, { video, minutesReserved: minutes });
});
