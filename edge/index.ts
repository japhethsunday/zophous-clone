// Cloudnivo edge Worker: serves the web app (static assets) and the Studio API.
//
// /api/studio/* runs image models on Cloudflare Workers AI through the AI binding, so no API keys
// live anywhere. Callers must send their Supabase access token; usage is capped per user per day
// in KV so one account can't drain the account-wide free allowance.

interface Env {
  AI: { run(model: string, input: Record<string, unknown>): Promise<unknown> };
  ASSETS: { fetch(req: Request): Promise<Response> };
  USAGE: { get(key: string): Promise<string | null>; put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> };
  SUPABASE_URL: string;
  SUPABASE_KEY: string;
  DAILY_IMAGES: string;
}

type Json = Record<string, unknown>;

export const MODELS: Record<string, { id: string; label: string; kind: 'json' | 'binary'; sizes: boolean; negative: boolean; steps: number }> = {
  'flux-schnell': { id: '@cf/black-forest-labs/flux-1-schnell', label: 'FLUX.1 schnell', kind: 'json', sizes: false, negative: false, steps: 4 },
  'lucid-origin': { id: '@cf/leonardo/lucid-origin', label: 'Lucid Origin', kind: 'json', sizes: true, negative: false, steps: 20 },
  'sdxl-lightning': { id: '@cf/bytedance/stable-diffusion-xl-lightning', label: 'SDXL Lightning', kind: 'binary', sizes: true, negative: true, steps: 8 },
  'dreamshaper': { id: '@cf/lykon/dreamshaper-8-lcm', label: 'DreamShaper 8', kind: 'binary', sizes: true, negative: true, steps: 8 },
  'sdxl-base': { id: '@cf/stabilityai/stable-diffusion-xl-base-1.0', label: 'SDXL 1.0', kind: 'binary', sizes: true, negative: true, steps: 15 },
};
const INPAINT = '@cf/runwayml/stable-diffusion-v1-5-inpainting';
const VISION = '@cf/meta/llama-4-scout-17b-16e-instruct';

export const ASPECTS: Record<string, [number, number]> = {
  '1:1': [1024, 1024], '3:4': [896, 1152], '4:3': [1152, 896], '9:16': [768, 1344], '16:9': [1344, 768],
};

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors } });
const fail = (error: string, message: string, status = 400) => json({ error, message }, status);

async function userId(req: Request, env: Env): Promise<string | null> {
  const auth = req.headers.get('authorization') ?? '';
  if (!/^Bearer\s+\S+/.test(auth)) return null;
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { authorization: auth, apikey: env.SUPABASE_KEY } });
  if (!r.ok) return null;
  const u = (await r.json()) as { id?: string };
  return u.id ?? null;
}

/** Reserve `n` images from today's allowance. Returns remaining after, or -1 when over. */
async function reserve(env: Env, uid: string, n: number): Promise<number> {
  const day = new Date().toISOString().slice(0, 10);
  const key = `u:${uid}:${day}`;
  const used = Number((await env.USAGE.get(key)) ?? 0);
  const limit = Number(env.DAILY_IMAGES || 40);
  if (used + n > limit) return -1;
  await env.USAGE.put(key, String(used + n), { expirationTtl: 60 * 60 * 30 });
  return limit - used - n;
}

async function usage(env: Env, uid: string) {
  const day = new Date().toISOString().slice(0, 10);
  const used = Number((await env.USAGE.get(`u:${uid}:${day}`)) ?? 0);
  return { used, limit: Number(env.DAILY_IMAGES || 40) };
}

function b64ToBytes(b64: string): number[] {
  const bin = atob(b64.replace(/^data:[^,]+,/, ''));
  const out = new Array<number>(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function toBase64(result: unknown): Promise<string> {
  if (result && typeof result === 'object' && 'image' in (result as Json)) return String((result as Json).image);
  const buf = result instanceof ReadableStream ? await new Response(result).arrayBuffer() : (result as ArrayBuffer);
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const clean = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

async function generate(env: Env, body: Json) {
  const model = MODELS[String(body.model)] ?? MODELS['flux-schnell'];
  const prompt = clean(body.prompt, 2000);
  if (!prompt) return fail('prompt_required', 'Describe what you want to create.');
  const count = Math.max(1, Math.min(4, Number(body.count) || 1));
  const [w, h] = ASPECTS[String(body.aspect)] ?? ASPECTS['1:1'];
  const negative = clean(body.negative, 500);
  const baseSeed = Number.isFinite(Number(body.seed)) && body.seed !== '' && body.seed !== null ? Math.floor(Number(body.seed)) : Math.floor(Math.random() * 2 ** 31);
  const images: { b64: string; seed: number; width: number; height: number; mime: string }[] = [];
  for (let i = 0; i < count; i++) {
    const seed = baseSeed + i;
    const input: Json = { prompt, seed };
    if (model.kind === 'json' && !model.sizes) input.steps = model.steps;
    if (model.sizes) Object.assign(input, { width: w, height: h });
    if (model.id.includes('lucid')) input.steps = model.steps;
    if (model.kind === 'binary') input.num_steps = model.steps;
    if (model.negative && negative) input.negative_prompt = negative;
    const out = await env.AI.run(model.id, input);
    images.push({
      b64: await toBase64(out), seed,
      width: model.sizes ? w : 1024, height: model.sizes ? h : 1024,
      mime: model.kind === 'json' ? 'image/jpeg' : 'image/png',
    });
  }
  return json({ images, model: Object.keys(MODELS).find((k) => MODELS[k] === model), seed: baseSeed });
}

async function inpaint(env: Env, body: Json) {
  const prompt = clean(body.prompt, 1000);
  if (!body.image || !body.mask) return fail('image_required', 'Add an image (and paint the area to change).');
  const strength = Math.max(0.05, Math.min(1, Number(body.strength) || 0.75));
  const input: Json = {
    prompt: prompt || 'clean natural background, seamless, high detail',
    image: b64ToBytes(String(body.image)), mask: b64ToBytes(String(body.mask)),
    strength, num_steps: 20, guidance: 7.5,
    negative_prompt: clean(body.negative, 500) || 'blurry, distorted, artifacts, text, watermark',
  };
  if (Number.isFinite(Number(body.seed)) && body.seed !== '' && body.seed !== null) input.seed = Math.floor(Number(body.seed));
  const out = await env.AI.run(INPAINT, input);
  return json({ images: [{ b64: await toBase64(out), mime: 'image/png' }] });
}

async function chat(env: Env, content: unknown, max = 200): Promise<string> {
  const r = (await env.AI.run(VISION, { messages: [{ role: 'user', content }], max_tokens: max })) as Json;
  const val = r.response ?? ((r.choices as Json[])?.[0]?.message as Json)?.content;
  // Some models hand back JSON-looking answers already parsed.
  if (val && typeof val === 'object') return JSON.stringify(val);
  return String(val ?? '').trim().replace(/^["']|["']$/g, '');
}

async function describe(env: Env, body: Json) {
  if (!body.image) return fail('image_required', 'Add an image to describe.');
  const url = String(body.image).startsWith('data:') ? String(body.image) : `data:image/png;base64,${body.image}`;
  const text = await chat(env, [
    { type: 'text', text: 'Write one detailed prompt (max 60 words) that an image generator could use to recreate this image: subject, setting, style, lighting, camera. Reply with the prompt only.' },
    { type: 'image_url', image_url: { url } },
  ], 160);
  return json({ prompt: text });
}

async function enhance(env: Env, body: Json) {
  const prompt = clean(body.prompt, 1000);
  if (!prompt) return fail('prompt_required', 'Write a short idea first.');
  const text = await chat(env, `Rewrite this image idea as one vivid, specific image-generation prompt (max 70 words): subject, setting, style, lighting, composition. Keep the user's intent. Reply with the prompt only.\n\nIdea: ${prompt}`, 180);
  return json({ prompt: text || prompt });
}

/** Chat mode: turn a message into a reply plus a concrete action the app runs. */
async function plan(env: Env, body: Json) {
  const message = clean(body.message, 1500);
  if (!message) return fail('message_required', 'Type what you want to make.');
  const hasImage = Boolean(body.hasImage);
  const history = Array.isArray(body.history) ? (body.history as Json[]).slice(-6).map((m) => `${m.role}: ${clean(m.text, 300)}`).join('\n') : '';
  const sys = `You are the Cloudnivo Studio assistant. Decide what to do with the user's message and reply with ONE JSON object only:
{"reply": "<one or two friendly sentences>", "action": {"type": "generate"|"restyle"|"none", "prompt": "<detailed image prompt, max 70 words>", "model": "flux-schnell"|"lucid-origin"|"sdxl-lightning"|"dreamshaper"|"sdxl-base", "aspect": "1:1"|"3:4"|"4:3"|"9:16"|"16:9", "count": 1-4, "strength": 0.3-0.9}}
Rules: "generate" makes new images. "restyle" changes the attached image (only if an image is attached: ${hasImage ? 'yes' : 'no'}). Use "none" for questions or chat. Prefer lucid-origin for photos and text, flux-schnell for speed, dreamshaper for illustration/anime. 9:16 for phone/story/reel, 16:9 for banners/thumbnails. Default count 2.`;
  const raw = await chat(env, `${sys}\n\nConversation so far:\n${history}\n\nuser: ${message}`, 400);
  const m = raw.match(/\{[\s\S]*\}/);
  let out: Json = { reply: raw || 'Okay.', action: { type: 'none' } };
  try { if (m) out = JSON.parse(m[0]) as Json; } catch { /* keep plain reply */ }
  const a = (out.action ?? {}) as Json;
  const type = ['generate', 'restyle'].includes(String(a.type)) ? String(a.type) : 'none';
  return json({
    reply: clean(out.reply, 600) || 'Okay.',
    action: type === 'none' ? { type } : {
      type,
      prompt: clean(a.prompt, 1500) || message,
      model: MODELS[String(a.model)] ? String(a.model) : 'flux-schnell',
      aspect: ASPECTS[String(a.aspect)] ? String(a.aspect) : '1:1',
      count: Math.max(1, Math.min(4, Number(a.count) || 2)),
      strength: Math.max(0.3, Math.min(0.9, Number(a.strength) || 0.65)),
    },
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    if (url.pathname === '/api/studio/models' && req.method === 'GET') {
      return json({ models: Object.entries(MODELS).map(([key, m]) => ({ key, label: m.label, sizes: m.sizes, negative: m.negative })), aspects: Object.keys(ASPECTS) });
    }

    const uid = await userId(req, env);
    if (!uid) return fail('unauthorized', 'Sign in to use the Studio.', 401);
    if (url.pathname === '/api/studio/usage' && req.method === 'GET') return json(await usage(env, uid));
    if (req.method !== 'POST') return fail('method_not_allowed', 'Use POST.', 405);

    let body: Json;
    try { body = (await req.json()) as Json; } catch { return fail('invalid_json', 'The request body must be JSON.'); }

    const route = url.pathname.replace('/api/studio/', '');
    const cost = route === 'generate' ? Math.max(1, Math.min(4, Number(body.count) || 1)) : route === 'inpaint' ? 1 : 0;
    if (!['generate', 'inpaint', 'describe', 'enhance', 'plan'].includes(route)) return fail('not_found', 'Unknown Studio action.', 404);
    if (cost) {
      const left = await reserve(env, uid, cost);
      if (left < 0) {
        const u = await usage(env, uid);
        return fail('daily_limit', `You've used ${u.used} of ${u.limit} free images today. The allowance resets at midnight UTC.`, 429);
      }
    }
    try {
      if (route === 'generate') return await generate(env, body);
      if (route === 'inpaint') return await inpaint(env, body);
      if (route === 'describe') return await describe(env, body);
      if (route === 'plan') return await plan(env, body);
      return await enhance(env, body);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Give the reservation back: a failed run shouldn't count against the user.
      if (cost) {
        const day = new Date().toISOString().slice(0, 10);
        const key = `u:${uid}:${day}`;
        const used = Number((await env.USAGE.get(key)) ?? 0);
        await env.USAGE.put(key, String(Math.max(0, used - cost)), { expirationTtl: 60 * 60 * 30 });
      }
      const quota = /quota|limit|3036|4006|capacity/i.test(msg);
      return fail(quota ? 'busy' : 'model_error', quota ? 'The free AI allowance is used up for today. Try again after midnight UTC.' : 'The model could not finish this request. Try again or change the prompt.', quota ? 503 : 502);
    }
  },
};
