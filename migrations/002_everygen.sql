-- EveryGen integration: AI generations, prompt library, scripts, credits
-- All user-owned tables enforce auth.uid() = user_id via RLS.

-- generations: every AI video/image job
create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('video','image')),
  model text not null default 'seedance-fast',
  prompt text not null,
  format_key text,
  aspect text not null default '9:16',
  duration_seconds int,
  resolution text not null default '720p',
  style text,
  provider text,
  provider_job_id text,
  status text not null default 'queued' check (status in ('queued','processing','ready','failed')),
  result_url text,
  thumb_url text,
  credit_cost int not null default 0,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists idx_generations_user on public.generations(user_id, created_at desc);

-- prompt_library: seeded viral formats + prompt presets (public read)
create table if not exists public.prompt_library (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  title text not null,
  prompt text not null,
  format_key text,
  aspect text not null default '9:16',
  sort int not null default 0
);
alter table public.prompt_library enable row level security;
create policy "prompt_library_public_read" on public.prompt_library for select using (true);

-- scripts: scriptwriter output
create table if not exists public.scripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null,
  tone text not null default 'energetic',
  duration_seconds int not null default 30,
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_scripts_user on public.scripts(user_id, created_at desc);

-- credits on profiles
alter table public.profiles add column if not exists credits_balance int not null default 0;
alter table public.profiles add column if not exists credits_limit int not null default 50;

-- plan defaults: free 50 / starter 200 / pro 500
update public.profiles set credits_limit = 200, credits_balance = 200 where plan = 'starter';
update public.profiles set credits_limit = 500, credits_balance = 500 where plan = 'pro';

-- atomic credit spend: returns true if deducted
create or replace function public.try_spend_credits(p_user uuid, p_cost int)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_balance int;
begin
  if p_cost is null or p_cost < 0 then return false; end if;
  select credits_balance into v_balance from profiles where id = p_user for update;
  if v_balance is null or v_balance < p_cost then return false; end if;
  update profiles set credits_balance = credits_balance - p_cost where id = p_user;
  return true;
end $$;

-- refund on failure
create or replace function public.refund_credits(p_user uuid, p_amount int)
returns void language sql security definer set search_path = public as $$
  update profiles set credits_balance = credits_balance + p_amount where id = p_user;
$$;

alter table public.generations enable row level security;
alter table public.scripts enable row level security;
create policy "own_generations_all" on public.generations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_scripts_all" on public.scripts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- seed prompt library: viral formats + presets
insert into public.prompt_library (category, title, prompt, format_key, aspect, sort) values
('Formats','Bodycam','Found-footage police bodycam style video: slightly shaky camera, timestamp overlay in the corner, night-time street lighting, tense atmospheric story unfolding in front of the lens.','bodycam','9:16',1),
('Formats','Trail Cam','Wildlife trail camera footage at dusk: fixed position, infrared glow, forest scene with a mysterious animal encounter, subtle grain and timestamp.','trailcam','9:16',2),
('Formats','Ring Cam','Smart doorbell camera perspective: wide-angle lens, front porch at night, unexpected visitor moment, realistic lighting with motion alert framing.','ringcam','9:16',3),
('Formats','Ranking','Fast-paced ranking video: bold numbered list overlays counting down, dynamic zooms between items, energetic background music pacing.','ranking','9:16',4),
('Formats','Courtroom','Dramatic courtroom scene: judge''s bench view, attorney pacing, witness reaction close-ups, cinematic tension lighting.','courtroom','9:16',5),
('Formats','Animal Story','Emotional animal rescue story: wildlife cinematography, golden hour lighting, narrative voiceover moments, heartwarming payoff.','animal','9:16',6),
('Formats','3D Explainer','3D animated explainer: isometric camera moves, clean material shading, labels building in, curiosity-driven narration pacing.','explainer','9:16',7),
('Formats','Nursery Rhyme','Soft children''s animation: gentle pastel colors, rounded characters, slow comforting camera drift, lullaby mood.','nursery','9:16',8),
('Ads','UGC Ad','Authentic UGC-style product ad: handheld phone camera feel, creator talking directly to lens, natural home lighting, genuine enthusiasm, product held up to camera.','ugc','9:16',9),
('Ads','Cinematic Product','High-end product commercial: macro detail shots, dramatic studio lighting, slow rotation reveal, premium reflections.','product','9:16',10),
('Ads','Before / After','Transformation ad: split-screen reveal, dramatic before state transitioning to polished after, satisfying payoff beat.','transform','9:16',11),
('Ads','Unboxing','Unboxing ad: top-down desk shot, hands opening the package, close-up product details, ASMR-adjacent pacing.','unboxing','9:16',12),
('Ads','Try-On','Virtual try-on ad: creator wearing the product, confident poses, clean background, fashion-forward cuts.','tryon','9:16',13),
('Presets','Calm Night Sky','A calm ambient video of the night sky slowly drifting over a mountain ridge, stars twinkling, gentle mist in the valley below.','ambient','16:9',14),
('Presets','Rainy Rooftop Duel','A cinematic sword fight on a rainy rooftop at night, neon reflections in puddles, dramatic slow-motion parries.','cinematic','16:9',15),
('Presets','Dolphin Rescue','A dolphin rescue story: ocean cinematography, marine team releasing a dolphin back to open water, sun flare on the water.','animal','9:16',16),
('Presets','Black Hole 3D','A 3D curiosity explainer about how black holes form, swirling accretion disk, awe-inspiring scale, smooth camera push-in.','explainer','16:9',17);
