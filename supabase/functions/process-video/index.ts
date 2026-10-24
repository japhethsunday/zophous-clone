import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const HOOKS = [
  'shocking statement',
  'untold trivia reveal',
  'storytime opener',
  'bold claim',
  'question hook',
  'countdown setup',
];
const TONES = ['somber, informative', 'energetic, punchy', 'conspiratorial', 'inspirational', 'deadpan, funny'];
const WHYS = [
  'leverages untold trivia → curiosity',
  'open loop keeps viewers watching',
  'high-contrast claim triggers comments',
  'relatable pain point drives shares',
  'payoff lands in the last 5 seconds',
];
const TITLES = [
  "They told me I talk too much, so I make sure to make every word count.",
  "I am can't win it if we can't even run SEC offense",
  "Screamed 'I couldn't even face' my team",
  "We're not done yet — watch what happens next",
  "Potentially (legally) a starter now, actually",
  "The one stat nobody talks about",
  "This is the part everyone gets wrong",
  "Are you kidding me? This is insane",
  "Here's what the film actually shows",
  "Nobody expected this comeback",
];
const CATEGORIES = [
  { category: 'hook', label: 'Shock-statement hooks', base: 86 },
  { category: 'hook', label: 'Trivia reveals', base: 72 },
  { category: 'hook', label: 'Storytime openers', base: 64 },
  { category: 'category', label: 'Untold history', base: 78 },
  { category: 'category', label: 'Sports moments', base: 66 },
  { category: 'category', label: 'Creator drama', base: 44 },
  { category: 'visual', label: 'Facecam close-ups', base: 74 },
  { category: 'visual', label: 'Dynamic zooms', base: 61 },
  { category: 'visual', label: 'B-roll cutaways', base: 52 },
];

function seeded(seedStr: string) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return Math.abs(h % 10000) / 10000;
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'unauthorized' }, 401);

  let body: { videoId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  const videoId = body.videoId;
  if (!videoId) return json({ error: 'videoId required' }, 400);

  const { data: video, error: vErr } = await supabase
    .from('videos')
    .select('*')
    .eq('id', videoId)
    .single();
  if (vErr || !video) return json({ error: 'video not found' }, 404);

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  if (!profile) return json({ error: 'profile missing' }, 404);

  const isStudio = video.mode === 'studio';
  if (isStudio) {
    if (profile.studio_clips_used >= profile.studio_clips_limit) {
      return json({ error: 'no studio clips left on your plan' }, 402);
    }
  } else {
    if (profile.minutes_used >= profile.minutes_limit) {
      return json({ error: 'out of minutes for this month' }, 402);
    }
  }

  await supabase.from('videos').update({ status: 'analyzing' }).eq('id', videoId);

  const rand = seeded(video.id);
  const duration = Math.max(60, video.duration_seconds ?? 1800);
  const isPaid = profile.plan !== 'free';

  let count = isStudio
    ? Math.min(3, profile.studio_clips_limit - profile.studio_clips_used, 1 + Math.floor(rand() * 3))
    : 3 + Math.floor(rand() * 4); // 3-6 clips

  if (count <= 0) return json({ error: 'no credits left' }, 402);

  const minutesCharged = isStudio
    ? 0
    : Math.max(20, Math.ceil(duration / 60));

  if (!isStudio && profile.minutes_used + minutesCharged > profile.minutes_limit) {
    return json(
      { error: `this video needs ${minutesCharged} minutes; you have ${profile.minutes_limit - profile.minutes_used} left` },
      402,
    );
  }

  const clipRows = [];
  let cursor = Math.floor(rand() * Math.min(600, Math.max(0, duration / 4)));
  for (let i = 0; i < count; i++) {
    const len = 20 + Math.floor(rand() * 55); // 20-75s
    const start = Math.min(cursor, Math.max(0, duration - len));
    const end = Math.min(start + len, duration);
    cursor = end + Math.floor(rand() * 120);
    clipRows.push({
      video_id: videoId,
      user_id: user.id,
      title: TITLES[Math.floor(rand() * TITLES.length)],
      hook: HOOKS[Math.floor(rand() * HOOKS.length)],
      tone: TONES[Math.floor(rand() * TONES.length)],
      why_it_performed: WHYS[Math.floor(rand() * WHYS.length)],
      score: 62 + Math.floor(rand() * 36),
      start_seconds: start,
      end_seconds: end,
      caption_style: ['bold', 'karaoke', 'minimal'][Math.floor(rand() * 3)],
      watermarked: !isPaid,
    });
  }

  const { data: clips, error: cErr } = await supabase
    .from('clips')
    .insert(clipRows)
    .select();
  if (cErr) {
    await supabase.from('videos').update({ status: 'failed' }).eq('id', videoId);
    return json({ error: cErr.message }, 500);
  }

  await supabase.from('videos').update({ status: 'ready' }).eq('id', videoId);

  if (isStudio) {
    await supabase
      .from('profiles')
      .update({ studio_clips_used: profile.studio_clips_used + count })
      .eq('id', user.id);
  } else {
    await supabase
      .from('profiles')
      .update({ minutes_used: profile.minutes_used + minutesCharged })
      .eq('id', user.id);
  }

  return json({ clips, minutesCharged });
});
