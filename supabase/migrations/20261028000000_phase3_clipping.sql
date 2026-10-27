-- Phase 3: real clipping with the self-hosted open-source worker.
-- Adds media paths to videos/clips, a minutes reservation tied to the job,
-- and an atomic "claim the next job" function for workers.
--
-- Rollback (down):
--   drop function if exists public.claim_clipping_job(text), public.clip_minutes_hold(uuid,uuid,int),
--     public.clip_minutes_settle(uuid), public.clip_minutes_release(uuid);
--   alter table public.videos drop column if exists source_path, drop column if exists job_id,
--     drop column if exists progress, drop column if exists error;
--   alter table public.clips drop column if exists clip_path, drop column if exists thumb_path,
--     drop column if exists transcript, drop column if exists job_id;

alter table public.videos add column if not exists source_path text;
alter table public.videos add column if not exists job_id uuid references public.jobs(id) on delete set null;
alter table public.videos add column if not exists progress int not null default 0;
alter table public.videos add column if not exists error text;

alter table public.clips add column if not exists clip_path text;
alter table public.clips add column if not exists thumb_path text;
alter table public.clips add column if not exists transcript text;
alter table public.clips add column if not exists job_id uuid references public.jobs(id) on delete set null;

alter table public.jobs add column if not exists worker_id text;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'videos') then
    alter publication supabase_realtime add table public.videos;
  end if;
end $$;

-- Reserve clipping minutes for a job (stored in jobs.cost_quoted, unit = minutes).
create or replace function public.clip_minutes_hold(p_user uuid, p_job uuid, p_minutes int) returns boolean
language plpgsql security definer set search_path = public as $$
declare used int; lim int;
begin
  if p_minutes < 1 then raise exception 'minutes must be >= 1'; end if;
  if exists (select 1 from public.jobs where id = p_job and cost_quoted > 0) then return true; end if;
  select minutes_used, minutes_limit into used, lim from public.profiles where id = p_user for update;
  if used is null or used + p_minutes > lim then return false; end if;
  update public.profiles set minutes_used = minutes_used + p_minutes where id = p_user;
  update public.jobs set cost_quoted = p_minutes where id = p_job;
  return true;
end; $$;

-- Keep the minutes (success). Idempotent.
create or replace function public.clip_minutes_settle(p_job uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.jobs set cost_settled = cost_quoted where id = p_job and cost_settled is null;
end; $$;

-- Give the minutes back (failure / cancel). Idempotent.
create or replace function public.clip_minutes_release(p_job uuid) returns void
language plpgsql security definer set search_path = public as $$
declare j record;
begin
  select user_id, cost_quoted into j from public.jobs where id = p_job and cost_settled is null for update;
  if not found or j.cost_quoted <= 0 then return; end if;
  update public.profiles set minutes_used = greatest(0, minutes_used - j.cost_quoted) where id = j.user_id;
  update public.jobs set cost_settled = 0 where id = p_job;
end; $$;

-- Workers call this to take the next queued clipping job. SKIP LOCKED lets
-- several workers run side by side without taking the same job.
-- Jobs stuck in 'running' for 30+ minutes (worker crashed) go back to the queue.
create or replace function public.claim_clipping_job(p_worker text) returns setof public.jobs
language plpgsql security definer set search_path = public as $$
begin
  update public.jobs set status = 'queued', worker_id = null
   where kind = 'clipping' and status = 'running' and updated_at < now() - interval '30 minutes' and attempts < 3;

  return query
  update public.jobs j set status = 'running', worker_id = p_worker, attempts = j.attempts + 1, progress = greatest(j.progress, 1)
   where j.id = (
     select id from public.jobs
      where kind = 'clipping' and status = 'queued' and coalesce(next_poll_at, now()) <= now()
      order by created_at
      for update skip locked
      limit 1)
  returning j.*;
end; $$;

revoke execute on function public.clip_minutes_hold(uuid, uuid, int), public.clip_minutes_settle(uuid),
  public.clip_minutes_release(uuid), public.claim_clipping_job(text) from public, anon, authenticated;
grant execute on function public.clip_minutes_hold(uuid, uuid, int), public.clip_minutes_settle(uuid),
  public.clip_minutes_release(uuid), public.claim_clipping_job(text) to service_role;
