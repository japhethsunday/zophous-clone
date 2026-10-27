// Generation jobs: provider calls, polling, storage and credit settlement.
// Used by generate-media (create/check), jobs-tick (background) and jobs-cancel.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const SUPA_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
export const REPLICATE_TOKEN = Deno.env.get('REPLICATE_API_TOKEN') ?? '';
export const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';

export const REPLICATE_MODELS: Record<string, string> = {
  'seedance-fast': 'bytedance/seedance-1-lite',
  'seedance-pro': 'bytedance/seedance-1-pro',
  'kling-2.1': 'kwaivgi/kling-v2.1',
};

const POLL_SECONDS = 10;
const MAX_ATTEMPTS = 120; // ~20 minutes of polling

export function adminClient(): SupabaseClient {
  return createClient(SUPA_URL, SERVICE_KEY);
}

export async function userFromRequest(admin: SupabaseClient, req: Request) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  return data.user ?? null;
}

// ---------- providers ----------

export async function startReplicate(model: string, input: Record<string, unknown>): Promise<string> {
  const r = await fetch('https://api.replicate.com/v1/models/' + model + '/predictions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REPLICATE_TOKEN, 'Content-Type': 'application/json', Prefer: 'respond-async' },
    body: JSON.stringify({ input }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.detail ?? j.title ?? 'replicate_error_' + r.status);
  return j.id as string;
}

async function getReplicate(id: string) {
  const r = await fetch('https://api.replicate.com/v1/predictions/' + id, {
    headers: { Authorization: 'Bearer ' + REPLICATE_TOKEN },
  });
  if (r.status === 429 || r.status >= 500) return { status: 'transient' as const };
  return await r.json();
}

export async function cancelReplicate(id: string) {
  await fetch('https://api.replicate.com/v1/predictions/' + id + '/cancel', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REPLICATE_TOKEN },
  }).catch(() => undefined);
}

export async function openAIImage(prompt: string, aspect: string): Promise<Uint8Array> {
  const size = aspect === '16:9' ? '1536x1024' : aspect === '1:1' ? '1024x1024' : '1024x1536';
  const r = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + OPENAI_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-1', prompt, size, n: 1 }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message ?? 'openai_error_' + r.status);
  const b64 = j.data?.[0]?.b64_json;
  if (!b64) throw new Error('openai_no_image');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

// ---------- storage ----------

export async function storeOutput(
  admin: SupabaseClient,
  userId: string,
  jobId: string,
  name: string,
  bytes: Uint8Array,
  mime: string,
): Promise<string> {
  const path = `${userId}/${jobId}/${name}`;
  const { error } = await admin.storage.from('outputs').upload(path, bytes, { contentType: mime, upsert: true });
  if (error) throw new Error('storage_upload_failed: ' + error.message);
  await admin.from('assets').upsert(
    { user_id: userId, bucket: 'outputs', path, mime, bytes: bytes.byteLength, origin_job_id: jobId },
    { onConflict: 'bucket,path' },
  );
  return path;
}

// ---------- virality enrichment (best effort) ----------

export async function enrichGeneration(admin: SupabaseClient, id: string, kind: string, prompt: string) {
  if (!OPENAI_KEY) return;
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + OPENAI_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are a short-form video strategist. Given an AI-generated ' + kind +
              ' prompt, estimate how well content like it performs on TikTok/Reels/Shorts. ' +
              'Reply with JSON only: {"score": <integer 1-100>, "description": "<one-sentence post description>", "hashtags": ["<tag>", ...]} ' +
              'with 4-6 hashtags, no # symbols.',
          },
          { role: 'user', content: prompt.slice(0, 800) },
        ],
      }),
    });
    if (!r.ok) return;
    const j = await r.json();
    const parsed = JSON.parse(j.choices?.[0]?.message?.content ?? '{}');
    const score = Math.max(1, Math.min(100, Number(parsed.score) || 0));
    if (!score) return;
    const meta: Record<string, unknown> = { description: String(parsed.description ?? '').slice(0, 300) };
    if (Array.isArray(parsed.hashtags)) {
      meta.hashtags = parsed.hashtags.slice(0, 8).map((t: unknown) => String(t).replace(/^#/, ''));
    }
    await admin.from('generations').update({ virality_score: score, meta }).eq('id', id);
  } catch {
    // optional
  }
}

// ---------- job state transitions ----------

export async function failJob(admin: SupabaseClient, job: Record<string, any>, message: string) {
  await admin.from('jobs').update({ status: 'failed', error: message, completed_at: new Date().toISOString() }).eq('id', job.id);
  if (job.ref_table === 'generations' && job.ref_id) {
    await admin.from('generations').update({ status: 'failed', error: message, completed_at: new Date().toISOString() }).eq('id', job.ref_id);
  }
  await admin.rpc('credit_release', { p_job: job.id });
}

/**
 * Move one running generation job forward: poll the provider, store the output,
 * settle or release credits. Safe to call repeatedly and from several places.
 */
export async function advanceGenerationJob(admin: SupabaseClient, job: Record<string, any>) {
  if (job.status !== 'running' || job.provider !== 'replicate' || !job.provider_ref) return;

  if (job.deadline_at && new Date(job.deadline_at) < new Date()) {
    await cancelReplicate(job.provider_ref);
    await failJob(admin, job, 'timed_out');
    return;
  }

  const p = await getReplicate(job.provider_ref);
  if (p.status === 'transient' || p.status === 'starting' || p.status === 'processing') {
    const attempts = (job.attempts ?? 0) + 1;
    if (attempts > MAX_ATTEMPTS) {
      await cancelReplicate(job.provider_ref);
      await failJob(admin, job, 'timed_out');
      return;
    }
    await admin
      .from('jobs')
      .update({
        attempts,
        progress: p.status === 'processing' ? Math.min(90, 20 + attempts * 5) : 10,
        next_poll_at: new Date(Date.now() + POLL_SECONDS * 1000).toISOString(),
      })
      .eq('id', job.id);
    return;
  }

  if (p.status === 'succeeded') {
    const url = Array.isArray(p.output) ? p.output[0] : p.output;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('download_failed_' + res.status);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const path = await storeOutput(admin, job.user_id, job.id, 'video.mp4', bytes, 'video/mp4');
      const now = new Date().toISOString();
      // Claim the job first so two pollers can't both finish it.
      const { data: claimed } = await admin
        .from('jobs')
        .update({ status: 'succeeded', progress: 100, output: { path }, completed_at: now })
        .eq('id', job.id)
        .eq('status', 'running')
        .select('id');
      if (!claimed?.length) return;
      await admin.from('generations').update({ status: 'ready', result_path: path, result_url: null, completed_at: now }).eq('id', job.ref_id);
      await admin.rpc('credit_settle', { p_job: job.id, p_actual: job.cost_quoted });
      const { data: gen } = await admin.from('generations').select('prompt').eq('id', job.ref_id).single();
      await enrichGeneration(admin, job.ref_id, 'video', gen?.prompt ?? '');
    } catch (e) {
      await failJob(admin, job, e instanceof Error ? e.message : String(e));
    }
    return;
  }

  // failed | canceled | unknown
  await failJob(admin, job, String(p.error ?? p.status ?? 'provider_failed'));
}
