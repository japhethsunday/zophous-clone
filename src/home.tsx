// Dashboard: pick up where you left off, or start something new.
import { useState } from 'react';
import type { Clip, Profile, Video } from './lib/supabase';
import { stageLabel } from './clips/ClipsLibrary';
import { timecode } from './clips/captions';
import './clips/clips.css';

type Dest = 'clips' | 'gen' | 'brand' | 'settings';

export default function HomePage({
  profile, clips, videos, onNav, onOpenVideo,
}: {
  profile: Profile;
  clips: Clip[];
  videos: Video[];
  checklist?: Record<string, boolean>;
  onNav: (p: Dest) => void;
  onOpenVideo: (id: string) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const projects = videos.filter((v) => v.mode === 'clips').slice(0, 4);
  const recent = [...clips].filter((c) => c.clip_url || c.thumb_url)
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).slice(0, 8);
  const first = (profile.display_name ?? '').split(/[\s@._-]/)[0];
  const left = profile.minutes_limit - profile.minutes_used;

  const generate = (text: string) => {
    if (!text.trim()) return;
    sessionStorage.setItem('cn_gen_prompt', text.trim());
    onNav('gen');
  };

  return (
    <div className="page-pad home">
      <h1 className="home-h1">{first ? `Welcome back, ${first}` : 'Welcome back'}</h1>

      <div className="starts">
        <button className="start start-clip" onClick={() => onNav('clips')}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12" /></svg>
          <span>
            <strong>Clip a long video</strong>
            <span>Upload a podcast, stream or talk and get captioned shorts. {left} minutes left this month.</span>
          </span>
        </button>
        <form className="start start-gen" onSubmit={(e) => { e.preventDefault(); generate(prompt); }}>
          <label htmlFor="home-prompt"><strong>Generate from a prompt</strong></label>
          <div className="gen-row">
            <input id="home-prompt" className="input" value={prompt} onChange={(e) => setPrompt(e.target.value)}
              placeholder="A 30 second story about how octopuses think" />
            <button className="btn btn-outline" type="submit" disabled={!prompt.trim()}>Generate</button>
          </div>
        </form>
      </div>

      <section aria-labelledby="h-proj">
        <div className="sec-row">
          <h2 id="h-proj" className="lib-h2">Projects</h2>
          {videos.length > 0 && <button className="lnk" onClick={() => onNav('clips')}>All projects</button>}
        </div>
        {projects.length === 0 ? (
          <p className="lib-empty">No projects yet. <button className="lnk" onClick={() => onNav('clips')}>Upload your first video</button> and the clips it produces show up here.</p>
        ) : (
          <ul className="proj-list">
            {projects.map((v) => {
              const vc = clips.filter((c) => c.video_id === v.id);
              const working = v.status === 'queued' || v.status === 'analyzing';
              return (
                <li key={v.id} className={`proj proj-${v.status}`}>
                  <button className="proj-strip" onClick={() => onOpenVideo(v.id)} disabled={!vc.length} aria-label={`Open ${v.title}`}>
                    {vc.length ? vc.slice(0, 5).map((c) => (c.thumb_url ? <img key={c.id} src={c.thumb_url} alt="" loading="lazy" /> : <span key={c.id} className="thumb-ph" />))
                      : <span className="thumb-ph wide" />}
                  </button>
                  <div className="proj-body">
                    <strong className="proj-title">{v.title}</strong>
                    {working && (
                      <div className="proj-work" role="status">
                        <div className="bar" aria-hidden="true"><i style={{ width: `${Math.max(3, v.progress ?? 0)}%` }} /></div>
                        <span>{stageLabel(v)} · {v.progress ?? 0}%</span>
                      </div>
                    )}
                    {v.status === 'failed' && <span className="proj-err">Processing failed. Open Clips for details.</span>}
                    {v.status === 'ready' && <span className="proj-facts">{vc.length} clips · {timecode(v.duration_seconds, false)} of video</span>}
                  </div>
                  {v.status === 'ready' && vc.length > 0 && <button className="btn btn-outline sm" onClick={() => onOpenVideo(v.id)}>Edit clips</button>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {recent.length > 0 && (
        <section aria-labelledby="h-clips">
          <h2 id="h-clips" className="lib-h2">Recent clips</h2>
          <ul className="shelf">
            {recent.map((c) => (
              <li key={c.id}>
                <button className="shelf-item" onClick={() => onOpenVideo(c.video_id)}>
                  <span className="shelf-thumb">{c.thumb_url ? <img src={c.thumb_url} alt="" loading="lazy" /> : null}
                    <span className="shelf-len">{timecode(c.end_seconds - c.start_seconds, false)}</span></span>
                  <strong>{c.title}</strong>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
