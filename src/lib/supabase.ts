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

export const PLANS = {
  free: { name: 'Free', minutes: 60, studio: 0 },
  starter: { name: 'Creator Starter', minutes: 200, studio: 3 },
  pro: { name: 'Creator Pro', minutes: 600, studio: 3 },
} as const;

export function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}
