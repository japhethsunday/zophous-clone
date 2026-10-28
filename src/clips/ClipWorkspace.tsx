// Clip editor: review every clip from one source, trim on word boundaries, pick captions,
// format and framing, preview the result live over the source, then render it for real.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Clip, Video } from '../lib/supabase';
import { supabase } from '../lib/supabase';
import {
  MAX_CLIP_SECONDS, MIN_CLIP_SECONDS, validateRenderEdit, type AspectId, type CaptionStyleId,
} from '../../supabase/functions/_shared/clip-edit';
import { activeCaption, ASPECTS, CAPTION_STYLES, groupWords, snapToWord, styleById, timecode, type Word } from './captions';
import './clips.css';

type Draft = { start: number; end: number; captionStyle: CaptionStyleId; aspect: AspectId; cropX: number | null; title: string };
type RenderJob = { id: string; ref_id: string; status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'; progress: number; error: string | null; output: { stage?: string } | null; created_at: string };
type EditRow = { media_id: string; project: Partial<Draft> & { start?: number; end?: number }; rendered_at: string | null };

const PAD = 12; // seconds of context shown either side of the clip on the timeline

function draftFromClip(c: Clip, saved?: EditRow): Draft {
  const p = saved?.project ?? {};
  return {
    start: p.start ?? c.start_seconds,
    end: p.end ?? c.end_seconds,
    captionStyle: (p.captionStyle ?? (c.caption_style as CaptionStyleId)) || 'bold',
    aspect: p.aspect ?? '9:16',
    cropX: p.cropX ?? null,
    title: p.title ?? c.title,
  };
}

function sameDraft(a: Draft, b: Draft) {
  return Math.abs(a.start - b.start) < 0.05 && Math.abs(a.end - b.end) < 0.05 && a.captionStyle === b.captionStyle
    && a.aspect === b.aspect && a.cropX === b.cropX && a.title.trim() === b.title.trim();
}

function renderError(code: string | null): string {
  const map: Record<string, string> = {
    clip_too_short: 'The trimmed clip is too short to render.',
    bad_aspect: 'That format is not supported.',
    clip_not_found: 'This clip was deleted.',
  };
  return (code && map[code]) || 'The render failed. Your previous version is unchanged.';
}

export default function ClipWorkspace({
  video, clips, onBack, refresh, showToast,
}: {
  video: Video;
  clips: Clip[];
  onBack: () => void;
  refresh: () => Promise<void>;
  showToast: (m: string) => void;
}) {
  const ordered = useMemo(() => [...clips].sort((a, b) => b.score - a.score), [clips]);
  const [selId, setSelId] = useState<string | null>(ordered[0]?.id ?? null);
  const sel = ordered.find((c) => c.id === selId) ?? ordered[0];

  const [saved, setSaved] = useState<Record<string, EditRow>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [jobs, setJobs] = useState<Record<string, RenderJob>>({});
  const [words, setWords] = useState<Word[] | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<'draft' | 'rendered'>('rendered');
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [srcSize, setSrcSize] = useState<{ w: number; h: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const vref = useRef<HTMLVideoElement>(null);

  const base = sel ? draftFromClip(sel, saved[sel.id]) : null;
  const draft = sel ? drafts[sel.id] ?? base! : null;
  const dirty = !!(draft && base && !sameDraft(draft, base));
  const job = sel ? jobs[sel.id] : undefined;
  const rendering = job && (job.status === 'queued' || job.status === 'running');

  const setDraft = (patch: Partial<Draft>) => {
    if (!sel || !draft) return;
    setDrafts((d) => ({ ...d, [sel.id]: { ...draft, ...patch } }));
    setMode('draft');
  };

  // Saved edits, the source video and the word-timed transcript (written by the worker).
  useEffect(() => {
    let live = true;
    (async () => {
      const ids = clips.map((c) => c.id);
      const { data: edits } = await supabase.from('clip_edits').select('media_id, project, rendered_at').eq('media_kind', 'clip').in('media_id', ids);
      if (live && edits) setSaved(Object.fromEntries((edits as EditRow[]).map((e) => [e.media_id, e])));
      if (video.source_path) {
        const { data } = await supabase.storage.from('sources').createSignedUrl(video.source_path, 60 * 60 * 3);
        if (live && data) setSourceUrl(data.signedUrl);
      }
      const jobId = clips.find((c) => c.job_id)?.job_id;
      if (jobId) {
        const { data: u } = await supabase.auth.getUser();
        const { data: tr } = await supabase.storage.from('outputs').download(`${u.user?.id}/${jobId}/transcript.json`);
        if (live) {
          try {
            const parsed = tr ? JSON.parse(await tr.text()) : null;
            setWords(Array.isArray(parsed?.words) ? (parsed.words as Word[]) : []);
          } catch { setWords([]); }
        }
      } else if (live) setWords([]);
    })();
    return () => { live = false; };
  }, [clips, video.source_path]);

  // Render jobs: load the latest per clip, poll while any is in flight.
  const loadJobs = useCallback(async () => {
    const { data } = await supabase.from('jobs').select('id, ref_id, status, progress, error, output, created_at')
      .eq('kind', 'clip_render').in('ref_id', clips.map((c) => c.id)).order('created_at', { ascending: true });
    if (!data) return;
    const latest: Record<string, RenderJob> = {};
    for (const j of data as RenderJob[]) latest[j.ref_id] = j;
    setJobs((prev) => {
      const finished = Object.values(latest).filter((j) => j.status === 'succeeded' && prev[j.ref_id] && prev[j.ref_id].status !== 'succeeded');
      if (finished.length) {
        void refresh();
        setDrafts((d) => {
          const n = { ...d };
          finished.forEach((j) => delete n[j.ref_id]);
          return n;
        });
        showToast(finished.length === 1 ? 'Render finished.' : `${finished.length} renders finished.`);
      }
      return latest;
    });
  }, [clips, refresh, showToast]);
  useEffect(() => { void loadJobs(); }, [loadJobs]);
  const anyRendering = Object.values(jobs).some((j) => j.status === 'queued' || j.status === 'running');
  useEffect(() => {
    if (!anyRendering) return;
    const id = setInterval(() => void loadJobs(), 3000);
    return () => clearInterval(id);
  }, [anyRendering, loadJobs]);

  // When a clip is selected, show its rendered file; reset playback.
  useEffect(() => {
    setMode(sel && drafts[sel.id] ? 'draft' : 'rendered');
    setPlaying(false);
    setConfirmDelete(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId]);

  const draftMode = mode === 'draft' && !!sourceUrl;
  // Seek the source to the clip start when entering draft preview.
  useEffect(() => {
    const v = vref.current;
    if (!v || !draft) return;
    if (draftMode) {
      const go = () => { v.currentTime = draft.start; setT(draft.start); };
      if (v.readyState >= 1) go(); else v.addEventListener('loadedmetadata', go, { once: true });
    } else {
      v.currentTime = 0;
      setT(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftMode, selId, sourceUrl]);

  const onTime = () => {
    const v = vref.current;
    if (!v || !draft) return;
    if (draftMode && v.currentTime >= draft.end) {
      v.pause();
      v.currentTime = draft.start;
    }
    setT(v.currentTime);
  };

  const togglePlay = useCallback(() => {
    const v = vref.current;
    if (!v) return;
    if (v.paused) {
      if (draftMode && draft && (v.currentTime < draft.start || v.currentTime >= draft.end - 0.05)) v.currentTime = draft.start;
      void v.play();
    } else v.pause();
  }, [draftMode, draft]);

  const seek = (s: number) => {
    const v = vref.current;
    if (!v) return;
    if (!draftMode) setMode('draft');
    v.currentTime = s;
    setT(s);
  };

  // Source time of the playhead, in both preview modes.
  const sourceT = draftMode ? t : (draft ? (base?.start ?? 0) + t : 0);

  const setIn = useCallback((s: number) => {
    if (!draft) return;
    const v = Math.max(0, Math.min(s, draft.end - MIN_CLIP_SECONDS));
    setDraft({ start: Math.round(v * 100) / 100 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);
  const setOut = useCallback((s: number) => {
    if (!draft) return;
    const max = Math.min(video.duration_seconds || Infinity, draft.start + MAX_CLIP_SECONDS);
    const v = Math.min(max, Math.max(s, draft.start + MIN_CLIP_SECONDS));
    setDraft({ end: Math.round(v * 100) / 100 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, video.duration_seconds]);

  // Keyboard: Space play, I / O set in and out at the playhead, J / L step one second.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === ' ' && !el.closest('button, [role="slider"]')) { e.preventDefault(); togglePlay(); }
      else if (e.key === 'i' || e.key === 'I') setIn(snapToWord(words ?? [], sourceT, 'start'));
      else if (e.key === 'o' || e.key === 'O') setOut(snapToWord(words ?? [], sourceT, 'end'));
      else if (e.key === 'j' || e.key === 'J') seek(Math.max(0, sourceT - 1));
      else if (e.key === 'l' || e.key === 'L') seek(sourceT + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const render = async () => {
    if (!sel || !draft) return;
    const check = validateRenderEdit({ ...draft }, video.duration_seconds + 1);
    if (!check.ok) { showToast(check.message); return; }
    const { data, error } = await supabase.functions.invoke('clips-render', { body: { clipId: sel.id, ...check.edit } });
    if (error) {
      let msg = 'Could not start the render.';
      try { msg = (await (error as { context?: Response }).context?.json())?.message ?? msg; } catch { /* default */ }
      showToast(msg);
      return;
    }
    const j = (data as { job: RenderJob }).job;
    setJobs((m) => ({ ...m, [sel.id]: { ...j, error: null, output: null, created_at: new Date().toISOString(), progress: j.progress ?? 0 } }));
    setSaved((s) => ({ ...s, [sel.id]: { media_id: sel.id, project: check.edit as Partial<Draft>, rendered_at: null } }));
    showToast('Rendering. You can keep editing other clips.');
  };

  const download = async () => {
    if (!sel?.clip_path) return;
    const name = `${(draft?.title || sel.title || 'clip').replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'clip'}.mp4`;
    const { data, error } = await supabase.storage.from('outputs').createSignedUrl(sel.clip_path, 600, { download: name });
    if (error || !data) { showToast('Could not prepare the download.'); return; }
    const a = document.createElement('a');
    a.href = data.signedUrl;
    a.download = name;
    a.click();
  };

  const remove = async () => {
    if (!sel) return;
    const { error } = await supabase.from('clips').delete().eq('id', sel.id);
    if (error) { showToast('Could not delete the clip.'); return; }
    const paths = [sel.clip_path, sel.thumb_path].filter((p): p is string => !!p);
    if (paths.length) await supabase.storage.from('outputs').remove(paths);
    showToast('Clip deleted.');
    setSelId(null);
    await refresh();
  };

  const back = () => {
    const unsaved = Object.entries(drafts).filter(([id, d]) => {
      const c = ordered.find((x) => x.id === id);
      return c && !sameDraft(d, draftFromClip(c, saved[id]));
    }).length;
    if (unsaved && !window.confirm(`${unsaved} ${unsaved === 1 ? 'clip has' : 'clips have'} changes that are not rendered. Leave anyway?`)) return;
    onBack();
  };

  const capWords = styleById(draft?.captionStyle ?? 'bold').words;
  const groups = useMemo(() => (capWords > 0 ? groupWords(words ?? [], capWords) : []), [words, capWords]);

  if (!sel || !draft) {
    return (
      <div className="page-pad">
        <button className="lnk" onClick={onBack}>Back to projects</button>
        <p className="lib-empty">This project has no clips left.</p>
      </div>
    );
  }

  // Preview geometry.
  const aspect = ASPECTS.find((a) => a.id === draft.aspect) ?? ASPECTS[0];
  const style = styleById(draft.captionStyle);
  const cap = draftMode && style.words > 0 ? activeCaption(groups, t) : null;
  const objPos = (() => {
    if (draft.cropX == null || !srcSize) return '50% 50%';
    const ratio = aspect.width / aspect.height;
    const cropW = srcSize.h * ratio;
    if (cropW >= srcSize.w) return '50% 50%';
    const x = Math.max(0, Math.min(srcSize.w - cropW, draft.cropX * srcSize.w - cropW / 2));
    return `${(x / (srcSize.w - cropW)) * 100}% 50%`;
  })();

  // Timeline window.
  const total = video.duration_seconds || draft.end + PAD;
  const winStart = Math.max(0, Math.min(draft.start, base!.start) - PAD);
  const winEnd = Math.min(total, Math.max(draft.end, base!.end) + PAD);
  const pct = (s: number) => `${((s - winStart) / (winEnd - winStart)) * 100}%`;
  const winWords = (words ?? []).filter((w) => w.end > winStart && w.start < winEnd);
  const len = draft.end - draft.start;

  return (
    <div className="ws">
      <header className="ws-bar">
        <button className="ws-back" onClick={back} aria-label="Back to projects">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div className="ws-name">
          <strong>{video.title}</strong>
          <span>{ordered.length} clips · source {timecode(video.duration_seconds, false)}</span>
        </div>
        <div className="ws-actions">
          <button className="btn btn-outline sm" onClick={() => void download()} disabled={!sel.clip_url}>Download</button>
          <button className="btn btn-primary sm" onClick={() => void render()} disabled={!dirty || !!rendering || !video.source_path}
            title={!video.source_path ? 'This clip has no stored source video' : undefined}>
            {rendering ? 'Rendering…' : 'Render changes'}
          </button>
        </div>
      </header>

      <div className="ws-grid">
        <nav className="ws-list" aria-label="Clips in this project">
          <ol>
            {ordered.map((c, i) => {
              const j = jobs[c.id];
              const busy = j && (j.status === 'queued' || j.status === 'running');
              const d = drafts[c.id];
              const changed = d && !sameDraft(d, draftFromClip(c, saved[c.id]));
              return (
                <li key={c.id}>
                  <button className={`ws-item${c.id === sel.id ? ' on' : ''}`} aria-current={c.id === sel.id ? 'true' : undefined} onClick={() => setSelId(c.id)}>
                    <span className="ws-thumb">
                      {c.thumb_url ? <img src={c.thumb_url} alt="" loading="lazy" /> : null}
                      {busy && <span className="ws-thumb-busy">{j.progress}%</span>}
                    </span>
                    <span className="ws-item-txt">
                      <strong>{(d?.title ?? c.title) || `Clip ${i + 1}`}</strong>
                      <span>
                        <b className="score" title="Moment score: how strong the hook and pacing are">{c.score}</b>
                        {timecode(c.end_seconds - c.start_seconds, false)}
                        {busy ? ' · rendering' : changed ? ' · edited' : j?.status === 'failed' ? ' · render failed' : ''}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <section className="ws-stage" aria-label="Preview">
          <div className="ws-modes" role="tablist" aria-label="Preview mode">
            <button role="tab" aria-selected={!draftMode} onClick={() => setMode('rendered')} disabled={!sel.clip_url}>Rendered</button>
            <button role="tab" aria-selected={draftMode} onClick={() => setMode('draft')} disabled={!sourceUrl}>
              {dirty ? 'Your changes' : 'Live preview'}
            </button>
          </div>
          <div className="ws-frame" style={{ aspectRatio: draftMode ? `${aspect.width} / ${aspect.height}` : undefined }}>
            <video
              ref={vref}
              key={draftMode ? 'src' : sel.clip_url ?? 'none'}
              src={draftMode ? sourceUrl ?? undefined : sel.clip_url ?? undefined}
              poster={draftMode ? undefined : sel.thumb_url ?? undefined}
              playsInline
              preload="metadata"
              style={draftMode ? { objectFit: 'cover', objectPosition: objPos } : undefined}
              onTimeUpdate={onTime}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onLoadedMetadata={(e) => { const v = e.currentTarget; if (draftMode) setSrcSize({ w: v.videoWidth, h: v.videoHeight }); }}
              onClick={togglePlay}
            />
            {cap && (
              <div className={`cap cap-${style.id}`} style={capStyle(style)} aria-hidden="true">
                <span>
                  {cap.group.map((w, k) => (
                    <span key={k} style={k === cap.index && style.highlight ? { color: style.highlight } : undefined}>
                      {style.uppercase ? w.text.trim().toUpperCase() : w.text.trim()}{' '}
                    </span>
                  ))}
                </span>
              </div>
            )}
            {rendering && (
              <div className="ws-rendering" role="status">
                <div className="bar"><i style={{ width: `${Math.max(4, job!.progress)}%` }} /></div>
                <span>{job!.status === 'queued' ? 'Waiting for a worker' : `Rendering · ${job!.output?.stage ?? 'working'} · ${job!.progress}%`}</span>
              </div>
            )}
          </div>
          <div className="ws-transport">
            <button className="ws-play" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
              {playing
                ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
                : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>}
            </button>
            <span className="tc">{timecode(draftMode ? Math.max(0, t - draft.start) : t)} / {timecode(draftMode ? len : (sel.end_seconds - sel.start_seconds))}</span>
            {draftMode && !sel.clip_url && <span className="ws-note">Not rendered yet</span>}
            {draftMode && dirty && <span className="ws-note">Preview of unrendered changes</span>}
            {job?.status === 'failed' && <span className="ws-note err">{renderError(job.error)}</span>}
          </div>
        </section>

        <aside className="ws-inspect" aria-label="Clip settings">
          <div className="fld">
            <label className="field-label" htmlFor="ws-title">Title</label>
            <input id="ws-title" className="input" value={draft.title} maxLength={200} onChange={(e) => setDraft({ title: e.target.value })} />
            {sel.why_it_performed && <p className="fld-hint">{sel.why_it_performed}</p>}
          </div>

          <fieldset className="fld">
            <legend className="field-label">Captions</legend>
            <div className="styles">
              {CAPTION_STYLES.map((s) => (
                <label key={s.id} className={`style-opt${draft.captionStyle === s.id ? ' on' : ''}`}>
                  <input type="radio" name="cap" value={s.id} checked={draft.captionStyle === s.id} onChange={() => setDraft({ captionStyle: s.id })} className="sr-only" />
                  <span className={`style-swatch sw-${s.id}`} aria-hidden="true">
                    {s.id === 'none' ? '—' : <><span>{s.uppercase ? 'SAY ' : 'Say '}</span><span style={s.highlight ? { color: s.highlight } : undefined}>{s.uppercase ? 'IT' : 'it'}</span></>}
                  </span>
                  <span className="style-name">{s.label}</span>
                </label>
              ))}
            </div>
            {words !== null && words.length === 0 && draft.captionStyle !== 'none' && (
              <p className="fld-hint">This project was clipped before transcripts were saved, so captions don't show in the live preview. They're still burned in when you render.</p>
            )}
          </fieldset>

          <fieldset className="fld">
            <legend className="field-label">Format</legend>
            <div className="seg2">
              {ASPECTS.map((a) => (
                <label key={a.id} className={draft.aspect === a.id ? 'on' : ''}>
                  <input type="radio" name="aspect" className="sr-only" checked={draft.aspect === a.id} onChange={() => setDraft({ aspect: a.id })} />
                  <span className="ar-ic" style={{ aspectRatio: `${a.width} / ${a.height}` }} aria-hidden="true" />
                  {a.id}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="fld">
            <legend className="field-label">Framing</legend>
            <label className="check">
              <input type="checkbox" checked={draft.cropX === null} onChange={(e) => setDraft({ cropX: e.target.checked ? null : 0.5 })} />
              Follow the speaker's face
            </label>
            {draft.cropX !== null && (
              <div className="range-row">
                <span aria-hidden="true">Left</span>
                <input type="range" min={0} max={1} step={0.01} value={draft.cropX} aria-label="Horizontal framing"
                  onChange={(e) => setDraft({ cropX: Number(e.target.value) })} />
                <span aria-hidden="true">Right</span>
              </div>
            )}
            {draft.cropX === null && <p className="fld-hint">The render centres on the largest face it finds. The live preview shows the centre of the frame.</p>}
          </fieldset>

          <div className="fld ws-danger">
            {!confirmDelete
              ? <button className="btn btn-ghost sm" onClick={() => setConfirmDelete(true)}>Delete clip</button>
              : <span className="confirm">Delete this clip for good? <button className="btn btn-danger sm" onClick={() => void remove()}>Delete</button> <button className="btn btn-ghost sm" onClick={() => setConfirmDelete(false)}>Keep</button></span>}
          </div>
        </aside>

        <section className="ws-time" aria-label="Trim">
          <div className="tl-head">
            <span className="tl-range">
              <span className="tc">{timecode(draft.start)}</span> to <span className="tc">{timecode(draft.end)}</span>
              <b>{timecode(len)}</b>
            </span>
            <span className="tl-keys">
              <button className="btn btn-outline xs" onClick={() => setIn(snapToWord(words ?? [], sourceT, 'start'))}>Set start <kbd>I</kbd></button>
              <button className="btn btn-outline xs" onClick={() => setOut(snapToWord(words ?? [], sourceT, 'end'))}>Set end <kbd>O</kbd></button>
              {dirty && <button className="btn btn-ghost xs" onClick={() => { setDrafts((d) => { const n = { ...d }; delete n[sel.id]; return n; }); setMode('rendered'); }}>Undo changes</button>}
            </span>
          </div>
          <div className="tl-track"
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest('.tl-handle')) return;
              const r = e.currentTarget.getBoundingClientRect();
              seek(winStart + ((e.clientX - r.left) / r.width) * (winEnd - winStart));
            }}>
            <div className="tl-sel" style={{ left: pct(draft.start), width: `calc(${pct(draft.end)} - ${pct(draft.start)})` }} />
            <Handle label="Clip start" value={draft.start} min={winStart} max={draft.end - MIN_CLIP_SECONDS} pos={pct(draft.start)}
              onChange={(v) => setIn(v)} snap={(v) => snapToWord(words ?? [], v, 'start')} toTime={(x) => winStart + x * (winEnd - winStart)} />
            <Handle label="Clip end" value={draft.end} min={draft.start + MIN_CLIP_SECONDS} max={Math.min(total, draft.start + MAX_CLIP_SECONDS)} pos={pct(draft.end)}
              onChange={(v) => setOut(v)} snap={(v) => snapToWord(words ?? [], v, 'end')} toTime={(x) => winStart + x * (winEnd - winStart)} />
            {draftMode && <div className="tl-head-line" style={{ left: pct(t) }} aria-hidden="true" />}
          </div>
          <p className="tl-words" aria-label="Transcript. Select a word to jump to it.">
            {words === null && <span className="tl-loading">Loading transcript…</span>}
            {words !== null && winWords.length === 0 && <span className="tl-loading">No transcript for this project. Drag the handles or use I and O while playing.</span>}
            {winWords.map((w, k) => {
              const inRange = w.start >= draft.start - 0.01 && w.end <= draft.end + 0.01;
              const now = draftMode && t >= w.start && t < w.end;
              return (
                <button key={k} className={`w${inRange ? ' in' : ''}${now ? ' now' : ''}`} onClick={() => seek(w.start)}
                  title={timecode(w.start)}>{w.text.trim()}</button>
              );
            })}
          </p>
        </section>
      </div>
    </div>
  );
}

function capStyle(s: ReturnType<typeof styleById>): React.CSSProperties {
  // Sizes are defined on a 1080-wide frame; container query units scale them to the preview.
  const px = (n: number) => `calc(${n} / 1080 * 100cqw)`;
  return {
    bottom: `${s.position * 100}%`,
    fontSize: px(s.size),
    color: s.color,
    WebkitTextStroke: s.outline && !s.box ? `${px(s.outlineWidth / 2.2)} ${s.outline}` : undefined,
    textShadow: s.box ? undefined : `0 ${px(3)} ${px(8)} rgb(0 0 0 / .45)`,
    ['--box' as string]: s.box ?? 'transparent',
  };
}

function Handle({ label, value, min, max, pos, onChange, snap, toTime }: {
  label: string; value: number; min: number; max: number; pos: string;
  onChange: (v: number) => void; snap: (v: number) => number; toTime: (fraction: number) => number;
}) {
  return (
    <div
      className="tl-handle"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={Math.round(min * 10) / 10}
      aria-valuemax={Math.round(max * 10) / 10}
      aria-valuenow={Math.round(value * 10) / 10}
      aria-valuetext={timecode(value)}
      style={{ left: pos }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 1 : 0.1;
        if (e.key === 'ArrowLeft') { e.preventDefault(); onChange(value - step); }
        if (e.key === 'ArrowRight') { e.preventDefault(); onChange(value + step); }
      }}
      onPointerDown={(e) => {
        e.preventDefault();
        const track = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
        const el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        const move = (ev: PointerEvent) => onChange(toTime(Math.max(0, Math.min(1, (ev.clientX - track.left) / track.width))));
        const up = (ev: PointerEvent) => {
          onChange(snap(toTime(Math.max(0, Math.min(1, (ev.clientX - track.left) / track.width)))));
          el.removeEventListener('pointermove', move);
          el.removeEventListener('pointerup', up);
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
      }}
    />
  );
}
