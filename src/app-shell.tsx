import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  auth,
  supabase,
  PLANS,
  fmtTime,
  ensureWorkspace,
  creditCostFor,
  type Profile,
  type Video,
  type Clip,
  type DnaPattern,
  type Post,
  type Manager,
  type ShortformJob,
  type ShortformVariation,
  type Generation,
  type PromptPreset,
  type ScriptItem,
} from './lib/supabase';

/* ---------------- helpers ---------------- */

function gradeOf(score: number): string {
  if (score >= 93) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 78) return 'B+';
  if (score >= 70) return 'B';
  if (score >= 62) return 'C+';
  return 'C';
}

function predictedViews(clip: Clip): number {
  let h = 0;
  for (const ch of clip.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return Math.round(clip.score * (520 + (h % 900)));
}

function hookScore(clip: Clip): number {
  return Math.min(99, clip.score + (((clip.hook ?? '').length * 7) % 9) - 4);
}

function contentScore(clip: Clip): number {
  return Math.max(55, clip.score - 12 + (((clip.tone ?? '').length * 5) % 8));
}

function resetLabel(): string {
  const d = new Date(Date.now() + 30 * 86400000);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const DNA_POOL: Omit<DnaPattern, 'id' | 'unlocked'>[] = [
  { category: 'hook', label: 'Shock-statement hooks', score: 86 },
  { category: 'hook', label: 'Trivia reveals', score: 72 },
  { category: 'hook', label: 'Storytime openers', score: 64 },
  { category: 'category', label: 'Untold history', score: 78 },
  { category: 'category', label: 'Sports moments', score: 66 },
  { category: 'category', label: 'Creator drama', score: 44 },
  { category: 'visual', label: 'Facecam close-ups', score: 74 },
  { category: 'visual', label: 'Dynamic zooms', score: 61 },
  { category: 'visual', label: 'B-roll cutaways', score: 52 },
];

const CAMPAIGNS = [
  {
    kind: 'CLIPPING · TIKTOK',
    brand: '@cloudnivo',
    title: 'Clip the podcast',
    rate: '$1,000 per 1M views',
    budget: '$500',
    paid: '$0',
  },
  {
    kind: 'UGC · TIKTOK',
    brand: 'Cloudnivo UGC',
    title: 'Show how you create',
    rate: '$1,500 per 1M views',
    budget: '$2,000',
    paid: '$0',
  },
];

const PLATFORMS = ['TikTok', 'Instagram', 'YouTube', 'Twitch', 'X', 'Kick', 'Facebook'];
const FONTS = ['space grotesk', 'montserrat', 'inter', 'roboto'];
const EMOTIONS = ['Agree', 'Awkward', 'Funny', 'Hype', 'Shocked'];

type Page =
  | 'home'
  | 'clips'
  | 'studio'
  | 'gen'
  | 'posts'
  | 'brand'
  | 'dna'
  | 'analytics'
  | 'campaigns'
  | 'billing'
  | 'settings';

function SigninGate() {
  return (
    <div className="gate">
      <div className="gate-card">
        <div className="logo" style={{ justifyContent: 'center', fontSize: '1rem' }}>
          <span className="logo-mark">◉</span> CLOUDNIVO
        </div>
        <h2>Sign in to your studio</h2>
        <p className="sub left" style={{ margin: '12px 0 22px' }}>
          Clip long videos, schedule posts, and build your viral DNA. The Free plan gives you 60
          clipping minutes a month — no credit card required.
        </p>
        <button className="btn btn-purple big" onClick={() => auth.openSignInModal()}>
          Sign in / Create account
        </button>
        <a className="gate-back" href="#/">
          ← Back to site
        </a>
      </div>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const cls = score >= 85 ? 'hi' : score >= 72 ? 'mid' : 'low';
  return <span className={`score-badge ${cls}`}>{gradeOf(score)}</span>;
}

function UsageBar({ used, total, label }: { used: number; total: number; label: string }) {
  const pct = total === 0 ? 100 : Math.min(100, Math.round((used / total) * 100));
  return (
    <div className="usage">
      <div className="usage-head">
        <span>{label}</span>
        <em>
          {used} / {total}
        </em>
      </div>
      <div className="sp-track">
        <div className="sp-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ---------------- clip cards ---------------- */

function ClipBreakdown({ clip }: { clip: Clip }) {
  const hook = hookScore(clip);
  const content = contentScore(clip);
  const virality = clip.score;
  const tags = ['#viral', '#fyp', '#clips', '#cloudnivo'];
  return (
    <div className="breakdown">
      <div className="grades-row">
        {[
          ['Hook', hook],
          ['Content', content],
          ['Virality', virality],
        ].map(([label, sc]) => (
          <div className="grade-cell" key={label as string}>
            <span className="grade-letter">{gradeOf(sc as number)}</span>
            <strong>{sc}</strong>
            <em>{label}</em>
          </div>
        ))}
      </div>
      <div className="bd-caption">
        <strong>Caption</strong>
        <p>
          {clip.title} {tags.join(' ')}
        </p>
      </div>
      <div className="bd-note">
        <strong>Hook</strong>
        <p>{clip.hook} — the opening line teases exclusivity and curiosity, prompting viewers to keep watching.</p>
      </div>
      <div className="bd-note">
        <strong>Virality</strong>
        <p>{clip.why_it_performed}. Tone reads as {clip.tone}, which fits short-form share loops.</p>
      </div>
    </div>
  );
}

function ClipCardView({
  clip,
  onPost,
  onOpen,
}: {
  clip: Clip;
  onPost: (c: Clip) => void;
  onOpen?: (c: Clip) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="app-clip">
      <div className="app-clip-screen" style={{ aspectRatio: '9/16' }} onClick={() => onOpen?.(clip)}>
        <div className="clip-top">
          <span className="clip-src">{clip.caption_style.toUpperCase()}</span>
          <ScoreBadge score={clip.score} />
        </div>
        <div className="clip-caption">{clip.title}</div>
        <div className="clip-views">~{predictedViews(clip).toLocaleString()} views</div>
        {clip.watermarked && <div className="wm">◉ CLOUDNIVO</div>}
      </div>
      <div className="app-clip-meta">
        <div className="app-clip-times">
          {fmtTime(clip.start_seconds)} – {fmtTime(clip.end_seconds)}
        </div>
        <button className="lnk" onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide Breakdown ▲' : 'Show Breakdown ▼'}
        </button>
        {open && <ClipBreakdown clip={clip} />}
        {clip.posted_at ? (
          <div className="posted-tag">✓ Posted to {clip.platform}</div>
        ) : (
          <button className="btn btn-purple sm" onClick={() => onPost(clip)}>
            Post / Schedule
          </button>
        )}
      </div>
    </div>
  );
}

function PostModal({
  clip,
  onClose,
  onDone,
}: {
  clip: Clip;
  onClose: () => void;
  onDone: () => void;
}) {
  const [platform, setPlatform] = useState<'tiktok' | 'youtube' | 'reels'>('tiktok');
  const [when, setWhen] = useState('now');
  const [datetime, setDatetime] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const scheduledFor = when === 'now' ? new Date().toISOString() : new Date(datetime).toISOString();
    const status = when === 'now' ? 'posted' : 'scheduled';
    const seededViews = when === 'now' ? 1200 + Math.floor(Math.random() * 90000) : 0;
    const seededLikes = when === 'now' ? Math.floor(seededViews * (0.06 + Math.random() * 0.08)) : 0;
    await supabase.from('posts').insert({
      user_id: userData.user.id,
      clip_id: clip.id,
      platform,
      status,
      scheduled_for: scheduledFor,
      views: seededViews,
      likes: seededLikes,
    });
    if (when === 'now') {
      await supabase.from('clips').update({ posted_at: scheduledFor, platform }).eq('id', clip.id);
    }
    setBusy(false);
    onDone();
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Post clip</h3>
        <p className="modal-sub">“{clip.title.slice(0, 60)}…”</p>
        <div className="pub-chips" style={{ justifyContent: 'flex-start' }}>
          {(['tiktok', 'youtube', 'reels'] as const).map((p) => (
            <button
              key={p}
              className={`pub-chip pick${platform === p ? ' on' : ''}`}
              onClick={() => setPlatform(p)}
            >
              {p === 'tiktok' ? 'TikTok' : p === 'youtube' ? 'YouTube' : 'Reels'}
            </button>
          ))}
        </div>
        <div className="field-row">
          <label className="radio">
            <input type="radio" checked={when === 'now'} onChange={() => setWhen('now')} /> Post now
          </label>
          <label className="radio">
            <input type="radio" checked={when === 'later'} onChange={() => setWhen('later')} />{' '}
            Schedule
          </label>
        </div>
        {when === 'later' && (
          <input
            type="datetime-local"
            className="input"
            value={datetime}
            onChange={(e) => setDatetime(e.target.value)}
          />
        )}
        <div className="modal-actions">
          <button className="btn btn-ghost sm" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-purple sm" disabled={busy} onClick={submit}>
            {busy ? 'Working…' : when === 'now' ? 'Post now' : 'Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- gen studio (real AI generation via Edge Functions) ---------------- */

const GEN_MODELS = [
  { id: 'seedance-fast', name: 'Seedance Lite', kind: 'video', tag: 'Fast vertical clips', accent: '#38BDF8' },
  { id: 'seedance-pro', name: 'Seedance Pro', kind: 'video', tag: 'Richer motion detail', accent: '#7C5CFF' },
  { id: 'kling-2.1', name: 'Kling 2.1', kind: 'video', tag: 'Cinematic realism', accent: '#F472B6' },
  { id: 'gpt-image', name: 'GPT Image', kind: 'image', tag: 'Poster-grade stills', accent: '#FBBF24' },
] as const;

const GEN_ASPECTS = ['9:16', '16:9', '1:1'] as const;

const GEN_TONES = ['energetic', 'dramatic', 'funny', 'calm'] as const;

/** Pull the structured error body out of a failed functions.invoke. */
async function readFnError(e: unknown): Promise<{ code: string; message: string }> {
  const ctx = (e as { context?: { json?: () => Promise<Record<string, unknown>> } })?.context;
  if (ctx?.json) {
    try {
      const j = await ctx.json();
      return {
        code: String(j.error ?? 'request_failed'),
        message: String(j.message ?? j.error ?? 'Generation request failed'),
      };
    } catch {
      /* fall through to generic message */
    }
  }
  return { code: 'request_failed', message: e instanceof Error ? e.message : 'Generation request failed' };
}

function GenPage({
  profile,
  showToast,
  refresh,
}: {
  profile: Profile;
  showToast: (m: string) => void;
  refresh: () => Promise<void>;
}) {
  const [tab, setTab] = useState<'create' | 'scripts'>('create');
  const [gens, setGens] = useState<Generation[] | null>(null);
  const [prompts, setPrompts] = useState<PromptPreset[]>([]);
  const [scripts, setScripts] = useState<ScriptItem[] | null>(null);
  const [prompt, setPrompt] = useState('');
  const [modelId, setModelId] = useState<string>(GEN_MODELS[0].id);
  const [aspect, setAspect] = useState<string>('9:16');
  const [resolution, setResolution] = useState<string>('720p');
  const [durationSeconds, setDuration] = useState(5);
  const [formatKey, setFormatKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState<string>(GEN_TONES[0]);
  const [scriptLen, setScriptLen] = useState(30);
  const [scriptBusy, setScriptBusy] = useState(false);

  const model = GEN_MODELS.find((m) => m.id === modelId) ?? GEN_MODELS[0];
  const cost = creditCostFor(model.kind, resolution, model.kind === 'video' ? durationSeconds : null);
  const creditsLeft = profile.credits_balance ?? 0;
  const creditsLimit = profile.credits_limit ?? 0;

  const load = useCallback(async () => {
    const [g, pl, sc] = await Promise.all([
      supabase.from('generations').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('prompt_library').select('*').order('sort', { ascending: true }),
      supabase.from('scripts').select('*').order('created_at', { ascending: false }).limit(30),
    ]);
    setGens((g.data ?? []) as Generation[]);
    setPrompts((pl.data ?? []) as PromptPreset[]);
    setScripts((sc.data ?? []) as ScriptItem[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll in-flight Replicate jobs so status + result land without a manual reload.
  useEffect(() => {
    const active = (gens ?? []).filter((g) => g.status === 'processing' && g.kind === 'video');
    if (active.length === 0) return;
    const t = setInterval(async () => {
      for (const g of active) {
        const { data, error } = await supabase.functions.invoke('generate-media', {
          body: { mode: 'check', id: g.id },
        });
        if (!error && data?.generation) {
          const updated = data.generation as Generation;
          setGens((prev) => (prev ?? []).map((x) => (x.id === updated.id ? updated : x)));
          if (updated.status === 'ready') {
            showToast('Generation ready — your video is in the history below');
            void refresh();
          } else if (updated.status === 'failed') {
            showToast(`Generation failed: ${updated.error ?? 'provider error'} — credits refunded`);
            void refresh();
          }
        }
      }
    }, 6000);
    return () => clearInterval(t);
  }, [gens, showToast, refresh]);

  const last7 = useMemo(() => {
    const days: { label: string; credits: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      const credits = (gens ?? [])
        .filter((g) => {
          const t = new Date(g.created_at);
          return t >= d && t < next && g.status !== 'failed';
        })
        .reduce((s, g) => s + g.credit_cost, 0);
      days.push({ label: d.toLocaleDateString('en-US', { weekday: 'short' }), credits });
    }
    return days;
  }, [gens]);
  const peak = Math.max(20, ...last7.map((d) => d.credits));

  const generate = useCallback(async () => {
    if (!prompt.trim()) {
      showToast('Describe what to generate first');
      return;
    }
    if (creditsLeft < cost) {
      showToast(`Not enough credits — this render costs ${cost}, you have ${creditsLeft}. Upgrade in Billing.`);
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('generate-media', {
      body: {
        mode: 'create',
        kind: model.kind,
        model: model.id,
        prompt: prompt.trim(),
        aspect,
        resolution,
        durationSeconds: model.kind === 'video' ? durationSeconds : undefined,
        formatKey,
      },
    });
    setBusy(false);
    if (error) {
      showToast((await readFnError(error)).message);
      return;
    }
    const gen = (data as { generation?: Generation }).generation;
    if (!gen) {
      showToast('Generation could not be created — try again');
      return;
    }
    setGens((prev) => [gen, ...(prev ?? [])]);
    showToast(
      gen.status === 'ready'
        ? `${model.name} ready — ${cost} credits used`
        : `${model.name} is rendering — it will appear below when done`,
    );
    setPrompt('');
    await refresh();
  }, [prompt, creditsLeft, cost, model, aspect, resolution, durationSeconds, formatKey, showToast, refresh]);

  const writeScript = useCallback(async () => {
    if (!topic.trim()) {
      showToast('Give the script a topic first');
      return;
    }
    setScriptBusy(true);
    const { data, error } = await supabase.functions.invoke('write-script', {
      body: { topic: topic.trim(), tone, durationSeconds: scriptLen },
    });
    setScriptBusy(false);
    if (error) {
      showToast((await readFnError(error)).message);
      return;
    }
    const s = (data as { script?: ScriptItem }).script;
    if (!s) {
      showToast('Could not write the script — try again');
      return;
    }
    setScripts((prev) => [s, ...(prev ?? [])]);
    showToast('Script ready');
  }, [topic, tone, scriptLen, showToast]);

  const usePreset = (p: PromptPreset) => {
    setPrompt(p.prompt);
    setAspect(p.aspect);
    setFormatKey(p.format_key);
    setTab('create');
  };

  const usagePct = creditsLimit > 0 ? Math.round(((creditsLimit - creditsLeft) / creditsLimit) * 100) : 0;

  return (
    <div className="gen-page">
      <div className="page-head-row">
        <div>
          <h2 className="app-h gen-h">AI Studio</h2>
          <p className="gen-sub">Generate real video, images and scripts — powered by credits.</p>
        </div>
        <span className="gen-credits-pill">
          ⚡ {creditsLeft} credits left
        </span>
      </div>

      <div className="gen-stats">
        <div className="gen-stat">
          <em>Credits</em>
          <strong>
            {creditsLeft}
            <span> / {creditsLimit}</span>
          </strong>
          <i className="gen-delta">{usagePct}% used</i>
          <div className="gen-track">
            <div className="gen-track-fill" style={{ width: `${Math.min(100, usagePct)}%` }} />
          </div>
        </div>
        <div className="gen-stat">
          <em>Generations</em>
          <strong>{gens?.length ?? 0}</strong>
          <i className="gen-delta up">all time</i>
        </div>
        <div className="gen-stat">
          <em>Models online</em>
          <strong>{GEN_MODELS.length}</strong>
          <i className="gen-delta up">video · image</i>
        </div>
        <div className="gen-stat">
          <em>Plan</em>
          <strong className="gen-stat-plan">{PLANS[profile.plan].name}</strong>
          <i className="gen-delta">{PLANS[profile.plan].credits} credits / mo</i>
        </div>
      </div>

      <div className="gen-tabs">
        <button className={`gen-tab${tab === 'create' ? ' on' : ''}`} onClick={() => setTab('create')}>
          Create
        </button>
        <button className={`gen-tab${tab === 'scripts' ? ' on' : ''}`} onClick={() => setTab('scripts')}>
          Scriptwriter
        </button>
      </div>

      {tab === 'create' && (
        <>
          <div className="gen-grid">
            <div className="gen-panel gen-composer">
              <div className="gen-panel-head">
                <h3>What are we creating today?</h3>
                <span className="gen-kind">
                  {model.kind === 'video' ? 'Video' : 'Image'} · {cost} cr
                </span>
              </div>
              <textarea
                className="gen-input"
                rows={3}
                placeholder="Describe the shot — subject, motion, lighting, mood…"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
              <div className="gen-opt-row">
                <span className="gen-opt-label">Model</span>
                {GEN_MODELS.map((m) => (
                  <button
                    key={m.id}
                    className={`gen-opt${m.id === modelId ? ' on' : ''}`}
                    onClick={() => setModelId(m.id)}
                    title={m.tag}
                  >
                    <span className="gen-model-dot" style={{ background: m.accent }} /> {m.name}
                  </button>
                ))}
              </div>
              {model.kind === 'video' && (
                <div className="gen-opt-row">
                  <span className="gen-opt-label">Length</span>
                  {[5, 10].map((d) => (
                    <button
                      key={d}
                      className={`gen-opt sm${durationSeconds === d ? ' on' : ''}`}
                      onClick={() => setDuration(d)}
                    >
                      {d}s
                    </button>
                  ))}
                  <span className="gen-opt-label" style={{ marginLeft: 12 }}>
                    Quality
                  </span>
                  {['720p', '1080p'].map((r) => (
                    <button
                      key={r}
                      className={`gen-opt sm${resolution === r ? ' on' : ''}`}
                      onClick={() => setResolution(r)}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              )}
              <div className="gen-opt-row">
                <span className="gen-opt-label">Aspect</span>
                {GEN_ASPECTS.map((a) => (
                  <button
                    key={a}
                    className={`gen-opt sm${aspect === a ? ' on' : ''}`}
                    onClick={() => setAspect(a)}
                  >
                    {a}
                  </button>
                ))}
              </div>
              <div className="gen-composer-foot">
                <span className="gen-eta">{busy ? 'Starting…' : `${cost} credits · ${model.name}`}</span>
                <button className="gen-btn" disabled={busy} onClick={generate}>
                  {busy ? 'Starting…' : 'Generate'}
                </button>
              </div>
            </div>

            <div className="gen-panel gen-usage">
              <div className="gen-panel-head">
                <h3>Credit usage</h3>
                <span className="gen-kind">last 7 days</span>
              </div>
              <div className="gen-chart">
                {last7.map((d) => (
                  <div key={d.label} className="gen-chart-col">
                    <div className="gen-chart-bar-wrap">
                      <div
                        className="gen-chart-bar"
                        style={{ height: `${Math.max(4, (d.credits / peak) * 100)}%` }}
                      />
                    </div>
                    <span>{d.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <h3 className="gen-sec-h">Viral formats &amp; presets — tap to use</h3>
          <div className="gen-presets">
            {prompts.map((p) => (
              <button key={p.id} className="gen-preset" onClick={() => usePreset(p)} title={p.prompt}>
                <em>{p.category}</em>
                <strong>{p.title}</strong>
                <span>{p.aspect}</span>
              </button>
            ))}
            {prompts.length === 0 && <div className="gen-empty">Loading formats…</div>}
          </div>
        </>
      )}

      {tab === 'scripts' && (
        <div className="gen-grid">
          <div className="gen-panel gen-composer">
            <div className="gen-panel-head">
              <h3>Write a short-form script</h3>
              <span className="gen-kind">GPT · {scriptLen}s</span>
            </div>
            <textarea
              className="gen-input"
              rows={2}
              placeholder="Topic — e.g. why most creators quit at 300 followers"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
            <div className="gen-opt-row">
              <span className="gen-opt-label">Tone</span>
              {GEN_TONES.map((tn) => (
                <button
                  key={tn}
                  className={`gen-opt sm${tone === tn ? ' on' : ''}`}
                  onClick={() => setTone(tn)}
                >
                  {tn}
                </button>
              ))}
              <span className="gen-opt-label" style={{ marginLeft: 12 }}>
                Length
              </span>
              {[15, 30, 60].map((l) => (
                <button
                  key={l}
                  className={`gen-opt sm${scriptLen === l ? ' on' : ''}`}
                  onClick={() => setScriptLen(l)}
                >
                  {l}s
                </button>
              ))}
            </div>
            <div className="gen-composer-foot">
              <span className="gen-eta">{scriptBusy ? 'Writing…' : 'Hook-first, beat-by-beat'}</span>
              <button className="gen-btn" disabled={scriptBusy} onClick={writeScript}>
                {scriptBusy ? 'Writing…' : 'Write script'}
              </button>
            </div>
          </div>
          <div className="gen-panel gen-usage">
            <div className="gen-panel-head">
              <h3>Your scripts</h3>
              <span className="gen-kind">latest first</span>
            </div>
            <div className="gen-scripts">
              {scripts === null && <div className="gen-empty">Loading…</div>}
              {scripts !== null && scripts.length === 0 && (
                <div className="gen-empty">No scripts yet — write your first one.</div>
              )}
              {scripts?.map((s) => (
                <details key={s.id} className="gen-script">
                  <summary>
                    <strong>{s.topic}</strong>
                    <span>
                      {s.tone} · {s.duration_seconds}s ·{' '}
                      {new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </summary>
                  <pre>{s.content}</pre>
                </details>
              ))}
            </div>
          </div>
        </div>
      )}

      <h3 className="gen-sec-h">Recent generations</h3>
      <div className="gen-history">
        {gens === null && <div className="gen-empty">Loading…</div>}
        {gens !== null && gens.length === 0 && (
          <div className="gen-empty">Nothing yet — your first generation will appear here.</div>
        )}
        {gens?.map((g) => (
          <div key={g.id} className="gen-row">
            <div className={`gen-thumb ${g.aspect === '16:9' ? 'wide' : 'tall'}`}>
              {g.status === 'ready' && g.result_url && g.kind === 'video' && (
                <video src={g.result_url} controls playsInline preload="metadata" />
              )}
              {g.status === 'ready' && g.result_url && g.kind === 'image' && (
                <img src={g.result_url} alt={g.prompt.slice(0, 60)} />
              )}
              {(g.status === 'processing' || g.status === 'queued') && (
                <div className="gen-thumb-note">Rendering…</div>
              )}
              {g.status === 'failed' && <div className="gen-thumb-note failed">Failed · refunded</div>}
            </div>
            <div className="gen-row-body">
              <strong>{g.prompt}</strong>
              <span>
                {g.model} · {g.kind} · {g.aspect} · {g.resolution} ·{' '}
                {new Date(g.created_at).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
              {g.error && <span className="gen-row-error">{g.error}</span>}
            </div>
            <em className="gen-row-credits">
              {g.status === 'failed' ? 'refunded' : g.credit_cost ? `-${g.credit_cost} cr` : '—'}
            </em>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- main shell ---------------- */

export default function AppShell() {
  const [session, setSession] = useState<boolean | null>(null);
  const [page, setPage] = useState<Page>('home');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [dna, setDna] = useState<DnaPattern[]>([]);
  const [postClip, setPostClip] = useState<Clip | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [whoseOpen, setWhoseOpen] = useState(false);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [sfJobs, setSfJobs] = useState<ShortformJob[]>([]);
  const [sfVars, setSfVars] = useState<ShortformVariation[]>([]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  }, []);

  const refresh = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const uid = userData.user.id;
    const [p, v, c, po, d, mj, sv] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).single(),
      supabase.from('videos').select('*').order('created_at', { ascending: false }),
      supabase.from('clips').select('*').order('score', { ascending: false }),
      supabase.from('posts').select('*').order('scheduled_for', { ascending: false }),
      supabase.from('dna_patterns').select('*').order('score', { ascending: false }),
      supabase.from('shortform_jobs').select('*').order('created_at', { ascending: false }),
      supabase.from('shortform_variations').select('*').order('created_at', { ascending: true }),
    ]);
    if (p.data) setProfile(p.data as Profile);
    if (v.data) setVideos(v.data as Video[]);
    if (c.data) setClips(c.data as Clip[]);
    if (po.data) setPosts(po.data as Post[]);
    if (d.data) setDna(d.data as DnaPattern[]);
    if (mj.data) setSfJobs(mj.data as ShortformJob[]);
    if (sv.data) setSfVars(sv.data as ShortformVariation[]);
    try {
      setManagers(await ensureWorkspace(uid));
    } catch {
      /* workspace load is non-fatal */
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(!!data.session);
      if (data.session) refresh();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(!!s);
      if (s) refresh();
    });
    return () => sub.subscription.unsubscribe();
  }, [refresh]);

  const markChecklist = useCallback(
    async (key: string) => {
      if (!profile) return;
      const done = { ...profile.checklist_done, [key]: true };
      setProfile({ ...profile, checklist_done: done });
      await supabase.from('profiles').update({ checklist_done: done }).eq('id', profile.id);
    },
    [profile],
  );

  const createVideo = useCallback(
    async (opts: {
      title: string;
      sourceUrl?: string;
      sourceType: 'link' | 'upload';
      mode: 'clips' | 'studio';
      durationMinutes: number;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user || !profile) return;
      if (opts.mode === 'studio' && profile.plan === 'free') {
        showToast('Studio clips are part of paid plans — upgrade in Billing');
        setPage('billing');
        return;
      }
      const { data, error } = await supabase
        .from('videos')
        .insert({
          user_id: userData.user.id,
          title: opts.title,
          source_url: opts.sourceUrl || null,
          source_type: opts.sourceType,
          mode: opts.mode,
          duration_seconds: Math.max(60, opts.durationMinutes * 60),
          status: 'queued',
        })
        .select()
        .single();
      if (error || !data) {
        showToast(error?.message ?? 'Could not create video');
        return;
      }
      await markChecklist('first_video');
      showToast('Analyzing… this takes a few seconds');
      const { error: fnErr } = await supabase.functions.invoke('process-video', {
        body: { videoId: data.id },
      });
      if (fnErr) {
        showToast(fnErr.message);
        await supabase.from('videos').update({ status: 'failed' }).eq('id', data.id);
      } else {
        showToast(opts.mode === 'studio' ? 'Studio clips ready!' : 'Clips ready!');
      }
      await refresh();
    },
    [profile, markChecklist, refresh, showToast],
  );

  const createShortformJob = useCallback(
    async (opts: { url: string; look: string; style: string; instructions: string; minutes: number; autoEdit: boolean }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user || !profile) return;
      if (profile.plan === 'free') {
        showToast('Studio is part of paid plans — upgrade in Billing');
        setPage('billing');
        return;
      }
      const uid = userData.user.id;
      const ws = managers[0]?.id ?? null;
      const { data: job, error } = await supabase
        .from('shortform_jobs')
        .insert({
          user_id: uid,
          workspace_id: ws,
          mode: 'creator',
          kind: 'test',
          title: opts.url.slice(0, 80),
          status: 'analyzing',
          test_config: {
            look: opts.look,
            style: opts.style,
            instructions: opts.instructions || null,
            duration_minutes: opts.minutes,
          },
          auto_edit: opts.autoEdit,
          videos: 1,
        })
        .select()
        .single();
      if (error || !job) {
        showToast(error?.message ?? 'Could not start the studio job');
        return;
      }
      const parts = ['hook', 'body', 'outro'].map((role, i) => ({
        job_id: job.id,
        user_id: uid,
        role,
        position: i,
        content: opts.instructions || `Auto ${role} pass — ${opts.look} look, ${opts.style} style`,
      }));
      const { data: insertedParts, error: partsErr } = await supabase
        .from('shortform_test_parts')
        .insert(parts)
        .select();
      if (partsErr || !insertedParts) {
        await supabase.from('shortform_jobs').delete().eq('id', job.id);
        showToast(partsErr?.message ?? 'Could not build the test parts');
        return;
      }
      const totalSec = Math.max(60, opts.minutes * 60);
      const moments = [0, 1, 2].map((i) => ({
        job_id: job.id,
        user_id: uid,
        rank: i,
        strength: [92, 78, 64][i],
        label: ['Strong claim + payoff', 'Story turn', 'Rapid-fire list'][i],
        transcript: `${opts.look} segment ${i + 1}`,
        start_seconds: Math.round((totalSec / 3) * i),
        end_seconds: Math.round((totalSec / 3) * (i + 1)),
      }));
      const letters = ['A', 'B'];
      const hooks = [
        `The ${opts.look.toLowerCase()} trick nobody tells you about`,
        `I tested ${opts.style.toLowerCase()} editing — here's what happened`,
      ];
      const variations = letters.map((letter, i) => ({
        job_id: job.id,
        user_id: uid,
        body_part_id: insertedParts[Math.min(i, insertedParts.length - 1)].id,
        variation_letter: letter,
        status: 'ready' as const,
        hook_text: hooks[i],
        topic_title: `${opts.look} · Variation ${letter}`,
        duration_ms: Math.round((totalSec / letters.length) * 1000),
        combo_index: i,
        template_index: i,
        auto_edited_at: opts.autoEdit ? new Date().toISOString() : null,
      }));
      const [mErr, vErr] = await Promise.all([
        supabase.from('shortform_moments').insert(moments).then((r) => r.error),
        supabase.from('shortform_variations').insert(variations).then((r) => r.error),
      ]);
      if (mErr || vErr) {
        showToast((mErr ?? vErr)?.message ?? 'Could not finish the studio job');
        return;
      }
      await supabase.from('shortform_jobs').update({ status: 'ready' }).eq('id', job.id);
      await supabase
        .from('profiles')
        .update({ current_credits: Math.max(0, (profile.current_credits ?? 0) - opts.minutes) })
        .eq('id', profile.id);
      showToast(`Studio job ready — ${letters.length} variations generated`);
      await refresh();
    },
    [profile, managers, refresh, showToast],
  );

  const unlockDna = useCallback(async () => {
    if (!profile) return;
    if (!profile.tiktok_connected) {
      showToast('Connect TikTok in Settings → Connections first');
      setPage('settings');
      return;
    }
    if (dna.length) {
      showToast('DNA Profile already unlocked');
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const rows = DNA_POOL.map((p) => ({ ...p, user_id: userData.user!.id, unlocked: true }));
    await supabase.from('dna_patterns').insert(rows);
    await markChecklist('dna');
    showToast('DNA Profile unlocked');
    await refresh();
  }, [profile, dna.length, markChecklist, refresh, showToast]);

  const isPaid = profile ? profile.plan !== 'free' : false;
  const minutesLeft = profile ? profile.minutes_limit - profile.minutes_used : 0;
  const checklist = profile?.checklist_done ?? {};
  const doneCount = ['first_video', 'connected', 'first_post', 'dna'].filter((k) => checklist[k]).length;

  if (session === null || session === undefined) {
    return <div className="gate-loading">Loading…</div>;
  }
  if (!session) return <SigninGate />;

  const planName = profile ? PLANS[profile.plan].name.toUpperCase() : 'FREE';

  return (
    <div className={`shell v2${page === 'gen' ? ' gen-mode' : ''}`}>
      <aside className="sidebar">
        <div className="logo side-logo">
          <span className="logo-mark zlogo">C</span> Cloudnivo
        </div>
        <button className="ws-link" onClick={() => setPage('home')}>
          ‹ All Workspaces
        </button>
        <nav>
          <div className="nav-group">CREATE</div>
          {(
            [
              ['clips', 'Clips', '✂'],
              ['studio', 'Studio', '🎞'],
              ['gen', 'Gen Studio', '✨'],
              ['posts', 'Posts', '🗓'],
            ] as const
          ).map(([id, label, icon]) => (
            <button key={id} className={`side-link${page === id ? ' on' : ''}`} onClick={() => setPage(id)}>
              <span className="side-ic">{icon}</span> {label}
            </button>
          ))}
          <div className="nav-group">GROW</div>
          {(
            [
              ['brand', 'Brand', '◈'],
              ['dna', 'DNA Profile', '✦'],
              ['analytics', 'Analytics', '📊'],
              ['campaigns', 'Campaigns', '📣'],
            ] as const
          ).map(([id, label, icon]) => (
            <button key={id} className={`side-link${page === id ? ' on' : ''}`} onClick={() => setPage(id)}>
              <span className="side-ic">{icon}</span> {label}
            </button>
          ))}
          <div className="nav-group">ACCOUNT</div>
          {(
            [
              ['billing', 'Billing', '💳'],
              ['settings', 'Settings', '⚙'],
            ] as const
          ).map(([id, label, icon]) => (
            <button key={id} className={`side-link${page === id ? ' on' : ''}`} onClick={() => setPage(id)}>
              <span className="side-ic">{icon}</span> {label}
            </button>
          ))}
        </nav>

        <button className="gs-pill" onClick={() => setPage('home')}>
          Getting started · {doneCount}/4
        </button>

        {profile && (
          <div className="plan-card">
            <div className="plan-card-head">
              <span>{planName} PLAN</span>
              <strong>{minutesLeft} min left</strong>
            </div>
            <div className="sp-track">
              <div
                className="sp-fill"
                style={{
                  width: `${profile.minutes_limit ? Math.min(100, Math.round((profile.minutes_used / profile.minutes_limit) * 100)) : 0}%`,
                }}
              />
            </div>
            <div className="plan-card-head">
              <span>AI CREDITS</span>
              <strong>{profile.credits_balance} left</strong>
            </div>
            <em className="plan-resets">Resets {resetLabel()}</em>
            <p>
              {minutesLeft} free minutes left this month (20 minimum per video). Upgrade for more, no
              watermark &amp; analytics.
            </p>
            <button className="btn btn-purple sm wide" onClick={() => setPage('billing')}>
              ⚡ Upgrade Plan
            </button>
          </div>
        )}

        <div className="side-foot">
          <a className="side-link" href="#/">
            ← Back to site
          </a>
          <button
            className="side-link"
            onClick={async () => {
              await supabase.auth.signOut();
              setSession(false);
            }}
          >
            Sign out
          </button>
          <div className="side-legal">Terms · Privacy · DMCA</div>
        </div>
      </aside>

      <main className="app-main">
        {toast && <div className="toast">{toast}</div>}

        {page === 'home' && profile && (
          <HomePage
            profile={profile}
            clips={clips}
            workspaceName={managers[0]?.name ?? 'My Workspace'}
            checklist={checklist}
            doneCount={doneCount}
            onNav={(p) => setPage(p)}
            onPost={setPostClip}
          />
        )}

        {page === 'clips' && profile && (
          <ClipsPage
            profile={profile}
            videos={videos}
            clips={clips}
            minutesLeft={minutesLeft}
            whoseOpen={whoseOpen}
            setWhoseOpen={setWhoseOpen}
            onCreate={createVideo}
            onPost={setPostClip}
            onUpgrade={() => setPage('billing')}
          />
        )}

        {page === 'studio' && profile && (
          <StudioPage
            profile={profile}
            jobs={sfJobs}
            variations={sfVars}
            onCreate={createShortformJob}
          />
        )}

        {page === 'gen' && profile && (
          <GenPage profile={profile} showToast={showToast} refresh={refresh} />
        )}

        {page === 'posts' && (
          <div className="page-pad">
            {!isPaid ? (
              <div className="paygate">
                <h3>Posting is a paid feature</h3>
                <p>Post and schedule to TikTok and YouTube — up to 15 posts a day, depending on your plan.</p>
                <button className="btn btn-purple" onClick={() => setPage('billing')}>
                  Upgrade your plan
                </button>
              </div>
            ) : (
              <PostsList posts={posts} clips={clips} markChecklist={markChecklist} refresh={refresh} />
            )}
          </div>
        )}

        {page === 'brand' && profile && (
          <BrandPage profile={profile} isPaid={isPaid} onSaved={setProfile} showToast={showToast} />
        )}

        {page === 'dna' && (
          <DnaPage dna={dna} profile={profile} onUnlock={unlockDna} onUpgrade={() => setPage('billing')} />
        )}

        {page === 'analytics' && profile && (
          <AnalyticsPage
            profile={profile}
            posts={posts}
            isPaid={isPaid}
            onNav={(p) => setPage(p)}
            showToast={showToast}
          />
        )}

        {page === 'campaigns' && (
          <div className="page-pad">
            <div className="page-head-row">
              <div>
                <h2 className="app-h">Campaigns</h2>
                <p className="app-sub">
                  Get paid per million views for videos you post on your own account.
                </p>
              </div>
              <a
                className="lnk"
                onClick={(e) => {
                  e.preventDefault();
                  showToast('Earnings open after your first campaign post');
                }}
              >
                Your earnings
              </a>
            </div>
            <div className="campaign-grid">
              {CAMPAIGNS.map((c) => (
                <div className="campaign-card" key={c.title}>
                  <div className="campaign-art">
                    <span className="campaign-brand">{c.brand}</span>
                    <strong>{c.title}</strong>
                  </div>
                  <div className="campaign-kind">
                    {c.kind} <em className="open-chip">Open</em>
                  </div>
                  <h3>{c.brand === '@cloudnivo' ? 'Cloudnivo Clipping' : 'Cloudnivo UGC'}</h3>
                  <div className="campaign-rate">{c.rate}</div>
                  <div className="campaign-stats">
                    <div>
                      <em>Budget left</em>
                      <strong>{c.budget}</strong>
                    </div>
                    <div>
                      <em>Paid out so far</em>
                      <strong>{c.paid}</strong>
                    </div>
                  </div>
                  <button
                    className="btn btn-purple wide"
                    onClick={() => showToast('Joined! Post clips with the campaign hashtag to earn.')}
                  >
                    Join Campaign
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {page === 'billing' && profile && (
          <BillingPage profile={profile} showToast={showToast} refresh={refresh} />
        )}

        {page === 'settings' && profile && (
          <SettingsPage
            profile={profile}
            onSaved={setProfile}
            showToast={showToast}
            onConnected={() => {
              refresh();
              markChecklist('connected');
            }}
          />
        )}
      </main>

      {postClip && (
        <PostModal
          clip={postClip}
          onClose={() => setPostClip(null)}
          onDone={async () => {
            setPostClip(null);
            await markChecklist('first_post');
            await refresh();
            showToast('Done — see the Posts page');
          }}
        />
      )}
    </div>
  );
}

/* ---------------- pages ---------------- */

function HomePage({
  profile,
  clips,
  workspaceName,
  checklist,
  doneCount,
  onNav,
  onPost,
}: {
  profile: Profile;
  clips: Clip[];
  workspaceName: string;
  checklist: Record<string, boolean>;
  doneCount: number;
  onNav: (p: Page) => void;
  onPost: (c: Clip) => void;
}) {
  const items: Array<[string, string, string, string, Page]> = [
    ['first_video', 'Make your first clips', 'Turn a long video into short clips in a few minutes.', 'Create clips', 'clips'],
    ['connected', 'Connect TikTok or YouTube', 'So you can post straight from Cloudnivo and unlock your DNA.', 'Connect', 'settings'],
    ['first_post', 'Post or schedule a clip', 'Post now or schedule a week ahead — TikTok and YouTube.', checklist.first_post ? 'Go to your clips' : '🔒 Go to your clips', 'clips'],
    ['dna', 'Unlock your DNA Profile', 'See which hooks and topics go viral for you, then create clips with that recipe.', 'Connect TikTok first', 'dna'],
  ];
  return (
    <div className="page-pad">
      <div className="home-top">
        <div className="checklist card">
          <div className="card-head">
            <h3>Getting started</h3>
            <em>{doneCount} of 4 done</em>
          </div>
          {items.map(([k, t, d, cta, target], i) => (
            <div className={`check-item${checklist[k] ? ' done' : ''}`} key={k}>
              <span className="check-num">{i + 1}</span>
              <div>
                <strong>{t}</strong>
                <p>{d}</p>
              </div>
              {!checklist[k] && (
                <button className="btn btn-outline sm" onClick={() => onNav(target)}>
                  {cta}
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="home-side">
          <div className="card ws-card">
            <div className="ws-avatar">{workspaceName[0]?.toUpperCase() ?? 'M'}</div>
            <strong>{workspaceName}</strong>
            <p>Welcome back, {profile.display_name ?? 'creator'}.</p>
          </div>
          <div className="card discord-card">
            <strong>Join the Cloudnivo Discord</strong>
            <p>Support, giveaways, early access &amp; tutorials with other creators.</p>
            <button className="btn btn-outline sm" onClick={() => onNav('campaigns')}>
              Join Discord
            </button>
          </div>
        </div>
      </div>

      <div className="nav-group" style={{ marginTop: 24 }}>
        QUICK ACTIONS
      </div>
      <div className="qa-grid">
        {(
          [
            ['Clips', 'Fast clips from a link or upload', 'clips'],
            ['Studio', 'Edit your talking-head videos', 'studio'],
            ['Posts', 'Your posting calendar', 'posts'],
            ['DNA Profile', 'What goes viral for you', 'dna'],
            ['Analytics', 'TikTok and YouTube performance', 'analytics'],
            ['Settings', 'Account, connections, workspace', 'settings'],
          ] as const
        ).map(([t, d, p]) => (
          <button className="qa-card" key={t} onClick={() => onNav(p)}>
            <strong>{t}</strong>
            <span>{d}</span>
          </button>
        ))}
      </div>

      <div className="nav-group" style={{ marginTop: 24 }}>
        BRAND ASSETS
      </div>
      <div className="card brand-assets">
        <div className="ws-avatar big">M</div>
        <div>
          <strong>Square Logo</strong>
          <p>Profile / watermark</p>
        </div>
        <button className="btn btn-outline sm" style={{ marginLeft: 'auto' }} onClick={() => onNav('brand')}>
          Generate logo
        </button>
      </div>

      <h3 className="app-h3">Top clips</h3>
      {clips.length === 0 && <p className="app-sub">No clips yet — paste a video in Clips.</p>}
      <div className="clip-grid">
        {clips.slice(0, 4).map((c) => (
          <ClipCardView key={c.id} clip={c} onPost={onPost} />
        ))}
      </div>
    </div>
  );
}

function ClipsPage({
  profile,
  videos,
  clips,
  minutesLeft,
  whoseOpen,
  setWhoseOpen,
  onCreate,
  onPost,
  onUpgrade,
}: {
  profile: Profile;
  videos: Video[];
  clips: Clip[];
  minutesLeft: number;
  whoseOpen: boolean;
  setWhoseOpen: (v: boolean) => void;
  onCreate: (o: { title: string; sourceUrl?: string; sourceType: 'link' | 'upload'; mode: 'clips' | 'studio'; durationMinutes: number }) => void;
  onPost: (c: Clip) => void;
  onUpgrade: () => void;
}) {
  const [tab, setTab] = useState<'link' | 'upload'>('link');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [mins, setMins] = useState(45);
  const [openSet, setOpenSet] = useState<string | null>(null);
  const [howOpen, setHowOpen] = useState(true);

  if (openSet) {
    const v = videos.find((x) => x.id === openSet);
    const vclips = clips.filter((c) => c.video_id === openSet);
    return (
      <div className="page-pad">
        <button className="lnk" onClick={() => setOpenSet(null)}>
          ← Back
        </button>
        <h2 className="app-h">{v?.title}</h2>
        <p className="app-sub">{vclips.length} clips</p>
        <div className="set-grid">
          {vclips.map((c, i) => (
            <ClipCardView key={c.id} clip={{ ...c, title: `Clip ${i + 1} — ${c.title}` }} onPost={onPost} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page-pad">
      <h2 className="app-h">Clips</h2>
      <p className="app-sub">Fast clips from a link or upload</p>
      <button className="lnk" onClick={() => setHowOpen((o) => !o)}>
        ? How Clips works
      </button>
      {howOpen && (
        <div className="how-card">
          <ol>
            <li>Paste a link or upload a video.</li>
            <li>Pick the part to clip and the clip type.</li>
            <li>Your clips appear here in a few minutes.</li>
            <li>Open a clip to edit it, or press Post.</li>
          </ol>
          <p className="form-note">Tip: Parts mode splits long videos into ~1:30 chapters.</p>
          <button className="btn btn-ghost sm" onClick={() => setHowOpen(false)}>
            Got it
          </button>
        </div>
      )}

      <div className="card create-card">
        <h3>Create a new clip set</h3>
        <p className="app-sub">Paste a link or upload — AI finds the best moments</p>
        <div className="tab-row">
          <button className={`tab${tab === 'link' ? ' on' : ''}`} onClick={() => setTab('link')}>
            Paste a link
          </button>
          <button className={`tab${tab === 'upload' ? ' on' : ''}`} onClick={() => setTab('upload')}>
            Upload
          </button>
          <span className="mins-chip">{minutesLeft} minutes left</span>
          <span className="mins-chip">{PLANS[profile.plan].name.toUpperCase()} PLAN</span>
        </div>
        {tab === 'link' ? (
          <div className="form-row">
            <input
              className="input grow"
              placeholder="https://youtube.com/watch?v=…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button
              className="btn btn-purple"
              disabled={!url.trim()}
              onClick={() => {
                setWhoseOpen(true);
                onCreate({ title: url.trim().slice(0, 80), sourceUrl: url.trim(), sourceType: 'link', mode: 'clips', durationMinutes: mins });
              }}
            >
              Generate Clips
            </button>
          </div>
        ) : (
          <div className="form-row">
            <input className="input" placeholder="Video title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <input
              className="input small"
              type="number"
              min={1}
              max={180}
              value={mins}
              onChange={(e) => setMins(Number(e.target.value) || 1)}
              title="Duration in minutes"
            />
            <button
              className="btn btn-purple"
              disabled={!title.trim()}
              onClick={() => onCreate({ title: title.trim(), sourceType: 'upload', mode: 'clips', durationMinutes: mins })}
            >
              Generate Clips
            </button>
          </div>
        )}
        <p className="form-note">
          {profile.plan === 'free'
            ? `Free plan: 1 watermark-free clip a month · 1 left · resets ${resetLabel()}. `
            : `${PLANS[profile.plan].name}: ${minutesLeft} minutes left · resets ${resetLabel()}. `}
          Posting and scheduling are on paid plans.{' '}
          <a className="lnk" onClick={(e) => { e.preventDefault(); onUpgrade(); }}>
            Upgrade
          </a>
        </p>
      </div>

      <h3 className="app-h3">Your clip sets</h3>
      {videos.filter((v) => v.mode === 'clips').length === 0 && (
        <p className="app-sub">No clips yet — paste a video URL above to generate your first clip set.</p>
      )}
      {videos
        .filter((v) => v.mode === 'clips')
        .map((v) => {
          const vclips = clips.filter((c) => c.video_id === v.id);
          return (
            <div className="video-block" key={v.id}>
              <div className="video-head">
                <strong>{v.title}</strong>
                <span className={`status s-${v.status}`}>{v.status}</span>
                {vclips.length > 0 && (
                  <button className="btn btn-outline sm" onClick={() => setOpenSet(v.id)}>
                    Explore →
                  </button>
                )}
              </div>
              {vclips.length > 0 && (
                <div className="clip-grid">
                  {vclips.slice(0, 4).map((c) => (
                    <ClipCardView key={c.id} clip={c} onPost={onPost} />
                  ))}
                </div>
              )}
            </div>
          );
        })}

      {whoseOpen && (
        <div className="modal-back" onClick={() => setWhoseOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Whose videos will you turn into clips?</h3>
            <div className="whose-grid">
              <button className="whose-opt" onClick={() => setWhoseOpen(false)}>
                <strong>My own videos</strong>
                <span>I film, stream or podcast my own content</span>
              </button>
              <button className="whose-opt" onClick={() => setWhoseOpen(false)}>
                <strong>Other creators' videos</strong>
                <span>I clip streams, podcasts or shows made by others</span>
              </button>
            </div>
            <button className="btn btn-ghost sm" onClick={() => setWhoseOpen(false)}>
              Skip
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StudioPage({
  profile,
  jobs,
  variations,
  onCreate,
}: {
  profile: Profile;
  jobs: ShortformJob[];
  variations: ShortformVariation[];
  onCreate: (o: { url: string; look: string; style: string; instructions: string; minutes: number; autoEdit: boolean }) => void;
}) {
  const [look, setLook] = useState('Explainer');
  const [style, setStyle] = useState('Blueprint');
  const [url, setUrl] = useState('');
  const [mins, setMins] = useState(5);
  const [instructions, setInstructions] = useState('');
  const [howOpen, setHowOpen] = useState(false);

  return (
    <div className="page-pad">
      <div className="page-head-row">
        <div>
          <h2 className="app-h">Cloudnivo Studio</h2>
          <p className="app-sub">Edit your talking-head videos. Drop them in, pick a look, get finished shorts.</p>
        </div>
        <span className="studio-chip">✦ {profile.studio_clips_limit - profile.studio_clips_used} Studio clips</span>
      </div>
      <button className="lnk" onClick={() => setHowOpen((o) => !o)}>
        ? How this works
      </button>
      {howOpen && (
        <div className="how-card">
          <ol>
            <li>Drop in one or more talking-head videos (up to 7:00 total).</li>
            <li>Pick a look — Explainer, Hyper or Classic — and a style.</li>
            <li>Studio cuts silences, adds captions and designed scenes.</li>
          </ol>
          <button className="btn btn-ghost sm" onClick={() => setHowOpen(false)}>
            Got it
          </button>
        </div>
      )}

      <div className="card create-card">
        <div className="dropzone">Drop your videos here · or paste a link below · up to 7:00 in total</div>
        <div className="form-row" style={{ marginTop: 12 }}>
          <input
            className="input grow"
            placeholder="https://youtube.com/watch?v=…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <input
            className="input small"
            type="number"
            min={1}
            max={7}
            value={mins}
            onChange={(e) => setMins(Number(e.target.value) || 1)}
            title="Minutes"
          />
        </div>

        <h4 className="sec-h">Pick a look</h4>
        <div className="look-grid">
          {(
            [
              ['Explainer', 'Diagrams build on your words. For teaching and explaining.'],
              ['Hyper', 'Fast cuts, zooms, bold captions and designed scenes. Keeps people watching.'],
              ['Classic', 'Clean cuts and captions.'],
            ] as const
          ).map(([name, desc]) => (
            <button className={`look-card${look === name ? ' on' : ''}`} key={name} onClick={() => setLook(name)}>
              <div className="look-art">{name === 'Hyper' ? 'KEY WORD' : name === 'Classic' ? 'clean captions' : '▭ ▭ ▭'}</div>
              <strong>{name}</strong>
              <span>{desc}</span>
            </button>
          ))}
        </div>
        <div className="chip-row">
          {['Blueprint', 'Paper', 'Neon', 'Brand'].map((s) => (
            <button className={`pub-chip pick${style === s ? ' on' : ''}`} key={s} onClick={() => setStyle(s)}>
              {s}
            </button>
          ))}
        </div>

        <div className="brand-row">
          <span>🏷 Brand library</span>
          <a className="lnk" onClick={(e) => e.preventDefault()}>
            Add your brand
          </a>
        </div>

        <h4 className="sec-h">Your b-roll for this edit</h4>
        <div className="dropzone slim">Drop pictures or short videos · up to 10, 50 MB each</div>
        <p className="form-note">Used only in this edit. To reuse something in every edit, add it to your Brand library.</p>

        <details className="instr">
          <summary>+ Add instructions (optional)</summary>
          <textarea
            className="input"
            rows={2}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="e.g. keep the intro, cut the sponsor section"
          />
        </details>

        <button
          className="btn btn-purple big wide"
          disabled={!url.trim()}
          onClick={() =>
            onCreate({
              url: url.trim(),
              look,
              style,
              instructions,
              minutes: mins,
              autoEdit: true,
            })
          }
        >
          Edit my videos
        </button>
        <p className="form-note" style={{ textAlign: 'center' }}>
          Want to test different hooks?{' '}
          <a className="lnk" onClick={(e) => e.preventDefault()}>
            A/B test your videos →
          </a>
        </p>
      </div>

      <div className="nav-group">YOUR STUDIO JOBS</div>
      {jobs.length === 0 && (
        <p className="app-sub">Your edited videos show up here. Drop a video above to start.</p>
      )}
      {jobs.map((job) => {
        const cfg = (job.test_config ?? {}) as { look?: string; style?: string };
        const jvars = variations.filter((v) => v.job_id === job.id);
        return (
          <div className="video-block" key={job.id}>
            <div className="video-head">
              <strong>
                {cfg.look ?? 'Studio'} · {cfg.style ?? 'Edit'}
              </strong>
              <span className={`status s-${job.status}`}>{job.status}</span>
              <em className="mins-chip">A/B test · {jvars.length} variations</em>
            </div>
            {jvars.length > 0 && (
              <div className="clip-grid">
                {jvars.map((v) => (
                  <div className="app-clip" key={v.id}>
                    <div className="app-clip-screen" style={{ aspectRatio: '9/16' }}>
                      <div className="clip-top">
                        <span className="clip-src">VARIATION {v.variation_letter}</span>
                        <ScoreBadge score={92 - v.combo_index * 5} />
                      </div>
                      <div className="clip-caption">{v.hook_text ?? v.topic_title}</div>
                      <div className="clip-views">
                        {v.duration_ms ? fmtTime(Math.round(v.duration_ms / 1000)) : '—'}
                      </div>
                      {v.auto_edited_at && <div className="wm">✦ auto-edited</div>}
                    </div>
                    <div className="app-clip-meta">
                      <div className="app-clip-times">{v.topic_title}</div>
                      <span className={`status s-${v.status}`}>{v.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PostsList({
  posts,
  clips,
  markChecklist,
  refresh,
}: {
  posts: Post[];
  clips: Clip[];
  markChecklist: (k: string) => Promise<void>;
  refresh: () => Promise<void>;
}) {
  return (
    <>
      <h2 className="app-h">Posts</h2>
      <p className="app-sub">Everything you have posted or scheduled, newest first.</p>
      {posts.length === 0 && <p className="app-sub">No posts yet.</p>}
      <div className="post-list">
        {posts.map((p) => {
          const clip = clips.find((c) => c.id === p.clip_id);
          return (
            <div className="post-row" key={p.id}>
              <div>
                <strong>{clip?.title?.slice(0, 48) ?? 'Clip'}…</strong>
                <span className="post-meta">
                  {p.platform} · {new Date(p.scheduled_for).toLocaleString()}
                </span>
              </div>
              {p.status === 'posted' ? (
                <span className="post-stats">
                  ▶ {p.views.toLocaleString()} views · ♥ {p.likes.toLocaleString()}
                </span>
              ) : (
                <div className="post-actions">
                  <button
                    className="btn btn-outline sm"
                    onClick={async () => {
                      await supabase.from('posts').delete().eq('id', p.id);
                      refresh();
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-purple sm"
                    onClick={async () => {
                      const views = 900 + Math.floor(Math.random() * 60000);
                      await supabase
                        .from('posts')
                        .update({ status: 'posted', scheduled_for: new Date().toISOString(), views, likes: Math.floor(views * 0.08) })
                        .eq('id', p.id);
                      if (clip)
                        await supabase
                          .from('clips')
                          .update({ posted_at: new Date().toISOString(), platform: p.platform })
                          .eq('id', clip.id);
                      await markChecklist('first_post');
                      refresh();
                    }}
                  >
                    Post now
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function BrandPage({
  profile,
  isPaid,
  onSaved,
  showToast,
}: {
  profile: Profile;
  isPaid: boolean;
  onSaved: (p: Profile) => void;
  showToast: (m: string) => void;
}) {
  const [name, setName] = useState(profile.display_name ?? '');
  const [color, setColor] = useState(profile.brand_color ?? '#8b5cf6');
  const [font, setFont] = useState(profile.brand_font ?? 'inter');
  const [cta, setCta] = useState(profile.brand_cta ?? 'Follow for more');
  const [site, setSite] = useState('');
  const [showBanner, setShowBanner] = useState(true);
  const [platforms, setPlatforms] = useState<string[]>(['TikTok', 'YouTube']);

  async function saveKit() {
    const { data, error } = await supabase
      .from('profiles')
      .update({ display_name: name, brand_color: color, brand_font: font, brand_cta: cta })
      .eq('id', profile.id)
      .select()
      .single();
    if (!error && data) {
      onSaved(data as Profile);
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        const kit = {
          user_id: userData.user.id,
          brand_name: name,
          primary_color: color,
          font_choice: font,
          cta_text: cta,
        };
        const { data: existing } = await supabase
          .from('brand_kits')
          .select('id')
          .eq('user_id', userData.user.id)
          .order('created_at', { ascending: false })
          .limit(1);
        if (existing && existing.length > 0) {
          await supabase.from('brand_kits').update(kit).eq('id', existing[0].id);
        } else {
          await supabase.from('brand_kits').insert(kit);
        }
      }
      showToast('Brand Kit saved');
    }
  }

  return (
    <div className="page-pad">
      <h2 className="app-h">Brand</h2>
      <p className="app-sub">Your pictures, videos, logo and colors, ready for every edit.</p>

      <h3 className="app-h3">Brand library</h3>
      <p className="app-sub">
        Your own pictures and short videos. One Click Edit shows them when what you say matches the
        note, and adds your intro and outro.
      </p>
      <div className="card gate-strip">
        <span>Brand library is part of paid plans. · 0 of 50 items</span>
        <button className="btn btn-outline sm" onClick={() => showToast('Brand library unlocks on paid plans')}>
          {isPaid ? '+ Add item' : 'See plans'}
        </button>
      </div>

      <h3 className="app-h3">Social banner</h3>
      <p className="app-sub">Your logos and name on every clip. You can change it for any batch when you make clips.</p>
      <div className="card gate-strip">
        <span>Social banners are part of paid plans.</span>
        <button className="btn btn-outline sm" onClick={() => showToast('Social banners unlock on paid plans')}>
          See plans
        </button>
      </div>
      <div className="card">
        <label className="radio">
          <input type="checkbox" checked={showBanner} onChange={(e) => setShowBanner(e.target.checked)} /> Show on new
          clips
        </label>
        <div className="chip-row wrap">
          {PLATFORMS.map((p) => (
            <button
              key={p}
              className={`pub-chip pick${platforms.includes(p) ? ' on' : ''}`}
              onClick={() => setPlatforms((ps) => (ps.includes(p) ? ps.filter((x) => x !== p) : [...ps, p]))}
            >
              {p}
            </button>
          ))}
        </div>
        <label className="set-label">Name to show</label>
        <input className="input" placeholder="Letters, numbers, spaces and . _ - @ & ' ! only." />
        <button className="btn btn-purple sm" onClick={() => showToast('Banner saved')}>
          Save banner
        </button>
      </div>

      <h3 className="app-h3">Brand Kit</h3>
      <p className="app-sub">Visual identity for your content</p>
      <div className="card">
        <div className="kit-grid">
          <div>
            <label className="set-label">Logo</label>
            <div className="logo-slot">{profile.display_name?.[0]?.toUpperCase() ?? 'C'}</div>
            <button className="btn btn-outline sm">Upload logo</button>
          </div>
          <div>
            <label className="set-label">Primary Color</label>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
            <label className="set-label">Font</label>
            <select className="input" value={font} onChange={(e) => setFont(e.target.value)}>
              {FONTS.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="set-label">Brand name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            <label className="set-label">Website</label>
            <input className="input" value={site} onChange={(e) => setSite(e.target.value)} placeholder="cloudnivo.org" />
            <label className="set-label">CTA Text</label>
            <input className="input" value={cta} onChange={(e) => setCta(e.target.value)} />
          </div>
        </div>
        <p className="form-note">Explainer edits spell your brand this way and show its logo from this site.</p>
        <button className="btn btn-purple" onClick={saveKit}>
          Save Brand Kit
        </button>
      </div>
    </div>
  );
}

function DnaPage({
  dna,
  profile,
  onUnlock,
  onUpgrade,
}: {
  dna: DnaPattern[];
  profile: Profile | null;
  onUnlock: () => void;
  onUpgrade: () => void;
}) {
  const [tab, setTab] = useState<'profile' | 'performance' | 'patterns' | 'trends' | 'advisor'>('profile');
  const connected = profile?.tiktok_connected ?? false;

  return (
    <div className="page-pad">
      <h2 className="app-h">DNA Profile</h2>
      <p className="app-sub">Your content intelligence hub — {dna.length ? 'unlocked' : '0 clips analyzed'}</p>

      <div className="card how-card">
        <strong>How DNA Profile works</strong>
        <p>
          DNA studies the TikToks you've already posted to find what goes viral for your audience — the
          hooks, topics, tone and visuals behind your best clips.
        </p>
        <ul>
          <li>Profile: what works for you overall</li>
          <li>Performance: which hooks and tones win</li>
          <li>Patterns: combinations worth repeating</li>
          <li>Trends: how you're improving</li>
          <li>Advisor: ask anything about your strategy</li>
        </ul>
        <p className="form-note">Found a winning pattern? Press Use this recipe and Clips will aim for it.</p>
      </div>

      {!connected ? (
        <div className="card unlock-steps">
          <h3>Unlock your DNA Profile</h3>
          <ol>
            <li>Connect TikTok</li>
            <li>Analyze at least 2 of your TikToks below — free, about a minute each · 0 of 2</li>
            <li>Come back here — your DNA fills in</li>
          </ol>
          <button className="btn btn-purple" onClick={onUnlock}>
            Analyze your clips
          </button>
          <p className="form-note">Each analysis sharpens your DNA profile below.</p>
          <p className="form-note">Connect TikTok to analyze clips →</p>
        </div>
      ) : (
        <>
          <div className="tab-row">
            {(
              [
                ['profile', 'Profile'],
                ['performance', 'Performance'],
                ['patterns', 'Patterns'],
                ['trends', 'Trends'],
                ['advisor', 'Advisor'],
              ] as const
            ).map(([id, label]) => (
              <button key={id} className={`tab${tab === id ? ' on' : ''}`} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
          {dna.length === 0 ? (
            <div className="card unlock-steps">
              <p>Analyze some TikTok clips to unlock your Account DNA.</p>
              <button className="btn btn-purple" onClick={onUnlock}>
                Analyze your clips
              </button>
            </div>
          ) : (
            <>
              {tab === 'profile' && (
                <div className="dna-cols">
                  {(['hook', 'category', 'visual'] as const).map((cat) => (
                    <div className="dna-col" key={cat}>
                      <div className="sp-title">{cat.toUpperCase()} PERFORMANCE</div>
                      {dna
                        .filter((d) => d.category === cat)
                        .map((d) => (
                          <div className="sp-row" key={d.id}>
                            <span>{d.label}</span>
                            <div className="sp-track">
                              <div className="sp-fill" style={{ width: `${d.score}%` }} />
                            </div>
                            <em>{d.score}</em>
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
              )}
              {tab === 'performance' && (
                <div className="dna-cols">
                  {dna
                    .filter((d) => d.category === 'hook')
                    .map((d) => (
                      <div className="sp-row" key={d.id}>
                        <span>{d.label}</span>
                        <div className="sp-track">
                          <div className="sp-fill" style={{ width: `${d.score}%` }} />
                        </div>
                        <em>{d.score}</em>
                      </div>
                    ))}
                </div>
              )}
              {tab === 'patterns' && (
                <div className="card">
                  <p>
                    Best combo right now: <strong>{dna[0]?.label}</strong> + facecam close-ups. Press{' '}
                    <a className="lnk" onClick={(e) => e.preventDefault()}>
                      Use this recipe
                    </a>{' '}
                    and Clips will aim for it.
                  </p>
                </div>
              )}
              {tab === 'trends' && (
                <div className="card">
                  <p>Your hook scores improved ~12% over your last 5 posts. Storytime openers are trending up.</p>
                </div>
              )}
              {tab === 'advisor' && (
                <div className="card">
                  <p>
                    Advisor is part of paid plans.{' '}
                    <a className="lnk" onClick={(e) => { e.preventDefault(); onUpgrade(); }}>
                      Upgrade to Unlock
                    </a>
                  </p>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function AnalyticsPage({
  profile,
  posts,
  isPaid,
  onNav,
  showToast,
}: {
  profile: Profile;
  posts: Post[];
  isPaid: boolean;
  onNav: (p: Page) => void;
  showToast: (m: string) => void;
}) {
  const [network, setNetwork] = useState<'tiktok' | 'youtube'>('tiktok');
  const connected = network === 'tiktok' ? profile.tiktok_connected : profile.youtube_connected;
  const posted = posts.filter((p) => p.status === 'posted' && (network === 'tiktok' ? p.platform === 'tiktok' : p.platform === 'youtube'));

  return (
    <div className="page-pad">
      <div className="tab-row">
        <button className={`tab${network === 'tiktok' ? ' on' : ''}`} onClick={() => setNetwork('tiktok')}>
          TikTok
        </button>
        <button className={`tab${network === 'youtube' ? ' on' : ''}`} onClick={() => setNetwork('youtube')}>
          YouTube
        </button>
      </div>
      <h2 className="app-h">{network === 'tiktok' ? 'TikTok' : 'YouTube'} Analytics</h2>
      <p className="app-sub">Performance insights from your {network === 'tiktok' ? 'TikTok' : 'YouTube'} account</p>

      {!connected ? (
        <div className="card unlock-steps">
          <h3>{network === 'tiktok' ? "TikTok isn't connected yet" : "YouTube isn't connected yet"}</h3>
          <p>Sync your analytics automatically and post clips straight from Cloudnivo.</p>
          <button className="btn btn-purple" onClick={() => onNav('settings')}>
            Connect {network === 'tiktok' ? 'TikTok' : 'YouTube'}
          </button>
        </div>
      ) : posted.length === 0 ? (
        <p className="app-sub">Post a clip to start collecting performance data.</p>
      ) : !isPaid ? (
        <div className="paygate">
          <h3>Unlock {network === 'tiktok' ? 'TikTok' : 'YouTube'} Analytics</h3>
          <p>See exactly how your clips perform — and what to post next.</p>
          <button className="btn btn-purple" onClick={() => onNav('billing')}>
            Upgrade to Unlock
          </button>
        </div>
      ) : (
        <>
          <div className="stats-row app-stats">
            <div className="stat">
              <div className="stat-v">{posted.reduce((a, p) => a + p.views, 0).toLocaleString()}</div>
              <div className="stat-l">views</div>
            </div>
            <div className="stat">
              <div className="stat-v">{posted.reduce((a, p) => a + p.likes, 0).toLocaleString()}</div>
              <div className="stat-l">likes</div>
            </div>
            <div className="stat">
              <div className="stat-v">{posted.length}</div>
              <div className="stat-l">posts</div>
            </div>
          </div>
          <div className="pub-graph tall">
            {posted.slice(0, 14).map((p) => (
              <span key={p.id} style={{ height: `${Math.max(8, Math.round((p.views / 90000) * 100))}%` }} title={`${p.views} views`} />
            ))}
          </div>
        </>
      )}
      <button className="btn btn-outline sm" style={{ marginTop: 12 }} onClick={() => showToast('Analytics sync a few times a day')}>
        Refresh data
      </button>
    </div>
  );
}

function BillingPage({
  profile,
  showToast,
  refresh,
}: {
  profile: Profile;
  showToast: (m: string) => void;
  refresh: () => Promise<void>;
}) {
  const [annual, setAnnual] = useState(false);
  const [family, setFamily] = useState<'creator' | 'influencer' | 'suite'>('creator');

  const families: Record<typeof family, Array<{ key: 'starter' | 'pro'; name: string; desc: string; flag?: string; chips: Array<[string, string]>; features: string[] }>> = {
    creator: [
      {
        key: 'starter',
        name: 'Cloudnivo Starter',
        desc: 'Try posting: clip your videos and post the best ones.',
        chips: [['5', 'TikTok posts / day'], ['200', 'minutes / mo'], ['200', 'AI credits / mo'], ['1', 'workspace']],
        features: [
          'Post and schedule every clip to TikTok & YouTube',
          'Up to 5 TikTok posts a day per account',
          'Watermark-free exports',
          'Brand library: your own pictures, videos, intro and outro in your edits',
          'Turbo Downloads: clips ready in about 10 seconds',
          'Long-form videos → AI-graded short clips',
          'Virality scores & predicted views per clip',
          'Auto captions & silence cutting',
          '3 Studio clips a month, each with a Director edit',
          'TikTok & YouTube analytics',
          'DNA Profile & AI content advisor',
          'Email Support',
        ],
      },
      {
        key: 'pro',
        name: 'Cloudnivo Pro',
        desc: 'For weekly clippers posting volume across channels.',
        flag: 'BEST FOR CLIPPERS',
        chips: [['10', 'TikTok posts / day'], ['600', 'minutes / mo'], ['500', 'AI credits / mo'], ['3', 'workspaces']],
        features: [
          'Post and schedule every clip to TikTok & YouTube',
          'Up to 10 TikTok posts a day per account',
          'Watermark-free exports',
          'Brand library: your own pictures, videos, intro and outro in your edits',
          'Turbo Downloads: clips ready in about 10 seconds',
          'Long-form videos → AI-graded short clips',
          'Virality scores & predicted views per clip',
          'Auto captions & silence cutting',
          '3 Studio clips a month, each with a Director edit',
          'TikTok & YouTube analytics',
          'DNA Profile & AI content advisor',
          'Priority Support',
        ],
      },
    ],
    influencer: [
      {
        key: 'starter',
        name: 'Creator Starter',
        desc: 'Get started turning one video into shareable variations.',
        chips: [['5', 'TikTok posts / day'], ['21', 'Studio clips / mo'], ['1', 'workspace']],
        features: [
          'Post and schedule every clip to TikTok & YouTube',
          'Watermark-free exports',
          'Brand library',
          'One video → platform-ready variations',
          'Studio with Reaction Library & Brand Kit',
          'TikTok & YouTube analytics',
          'DNA Profile & AI content advisor',
          'Email Support',
        ],
      },
      {
        key: 'pro',
        name: 'Creator Pro',
        desc: 'More variations across platforms, ready to scale.',
        flag: 'RECOMMENDED',
        chips: [['10', 'TikTok posts / day'], ['60', 'Studio clips / mo'], ['3', 'workspaces']],
        features: [
          'Post and schedule every clip to TikTok & YouTube',
          'Watermark-free exports',
          'Brand library',
          'One video → platform-ready variations',
          'Studio with Reaction Library & Brand Kit',
          'TikTok & YouTube analytics',
          'DNA Profile & AI content advisor',
          'Priority Support',
        ],
      },
    ],
    suite: [
      {
        key: 'starter',
        name: 'Suite Starter',
        desc: 'Everything, together — for teams.',
        chips: [['5', 'TikTok posts / day'], ['600', 'minutes / mo'], ['10', 'Studio clips / mo']],
        features: ['Everything in Pro', 'Team workspaces', 'Shared brand kits', 'Email Support'],
      },
      {
        key: 'pro',
        name: 'Suite Pro',
        desc: 'Everything, together — for teams at volume.',
        flag: 'BEST VALUE',
        chips: [['15', 'TikTok posts / day'], ['1800', 'minutes / mo'], ['30', 'Studio clips / mo']],
        features: ['Everything in Starter', 'Priority Support', 'Campaign payouts', 'API access (soon)'],
      },
    ],
  };

  async function subscribe(key: 'starter' | 'pro') {
    const plan = PLANS[key];
    await supabase
      .from('profiles')
      .update({
        plan: key,
        minutes_limit: plan.minutes,
        studio_clips_limit: plan.studio,
        credits_limit: plan.credits,
        credits_balance: plan.credits,
      })
      .eq('id', profile.id);
    showToast(`${plan.name} applied — ${plan.credits} AI credits added`);
    refresh();
  }

  return (
    <div className="page-pad">
      <h2 className="app-h">Choose Your Plan</h2>
      <p className="app-sub">
        You're on the <strong>{PLANS[profile.plan].name} plan</strong> — you have{' '}
        {profile.minutes_limit - profile.minutes_used} free minutes left this month. Pick a plan to post
        and schedule every clip, watermark-free.
      </p>
      <div className="toggle-row">
        <span>Monthly</span>
        <button className={`switch${annual ? ' on' : ''}`} onClick={() => setAnnual((a) => !a)} aria-label="Toggle annual" />
        <span>Annual</span>
        <em className="save-chip">Save ~20%</em>
      </div>
      <div className="tab-row">
        {(
          [
            ['creator', 'Creator', 'Long-form → clips'],
            ['influencer', 'Influencer', 'One video → variations'],
            ['suite', 'Suite', 'Everything, together'],
          ] as const
        ).map(([id, label, sub]) => (
          <button key={id} className={`tab${family === id ? ' on' : ''}`} onClick={() => setFamily(id)}>
            <strong>{label}</strong>
            <em>{sub}</em>
          </button>
        ))}
      </div>
      <div className="billing-grid">
        {families[family].map((p) => {
          const price = p.key === 'starter' ? 15 : 29;
          const shown = annual ? Math.round(price * 0.8) : price;
          const current = profile.plan === p.key;
          return (
            <div className={`billing-card${p.flag ? ' featured' : ''}`} key={p.name}>
              {p.flag && <div className="plan-flag">{p.flag}</div>}
              <h3>{p.name}</h3>
              <p className="app-sub">{p.desc}</p>
              <div className="plan-price">
                <strong>${shown}</strong>
                <span>/mo</span>
              </div>
              <div className="quota-chips">
                {p.chips.map(([v, l]) => (
                  <div className="quota-chip" key={l}>
                    <strong>{v}</strong>
                    <em>{l}</em>
                  </div>
                ))}
              </div>
              <ul>
                {p.features.map((f) => (
                  <li key={f}>
                    <span className="li-check">✓</span> {f}
                  </li>
                ))}
              </ul>
              <button
                className={`btn plan-btn${p.key === 'pro' ? ' btn-purple' : ' btn-outline'}`}
                disabled={current}
                onClick={() => subscribe(p.key)}
              >
                {current ? 'Current plan' : 'Subscribe'}
              </button>
            </div>
          );
        })}
      </div>
      <p className="form-note" style={{ textAlign: 'center' }}>
        Clips uses 1 minute for every minute of video it processes. AI Studio uses credits: images 3
        cr · video 16–32 cr per 5 seconds depending on quality. Failed generations are refunded
        automatically.
      </p>
      <p className="form-note" style={{ textAlign: 'center' }}>
        🔒 Secure payment via Stripe · Cancel anytime
      </p>
    </div>
  );
}

function SettingsPage({
  profile,
  onSaved,
  showToast,
  onConnected,
}: {
  profile: Profile;
  onSaved: (p: Profile) => void;
  showToast: (m: string) => void;
  onConnected: () => void;
}) {
  const [tab, setTab] = useState<'account' | 'workspace' | 'connections' | 'reactions'>('account');
  const [name, setName] = useState(profile.display_name ?? '');
  const [emailsOn, setEmailsOn] = useState(true);
  const [emotion, setEmotion] = useState('Funny');
  const [email, setEmail] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''));
  }, []);

  return (
    <div className="page-pad">
      <h2 className="app-h">Settings</h2>
      <p className="app-sub">Manage your workspace</p>
      <div className="tab-row">
        {(
          [
            ['account', 'Account'],
            ['workspace', 'Workspace'],
            ['connections', 'Connections'],
            ['reactions', 'Reaction Library'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} className={`tab${tab === id ? ' on' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'account' && (
        <div className="nav-group">ACCOUNT</div>
      )}
      {tab === 'account' && (
        <div className="card">
          <label className="set-label">Email</label>
          <div className="readonly">{email || 'signed in'}</div>
          <label className="set-label">Plan</label>
          <div className="plan-chip">{PLANS[profile.plan].name.toUpperCase()} · {profile.minutes_limit - profile.minutes_used} min left</div>
          <a className="lnk" onClick={(e) => { e.preventDefault(); showToast('Manage subscription opens Stripe (soon)'); }}>
            Manage subscription →
          </a>
          <label className="set-label" style={{ marginTop: 16 }}>Emails</label>
          <div className="conn-row">
            <span>Email me when my clips are ready</span>
            <button className={`switch${emailsOn ? ' on' : ''}`} onClick={() => setEmailsOn((v) => !v)} aria-label="Toggle emails" />
          </div>
        </div>
      )}

      {tab === 'workspace' && (
        <div className="card">
          <label className="set-label">Workspace name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          <button
            className="btn btn-purple sm"
            onClick={async () => {
              const { data, error } = await supabase
                .from('profiles')
                .update({ display_name: name })
                .eq('id', profile.id)
                .select()
                .single();
              if (!error && data) {
                onSaved(data as Profile);
                showToast('Workspace saved');
              }
            }}
          >
            Save
          </button>
        </div>
      )}

      {tab === 'connections' && (
        <>
          <div className="nav-group">CONNECTIONS</div>
          <div className="card">
            {(
              [
                ['tiktok_connected', 'TikTok'],
                ['youtube_connected', 'YouTube'],
              ] as const
            ).map(([key, label]) => (
              <div className="conn-row" key={key}>
                <span>{label}</span>
                <em className="conn-state">{profile[key] ? 'Connected' : 'Not connected'}</em>
                <button
                  className={`btn sm ${profile[key] ? 'btn-outline' : 'btn-purple'}`}
                  onClick={async () => {
                    await supabase.from('profiles').update({ [key]: !profile[key] }).eq('id', profile.id);
                    onConnected();
                  }}
                >
                  {profile[key] ? '✓ Connected' : 'Connect'}
                </button>
              </div>
            ))}
            <p className="form-note">Connecting an account lets Cloudnivo sync your analytics and post clips on your behalf.</p>
          </div>
        </>
      )}

      {tab === 'reactions' && (
        <>
          <div className="page-head-row">
            <div>
              <h3 className="app-h3">Reaction Library</h3>
              <p className="app-sub">Manage your reaction media by emotion</p>
            </div>
            <button className="btn btn-purple sm" onClick={() => showToast('Reaction uploads are part of paid plans')}>
              + Add Media
            </button>
          </div>
          <div className="chip-row wrap">
            {EMOTIONS.map((em) => (
              <button key={em} className={`pub-chip pick${emotion === em ? ' on' : ''}`} onClick={() => setEmotion(em)}>
                {em}
              </button>
            ))}
          </div>
          <div className="card empty-state">No media for “{emotion.toLowerCase()}” yet.</div>
        </>
      )}
    </div>
  );
}
