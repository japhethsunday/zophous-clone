// generate-media: creates real AI video/image jobs via Replicate / OpenAI.
// Credits are deducted atomically (try_spend_credits RPC) and refunded on failure.
// Provider keys come from Edge secrets: REPLICATE_API_TOKEN, OPENAI_API_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPA_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const REPLICATE_TOKEN = Deno.env.get('REPLICATE_API_TOKEN') ?? '';
const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';

// Replicate model ids (open-source-compatible endpoints)
const REPLICATE_MODELS: Record<string, string> = {
  'seedance-fast': 'bytedance/seedance-1-lite',
  'seedance-pro': 'bytedance/seedance-1-pro',
  'kling-2.1': 'kwaivgi/kling-v2.1',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function creditCost(kind: string, resolution: string, durationSeconds: number | null): number {
  if (kind === 'image') return 3;
  const base = resolution === '1080p' ? 32 : 16;
  const spans = Math.max(1, Math.ceil((durationSeconds ?? 5) / 5));
  return base * spans;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

async function authedUser(req: Request) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const admin = createClient(SUPA_URL, SERVICE_KEY);
  const { data } = await admin.auth.getUser(token);
  return data.user ?? null;
}

async function startReplicate(model: string, body: Record<string, unknown>) {
  const r = await fetch('https://api.replicate.com/v1/models/' + model + '/predictions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + REPLICATE_TOKEN,
      'Content-Type': 'application/json',
      Prefer: 'respond-async',
    },
    body: JSON.stringify({ input: body }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.detail ?? j.title ?? 'replicate_error_' + r.status);
  return j.id as string;
}

async function checkReplicate(jobId: string) {
  const r = await fetch('https://api.replicate.com/v1/predictions/' + jobId, {
    headers: { Authorization: 'Bearer ' + REPLICATE_TOKEN },
  });
  return await r.json();
}

async function startOpenAIImage(prompt: string, aspect: string) {
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
  return 'data:image/png;base64,' + b64;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const user = await authedUser(req);
  if (!user) return json({ error: 'unauthorized' }, 401);
  const admin = createClient(SUPA_URL, SERVICE_KEY);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const mode = String(payload.mode ?? 'create');

  try {
    // ---------- create ----------
    if (mode === 'create') {
      const kind = payload.kind === 'image' ? 'image' : 'video';
      const model = String(payload.model ?? (kind === 'image' ? 'gpt-image' : 'seedance-fast'));
      const prompt = String(payload.prompt ?? '').trim();
      if (!prompt) return json({ error: 'prompt_required' }, 400);
      const aspect = String(payload.aspect ?? '9:16');
      const resolution = String(payload.resolution ?? '720p');
      const durationSeconds = kind === 'video' ? Math.max(5, Math.min(10, Number(payload.durationSeconds ?? 5))) : null;
      const formatKey = payload.formatKey ? String(payload.formatKey) : null;
      const style = payload.style ? String(payload.style) : null;

      const cost = creditCost(kind, resolution, durationSeconds);

      // provider configuration check BEFORE spending credits
      if (kind === 'video' && !REPLICATE_TOKEN) {
        return json({ error: 'PROVIDER_NOT_CONFIGURED', message: 'Video generation needs a Replicate API token. Add REPLICATE_API_TOKEN to the Edge Function secrets.' }, 503);
      }
      if (kind === 'image' && !OPENAI_KEY) {
        return json({ error: 'PROVIDER_NOT_CONFIGURED', message: 'Image generation needs an OpenAI API key. Add OPENAI_API_KEY to the Edge Function secrets.' }, 503);
      }

      const { data: ok } = await admin.rpc('try_spend_credits', { p_user: user.id, p_cost: cost });
      if (!ok) return json({ error: 'INSUFFICIENT_CREDITS', needed: cost }, 402);

      const { data: gen, error: insErr } = await admin
        .from('generations')
        .insert({
          user_id: user.id, kind, model, prompt, format_key: formatKey, aspect,
          duration_seconds: durationSeconds, resolution, style, credit_cost: cost, status: 'queued',
        })
        .select()
        .single();
      if (insErr || !gen) {
        await admin.rpc('refund_credits', { p_user: user.id, p_amount: cost });
        return json({ error: 'insert_failed', detail: String(insErr?.message ?? insErr) }, 500);
      }

      try {
        if (kind === 'video') {
          const replicateModel = REPLICATE_MODELS[model] ?? REPLICATE_MODELS['seedance-fast'];
          const jobId = await startReplicate(replicateModel, {
            prompt,
            aspect_ratio: aspect,
            duration: durationSeconds,
            resolution: resolution === '1080p' ? '1080p' : '720p',
          });
          await admin.from('generations').update({ provider: 'replicate', provider_job_id: jobId, status: 'processing' }).eq('id', gen.id);
          return json({ generation: { ...gen, status: 'processing' }, creditsCharged: cost });
        } else {
          const dataUrl = await startOpenAIImage(prompt, aspect);
          await admin.from('generations').update({ provider: 'openai', status: 'ready', result_url: dataUrl, completed_at: new Date().toISOString() }).eq('id', gen.id);
          return json({ generation: { ...gen, status: 'ready' }, creditsCharged: cost });
        }
      } catch (providerErr) {
        const msg = providerErr instanceof Error ? providerErr.message : String(providerErr);
        await admin.from('generations').update({ status: 'failed', error: msg, completed_at: new Date().toISOString() }).eq('id', gen.id);
        await admin.rpc('refund_credits', { p_user: user.id, p_amount: cost });
        return json({ error: 'PROVIDER_ERROR', message: msg, refunded: cost }, 502);
      }
    }

    // ---------- check ----------
    if (mode === 'check') {
      const id = String(payload.id ?? '');
      const { data: gen } = await admin.from('generations').select('*').eq('id', id).eq('user_id', user.id).single();
      if (!gen) return json({ error: 'not_found' }, 404);
      if (gen.status !== 'processing' || gen.provider !== 'replicate' || !gen.provider_job_id) {
        return json({ generation: gen });
      }
      const job = await checkReplicate(gen.provider_job_id);
      if (job.status === 'succeeded') {
        const out = Array.isArray(job.output) ? job.output[0] : job.output;
        const { data: updated } = await admin
          .from('generations')
          .update({ status: 'ready', result_url: out, completed_at: new Date().toISOString() })
          .eq('id', gen.id)
          .select()
          .single();
        return json({ generation: updated });
      }
      if (job.status === 'failed' || job.status === 'canceled') {
        await admin.from('generations').update({ status: 'failed', error: String(job.error ?? 'provider_failed'), completed_at: new Date().toISOString() }).eq('id', gen.id);
        await admin.rpc('refund_credits', { p_user: user.id, p_amount: gen.credit_cost });
        return json({ generation: { ...gen, status: 'failed', error: String(job.error ?? 'provider_failed') }, refunded: gen.credit_cost });
      }
      return json({ generation: gen });
    }

    return json({ error: 'unknown_mode' }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: 'internal', message: msg }, 500);
  }
});
