// generate-media: AI video/image generation as tracked jobs.
// - Credits: held on create, settled on success, released on failure (credit ledger).
// - Idempotent: the same idempotencyKey returns the same job instead of charging twice.
// - Outputs are stored in the private `outputs` bucket (generations.result_path).
// Provider keys come from Edge secrets: REPLICATE_API_TOKEN, OPENAI_API_KEY.
// The request/response shape is unchanged for the existing Gen Studio UI.

import { corsHeaders, json, readJson } from '../_shared/http.ts';
import { FREE_MODELS, clampVideoSeconds, creditCost } from '../_shared/pricing.ts';
import {
  OPENAI_KEY,
  REPLICATE_MODELS,
  REPLICATE_TOKEN,
  adminClient,
  advanceGenerationJob,
  enrichGeneration,
  failJob,
  openAIImage,
  startReplicate,
  storeOutput,
  userFromRequest,
} from '../_shared/generation.ts';

const ASPECTS = new Set(['9:16', '16:9', '1:1']);
const RESOLUTIONS = new Set(['720p', '1080p']);
const IMAGE_MODELS = new Set(['gpt-image']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405);

  const admin = adminClient();
  const user = await userFromRequest(admin, req);
  if (!user) return json(req, { error: 'unauthorized' }, 401);

  const payload = await readJson(req);
  if (!payload) return json(req, { error: 'invalid_json' }, 400);
  const mode = String(payload.mode ?? 'create');

  try {
    // ---------- create with a free open model (queued for the self-hosted worker) ----------
    if (mode === 'create' && FREE_MODELS[String(payload.model)]) {
      const model = String(payload.model);
      const { kind, credits } = FREE_MODELS[model];
      const prompt = String(payload.prompt ?? '').trim().slice(0, 1500);
      if (!prompt) return json(req, { error: 'prompt_required' }, 400);
      const aspect = ASPECTS.has(String(payload.aspect)) ? String(payload.aspect) : '9:16';
      const durationSeconds = kind === 'video' ? Math.max(2, Math.min(5, Number(payload.durationSeconds) || 3.5)) : null;
      const idem = payload.idempotencyKey ? String(payload.idempotencyKey).slice(0, 80) : null;

      if (idem) {
        const { data: existing } = await admin.from('jobs').select('ref_id').eq('user_id', user.id).eq('idempotency_key', idem).maybeSingle();
        if (existing?.ref_id) {
          const { data: gen } = await admin.from('generations').select('*').eq('id', existing.ref_id).single();
          if (gen) return json(req, { generation: gen, creditsCharged: 0, duplicate: true });
        }
      }

      const { data: job, error: jobErr } = await admin
        .from('jobs')
        .insert({
          user_id: user.id, kind: 'generation', status: 'queued', provider: 'hf-zerogpu', ref_table: 'generations',
          idempotency_key: idem, input: { kind, model, prompt, aspect, durationSeconds },
        })
        .select()
        .single();
      if (jobErr || !job) return json(req, { error: idem ? 'duplicate_in_progress' : 'insert_failed' }, idem ? 409 : 500);

      const { data: held } = await admin.rpc('credit_hold', { p_user: user.id, p_job: job.id, p_amount: credits });
      if (!held) {
        await admin.from('jobs').update({ status: 'failed', error: 'INSUFFICIENT_CREDITS', completed_at: new Date().toISOString() }).eq('id', job.id);
        return json(req, { error: 'INSUFFICIENT_CREDITS', needed: credits }, 402);
      }
      const { data: gen, error: genErr } = await admin
        .from('generations')
        .insert({
          user_id: user.id, kind, model, prompt, aspect, duration_seconds: durationSeconds ? Math.round(durationSeconds) : null,
          resolution: '480p', credit_cost: credits, status: 'queued', provider: 'hf-zerogpu', job_id: job.id,
        })
        .select()
        .single();
      if (genErr || !gen) {
        await failJob(admin, job, 'insert_failed');
        return json(req, { error: 'insert_failed' }, 500);
      }
      await admin.from('jobs').update({ ref_id: gen.id }).eq('id', job.id);
      return json(req, { generation: gen, creditsCharged: credits });
    }

    // ---------- create (paid providers) ----------
    if (mode === 'create') {
      const kind = payload.kind === 'image' ? 'image' : 'video';
      const model = String(payload.model ?? (kind === 'image' ? 'gpt-image' : 'seedance-fast'));
      if (kind === 'video' && !REPLICATE_MODELS[model]) return json(req, { error: 'unknown_model' }, 400);
      if (kind === 'image' && !IMAGE_MODELS.has(model)) return json(req, { error: 'unknown_model' }, 400);
      const prompt = String(payload.prompt ?? '').trim().slice(0, 2000);
      if (!prompt) return json(req, { error: 'prompt_required' }, 400);
      const aspect = ASPECTS.has(String(payload.aspect)) ? String(payload.aspect) : '9:16';
      const resolution = RESOLUTIONS.has(String(payload.resolution)) ? String(payload.resolution) : '720p';
      const durationSeconds = kind === 'video' ? clampVideoSeconds(payload.durationSeconds) : null;
      const formatKey = payload.formatKey ? String(payload.formatKey).slice(0, 80) : null;
      const style = payload.style ? String(payload.style).slice(0, 40) : null;
      const idem = payload.idempotencyKey ? String(payload.idempotencyKey).slice(0, 80) : null;
      const cost = creditCost(kind, resolution, durationSeconds);

      if (kind === 'video' && !REPLICATE_TOKEN) {
        return json(req, { error: 'PROVIDER_NOT_CONFIGURED', message: 'Video generation needs a Replicate API token. Add REPLICATE_API_TOKEN to the Edge Function secrets.' }, 503);
      }
      if (kind === 'image' && !OPENAI_KEY) {
        return json(req, { error: 'PROVIDER_NOT_CONFIGURED', message: 'Image generation needs an OpenAI API key. Add OPENAI_API_KEY to the Edge Function secrets.' }, 503);
      }

      // Same submit retried: return what already exists.
      if (idem) {
        const { data: existing } = await admin.from('jobs').select('ref_id').eq('user_id', user.id).eq('idempotency_key', idem).maybeSingle();
        if (existing?.ref_id) {
          const { data: gen } = await admin.from('generations').select('*').eq('id', existing.ref_id).single();
          if (gen) return json(req, { generation: gen, creditsCharged: 0, duplicate: true });
        }
      }

      const provider = kind === 'video' ? 'replicate' : 'openai';
      const { data: job, error: jobErr } = await admin
        .from('jobs')
        .insert({
          user_id: user.id, kind: 'generation', status: 'queued', provider, ref_table: 'generations',
          idempotency_key: idem, input: { kind, model, prompt, aspect, resolution, durationSeconds, formatKey, style },
          deadline_at: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
        })
        .select()
        .single();
      if (jobErr || !job) {
        // A parallel request with the same key won the insert.
        if (idem) return json(req, { error: 'duplicate_in_progress' }, 409);
        return json(req, { error: 'insert_failed', detail: jobErr?.message }, 500);
      }

      const { data: held } = await admin.rpc('credit_hold', { p_user: user.id, p_job: job.id, p_amount: cost });
      if (!held) {
        await admin.from('jobs').update({ status: 'failed', error: 'INSUFFICIENT_CREDITS', completed_at: new Date().toISOString() }).eq('id', job.id);
        return json(req, { error: 'INSUFFICIENT_CREDITS', needed: cost }, 402);
      }

      const { data: gen, error: genErr } = await admin
        .from('generations')
        .insert({
          user_id: user.id, kind, model, prompt, format_key: formatKey, aspect, duration_seconds: durationSeconds,
          resolution, style, credit_cost: cost, status: 'queued', provider, job_id: job.id,
        })
        .select()
        .single();
      if (genErr || !gen) {
        await failJob(admin, job, 'insert_failed');
        return json(req, { error: 'insert_failed', detail: genErr?.message }, 500);
      }
      const jobRow = { ...job, ref_id: gen.id, cost_quoted: cost };
      await admin.from('jobs').update({ ref_id: gen.id }).eq('id', job.id);

      try {
        if (kind === 'video') {
          const predictionId = await startReplicate(REPLICATE_MODELS[model], {
            prompt, aspect_ratio: aspect, duration: durationSeconds, resolution,
          });
          await admin.from('jobs').update({ status: 'running', provider_ref: predictionId, progress: 5, next_poll_at: new Date(Date.now() + 10000).toISOString() }).eq('id', job.id);
          await admin.from('generations').update({ provider_job_id: predictionId, status: 'processing' }).eq('id', gen.id);
          return json(req, { generation: { ...gen, status: 'processing' }, creditsCharged: cost });
        }

        const bytes = await openAIImage(prompt, aspect);
        const path = await storeOutput(admin, user.id, job.id, 'image.png', bytes, 'image/png');
        const now = new Date().toISOString();
        await admin.from('jobs').update({ status: 'succeeded', progress: 100, output: { path }, completed_at: now }).eq('id', job.id);
        await admin.from('generations').update({ status: 'ready', result_path: path, completed_at: now }).eq('id', gen.id);
        await admin.rpc('credit_settle', { p_job: job.id, p_actual: cost });
        await enrichGeneration(admin, gen.id, 'image', prompt);
        const { data: done } = await admin.from('generations').select('*').eq('id', gen.id).single();
        return json(req, { generation: done ?? gen, creditsCharged: cost });
      } catch (providerErr) {
        const msg = providerErr instanceof Error ? providerErr.message : String(providerErr);
        await failJob(admin, jobRow, msg);
        return json(req, { error: 'PROVIDER_ERROR', message: msg, refunded: cost }, 502);
      }
    }

    // ---------- check ----------
    if (mode === 'check') {
      const id = String(payload.id ?? '');
      const { data: gen } = await admin.from('generations').select('*').eq('id', id).eq('user_id', user.id).maybeSingle();
      if (!gen) return json(req, { error: 'not_found' }, 404);
      if (gen.status === 'processing' && gen.job_id) {
        const { data: job } = await admin.from('jobs').select('*').eq('id', gen.job_id).single();
        if (job) await advanceGenerationJob(admin, job);
        const { data: fresh } = await admin.from('generations').select('*').eq('id', id).single();
        return json(req, { generation: fresh ?? gen });
      }
      return json(req, { generation: gen });
    }

    return json(req, { error: 'unknown_mode' }, 400);
  } catch (e) {
    return json(req, { error: 'internal', message: e instanceof Error ? e.message : String(e) }, 500);
  }
});
