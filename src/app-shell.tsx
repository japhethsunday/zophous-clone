import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  auth,
  supabase,
  PLANS,
  fmtTime,
  ensureWorkspace,
  creditCostFor,
  FREE_MODELS,
  withSignedUrls,
  withSignedClips,
  readVideoDuration,
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
  type BrandKit,
} from './lib/supabase';

const ClipsLibrary = lazy(() => import('./clips/ClipsLibrary'));
const ClipWorkspace = lazy(() => import('./clips/ClipWorkspace'));
const HomePage = lazy(() => import('./home'));
const Studio = lazy(() => import('./studio/Studio'));
const Voiceover = lazy(() => import('./voice/Voiceover'));

/* ---------------- helpers ---------------- */

/* Inline SVG icon set — 16px, 1.5px stroke, currentColor (no dependency) */
const IC_PATHS: Record<string, React.ReactNode> = {
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>
  ),
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h5v-6h4v6h5V9.5" />
    </>
  ),
  scissors: (
    <>
      <circle cx="6" cy="6" r="2.6" />
      <circle cx="6" cy="18" r="2.6" />
      <path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12" />
    </>
  ),
  film: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4" />
    </>
  ),
  sparkles: (
    <>
      <path d="M10 3l1.8 4.7L16.5 9.5l-4.7 1.8L10 16l-1.8-4.7L3.5 9.5l4.7-1.8L10 3z" />
      <path d="M18 14l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1z" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 11h18" />
    </>
  ),
  diamond: <path d="M12 3l8 8-8 10L4 11l8-8z" />,
  activity: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  chart: (
    <>
      <path d="M5 20v-6M11 20V8M17 20v-10" />
      <path d="M3 20h18" />
    </>
  ),
  megaphone: (
    <>
      <path d="m3 11 18-5v12L3 14v-3z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </>
  ),
  card: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
      <path d="M1 14h6M9 8h6M17 16h6" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  zap: <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />,
  check: <path d="M20 6 9 17l-5-5" />,
  play: <path d="M6 4l14 8-14 8V4z" />,
};

function Ic({ name, size = 16 }: { name: keyof typeof IC_PATHS | string; size?: number }) {
  return (
    <svg
      className="ic"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {IC_PATHS[name] ?? null}
    </svg>
  );
}

function resetLabel(): string {
  const d = new Date(Date.now() + 30 * 86400000);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const FONTS = ['space grotesk', 'montserrat', 'inter', 'roboto'];
const EMOTIONS = ['Agree', 'Awkward', 'Funny', 'Hype', 'Shocked'];

type Page =
  | 'home'
  | 'clips'
  | 'studio'
  | 'gen'
  | 'voice'
  | 'posts'
  | 'brand'
  | 'dna'
  | 'analytics'
  | 'settings';

function SigninGate() {
  return (
    <div className="gate">
      <div className="gate-card">
        <a className="logo" href="#/" style={{ justifyContent: 'center', fontSize: '1rem', textDecoration: 'none', color: 'inherit' }}>
          <span className="logo-mark">C</span> Cloudnivo
        </a>
        <h1 style={{ fontSize: 22 }}>Sign in to your studio</h1>
        <p className="sub left" style={{ margin: '12px 0 22px' }}>
          Clip long videos, generate shorts and schedule posts from one workspace.
        </p>
        <button className="btn btn-purple big" onClick={() => auth.openSignInModal()}>
          Sign in / Create account
        </button>
      </div>
    </div>
  );
}

/* ---------------- clip cards ---------------- */

/* ---------------- gen studio (real AI generation via Edge Functions) ---------------- */

const GEN_MODELS = [
  { id: 'story-free', name: 'Story video', kind: 'video', tag: 'Script, voiceover, scenes and captions', accent: 'var(--c4)' },
  { id: 'wan-free', name: 'Wan 2.2', kind: 'video', tag: 'Short motion clip, 480p', accent: 'var(--c3)' },
  { id: 'flux-free', name: 'FLUX', kind: 'image', tag: 'Still image', accent: 'var(--c2)' },
  { id: 'flux-schnell-cf', name: 'FLUX Fast', kind: 'image', tag: 'Still image in seconds, no GPU queue', accent: 'var(--c2)' },
  { id: 'lucid-origin-cf', name: 'Lucid Origin', kind: 'image', tag: 'Detailed still image, sharp text', accent: 'var(--c2)' },
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
  const [prompt, setPrompt] = useState(() => {
    const v = sessionStorage.getItem('cn_gen_prompt') ?? '';
    if (v) sessionStorage.removeItem('cn_gen_prompt');
    return v;
  });
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
  const [brand, setBrand] = useState<BrandKit | null>(null);
  const [applyBrand, setApplyBrand] = useState(false);

  const model = GEN_MODELS.find((m) => m.id === modelId) ?? GEN_MODELS[0];
  const cost = FREE_MODELS[model.id]?.credits ?? creditCostFor(model.kind, resolution, model.kind === 'video' ? durationSeconds : null);
  // Each model family has its own length options; snap to a valid one when switching.
  useEffect(() => {
    const opts = model.id === 'story-free' ? [30, 60, 90] : model.id === 'wan-free' ? [3, 5] : [5, 10];
    if (!opts.includes(durationSeconds)) setDuration(opts[model.id === 'story-free' ? 1 : 0]);
  }, [model.id, durationSeconds]);
  const creditsLeft = profile.credits_balance ?? 0;
  const creditsLimit = profile.credits_limit ?? 0;

  const load = useCallback(async () => {
    const [g, pl, sc, bk] = await Promise.all([
      supabase.from('generations').select('*').neq('kind', 'audio').order('created_at', { ascending: false }).limit(50),
      supabase.from('prompt_library').select('*').order('sort', { ascending: true }),
      supabase.from('scripts').select('*').order('created_at', { ascending: false }).limit(30),
      supabase.from('brand_kits').select('*').limit(1),
    ]);
    setGens(await withSignedUrls((g.data ?? []) as Generation[]));
    setPrompts((pl.data ?? []) as PromptPreset[]);
    setScripts((sc.data ?? []) as ScriptItem[]);
    setBrand((bk.data?.[0] as BrandKit) ?? null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll in-flight Replicate jobs so status + result land without a manual reload.
  useEffect(() => {
    // Paid video jobs and free (worker-run) jobs of any kind finish in the background.
    const active = (gens ?? []).filter(
      (g) => (g.status === 'processing' && g.kind === 'video') || (g.provider === 'hf-zerogpu' && (g.status === 'queued' || g.status === 'processing')),
    );
    if (active.length === 0) return;
    const t = setInterval(async () => {
      for (const g of active) {
        const { data, error } = await supabase.functions.invoke('generate-media', {
          body: { mode: 'check', id: g.id },
        });
        if (!error && data?.generation) {
          const [updated] = await withSignedUrls([data.generation as Generation]);
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
      showToast(`This render needs ${cost} credits. You have ${creditsLeft}.`);
      return;
    }
    setBusy(true);
    let finalPrompt = prompt.trim();
    if (applyBrand && brand) {
      const bits = [
        brand.brand_name ? `brand "${brand.brand_name}"` : '',
        brand.primary_color ? `brand color ${brand.primary_color}` : '',
        brand.font_choice ? `${brand.font_choice} typography feel` : '',
        brand.cta_text ? `end with the call to action "${brand.cta_text}"` : '',
      ].filter(Boolean);
      if (bits.length) finalPrompt = `${finalPrompt}. Style it on-brand: ${bits.join(', ')}.`;
    }
    const { data, error } = await supabase.functions.invoke('generate-media', {
      body: {
        mode: 'create',
        kind: model.kind,
        model: model.id,
        prompt: finalPrompt,
        aspect,
        resolution,
        durationSeconds: model.kind === 'video' ? durationSeconds : undefined,
        formatKey,
        style: applyBrand && brand ? 'brand' : undefined,
        // One key per click: a retried request returns the same job instead of charging twice.
        idempotencyKey: crypto.randomUUID(),
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
    const [signed] = await withSignedUrls([gen]);
    setGens((prev) => [signed, ...(prev ?? []).filter((x) => x.id !== signed.id)]);
    showToast(
      gen.status === 'ready'
        ? `${model.name} ready — ${cost} credits used`
        : `${model.name} is rendering — it will appear below when done`,
    );
    setPrompt('');
    setApplyBrand(false);
    await refresh();
  }, [prompt, applyBrand, brand, creditsLeft, cost, model, aspect, resolution, durationSeconds, formatKey, showToast, refresh]);

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
      <PageHeader icon="sparkles" tone="pink" title="Generate" sub="Video, images and narrated stories from a prompt.">
        <span className="gen-credits-pill">{creditsLeft} credits</span>
      </PageHeader>

      {tab === 'create' && (
        <>
          <div className="gx">
            <section className="gx-main">
              <label className="gx-label" htmlFor="gx-prompt">Prompt</label>
              <div className="gx-prompt">
                <textarea
                  id="gx-prompt"
                  rows={6}
                  placeholder={model.id === 'story-free' ? 'A topic, e.g. Why octopuses are the smartest animals in the ocean' : 'Describe the shot: subject, motion, lighting, mood'}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !busy) generate();
                  }}
                />
                <div className="gx-prompt-foot">
                  <span>{prompt.length} characters</span>
                  <span className="gx-kbd">Ctrl + Enter to generate</span>
                </div>
              </div>
              {prompts.length > 0 && (
                <>
                  <span className="gx-label">Start from a format</span>
                  <div className="gx-formats">
                    {prompts.slice(0, 8).map((p) => (
                      <button key={p.id} onClick={() => usePreset(p)} title={p.prompt}>
                        {p.title}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </section>

            <aside className="gx-side">
              <span className="gx-label">Model</span>
              <div className="gx-models" role="radiogroup">
                {GEN_MODELS.map((m) => (
                  <button
                    key={m.id}
                    role="radio"
                    aria-checked={m.id === modelId}
                    className={`gx-model${m.id === modelId ? ' on' : ''}`}
                    onClick={() => setModelId(m.id)}
                  >
                    <span className="gx-model-ic"><Ic name={m.kind === 'image' ? 'sparkles' : m.id === 'story-free' ? 'play' : 'film'} size={15} /></span>
                    <span className="gx-model-txt">
                      <strong>{m.name}</strong>
                      <em>{m.tag}</em>
                    </span>
                    <span className="gx-radio" />
                  </button>
                ))}
              </div>

              {model.kind === 'video' && (
                <>
                  <span className="gx-label">Length</span>
                  <div className="seg gx-seg">
                    {(model.id === 'story-free' ? [30, 60, 90] : model.id === 'wan-free' ? [3, 5] : [5, 10]).map((d) => (
                      <button key={d} className={durationSeconds === d ? 'on' : ''} onClick={() => setDuration(d)}>
                        {d}s
                      </button>
                    ))}
                  </div>
                </>
              )}

              <span className="gx-label">Aspect ratio</span>
              <div className="seg gx-seg">
                {GEN_ASPECTS.map((x) => (
                  <button key={x} className={aspect === x ? 'on' : ''} onClick={() => setAspect(x)}>
                    {x}
                  </button>
                ))}
              </div>

              {brand && (
                <label className="gx-switch">
                  <input type="checkbox" checked={applyBrand} onChange={(e) => setApplyBrand(e.target.checked)} />
                  <span>Use brand kit{brand.brand_name ? ` (${brand.brand_name})` : ''}</span>
                </label>
              )}

              <div className="gx-cost">
                <span>Cost</span>
                <strong>{cost} credits</strong>
              </div>
              <button className="btn btn-purple gx-go" disabled={busy || !prompt.trim()} onClick={generate}>
                {busy ? 'Starting…' : 'Generate'}
              </button>
              <p className="gx-note">{creditsLeft} credits left this month</p>
            </aside>
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
      <div className="gen-history gh-list">
        {gens === null && <div className="gen-empty">Loading…</div>}
        {gens !== null && gens.length === 0 && (
          <div className="gen-empty">No generations yet. Your results will appear here.</div>
        )}
        {gens?.map((g) => {
          const busyRow = g.status === 'processing' || g.status === 'queued';
          const waiting = g.status === 'queued' && g.meta?.wait === 'gpu_quota';
          const retryAt = g.meta?.retry_at ? new Date(g.meta.retry_at) : null;
          const statusLabel =
            g.status === 'ready' ? 'Ready'
            : g.status === 'failed' ? (g.error === 'cancelled' ? 'Cancelled' : 'Failed')
            : waiting ? 'Waiting for GPU'
            : g.status === 'processing' ? 'Rendering'
            : 'Queued';
          const cancel = async () => {
            const { error } = await supabase.functions.invoke('jobs-cancel', { body: { jobId: g.job_id } });
            if (error) {
              showToast((await readFnError(error)).message);
              return;
            }
            setGens((prev) => (prev ?? []).map((x) => (x.id === g.id ? { ...x, status: 'failed', error: 'cancelled' } : x)));
            showToast('Cancelled. Credits returned.');
            void refresh();
          };
          return (
            <div key={g.id} className={`gh-row s-${g.status}`}>
              <div className={`gh-thumb ${g.aspect === '16:9' ? 'wide' : g.aspect === '1:1' ? 'square' : 'tall'}`}>
                {g.status === 'ready' && g.result_url && g.kind === 'video' && (
                  <video src={g.result_url} controls playsInline preload="metadata" />
                )}
                {g.status === 'ready' && g.result_url && g.kind === 'image' && <img src={g.result_url} alt="" />}
                {busyRow && <span className={`gh-spin${waiting ? ' paused' : ''}`} aria-hidden="true" />}
                {g.status === 'failed' && <Ic name="lock" size={14} />}
              </div>
              <div className="gh-body">
                <p className="gh-prompt" title={g.prompt}>{g.prompt}</p>
                <div className="gh-meta">
                  <span className={`gh-status ${g.status}${waiting ? ' waiting' : ''}`}>{statusLabel}</span>
                  <span>{GEN_MODELS.find((m) => m.id === g.model)?.name ?? g.model}</span>
                  <span>{g.aspect}</span>
                  <span>
                    {new Date(g.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </span>
                </div>
                {waiting && (
                  <p className="gh-note">
                    The shared GPU quota is used up. Cloudnivo retries automatically
                    {retryAt ? ` at ${retryAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}.
                  </p>
                )}
                {g.status === 'failed' && g.error && g.error !== 'cancelled' && <p className="gh-note err">{friendlyGenError(g.error)}</p>}
              </div>
              <div className="gh-side">
                <span className="gh-cost">{g.status === 'failed' ? 'Refunded' : `${g.credit_cost ?? 0} cr`}</span>
                {busyRow && g.job_id && (
                  <button type="button" className="btn btn-outline sm" onClick={cancel}>Cancel</button>
                )}
                {g.status === 'ready' && g.result_url && (
                  <a className="btn btn-outline sm" href={g.result_url} download target="_blank" rel="noreferrer">Download</a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- main shell ---------------- */

export default function AppShell() {
  const PAGES: Page[] = ['home', 'clips', 'studio', 'gen', 'voice', 'brand', 'settings'];
  const pageFromHash = (): Page => {
    const m = location.hash.match(/^#\/app\/([a-z]+)/);
    return m && (PAGES as string[]).includes(m[1]) ? (m[1] as Page) : 'home';
  };
  const subFromHash = (): string | null => location.hash.match(/^#\/app\/clips\/([\w-]+)/)?.[1] ?? null;
  const STUDIO_TOOLS = ['chat', 'create', 'restyle', 'edit', 'remove', 'extend', 'describe'];
  const studioTool = (): 'chat' => { const t = location.hash.match(/^#\/app\/studio\/([a-z]+)/)?.[1]; return (t && STUDIO_TOOLS.includes(t) ? t : 'chat') as 'chat'; };
  const [tool, setTool] = useState(studioTool);
  const [openVideo, setOpenVideo] = useState<string | null>(subFromHash);
  // Navigation goes through the URL so Back/Forward and deep links work.
  const go = (p: Page, sub?: string) => { location.hash = `#/app/${p}${sub ? `/${sub}` : ''}`; };
  const [session, setSession] = useState<boolean | null>(null);
  const [page, setPage] = useState<Page>(pageFromHash);
  const [menu, setMenu] = useState<null | 'more' | 'account' | 'side-account'>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsedState] = useState(() => {
    try { return localStorage.getItem('cn_side_collapsed') === '1'; } catch { return false; }
  });
  const setCollapsed = (v: boolean) => {
    setCollapsedState(v);
    try { localStorage.setItem('cn_side_collapsed', v ? '1' : '0'); } catch { /* private mode */ }
  };
  // Close the top-bar menus on any outside click or Escape.
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.top-menu')) setMenu(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menu]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [dna, setDna] = useState<DnaPattern[]>([]);
  const [toast, setToast] = useState<string | null>(null);
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
    if (c.data) setClips(await withSignedClips(c.data as Clip[]));
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

  // While the worker is processing an upload, refresh so progress and finished clips appear.
  const processing = videos.some((v) => v.status === 'queued' || v.status === 'analyzing');
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(() => void refresh(), 8000);
    return () => clearInterval(t);
  }, [processing, refresh]);

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

  // Deep links: #/app/<page> opens that page, including when the app is already mounted.
  useEffect(() => {
    const h = () => { setPage(pageFromHash()); setOpenVideo(subFromHash()); setTool(studioTool()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markChecklist = useCallback(
    async (key: string) => {
      if (!profile) return;
      const done = { ...profile.checklist_done, [key]: true };
      setProfile({ ...profile, checklist_done: done });
      await supabase.from('profiles').update({ checklist_done: done }).eq('id', profile.id);
    },
    [profile],
  );





  const isPaid = true;
  const minutesLeft = profile ? profile.minutes_limit - profile.minutes_used : 0;
  const checklist = profile?.checklist_done ?? {};
  const doneCount = ['first_video', 'connected', 'first_post', 'dna'].filter((k) => checklist[k]).length;

  if (session === null || session === undefined) {
    return <div className="gate-loading">Loading…</div>;
  }
  if (!session) return <SigninGate />;

  return (
    <div className={`shell pro${collapsed ? ' is-collapsed' : ''}${page === 'gen' ? ' gen-mode' : ''}`}>
      {navOpen && <div className="nav-scrim" onClick={() => setNavOpen(false)} />}

      <aside className={`pro-side${collapsed ? ' collapsed' : ''}${navOpen ? ' open' : ''}`} aria-label="Main navigation">
        <div className="ps-head">
          <span className="logo-mark">C</span>
          <div className="ps-ws">
            <strong>{managers[0]?.name ?? 'My Workspace'}</strong>
            <span>Workspace</span>
          </div>
          <button
            className="ps-collapse"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand' : 'Collapse'}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? '»' : '«'}
          </button>
        </div>

        <button className="ps-new" onClick={() => { go('studio'); setNavOpen(false); }} title="Create something new">
          <Ic name="sparkles" size={16} /> <span>New creation</span>
        </button>

        <nav className="ps-nav">
          {(
            [
              ['', [
                ['home', 'Dashboard', 'home'],
              ]],
              ['Create', [
                ['clips', 'Clips', 'scissors'],
                ['studio', 'Studio', 'sparkles'],
                ['gen', 'Video & story', 'film'],
                ['voice', 'Voiceover', 'mic'],
              ]],
              ['Brand', [
                ['brand', 'Brand kit', 'diamond'],
              ]],
            ] as const
          ).map(([group, items]) => (
            <div className="ps-group" key={group || 'main'}>
              {group && <div className="ps-label">{group}</div>}
              {items.map(([id, label, icon]) => (
                <button
                  key={id}
                  className={`ps-link${page === id ? ' on' : ''}`}
                  aria-current={page === id ? 'page' : undefined}
                  title={collapsed ? label : undefined}
                  onClick={() => { go(id); setNavOpen(false); }}
                >
                  <Ic name={icon} size={17} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        {profile && (
          <div className="ps-usage" title="Monthly allowance">
            <div className="ps-meter">
              <div><span>Minutes</span><b>{minutesLeft}/{profile.minutes_limit}</b></div>
              <i><u style={{ width: `${profile.minutes_limit ? Math.min(100, Math.round((minutesLeft / profile.minutes_limit) * 100)) : 0}%` }} /></i>
            </div>
            <div className="ps-meter">
              <div><span>Credits</span><b>{profile.credits_balance}</b></div>
              <i><u className="alt" style={{ width: `${PLANS[profile.plan].credits ? Math.min(100, Math.round((profile.credits_balance / PLANS[profile.plan].credits) * 100)) : 0}%` }} /></i>
            </div>
          </div>
        )}

        <div className="ps-user top-menu">
          <button
            className="ps-user-btn"
            aria-label="Account menu"
            aria-expanded={menu === 'side-account'}
            onClick={() => setMenu(menu === 'side-account' ? null : 'side-account')}
          >
            <span className="top-avatar">{(profile?.display_name ?? 'C').slice(0, 1).toUpperCase()}</span>
            <span className="ps-user-name">{profile?.display_name ?? 'Account'}</span>
            <span className="ps-chev">⋯</span>
          </button>
          {menu === 'side-account' && (
            <div className="top-pop up" role="menu">
              <button role="menuitem" onClick={() => { go('settings'); setMenu(null); setNavOpen(false); }}>
                <Ic name="sliders" size={15} /> Settings
              </button>
              <button
                role="menuitem"
                onClick={async () => {
                  await supabase.auth.signOut();
                  setSession(false);
                }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </aside>

      <div className="app-col">
        <div className="app-top">
          <button className="mob-burger" aria-label="Open menu" onClick={() => setNavOpen(true)}>
            <span /><span /><span />
          </button>
          <div className="app-top-right">
            {profile && (
              <button className="top-meter" onClick={() => go('settings')} title="Usage this month">
                <span><b>{minutesLeft}</b> min</span>
                <span><b>{profile.credits_balance}</b> credits</span>
              </button>
            )}
            <div className="top-menu">
              <button
                className="top-avatar"
                aria-label="Account menu"
                aria-expanded={menu === 'account'}
                onClick={() => setMenu(menu === 'account' ? null : 'account')}
              >
                {(profile?.display_name ?? 'C').slice(0, 1).toUpperCase()}
              </button>
              {menu === 'account' && (
                <div className="top-pop right" role="menu">
                  {profile && (
                    <div className="top-pop-head">
                      <strong>{profile.display_name ?? 'Account'}</strong>
                      <span>Usage resets {resetLabel()}</span>
                    </div>
                  )}
                  <button role="menuitem" onClick={() => { go('settings'); setMenu(null); }}>
                    <Ic name="sliders" size={15} /> Settings
                  </button>
                  <button
                    role="menuitem"
                    onClick={async () => {
                      await supabase.auth.signOut();
                      setSession(false);
                    }}
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        <main className="app-main">
        {toast && <div className="toast">{toast}</div>}

        <Suspense fallback={<div className="page-pad" aria-busy="true" />}>
        {page === 'home' && profile && (
          <HomePage
            profile={profile}
            clips={clips}
            videos={videos}
            checklist={checklist}
            onNav={(p: Page) => go(p)}
            onOpenVideo={(id: string) => go('clips', id)}
          />
        )}

          {page === 'clips' && profile && !openVideo && (
            <ClipsLibrary
              profile={profile}
              videos={videos}
              clips={clips}
              minutesLeft={minutesLeft}
              resetLabel={resetLabel()}
              onOpen={(id) => go('clips', id)}
              refresh={refresh}
              showToast={showToast}
              onFirstVideo={() => void markChecklist('first_video')}
            />
          )}
          {page === 'clips' && profile && openVideo && (() => {
            const v = videos.find((x) => x.id === openVideo);
            if (!v) return <div className="page-pad"><p className="lib-empty">{videos.length ? 'This project was not found.' : 'Loading…'}</p></div>;
            return (
              <ClipWorkspace
                key={v.id}
                video={v}
                clips={clips.filter((c) => c.video_id === v.id)}
                onBack={() => go('clips')}
                refresh={refresh}
                showToast={showToast}
              />
            );
          })()}
        </Suspense>

        {page === 'studio' && profile && (
          <Suspense fallback={<div className="page-pad" aria-busy="true" />}>
            <Studio tool={tool} onTool={(t) => go('studio', t)} showToast={showToast} />
          </Suspense>
        )}

        {page === 'voice' && profile && (
          <Suspense fallback={<div className="page-pad" aria-busy="true" />}>
            <Voiceover profile={profile} showToast={showToast} refresh={refresh} />
          </Suspense>
        )}

        {page === 'gen' && profile && (
          <GenPage profile={profile} showToast={showToast} refresh={refresh} />
        )}

        {page === 'brand' && profile && (
          <BrandPage profile={profile} isPaid={isPaid} onSaved={setProfile} showToast={showToast} />
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
      </div>

    </div>
  );
}

/* ---------------- pages ---------------- */

function friendlyGenError(e: string): string {
  if (/quota/i.test(e)) return 'The shared GPU quota ran out before this could finish. Credits were returned.';
  if (/timeout|timed out/i.test(e)) return 'The model took too long to respond. Credits were returned.';
  if (/name resolution|network|connect/i.test(e)) return 'The worker could not reach the model service. Credits were returned.';
  return 'Something went wrong while rendering. Credits were returned.';
}

function PageHeader({
  icon,
  tone,
  title,
  sub,
  children,
}: {
  icon: string;
  tone: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="ph">
      <span className={`tool-ic tone-${tone}`}><Ic name={icon} size={18} /></span>
      <div className="ph-txt">
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="ph-actions">{children}</div>}
    </header>
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
      <PageHeader icon="diamond" tone="teal" title="Brand kit" sub="Your logo, colour, font and call to action for generated videos." />

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
  const [emotion, setEmotion] = useState('Funny');
  const [email, setEmail] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''));
  }, []);

  return (
    <div className="page-pad">
      <PageHeader icon="sliders" tone="amber" title="Settings" sub="Account and workspace." />
      <div className="tab-row">
        {(
          [
            ['account', 'Account'],
            ['workspace', 'Workspace'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} className={`tab${tab === id ? ' on' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'account' && (
        <div className="nav-group">Account</div>
      )}
      {tab === 'account' && (
        <div className="card">
          <label className="set-label">Email</label>
          <div className="readonly">{email || 'signed in'}</div>
          <label className="set-label">Usage</label>
          <div className="plan-chip">{profile.minutes_limit - profile.minutes_used} min · {profile.credits_balance} credits</div>
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
          <div className="nav-group">Connections</div>
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
                {/* Real OAuth lands in Phase 6. Until then nothing is posted, so don't pretend to connect. */}
                <button className="btn sm btn-outline" disabled title="Coming soon">
                  Coming soon
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
            <button className="btn btn-purple sm" onClick={() => showToast('Reaction uploads are coming soon')}>
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
