-- Phase 2: shared backend.
-- Storage buckets + assets, an append-only credit ledger with hold/settle/release,
-- and a jobs table every provider integration will use.
--
-- Rollback (down):
--   drop trigger if exists credit_ledger_apply on public.credit_ledger;
--   drop function if exists public.credit_hold(uuid,uuid,int), public.credit_settle(uuid,int),
--     public.credit_release(uuid), public.credit_grant(uuid,int,text), public.credit_ledger_apply();
--   drop table if exists public.job_steps, public.jobs, public.assets, public.credit_ledger;
--   alter table public.generations drop column if exists result_path, drop column if exists job_id;
--   (buckets: delete from storage.buckets where id in ('sources','outputs') once empty)

-- ---------- Storage ----------
insert into storage.buckets (id, name, public, allowed_mime_types)
values
  ('sources', 'sources', false, array['video/mp4','video/quicktime','video/webm','audio/mpeg','audio/wav','audio/x-wav','image/png','image/jpeg','image/webp']),
  ('outputs', 'outputs', false, null)
on conflict (id) do nothing;

-- Objects live under <bucket>/<user_id>/...
drop policy if exists "sources owner read" on storage.objects;
drop policy if exists "sources owner write" on storage.objects;
drop policy if exists "sources owner delete" on storage.objects;
drop policy if exists "outputs owner read" on storage.objects;
create policy "sources owner read" on storage.objects for select to authenticated
  using (bucket_id = 'sources' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "sources owner write" on storage.objects for insert to authenticated
  with check (bucket_id = 'sources' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "sources owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'sources' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "outputs owner read" on storage.objects for select to authenticated
  using (bucket_id = 'outputs' and (storage.foldername(name))[1] = auth.uid()::text);
-- outputs are written only by the service role (edge functions).

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null check (bucket in ('sources','outputs')),
  path text not null,
  mime text,
  bytes bigint,
  duration_seconds numeric,
  origin_job_id uuid,
  created_at timestamptz not null default now(),
  unique (bucket, path)
);
create index if not exists assets_user_idx on public.assets(user_id, created_at desc);
alter table public.assets enable row level security;
drop policy if exists "assets owner read" on public.assets;
drop policy if exists "assets owner insert source" on public.assets;
drop policy if exists "assets owner delete source" on public.assets;
create policy "assets owner read" on public.assets for select using (auth.uid() = user_id);
create policy "assets owner insert source" on public.assets for insert
  with check (auth.uid() = user_id and bucket = 'sources' and split_part(path, '/', 1) = auth.uid()::text);
create policy "assets owner delete source" on public.assets for delete
  using (auth.uid() = user_id and bucket = 'sources');

-- ---------- Jobs ----------
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid,
  kind text not null,                      -- generation | clipping | longform | render | publish
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','cancelled')),
  provider text,
  provider_ref text,
  ref_table text,                          -- e.g. 'generations'
  ref_id uuid,
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  progress int not null default 0 check (progress between 0 and 100),
  error text,
  idempotency_key text,
  cost_quoted int not null default 0,
  cost_settled int,
  attempts int not null default 0,
  next_poll_at timestamptz default now(),
  deadline_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create unique index if not exists jobs_user_idem_uidx on public.jobs(user_id, idempotency_key) where idempotency_key is not null;
create index if not exists jobs_poll_idx on public.jobs(status, next_poll_at) where status in ('queued','running');
create index if not exists jobs_user_idx on public.jobs(user_id, created_at desc);
alter table public.jobs enable row level security;
drop policy if exists "jobs owner read" on public.jobs;
create policy "jobs owner read" on public.jobs for select using (auth.uid() = user_id);
-- No client writes: jobs are created and advanced by edge functions (service role).

create table if not exists public.job_steps (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  position int not null,
  name text not null,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','cancelled','skipped')),
  provider_ref text,
  progress int not null default 0,
  output jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, position)
);
alter table public.job_steps enable row level security;
drop policy if exists "job steps owner read" on public.job_steps;
create policy "job steps owner read" on public.job_steps for select using (auth.uid() = user_id);

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end; $$;
drop trigger if exists jobs_touch on public.jobs;
create trigger jobs_touch before update on public.jobs for each row execute function public.touch_updated_at();
drop trigger if exists job_steps_touch on public.job_steps;
create trigger job_steps_touch before update on public.job_steps for each row execute function public.touch_updated_at();

alter table public.generations add column if not exists result_path text;
alter table public.generations add column if not exists job_id uuid references public.jobs(id) on delete set null;

-- Live progress in the UI.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'jobs') then
    alter publication supabase_realtime add table public.jobs;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'generations') then
    alter publication supabase_realtime add table public.generations;
  end if;
end $$;

-- ---------- Credit ledger ----------
create table if not exists public.credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  kind text not null check (kind in ('opening','grant','purchase','hold','settle','release','adjust')),
  amount int not null,                     -- signed: holds are negative, releases positive
  note text,
  created_at timestamptz not null default now()
);
-- One hold / settle / release per job: retries can't double-charge or double-refund.
create unique index if not exists credit_ledger_job_kind_uidx on public.credit_ledger(job_id, kind)
  where job_id is not null and kind in ('hold','settle','release');
create index if not exists credit_ledger_user_idx on public.credit_ledger(user_id, created_at desc);
alter table public.credit_ledger enable row level security;
drop policy if exists "ledger owner read" on public.credit_ledger;
create policy "ledger owner read" on public.credit_ledger for select using (auth.uid() = user_id);

-- Opening balances, written before the trigger exists so balances don't change.
insert into public.credit_ledger (user_id, kind, amount, note)
select p.id, 'opening', p.credits_balance, 'opening balance at ledger start'
from public.profiles p
where not exists (select 1 from public.credit_ledger l where l.user_id = p.id and l.kind = 'opening');

-- profiles.credits_balance stays as a cached total, so the current UI keeps working.
create or replace function public.credit_ledger_apply() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set credits_balance = credits_balance + new.amount where id = new.user_id;
  return new;
end; $$;
drop trigger if exists credit_ledger_apply on public.credit_ledger;
create trigger credit_ledger_apply after insert on public.credit_ledger
  for each row execute function public.credit_ledger_apply();

-- Reserve credits for a job. Returns false when the balance is too low.
-- Calling it twice for the same job is safe (returns true, no second hold).
create or replace function public.credit_hold(p_user uuid, p_job uuid, p_amount int) returns boolean
language plpgsql security definer set search_path = public as $$
declare bal int;
begin
  if p_amount < 0 then raise exception 'amount must be >= 0'; end if;
  if exists (select 1 from public.credit_ledger where job_id = p_job and kind = 'hold') then return true; end if;
  select credits_balance into bal from public.profiles where id = p_user for update;
  if bal is null or bal < p_amount then return false; end if;
  insert into public.credit_ledger (user_id, job_id, kind, amount, note) values (p_user, p_job, 'hold', -p_amount, 'hold');
  update public.jobs set cost_quoted = p_amount where id = p_job;
  return true;
end; $$;

-- Charge the actual cost (<= hold) and return the rest. Idempotent.
create or replace function public.credit_settle(p_job uuid, p_actual int) returns void
language plpgsql security definer set search_path = public as $$
declare h record; give_back int;
begin
  select user_id, -amount as held into h from public.credit_ledger where job_id = p_job and kind = 'hold';
  if not found then return; end if;
  if exists (select 1 from public.credit_ledger where job_id = p_job and kind in ('settle','release')) then return; end if;
  give_back := greatest(0, h.held - greatest(0, p_actual));
  insert into public.credit_ledger (user_id, job_id, kind, amount, note)
    values (h.user_id, p_job, 'settle', give_back, 'settled at ' || least(h.held, greatest(0, p_actual)));
  update public.jobs set cost_settled = least(h.held, greatest(0, p_actual)) where id = p_job;
end; $$;

-- Return the whole hold (failure / cancel). Idempotent.
create or replace function public.credit_release(p_job uuid) returns void
language plpgsql security definer set search_path = public as $$
declare h record;
begin
  select user_id, -amount as held into h from public.credit_ledger where job_id = p_job and kind = 'hold';
  if not found then return; end if;
  if exists (select 1 from public.credit_ledger where job_id = p_job and kind in ('settle','release')) then return; end if;
  insert into public.credit_ledger (user_id, job_id, kind, amount, note) values (h.user_id, p_job, 'release', h.held, 'released');
  update public.jobs set cost_settled = 0 where id = p_job;
end; $$;

-- Grants (plan renewals, purchases, admin adjustments) go through here.
create or replace function public.credit_grant(p_user uuid, p_amount int, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.credit_ledger (user_id, kind, amount, note) values (p_user, 'grant', p_amount, p_note);
end; $$;

revoke execute on function public.credit_hold(uuid, uuid, int), public.credit_settle(uuid, int),
  public.credit_release(uuid), public.credit_grant(uuid, int, text), public.credit_ledger_apply()
  from public, anon, authenticated;
grant execute on function public.credit_hold(uuid, uuid, int), public.credit_settle(uuid, int),
  public.credit_release(uuid), public.credit_grant(uuid, int, text) to service_role;
