-- Zophous clone schema: profiles, videos, clips, dna_patterns, posts, studio_templates
-- All user-owned tables enforce auth.uid() = user_id via RLS.

-- profiles: 1:1 with auth.users, auto-created by trigger
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  plan text not null default 'free',
  minutes_used integer not null default 0,
  minutes_limit integer not null default 60,
  studio_clips_used integer not null default 0,
  studio_clips_limit integer not null default 0,
  turbo_left integer not null default 2,
  watermark_free_left integer not null default 1,
  brand_color text default '#8b5cf6',
  brand_font text default 'Inter',
  brand_cta text default 'Follow for more',
  logo_url text,
  tiktok_connected boolean not null default false,
  youtube_connected boolean not null default false,
  checklist_done jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  source_url text,
  source_type text not null default 'link' check (source_type in ('link','upload')),
  mode text not null default 'clips' check (mode in ('clips','studio')),
  status text not null default 'queued' check (status in ('queued','analyzing','ready','failed')),
  duration_seconds integer not null default 1800,
  created_at timestamptz not null default now()
);

create table if not exists public.clips (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  hook text,
  tone text,
  why_it_performed text,
  score integer not null default 0,
  start_seconds integer not null default 0,
  end_seconds integer not null default 0,
  caption_style text not null default 'bold',
  watermarked boolean not null default true,
  platform text,
  posted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.dna_patterns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('hook','category','visual')),
  label text not null,
  score integer not null default 0,
  unlocked boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  clip_id uuid not null references public.clips(id) on delete cascade,
  platform text not null check (platform in ('tiktok','youtube','reels')),
  status text not null default 'scheduled' check (status in ('scheduled','posted','failed')),
  scheduled_for timestamptz not null default now(),
  views integer not null default 0,
  likes integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.studio_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  mode text not null default 'creator' check (mode in ('creator','marketing')),
  caption_style text not null default 'bold',
  created_at timestamptz not null default now()
);

-- indexes
create index if not exists videos_user_idx on public.videos(user_id, created_at desc);
create index if not exists clips_video_idx on public.clips(video_id);
create index if not exists clips_user_idx on public.clips(user_id, created_at desc);
create index if not exists posts_user_idx on public.posts(user_id, scheduled_for desc);
create index if not exists dna_user_idx on public.dna_patterns(user_id);

-- auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.videos enable row level security;
alter table public.clips enable row level security;
alter table public.dna_patterns enable row level security;
alter table public.posts enable row level security;
alter table public.studio_templates enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own videos" on public.videos;
create policy "own videos" on public.videos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own clips" on public.clips;
create policy "own clips" on public.clips
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own dna" on public.dna_patterns;
create policy "own dna" on public.dna_patterns
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own posts" on public.posts;
create policy "own posts" on public.posts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own templates" on public.studio_templates;
create policy "own templates" on public.studio_templates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
