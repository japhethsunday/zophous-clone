// Fake Supabase backend for browser tests and screenshots.
// Routes every Supabase REST/Auth/Storage/Functions call to in-memory fixtures,
// so the real app can be driven signed-in without touching the live project.
const fs = require('fs');
const path = require('path');

const FIX = path.join(__dirname, 'fixtures');
const UID = '00000000-0000-4000-8000-000000000001';
const now = Date.now();
const iso = (minsAgo) => new Date(now - minsAgo * 60000).toISOString();

function b64url(o) {
  return Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'test@example.com', app_metadata: {}, user_metadata: {}, created_at: iso(9000) };
const jwt = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: UID, role: 'authenticated', exp: Math.floor(now / 1000) + 36000 })}.sig`;
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 36000, expires_at: Math.floor(now / 1000) + 36000, user };

const words = [];
const sentence = 'The biggest mistake new founders make is building before they listen to a single customer. Here is how to fix that in one week.'.split(' ');
for (let i = 0; i < 90; i++) {
  const w = sentence[i % sentence.length];
  words.push({ start: 8 + i * 0.42, end: 8 + i * 0.42 + 0.36, text: ' ' + w });
}

function seed() {
  const vid = 'v-0001';
  const vid2 = 'v-0002';
  const db = {
    profiles: [{
      id: UID, display_name: 'Jordan', plan: 'free', minutes_used: 18, minutes_limit: 60, studio_clips_used: 0, studio_clips_limit: 0,
      turbo_left: 0, watermark_free_left: 0, brand_color: null, brand_font: null, brand_cta: null, logo_url: null,
      tiktok_connected: false, youtube_connected: false, checklist_done: { first_video: true }, credits_balance: 42, credits_limit: 50,
    }],
    videos: [
      { id: vid2, user_id: UID, title: 'Q&A livestream — October', source_url: null, source_type: 'upload', mode: 'clips', status: 'analyzing', progress: 38, duration_seconds: 2710, created_at: iso(4), source_path: `${UID}/src-2.mp4`, job_id: 'j-2' },
      { id: vid, user_id: UID, title: 'Founder podcast ep. 12', source_url: null, source_type: 'upload', mode: 'clips', status: 'ready', progress: 100, duration_seconds: 90, created_at: iso(300), source_path: `${UID}/src-1.mp4`, job_id: 'j-1' },
    ],
    clips: [1, 2, 3, 4].map((n) => ({
      id: `c-${n}`, video_id: vid, user_id: UID, job_id: 'j-1',
      title: ['The biggest mistake new founders make', 'Listen before you build', 'Fix it in one week', 'Talk to one customer today'][n - 1],
      hook: 'The biggest mistake new founders make', tone: 'direct', why_it_performed: 'Opens with a strong claim and pays it off within 20 seconds.',
      score: [91, 84, 77, 66][n - 1], start_seconds: 8 + (n - 1) * 18, end_seconds: 8 + (n - 1) * 18 + 16, caption_style: 'bold', watermarked: true,
      clip_path: `${UID}/j-1/clip-${n}.mp4`, thumb_path: `${UID}/j-1/clip-${n}.jpg`, transcript: sentence.join(' '),
      platform: null, posted_at: null, created_at: iso(290),
    })),
    jobs: [], posts: [], dna_patterns: [], shortform_jobs: [], shortform_variations: [], generations: [], prompt_library: [], scripts: [], brand_kits: [], clip_edits: [],
    managers: [{ id: 'm-1', user_id: UID, name: 'Jordan’s studio', created_at: iso(9000) }],
    assets: [],
  };
  return db;
}

/** Applies a tiny subset of PostgREST filters (eq) to rows. */
function filterRows(rows, url) {
  let out = rows;
  for (const [k, v] of url.searchParams) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
    const m = /^eq\.(.*)$/.exec(v);
    if (m) out = out.filter((r) => String(r[k]) === m[1]);
  }
  return out;
}

async function install(page, opts = {}) {
  const db = opts.db ?? seed();
  const calls = [];
  await page.addInitScript(([s]) => {
    try { localStorage.setItem('sb-gapzawavgmsnfuekqudo-auth-token', JSON.stringify(s)); } catch { /* */ }
  }, [session]);

  await page.route(/\/(auth|rest|storage|functions)\/v1\//, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const p = url.pathname;
    calls.push({ method, path: p + url.search, body: req.postData() });
    const json = (body, status = 200, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', ...headers }, body: JSON.stringify(body) });
    if (method === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });

    if (p.startsWith('/auth/v1/user')) return json(user);
    if (p.startsWith('/auth/v1/token')) return json(session);
    if (p.startsWith('/auth/v1/logout')) return json({});

    if (p.startsWith('/storage/v1/object/sign/')) {
      const body = JSON.parse(req.postData() || '{}');
      const signed = (pth) => `/object/fake/${pth}?token=t`;
      if (body.paths) return json(body.paths.map((pth) => ({ path: pth, signedURL: signed(pth), error: null })));
      return json({ signedURL: signed(p.split('/sign/')[1].split('/').slice(1).join('/')) });
    }
    const isGet = p.startsWith('/storage/v1/object/fake/') || (method === 'GET' && /^\/storage\/v1\/object\/(authenticated\/)?(outputs|sources)\//.test(p));
    if (isGet) {
      const pth = decodeURIComponent(p.replace(/^\/storage\/v1\/object\/(fake|authenticated\/\w+|\w+)\//, ''));
      if (pth.endsWith('.jpg')) return route.fulfill({ status: 200, contentType: 'image/jpeg', body: fs.readFileSync(path.join(FIX, 'thumb.jpg')) });
      if (pth.endsWith('transcript.json')) return json({ words });
      const buf = fs.readFileSync(path.join(FIX, pth.includes('src-') ? 'source.mp4' : 'clip.mp4'));
      // Browsers need byte ranges to seek inside a video.
      const range = /bytes=(\d+)-(\d*)/.exec(req.headers()['range'] || '');
      if (range) {
        const a = +range[1];
        const b = range[2] ? Math.min(+range[2], buf.length - 1) : buf.length - 1;
        return route.fulfill({ status: 206, body: buf.subarray(a, b + 1), headers: {
          'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'content-range': `bytes ${a}-${b}/${buf.length}`, 'access-control-allow-origin': '*' } });
      }
      return route.fulfill({ status: 200, body: buf, headers: { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'access-control-allow-origin': '*' } });
    }
    if (p.startsWith('/storage/v1/object/upload/sign/') && method === 'POST') {
      return json({ url: `/object/upload/sign/${p.split('/upload/sign/')[1]}?token=t` });
    }
    if (p.startsWith('/storage/v1/object/')) return json({ Key: p, Id: 'x' });

    if (p.startsWith('/functions/v1/')) {
      const name = p.split('/')[3];
      const body = JSON.parse(req.postData() || '{}');
      if (opts.functions && opts.functions[name]) return json(...opts.functions[name](body, db));
      return json({ error: 'not_mocked' }, 404);
    }

    if (p.startsWith('/rest/v1/')) {
      const table = p.split('/')[3];
      const rows = db[table] ?? [];
      const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
      if (method === 'GET' || method === 'HEAD') {
        const out = filterRows(rows, url);
        return json(single ? out[0] ?? null : out);
      }
      if (method === 'POST') {
        const body = JSON.parse(req.postData() || '[]');
        const list = (Array.isArray(body) ? body : [body]).map((r) => ({ id: `${table}-${rows.length + 1}`, created_at: new Date().toISOString(), ...r }));
        db[table] = [...rows, ...list];
        return json(single ? list[0] : list, 201);
      }
      if (method === 'PATCH') {
        const body = JSON.parse(req.postData() || '{}');
        const hit = filterRows(rows, url);
        hit.forEach((r) => Object.assign(r, body));
        return json(single ? hit[0] ?? null : hit);
      }
      if (method === 'DELETE') {
        const hit = new Set(filterRows(rows, url));
        db[table] = rows.filter((r) => !hit.has(r));
        return json([]);
      }
    }
    return json({ error: 'unhandled' }, 404);
  });
  return { db, calls };
}

module.exports = { install, seed, UID, words };
