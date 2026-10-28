// Voiceover: type a script, pick a voice, get an MP3. Runs on the Cloudnivo worker (Kokoro).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, withSignedUrls, type Generation, type Profile } from '../lib/supabase';
import { VOICE_MAX_CHARS, voiceCredits } from '../../supabase/functions/_shared/pricing';
import { LANGUAGES, VOICES, voiceById, type Voice } from './voices';
import './voice.css';

const SAMPLE =
  'Most people quit right before it starts working. Here are three habits that kept me going when nobody was watching.';

function fmtSec(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, '0')}`;
}

/** One shared <audio> for voice previews so only one plays at a time. */
function usePreview() {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  useEffect(() => () => ref.current?.pause(), []);
  const toggle = useCallback((id: string) => {
    if (!ref.current) {
      ref.current = new Audio();
      ref.current.onended = () => setPlaying(null);
    }
    const a = ref.current;
    if (playing === id) {
      a.pause();
      setPlaying(null);
      return;
    }
    a.src = `/voices/${id}.mp3`;
    void a.play().then(() => setPlaying(id)).catch(() => setPlaying(null));
  }, [playing]);
  return { playing, toggle };
}

function PlayIcon({ on }: { on: boolean }) {
  return on ? (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
  ) : (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>
  );
}

export default function Voiceover({
  profile,
  showToast,
  refresh,
}: {
  profile: Profile;
  showToast: (m: string) => void;
  refresh: () => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [voiceId, setVoiceId] = useState(() => localStorage.getItem('cn_voice') ?? 'af_heart');
  const [speed, setSpeed] = useState(1);
  const [query, setQuery] = useState('');
  const [lang, setLang] = useState('All');
  const [gender, setGender] = useState<'All' | 'Female' | 'Male'>('All');
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<Generation[] | null>(null);
  const preview = usePreview();

  const voice = voiceById(voiceId);
  const chars = text.trim().length;
  const credits = voiceCredits(Math.max(chars, 1));
  const estSeconds = Math.round(chars / 15 / speed);
  const creditsLeft = profile.credits_balance ?? 0;

  useEffect(() => {
    try { localStorage.setItem('cn_voice', voiceId); } catch { /* ignore */ }
  }, [voiceId]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return VOICES.filter((v) =>
      (lang === 'All' || v.lang === lang) && (gender === 'All' || v.gender === gender)
      && (!q || `${v.name} ${v.tone} ${v.lang}`.toLowerCase().includes(q)));
  }, [query, lang, gender]);

  const load = useCallback(async () => {
    const { data } = await supabase.from('generations').select('*').eq('kind', 'audio').order('created_at', { ascending: false }).limit(30);
    setItems(await withSignedUrls((data ?? []) as Generation[]));
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Refresh while any voiceover is still being made.
  const active = (items ?? []).some((g) => g.status === 'queued' || g.status === 'processing');
  useEffect(() => {
    if (!active) return;
    const t = setInterval(async () => {
      const before = new Set((items ?? []).filter((g) => g.status === 'ready').map((g) => g.id));
      const { data } = await supabase.from('generations').select('*').eq('kind', 'audio').order('created_at', { ascending: false }).limit(30);
      const next = await withSignedUrls((data ?? []) as Generation[]);
      setItems(next);
      if (next.some((g) => g.status === 'ready' && !before.has(g.id))) {
        showToast('Voiceover ready');
        void refresh();
      }
    }, 3000);
    return () => clearInterval(t);
  }, [active, items, refresh, showToast]);

  const generate = useCallback(async () => {
    if (!chars) return;
    if (credits > creditsLeft) {
      showToast(`This needs ${credits} credits. You have ${creditsLeft}.`);
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('generate-media', {
      body: { mode: 'create', model: 'voice-kokoro', prompt: text.trim(), voice: voiceId, speed, idempotencyKey: crypto.randomUUID() },
    });
    setBusy(false);
    if (error || !data?.generation) {
      showToast('Could not start the voiceover. Please try again.');
      return;
    }
    setItems((prev) => [data.generation as Generation, ...(prev ?? [])]);
    void refresh();
  }, [chars, credits, creditsLeft, refresh, showToast, speed, text, voiceId]);

  const cancel = async (g: Generation) => {
    const { error } = await supabase.functions.invoke('jobs-cancel', { body: { jobId: g.job_id } });
    if (error) return showToast('Could not cancel.');
    setItems((prev) => (prev ?? []).map((x) => (x.id === g.id ? { ...x, status: 'failed', error: 'cancelled' } : x)));
    showToast('Cancelled. Credits returned.');
    void refresh();
  };

  const reuse = (g: Generation) => {
    setText(g.prompt);
    if (g.style) setVoiceId(g.style);
    const sp = Number((g.meta as { speed?: number } | null)?.speed);
    if (sp) setSpeed(sp);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="page-pad vo">
      <header className="vo-head">
        <div>
          <h1>Voiceover</h1>
          <p>Type a script, choose a voice and get a studio-quality MP3. 31 voices in 7 languages.</p>
        </div>
        <span className="vo-credits">{creditsLeft} credits</span>
      </header>

      <div className="vo-grid">
        <section className="vo-editor">
          <div className="vo-voicebar">
            <button className={`vo-play${preview.playing === voice.id ? ' on' : ''}`} onClick={() => preview.toggle(voice.id)} aria-label={`Preview ${voice.name}`}>
              <PlayIcon on={preview.playing === voice.id} />
            </button>
            <div>
              <strong>{voice.name}</strong>
              <span>{voice.tone} · {voice.lang}</span>
            </div>
          </div>
          <textarea
            className="vo-text"
            value={text}
            maxLength={VOICE_MAX_CHARS}
            placeholder="Start typing or paste your script here."
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !busy) void generate(); }}
            aria-label="Script"
          />
          {!text && (
            <button className="vo-sample" onClick={() => setText(SAMPLE)}>Use a sample script</button>
          )}
          <footer className="vo-foot">
            <span className="vo-count">
              {chars.toLocaleString()} / {VOICE_MAX_CHARS.toLocaleString()}
              {chars > 0 && <> · about {fmtSec(estSeconds)}</>}
            </span>
            <span className="vo-cost">{chars ? `${credits} credit${credits > 1 ? 's' : ''}` : ''}</span>
            <button className="btn btn-purple vo-go" disabled={!chars || busy} onClick={() => void generate()}>
              {busy ? 'Starting…' : 'Generate speech'}
            </button>
          </footer>
        </section>

        <aside className="vo-side">
          <div className="vo-filters">
            <input className="vo-search" placeholder="Search voices" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search voices" />
            <div className="vo-row">
              <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language">
                <option>All</option>
                {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
              </select>
              <div className="seg vo-seg" role="tablist" aria-label="Gender">
                {(['All', 'Female', 'Male'] as const).map((g) => (
                  <button key={g} role="tab" aria-selected={gender === g} className={gender === g ? 'on' : ''} onClick={() => setGender(g)}>{g}</button>
                ))}
              </div>
            </div>
          </div>
          <ul className="vo-list" role="listbox" aria-label="Voices">
            {list.map((v: Voice) => (
              <li key={v.id} role="option" aria-selected={v.id === voiceId} className={v.id === voiceId ? 'on' : ''} onClick={() => setVoiceId(v.id)}>
                <button
                  className={`vo-play sm${preview.playing === v.id ? ' on' : ''}`}
                  onClick={(e) => { e.stopPropagation(); preview.toggle(v.id); }}
                  aria-label={`Preview ${v.name}`}
                >
                  <PlayIcon on={preview.playing === v.id} />
                </button>
                <div className="vo-li-txt">
                  <strong>{v.name}</strong>
                  <span>{v.tone}</span>
                </div>
                <em>{v.lang.replace(' (US)', ' US').replace(' (UK)', ' UK').replace(' (BR)', '')} · {v.gender[0]}</em>
              </li>
            ))}
            {list.length === 0 && <li className="vo-none">No voices match.</li>}
          </ul>
          <div className="vo-speed">
            <div className="vo-speed-top">
              <label htmlFor="vo-speed">Speed</label>
              <span>{speed.toFixed(2)}×</span>
            </div>
            <input id="vo-speed" type="range" min={0.7} max={1.3} step={0.05} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
            <div className="vo-speed-ends"><span>Slower</span><button onClick={() => setSpeed(1)}>Reset</button><span>Faster</span></div>
          </div>
        </aside>
      </div>

      <section className="vo-history">
        <h2>History</h2>
        {items === null && <p className="vo-empty">Loading…</p>}
        {items?.length === 0 && <p className="vo-empty">Your voiceovers will appear here.</p>}
        {items && items.length > 0 && (
          <ul>
            {items.map((g) => {
              const v = voiceById(g.style);
              const busyRow = g.status === 'queued' || g.status === 'processing';
              return (
                <li key={g.id} className={`vo-item s-${g.status}`}>
                  <div className="vo-item-main">
                    <p title={g.prompt}>{g.prompt}</p>
                    <div className="vo-item-meta">
                      <span>{v.name}</span>
                      {g.duration_seconds ? <span>{fmtSec(g.duration_seconds)}</span> : null}
                      <span>{g.prompt.length.toLocaleString()} chars</span>
                      <span>{new Date(g.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                    </div>
                    {g.status === 'ready' && g.result_url && <audio className="vo-audio" src={g.result_url} controls preload="none" />}
                    {busyRow && <div className="vo-progress"><i /> {g.status === 'queued' ? 'In queue' : 'Speaking'}…</div>}
                    {g.status === 'failed' && (
                      <p className="vo-fail">{g.error === 'cancelled' ? 'Cancelled. Credits returned.' : 'Could not create this voiceover. Credits returned.'}</p>
                    )}
                  </div>
                  <div className="vo-item-actions">
                    {busyRow && g.job_id && <button className="btn btn-outline sm" onClick={() => void cancel(g)}>Cancel</button>}
                    {g.status === 'ready' && g.result_url && (
                      <a className="btn btn-outline sm" href={g.result_url} download={`voiceover-${v.name.toLowerCase()}.mp3`} target="_blank" rel="noreferrer">Download</a>
                    )}
                    <button className="btn btn-ghost sm" onClick={() => reuse(g)}>Reuse</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
