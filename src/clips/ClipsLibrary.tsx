// Clips library: import a source video, watch processing, open finished clip sets in the editor.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Clip, Profile, Video } from '../lib/supabase';
import { readVideoDuration, supabase } from '../lib/supabase';
import { checkUpload, UPLOAD_LIMIT_BYTES, uploadSource } from '../lib/uploads';
import { timecode } from './captions';
import './clips.css';

const STAGES: Array<[number, string]> = [
  [55, 'Rendering clips'],
  [45, 'Finding the best moments'],
  [12, 'Transcribing speech'],
  [5, 'Downloading the source'],
  [0, 'Waiting for a worker'],
];

/** The worker reports fixed progress points per step (worker/cloudnivo_worker/pipeline.py). */
export function stageLabel(v: Pick<Video, 'status' | 'progress'>): string {
  if (v.status === 'queued') return 'Waiting for a worker';
  const p = v.progress ?? 0;
  return (STAGES.find(([min]) => p >= min) ?? STAGES[STAGES.length - 1])[1];
}

export function friendlyClipError(code: string | null | undefined): string {
  const map: Record<string, string> = {
    video_too_short: 'The video is under 20 seconds, which is too short to clip.',
    no_audio_track: 'This video has no sound, so there is no speech to find moments in.',
    no_speech_found: 'No speech was found. Clips are picked from what people say.',
    OUT_OF_MINUTES: 'Not enough minutes left this month.',
  };
  return (code && map[code]) || 'Processing stopped with an error. Your minutes were returned.';
}

function ago(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

type Picked = { file: File; duration: number; title: string };

export default function ClipsLibrary({
  profile,
  videos,
  clips,
  minutesLeft,
  resetLabel,
  onOpen,
  refresh,
  showToast,
  onFirstVideo,
}: {
  profile: Profile;
  videos: Video[];
  clips: Clip[];
  minutesLeft: number;
  resetLabel: string;
  onOpen: (videoId: string) => void;
  refresh: () => Promise<void>;
  showToast: (m: string) => void;
  onFirstVideo: () => void;
}) {
  const [picked, setPicked] = useState<Picked | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [upload, setUpload] = useState<{ fraction: number; label: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sets = useMemo(() => videos.filter((v) => v.mode === 'clips'), [videos]);
  const maxMb = Math.round(UPLOAD_LIMIT_BYTES[profile.plan] / 1048576);

  const pick = useCallback(async (file: File | undefined | null) => {
    setProblem(null);
    if (!file) return;
    const check = checkUpload(file, profile.plan);
    if (!check.ok || !file.type.startsWith('video/')) {
      setProblem(check.ok ? 'Choose a video file: MP4, MOV or WebM.' : check.reason);
      return;
    }
    try {
      const duration = await readVideoDuration(file);
      if (!Number.isFinite(duration) || duration < 30) {
        setProblem('This video is under 30 seconds. Clips are cut from longer videos.');
        return;
      }
      setPicked({ file, duration, title: file.name.replace(/\.[^.]+$/, '') });
    } catch {
      setProblem('This file could not be read as a video. It may be damaged or use an unsupported codec.');
    }
  }, [profile.plan]);

  const needed = picked ? Math.max(1, Math.ceil(picked.duration / 60)) : 0;
  const enough = needed <= minutesLeft;

  const start = async () => {
    if (!picked || !enough) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      setUpload({ fraction: 0, label: 'Uploading' });
      const asset = await uploadSource(picked.file, profile.plan, (f) => setUpload({ fraction: f, label: 'Uploading' }), ctrl.signal);
      setUpload({ fraction: 1, label: 'Queuing' });
      const { data, error } = await supabase.functions.invoke('clips-create', {
        body: { assetId: asset.id, title: picked.title.trim() || 'Untitled video', durationSeconds: picked.duration, idempotencyKey: crypto.randomUUID() },
      });
      if (error) {
        let msg = 'Could not start processing.';
        try { msg = (await (error as { context?: Response }).context?.json())?.message ?? msg; } catch { /* keep default */ }
        throw new Error(msg);
      }
      void data;
      setPicked(null);
      onFirstVideo();
      showToast('Uploaded. Clips are usually ready in a few minutes; this page updates on its own.');
      await refresh();
    } catch (e) {
      if ((e as Error).name === 'AbortError') showToast('Upload cancelled.');
      else setProblem(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setUpload(null);
      abortRef.current = null;
    }
  };

  // Refresh while something is processing, so progress and finished clips appear.
  const busy = sets.some((v) => v.status === 'queued' || v.status === 'analyzing');
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => void refresh(), 6000);
    return () => clearInterval(t);
  }, [busy, refresh]);

  return (
    <div className="page-pad lib">
      <header className="lib-head">
        <div>
          <h1>Clips</h1>
          <p>Upload a long video. Cloudnivo transcribes it, finds the moments worth sharing and cuts them into captioned clips you can edit.</p>
        </div>
        <div className="lib-allowance" title={`Resets ${resetLabel}`}>
          <strong>{minutesLeft}</strong> of {profile.minutes_limit} minutes left
          <span>Resets {resetLabel}</span>
        </div>
      </header>

      <section
        className={`drop${drag ? ' is-drag' : ''}${picked ? ' has-file' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (!upload) void pick(e.dataTransfer.files?.[0]); }}
        aria-label="Upload a video"
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm"
          className="sr-only"
          id="clip-file"
          onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }}
        />
        {!picked && (
          <div className="drop-empty">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M10 9.5v5l4-2.5z" fill="currentColor" stroke="none" /></svg>
            <div>
              <strong>Drop a video here, or <label htmlFor="clip-file" className="drop-link">choose a file</label></strong>
              <span>MP4, MOV or WebM with speech · up to {maxMb >= 1024 ? `${maxMb / 1024} GB` : `${maxMb} MB`} · 30 seconds to 3 hours</span>
            </div>
          </div>
        )}
        {picked && (
          <div className="drop-file">
            <div className="drop-meta">
              <label className="field-label" htmlFor="clip-title">Project name</label>
              <input id="clip-title" className="input" value={picked.title} disabled={!!upload}
                onChange={(e) => setPicked({ ...picked, title: e.target.value })} maxLength={120} />
              <span className="drop-facts">
                {picked.file.name} · {(picked.file.size / 1048576).toFixed(0)} MB · {timecode(picked.duration, false)} long ·
                {enough ? ` uses ${needed} min` : ` needs ${needed} min, you have ${minutesLeft}`}
              </span>
            </div>
            {upload ? (
              <div className="drop-progress" role="status" aria-live="polite">
                <div className="bar" aria-hidden="true"><i style={{ width: `${Math.round(upload.fraction * 100)}%` }} /></div>
                <span>{upload.label} {upload.label === 'Uploading' ? `${Math.round(upload.fraction * 100)}%` : '…'}</span>
                {upload.label === 'Uploading' && (
                  <button className="btn btn-outline sm" onClick={() => abortRef.current?.abort()}>Cancel</button>
                )}
              </div>
            ) : (
              <div className="drop-actions">
                <button className="btn btn-ghost sm" onClick={() => setPicked(null)}>Remove</button>
                <button className="btn btn-primary" disabled={!enough} onClick={() => void start()}>Find clips</button>
              </div>
            )}
          </div>
        )}
        {problem && <p className="drop-problem" role="alert">{problem}</p>}
      </section>

      <section aria-labelledby="proj-h">
        <h2 id="proj-h" className="lib-h2">Projects <span>{sets.length}</span></h2>
        {sets.length === 0 ? (
          <p className="lib-empty">Your first project appears here as soon as the upload finishes. Podcasts, interviews, streams and talks work best.</p>
        ) : (
          <ul className="proj-list">
            {sets.map((v) => {
              const vc = clips.filter((c) => c.video_id === v.id).sort((a, b) => a.start_seconds - b.start_seconds);
              const working = v.status === 'queued' || v.status === 'analyzing';
              return (
                <li key={v.id} className={`proj proj-${v.status}`}>
                  <button className="proj-strip" onClick={() => onOpen(v.id)} disabled={!vc.length} aria-label={`Open ${v.title} in the editor`}>
                    {vc.length ? vc.slice(0, 5).map((c) => (
                      c.thumb_url ? <img key={c.id} src={c.thumb_url} alt="" loading="lazy" /> : <span key={c.id} className="thumb-ph" />
                    )) : <span className="thumb-ph wide" />}
                  </button>
                  <div className="proj-body">
                    <strong className="proj-title">{v.title}</strong>
                    {working && (
                      <div className="proj-work" role="status">
                        <div className="bar" aria-hidden="true"><i style={{ width: `${Math.max(3, v.progress ?? 0)}%` }} /></div>
                        <span>{stageLabel(v)} · {v.progress ?? 0}%</span>
                      </div>
                    )}
                    {v.status === 'failed' && <span className="proj-err">{friendlyClipError(v.error)}</span>}
                    {v.status === 'ready' && (
                      <span className="proj-facts">{vc.length} {vc.length === 1 ? 'clip' : 'clips'} · from {timecode(v.duration_seconds, false)} of video · {ago(v.created_at)}</span>
                    )}
                  </div>
                  {v.status === 'ready' && vc.length > 0 && (
                    <button className="btn btn-outline sm" onClick={() => onOpen(v.id)}>Edit clips</button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
