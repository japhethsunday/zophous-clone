/* ============================================================
   DIRECTOR — long-form project view in the Suite layout language.
   One upload becomes a production board: the source film with a
   real timeline scrub, every scored clip as a scene card on the
   same time axis, format chips per scene, and an export strip.
   Aurora theme tokens only; reuses ClipWorkspace for deep edits.
   ============================================================ */
import { useMemo, useState } from 'react';
import type { Clip, Video } from './lib/supabase';
import { fmtDur } from './suite-data';
import { SuiteIcon as Ic } from './suite-icons';
import './clips/clips.css';

const SCORE_TONE = (s: number) => (s >= 80 ? 'hot' : s >= 62 ? 'warm' : 'cool');

export default function DirectorPage({
  videos, clips, onOpenVideo, onBack,
}: {
  videos: Video[];
  clips: Clip[];
  onOpenVideo: (id: string) => void;
  onBack: () => void;
}) {
  const projects = useMemo(
    () => videos.filter((v) => v.mode === 'clips').sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)),
    [videos],
  );
  const [selId, setSelId] = useState<string>('');
  const sel = projects.find((p) => p.id === selId) ?? projects[0];

  if (!sel) {
    return (
      <div className="page-pad suite">
        <h1 className="home-h1 serif">Director</h1>
        <p className="lib-empty">
          No long-form projects yet. <button className="lnk" onClick={onBack}>Go back to the Suite</button> and start a Clip job — finished uploads open here as a production board.
        </p>
      </div>
    );
  }

  const scenes = clips
    .filter((c) => c.video_id === sel.id)
    .sort((a, b) => a.start_seconds - b.start_seconds);
  const total = Math.max(sel.duration_seconds || 0, scenes.length ? scenes[scenes.length - 1].end_seconds : 0, 1);
  const avg = scenes.length ? Math.round(scenes.reduce((s, c) => s + (c.score ?? 0), 0) / scenes.length) : 0;
  const best = scenes.reduce<Clip | null>((m, c) => (!m || (c.score ?? 0) > (m.score ?? 0) ? c : m), null);

  return (
    <div className="page-pad suite director">
      <div className="dir-top">
        <button className="lnk dir-back" onClick={onBack}><Ic name="back" size={14} /> Suite</button>
        <h1 className="home-h1 serif">Director</h1>
        <span className="dir-count">{projects.length} project{projects.length === 1 ? '' : 's'}</span>
      </div>

      {/* project switcher rail */}
      <div className="suite-rail dir-rail">
        {projects.map((p) => {
          const n = clips.filter((c) => c.video_id === p.id).length;
          return (
            <button key={p.id} className={`suite-tile dir-pick${p.id === sel.id ? ' on' : ''}`} onClick={() => setSelId(p.id)}>
              <strong>{p.title}</strong>
              <p>{fmtDur(p.duration_seconds)} · {n} scene{n === 1 ? '' : 's'} · {p.status}</p>
            </button>
          );
        })}
      </div>

      {/* stat strip */}
      <div className="dir-stats">
        <span><b>{scenes.length}</b> scenes found</span>
        <span><b>{avg}</b> avg score</span>
        <span><b>{fmtDur(total)}</b> runtime</span>
        {best && <span><b>{Math.round(best.score ?? 0)}</b> top: “{best.title?.slice(0, 34)}{best.title && best.title.length > 34 ? '…' : ''}”</span>}
      </div>

      {/* timeline */}
      <section>
        <h2 className="lib-h2">Timeline</h2>
        <div className="dir-track" aria-label={`Timeline of ${sel.title}`}>
          <div className="dir-track-base"><i style={{ width: `${Math.max(3, sel.progress ?? (sel.status === 'ready' ? 100 : 0))}%` }} /></div>
          {scenes.map((c) => {
            const left = (c.start_seconds / total) * 100;
            const w = Math.max(1.2, ((c.end_seconds - c.start_seconds) / total) * 100);
            return (
              <button
                key={c.id}
                className={`dir-mark sc-${SCORE_TONE(c.score ?? 0)}`}
                style={{ left: `${left}%`, width: `${w}%` }}
                title={`${c.title} · ${fmtDur(c.end_seconds - c.start_seconds)} · score ${Math.round(c.score ?? 0)}`}
                onClick={() => onOpenVideo(sel.id)}
              />
            );
          })}
          {sel.status !== 'ready' && <span className="dir-track-note">{sel.status === 'failed' ? 'Job failed — retry from Clips' : 'Scenes appear on the bar as they are found…'}</span>}
        </div>
      </section>

      {/* scene cards */}
      <section>
        <h2 className="lib-h2">Scene cards</h2>
        {scenes.length === 0 ? (
          <p className="lib-empty">No scenes yet — this project is still being watched by the moment finder.</p>
        ) : (
          <div className="dir-grid">
            {scenes.map((c, i) => (
              <article key={c.id} className={`dir-card sc-${SCORE_TONE(c.score ?? 0)}`}>
                <div className="dir-card-media">
                  {c.thumb_url ? <img src={c.thumb_url} alt="" loading="lazy" /> : <span className="thumb-ph wide" />}
                  <span className="dir-scene-n">SC {String(i + 1).padStart(2, '0')}</span>
                  <span className="suite-shot-score">{Math.round(c.score ?? 0)}</span>
                </div>
                <div className="dir-card-body">
                  <strong>{c.title}</strong>
                  <span className="asset-meta">
                    {fmtDur(c.start_seconds)} → {fmtDur(c.end_seconds)} · {fmtDur(c.end_seconds - c.start_seconds)}
                  </span>
                  {(c.hook || c.tone) && (
                    <div className="suite-chips tight">
                      {c.hook && <span className="suite-chip on">{c.hook}</span>}
                      {c.tone && <span className="suite-chip">{c.tone}</span>}
                    </div>
                  )}
                  {c.why_it_performed && <p className="dir-why">{c.why_it_performed}</p>}
                  <div className="asset-actions">
                    <button className="lnk" onClick={() => onOpenVideo(sel.id)}>Open in workspace</button>
                    {c.clip_url && <a className="lnk" href={c.clip_url} download>Export</a>}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* export strip */}
      <section className="dir-export">
        <h2 className="lib-h2">Export reel</h2>
        <p className="sub-left">Rank order, one tap each — the highest scoring scenes first.</p>
        <div className="suite-cards two">
          <button className="suite-card" onClick={() => onOpenVideo(sel.id)} disabled={!scenes.length}>
            <span className="tool-ic tone-pink"><Ic name="download" size={16} /></span>
            <strong>Download all {scenes.length} clips</strong>
            <span className="suite-card-sub">Opens the workspace where you can pick caption style and watermark before export.</span>
          </button>
          <button className="suite-card" onClick={() => onOpenVideo(sel.id)} disabled={!scenes.length}>
            <span className="tool-ic tone-violet"><Ic name="calendar" size={16} /></span>
            <strong>Schedule the reel</strong>
            <span className="suite-card-sub">Queue {scenes.length} vertical posts to TikTok, Reels and Shorts from Settings → Connections.</span>
          </button>
        </div>
      </section>
    </div>
  );
}
