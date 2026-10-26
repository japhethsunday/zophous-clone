// write-script: real AI scriptwriting via OpenAI chat completions, stored in `scripts`.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPA_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return json({ error: 'unauthorized' }, 401);
  const admin = createClient(SUPA_URL, SERVICE_KEY);
  const { data: userData } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (!user) return json({ error: 'unauthorized' }, 401);

  if (!OPENAI_KEY) {
    return json({ error: 'PROVIDER_NOT_CONFIGURED', message: 'Scriptwriting needs an OpenAI API key. Add OPENAI_API_KEY to the Edge Function secrets.' }, 503);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const topic = String(payload.topic ?? '').trim();
  const tone = String(payload.tone ?? 'energetic');
  const durationSeconds = Math.max(15, Math.min(90, Number(payload.durationSeconds ?? 30)));
  if (!topic) return json({ error: 'topic_required' }, 400);

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + OPENAI_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a short-form video scriptwriter. Write a punchy, production-ready script for a vertical short. Structure: HOOK (first line, on-screen), then beat-by-beat VO lines with [visual] cues. No preamble, no markdown headers — plain beat lines only.',
          },
          {
            role: 'user',
            content: `Topic: ${topic}\nTone: ${tone}\nTarget length: about ${durationSeconds} seconds of spoken content.`,
          },
        ],
        max_tokens: 700,
        temperature: 0.8,
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error?.message ?? 'openai_error_' + r.status);
    const content = j.choices?.[0]?.message?.content;
    if (!content) throw new Error('openai_empty_response');

    const { data: script, error } = await admin
      .from('scripts')
      .insert({ user_id: user.id, topic, tone, duration_seconds: durationSeconds, content })
      .select()
      .single();
    if (error) throw new Error('insert_failed: ' + error.message);
    return json({ script });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: 'SCRIPT_FAILED', message: msg }, 502);
  }
});
