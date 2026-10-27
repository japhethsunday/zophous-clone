import { createClient } from '@supabase/supabase-js';
import { createVerdentAuth } from '@verdent/auth-js';

const env = import.meta.env as Record<string, string | undefined>;

export const supabase = createClient(
  env.VITE_SUPABASE_URL || window.location.origin,
  env.VITE_SUPABASE_PUBLISHABLE_KEY || 'verdent-baas-proxy',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

export const auth = createVerdentAuth({
  supabase,
  ...(env.VITE_VERDENT_OAUTH_INITIATE_URL
    ? { oauth: { authorizeUrl: env.VITE_VERDENT_OAUTH_INITIATE_URL } }
    : {}),
});

export type Profile = {
  id: string;
  display_name: string | null;
  plan: 'free' | 'starter' | 'pro';
  minutes_used: number;
  minutes_limit: number;
  studio_clips_used: number;
  studio_clips_limit: number;
  turbo_left: number;
  watermark_free_left: number;
  brand_color: string | null;
  brand_font: string | null;
  brand_cta: string | null;
  logo_url: string | null;
  tiktok_connected: boolean;
  youtube_connected: boolean;
  checklist_done: Record<string, boolean>;
  current_credits?: number;
  credits_balance: number;
  credits_limit: number;
  onboarded_at?: string | null;
};

export type Video = {
  id: string;
  title: string;
  source_url: string | null;
  source_type: 'link' | 'upload';
  mode: 'clips' | 'studio';
  status: 'queued' | 'analyzing' | 'ready' | 'failed';
  duration_seconds: number;
  created_at: string;
};

export type Clip = {
  id: string;
  video_id: string;
  title: string;
  hook: string | null;
  tone: string | null;
  why_it_performed: string | null;
  score: number;
  start_seconds: number;
  end_seconds: number;
  caption_style: string;
  watermarked: boolean;
  platform: string | null;
  posted_at: string | null;
  created_at: string;
};

export type DnaPattern = {
  id: string;
  category: 'hook' | 'category' | 'visual';
  label: string;
  score: number;
  unlocked: boolean;
};

export type Post = {
  id: string;
  clip_id: string;
  platform: 'tiktok' | 'youtube' | 'reels';
  status: 'scheduled' | 'posted' | 'failed';
  scheduled_for: string;
  views: number;
  likes: number;
};

export type Generation = {
  id: string;
  user_id: string;
  kind: 'video' | 'image';
  model: string;
  prompt: string;
  format_key: string | null;
  aspect: string;
  duration_seconds: number | null;
  resolution: string;
  style: string | null;
  provider: string | null;
  provider_job_id: string | null;
  status: 'queued' | 'processing' | 'ready' | 'failed';
  result_url: string | null;
  thumb_url: string | null;
  credit_cost: number;
  error: string | null;
  virality_score: number | null;
  meta: { description?: string; hashtags?: string[] } | null;
  created_at: string;
  completed_at: string | null;
};

export type PromptPreset = {
  id: string;
  category: string;
  title: string;
  prompt: string;
  format_key: string | null;
  aspect: string;
  sort: number;
};

export type ScriptItem = {
  id: string;
  user_id: string;
  topic: string;
  tone: string;
  duration_seconds: number;
  content: string;
  created_at: string;
};

export const PLANS = {
  free: { name: 'Free', minutes: 60, studio: 0, credits: 50 },
  starter: { name: 'Creator Starter', minutes: 200, studio: 3, credits: 200 },
  pro: { name: 'Creator Pro', minutes: 600, studio: 3, credits: 500 },
} as const;

/** Mirrors the creditCost() table in the generate-media Edge Function. */
export function creditCostFor(kind: 'video' | 'image', resolution: string, durationSeconds: number | null): number {
  if (kind === 'image') return 3;
  const base = resolution === '1080p' ? 32 : 16;
  const spans = Math.max(1, Math.ceil((durationSeconds ?? 5) / 5));
  return base * spans;
}

/* ---------------- real Zophous model (workspaces + shortform pipeline) ---------------- */

export type Manager = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
};

export type ShortformJob = {
  id: string;
  user_id: string;
  workspace_id: string | null;
  mode: string;
  kind: string;
  title: string | null;
  status: 'pending' | 'analyzing' | 'ready' | 'failed';
  test_config: Record<string, unknown>;
  auto_edit: boolean;
  videos: number;
  created_at: string;
};

export type ShortformMoment = {
  id: string;
  job_id: string;
  rank: number;
  strength: number;
  label: string;
  transcript: string | null;
  start_seconds: number;
  end_seconds: number;
};

export type ShortformVariation = {
  id: string;
  job_id: string;
  variation_letter: string;
  status: 'pending' | 'ready' | 'failed';
  hook_text: string | null;
  topic_title: string | null;
  duration_ms: number | null;
  combo_index: number;
  template_index: number;
  auto_edited_at: string | null;
  created_at: string;
};

export type BrandKit = {
  id: string;
  user_id: string;
  brand_name: string | null;
  primary_color: string | null;
  font_choice: string | null;
  cta_text: string | null;
  logo_url: string | null;
};

/** Ensure the signed-in user has at least one workspace (mirrors the real app). */
export async function ensureWorkspace(userId: string): Promise<Manager[]> {
  const { data, error } = await supabase
    .from('managers')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  if (data && data.length > 0) return data as Manager[];
  const { data: created, error: insErr } = await supabase
    .from('managers')
    .insert({ user_id: userId, name: 'My Workspace' })
    .select()
    .single();
  if (insErr) throw insErr;
  return [created as Manager];
}

export function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}
