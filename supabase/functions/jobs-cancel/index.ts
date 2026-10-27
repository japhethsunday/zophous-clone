// jobs-cancel: the owner cancels a queued or running job. Credits are released.

import { corsHeaders, json, readJson } from '../_shared/http.ts';
import { adminClient, cancelReplicate, userFromRequest } from '../_shared/generation.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405);

  const admin = adminClient();
  const user = await userFromRequest(admin, req);
  if (!user) return json(req, { error: 'unauthorized' }, 401);
  const body = await readJson(req);
  const jobId = String(body?.jobId ?? '');
  if (!jobId) return json(req, { error: 'jobId_required' }, 400);

  const { data: job } = await admin.from('jobs').select('*').eq('id', jobId).eq('user_id', user.id).maybeSingle();
  if (!job) return json(req, { error: 'not_found' }, 404);
  if (!['queued', 'running'].includes(job.status)) return json(req, { error: 'not_cancellable', status: job.status }, 409);

  // Claim the transition first so a finishing poll can't race us.
  const now = new Date().toISOString();
  const { data: claimed } = await admin
    .from('jobs')
    .update({ status: 'cancelled', error: 'cancelled_by_user', completed_at: now })
    .eq('id', job.id)
    .in('status', ['queued', 'running'])
    .select('id');
  if (!claimed?.length) return json(req, { error: 'not_cancellable' }, 409);

  if (job.provider === 'replicate' && job.provider_ref) await cancelReplicate(job.provider_ref);
  if (job.ref_table === 'generations' && job.ref_id) {
    await admin.from('generations').update({ status: 'failed', error: 'cancelled', completed_at: now }).eq('id', job.ref_id);
  }
  await admin.rpc('credit_release', { p_job: job.id });
  return json(req, { job: { id: job.id, status: 'cancelled' }, released: job.cost_quoted });
});
