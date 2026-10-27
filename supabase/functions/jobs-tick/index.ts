// jobs-tick: advances due jobs in the background.
// - Called by pg_cron with the service-role key: processes due jobs for everyone.
// - Called by a signed-in user: processes only that user's due jobs.
// verify_jwt = true, so the gateway has already verified the token's signature.

import { corsHeaders, json, jwtRole } from '../_shared/http.ts';
import { adminClient, advanceGenerationJob, userFromRequest } from '../_shared/generation.ts';

const BATCH = 20;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405);

  const admin = adminClient();
  let userId: string | null = null;
  if (jwtRole(req) !== 'service_role') {
    const user = await userFromRequest(admin, req);
    if (!user) return json(req, { error: 'unauthorized' }, 401);
    userId = user.id;
  }

  let q = admin
    .from('jobs')
    .select('*')
    .eq('status', 'running')
    .lte('next_poll_at', new Date().toISOString())
    .order('next_poll_at', { ascending: true })
    .limit(BATCH);
  if (userId) q = q.eq('user_id', userId);
  const { data: due, error } = await q;
  if (error) return json(req, { error: 'query_failed', message: error.message }, 500);

  let advanced = 0;
  for (const job of due ?? []) {
    try {
      if (job.kind === 'generation') {
        await advanceGenerationJob(admin, job);
        advanced++;
      }
      // clipping / longform / render kinds are added in later phases.
    } catch (e) {
      console.error('tick_failed', job.id, e instanceof Error ? e.message : e);
    }
  }
  return json(req, { due: due?.length ?? 0, advanced });
});
