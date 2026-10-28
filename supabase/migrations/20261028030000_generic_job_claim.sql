-- Let workers claim any job kind they support (clipping, free generation, later long-form).
-- Rollback: drop function if exists public.claim_job(text, text[]);

create or replace function public.claim_job(p_worker text, p_kinds text[]) returns setof public.jobs
language plpgsql security definer set search_path = public as $$
begin
  -- Jobs stuck in 'running' for 30+ minutes (crashed worker) go back to the queue.
  update public.jobs set status = 'queued', worker_id = null
   where kind = any(p_kinds) and status = 'running' and provider in ('cloudnivo-worker', 'hf-zerogpu')
     and updated_at < now() - interval '30 minutes' and attempts < 3;

  return query
  update public.jobs j set status = 'running', worker_id = p_worker, attempts = j.attempts + 1, progress = greatest(j.progress, 1)
   where j.id = (
     select id from public.jobs
      where kind = any(p_kinds) and status = 'queued'
        and provider in ('cloudnivo-worker', 'hf-zerogpu')
        and coalesce(next_poll_at, now()) <= now()
      order by created_at
      for update skip locked
      limit 1)
  returning j.*;
end; $$;

revoke execute on function public.claim_job(text, text[]) from public, anon, authenticated;
grant execute on function public.claim_job(text, text[]) to service_role;
