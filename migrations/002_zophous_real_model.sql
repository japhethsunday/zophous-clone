-- Real Zophous data model, reverse-engineered from app.zophous.ai bundle.
-- Layers on top of 001: workspaces (managers), shortform pipeline, clip edits,
-- brand kits, scheduled posts, advisor conversations, feedback.

-- Workspaces ("managers" in the real app)
create table if not exists public.managers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'My Workspace',
  created_at timestamptz not null default now()
);

-- Real credit columns on profiles (kept alongside 001 columns)
alter table public.profiles
  add column if not exists issubscribed boolean not null default false,
  add column if not exists subscriptionplan text,
  add column if not exists subscriptiontitle text,
  add column if not exists subscription_status text,
  add column if not exists current_credits integer not null default 60,
  add column if not exists purchased_credits integer not null default 0,
  add column if not exists monthly_credits integer not null default 60,
  add column if not exists variation_credits integer not null default 0,
  add column if not exists purchased_variation_credits integer not null default 0,
  add column if not exists monthly_variation_credits integer not null default 0,
  add column if not exists last_credit_refill timestamptz,
  add column if not exists maxworkspaces integer not null default 1,
  add column if not exists onboarded_at timestamptz;

-- Shortform pipeline
create table if not exists public.shortform_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid references public.managers(id) on delete set null,
  mode text not null default 'creator',
  kind text not null default 'test',
  title text,
  status text not null default 'pending'
    check (status in ('pending','analyzing','ready','failed')),
  test_config jsonb not null default '{}'::jsonb,
  auto_edit boolean not null default false,
  videos integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.shortform_test_parts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.shortform_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  position integer not null default 0,
  content text,
  created_at timestamptz not null default now()
);

create table if not exists public.shortform_moments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.shortform_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rank integer not null default 0,
  strength integer not null default 0,
  label text not null,
  transcript text,
  start_seconds integer not null default 0,
  end_seconds integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.shortform_variations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.shortform_jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body_part_id uuid references public.shortform_test_parts(id) on delete set null,
  variation_letter text not null default 'A',
  status text not null default 'pending'
    check (status in ('pending','ready','failed')),
  hook_text text,
  topic_title text,
  duration_ms integer,
  combo_index integer not null default 0,
  template_index integer not null default 0,
  lazy_render boolean not null default false,
  auto_edited_at timestamptz,
  created_at timestamptz not null default now()
);

-- Clip editing (opencut-style projects keyed by media)
create table if not exists public.clip_edits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  media_kind text not null,
  media_id uuid not null,
  media_index integer not null default 0,
  project jsonb not null default '{}'::jsonb,
  rendered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, media_kind, media_id, media_index)
);

create table if not exists public.edit_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Brand kits (studio looks)
create table if not exists public.brand_kits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brand_name text,
  primary_color text default '#8b5cf6',
  font_choice text default 'Inter',
  cta_text text default 'Follow for more',
  logo_url text,
  created_at timestamptz not null default now()
);

-- Scheduled / published posts
create table if not exists public.scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  variation_id uuid references public.shortform_variations(id) on delete cascade,
  platform text not null check (platform in ('tiktok','youtube','reels')),
  caption text,
  status text not null default 'scheduled'
    check (status in ('scheduled','posted','failed')),
  scheduled_for timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.youtube_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  manager_id uuid references public.managers(id) on delete set null,
  variation_id uuid references public.shortform_variations(id) on delete set null,
  title text not null,
  status text not null default 'published',
  published_at timestamptz,
  views integer not null default 0,
  likes integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.tiktok_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  manager_id uuid references public.managers(id) on delete set null,
  variation_id uuid references public.shortform_variations(id) on delete set null,
  caption text not null default '',
  status text not null default 'published',
  published_at timestamptz,
  views integer not null default 0,
  likes integer not null default 0,
  created_at timestamptz not null default now()
);

-- DNA advisor chat
create table if not exists public.advisor_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation',
  created_at timestamptz not null default now()
);

create table if not exists public.advisor_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.advisor_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.feedback_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pmf text,
  use_for text,
  frustration text,
  pay_reason text,
  created_at timestamptz not null default now()
);

-- indexes
create index if not exists managers_user_idx on public.managers(user_id, created_at);
create index if not exists shortform_jobs_user_idx on public.shortform_jobs(user_id, created_at desc);
create index if not exists shortform_jobs_workspace_idx on public.shortform_jobs(workspace_id);
create index if not exists shortform_parts_job_idx on public.shortform_test_parts(job_id);
create index if not exists shortform_moments_job_idx on public.shortform_moments(job_id, strength desc, rank asc);
create index if not exists shortform_variations_job_idx on public.shortform_variations(job_id, created_at);
create index if not exists clip_edits_media_idx on public.clip_edits(user_id, media_kind, media_id);
create index if not exists brand_kits_user_idx on public.brand_kits(user_id, created_at desc);
create index if not exists scheduled_posts_user_idx on public.scheduled_posts(user_id, scheduled_for desc);
create index if not exists advisor_conv_user_idx on public.advisor_conversations(user_id);
create index if not exists advisor_msg_conv_idx on public.advisor_messages(conversation_id, created_at);

-- RLS
alter table public.managers enable row level security;
alter table public.shortform_jobs enable row level security;
alter table public.shortform_test_parts enable row level security;
alter table public.shortform_moments enable row level security;
alter table public.shortform_variations enable row level security;
alter table public.clip_edits enable row level security;
alter table public.edit_templates enable row level security;
alter table public.brand_kits enable row level security;
alter table public.scheduled_posts enable row level security;
alter table public.youtube_posts enable row level security;
alter table public.tiktok_posts enable row level security;
alter table public.advisor_conversations enable row level security;
alter table public.advisor_messages enable row level security;
alter table public.feedback_responses enable row level security;

drop policy if exists "own managers" on public.managers;
create policy "own managers" on public.managers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own shortform jobs" on public.shortform_jobs;
create policy "own shortform jobs" on public.shortform_jobs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own shortform parts" on public.shortform_test_parts;
create policy "own shortform parts" on public.shortform_test_parts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own shortform moments" on public.shortform_moments;
create policy "own shortform moments" on public.shortform_moments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own shortform variations" on public.shortform_variations;
create policy "own shortform variations" on public.shortform_variations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own clip edits" on public.clip_edits;
create policy "own clip edits" on public.clip_edits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own edit templates" on public.edit_templates;
create policy "own edit templates" on public.edit_templates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own brand kits" on public.brand_kits;
create policy "own brand kits" on public.brand_kits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own scheduled posts" on public.scheduled_posts;
create policy "own scheduled posts" on public.scheduled_posts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own youtube posts" on public.youtube_posts;
create policy "own youtube posts" on public.youtube_posts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own tiktok posts" on public.tiktok_posts;
create policy "own tiktok posts" on public.tiktok_posts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own advisor conversations" on public.advisor_conversations;
create policy "own advisor conversations" on public.advisor_conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own advisor messages" on public.advisor_messages;
create policy "own advisor messages" on public.advisor_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own feedback" on public.feedback_responses;
create policy "own feedback" on public.feedback_responses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
