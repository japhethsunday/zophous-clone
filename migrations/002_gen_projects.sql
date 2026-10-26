-- Cloudnivo x Everygen: gen_projects (additive only)
create table if not exists public.gen_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'video',
  model text not null,
  prompt text not null,
  status text not null default 'queued',
  credits_used int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.gen_projects enable row level security;

drop policy if exists "gen_projects_owner_all" on public.gen_projects;
create policy "gen_projects_owner_all"
  on public.gen_projects for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists gen_projects_user_created
  on public.gen_projects (user_id, created_at desc);
