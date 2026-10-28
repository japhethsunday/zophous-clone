// clips-render: queue a re-render of one clip with the user's edits
// (trim, caption style, aspect ratio, framing, title). The worker picks it up.
// Free: the source minutes were already reserved when the video was clipped.

import { corsHeaders, json, readJson } from '../_shared/http.ts';
import { adminClient, userFromRequest } from '../_shared/generation.ts';
import { validateRenderEdit } from '../_shared/clip-edit.ts';

const MAX_OPEN_RENDERS = 4; // per user, queued + running

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405);

  const admin = adminClient();
  const user = await userFromRequest(admin, req);
  if (!user) return json(req, { error: 'unauthorized' }, 401);
  const body = await readJson(req);
  if (!body) return json(req, { error: 'invalid_json' }, 400);

  const clipId = String(body.clipId ?? '');
  if (!clipId) return json(req, { error: 'clipId_required' }, 400);
  const { data: clip } = await admin.from('clips').select('id, user_id, video_id, job_id').eq('id', clipId).eq('user_id', user.id).maybeSingle();
  if (!clip) return json(req, { error: 'clip_not_found' }, 404);
  const { data: video } = await admin.from('videos').select('id, source_path, duration_seconds').eq('id', clip.video_id).maybeSingle();
  if (!video?.source_path) {
    return json(req, { error: 'no_source', message: 'This clip has no stored source video, so it cannot be re-rendered.' }, 409);
  }

  const check = validateRenderEdit(body, Number(video.duration_seconds) || 0);
  if (!check.ok) return json(req, { error: check.error, message: check.message }, 400);
  const edit = check.edit;

  // One render per clip at a time: a second click returns the job already in flight.
  const { data: open } = await admin
    .from('jobs')
    .select('id, ref_id, status')
    .eq('user_id', user.id)
    .eq('kind', 'clip_render')
    .in('status', ['queued', 'running']);
  const same = (open ?? []).find((j) => j.ref_id === clip.id);
  if (same) return json(req, { job: same, duplicate: true });
  if ((open ?? []).length >= MAX_OPEN_RENDERS) {
    return json(req, { error: 'too_many_renders', message: `You can have ${MAX_OPEN_RENDERS} renders running at once. Wait for one to finish.` }, 429);
  }

  const { data: profile } = await admin.from('profiles').select('plan').eq('id', user.id).single();
  const input = {
    clip_id: clip.id,
    source_path: video.source_path,
    origin_job: clip.job_id,
    transcript_path: clip.job_id ? `${user.id}/${clip.job_id}/transcript.json` : null,
    start_seconds: edit.start,
    end_seconds: edit.end,
    caption_style: edit.captionStyle,
    aspect: edit.aspect,
    crop_x: edit.cropX,
    title: edit.title,
    watermark: (profile?.plan ?? 'free') === 'free',
  };

  await admin.from('clip_edits').upsert(
    { user_id: user.id, media_kind: 'clip', media_id: clip.id, media_index: 0, project: { ...edit, saved_at: new Date().toISOString() }, rendered_at: null },
    { onConflict: 'user_id,media_kind,media_id,media_index' },
  );

  const { data: job, error } = await admin
    .from('jobs')
    .insert({ user_id: user.id, kind: 'clip_render', status: 'queued', provider: 'cloudnivo-worker', ref_table: 'clips', ref_id: clip.id, input })
    .select('id, ref_id, status, progress')
    .single();
  if (error || !job) return json(req, { error: 'insert_failed' }, 500);
  return json(req, { job });
});
