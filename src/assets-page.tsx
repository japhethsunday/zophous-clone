/* ============================================================
   ASSETS — Cloudnivo media library, in the Suite layout language.
   Everything you have ever made in one grid: clips (with quick
   preview), posters/thumbs and audio stems. Filter, sort, search,
   open a clip's project, copy caption text or download.
   Aurora theme tokens only — no new visual language.
   ============================================================ */
import { useMemo, useState } from 'react';
import type { Clip, Video } from './lib/supabase';
import { assetsFromClips, fmtDur, presetById, VIRAL_PRESETS, type SuiteAsset } from './suite-data';
import { SuiteIcon as Ic } from './suite-icons';
import './clips/clips.css';

type Tab = 'all' | 'clip' | 'image' | 'audio';
type Sort = 'new' | 'old' | 'score' | 'title';

export default function AssetsPage({
  clips, videos, onOpenVideo, onNav, showToast,
}: {
  clips: Clip[];
  videos: Video[];
  onOpenVideo: (id: string) => void;
  onNav: (p: 'suite' | 'clips') => void;
  showToast: (t: string) => void;
}) {
  const [tab, setTab] = useState<Tab>('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('new');
  const [preset, setPreset] = useState<string>('');
  const [playing, setPlaying] = useState<string | null>(null);

  const all = useMemo<SuiteAsset[]>(() => {
    const clipAssets = assetsFromClips(clips);
    // posters are every rendered thumb — treat them as image assets
    const posters: SuiteAsset[] = clipAssets
      .filter((a) => a.thumb)
      .map((a) => ({ ...a, id: `${a.id}-poster`, kind: 'image', title: `${a.title} — poster`, url: a.thumb, score: null, duration: null }));
    // audio stems: transcript exists per project; expose source audio availability per video
    const audio: SuiteAsset[] = videos
      .filter((v) => v.source_path || v.source_url)
      .map((v) => ({
        id: `${v.id}-audio`, kind: 'audio', title: `${v.title} — audio`,
        url: v.source_url ?? null, thumb: null, videoId: v.id, score: null,
        duration: v.duration_seconds || null, createdAt: v.created_at,
        watermark: false, posted: false,
      }));
    return [...clipAssets, ...posters, ...audio];
  }, [clips, videos]);

  const counts = useMemo(() => ({
    all: all.length,
    clip: all.filter((a) => a.kind === 'clip').length,
    image: all.filter((a) => a.kind === 'image').length,
    audio: all.filter((a) => a.kind === 'audio').length,
  }), [all]);

  const list = useMemo(() => {
    let out = all;
    if (tab !== 'all') out = out.filter((a) => a.kind === tab);
    if (preset) out = out.filter((a) => a.presetId && (a.presetId.includes(preset) || preset.includes(a.presetId)));
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      out = out.filter((a) => a.title.toLowerCase().includes(s));
    }
    const by: Record<Sort, (a: SuiteAsset, b: SuiteAsset) => number> = {
      new: (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
      old: (a, b) => +new Date(a.createdAt) - +new Date(b.createdAt),
      score: (a, b) => (b.score ?? -1) - (a.score ?? -1),
      title: (a, b) => a.title.localeCompare(b.title),
    };
    return [...out].sort(by[sort]);
  }, [all, tab, q, sort, preset]);

  const usedPresets = useMemo(() => {
    const ids = new Set(all.map((a) => a.presetId).filter(Boolean) as string[]);
    return VIRAL_PRESETS.filter((p) => ids.has(p.id));
  }, [all]);

  const copyTranscript = async (c: Clip) => {
    try {
      await navigator.clipboard.writeText(c.transcript ?? c.title ?? '');
      showToast('Caption text copied');
    } catch {
      showToast('Could not copy — check browser permissions');
    }
  };

  const TABS: [Tab, string][] = [['all', 'All'], ['clip', 'Clips'], ['image', 'Posters'], ['audio', 'Audio']];

  return (
    <div className="page-pad suite assets">
      <div className="assets-head">
        <h1 className="home-h1 serif">Assets</h1>
        <p className="sub-left">Every clip, poster and stem you have made — searchable, sortable, one click from your projects.</p>
      </div>

      <div className="assets-toolbar">
        <div className="assets-tabs" role="tablist" aria-label="Asset type">
          {TABS.map(([t, label]) => (
            <button key={t} role="tab" aria-selected={tab === t} className={`assets-tab${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
              {label}<em>{counts[t]}</em>
            </button>
          ))}
        </div>
        <label className="assets-search">
          <Ic name="search" size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles…" aria-label="Search assets" />
          {q && <button className="assets-clear" aria-label="Clear search" onClick={() => setQ('')}>×</button>}
        </label>
        <select className="assets-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort assets">
          <option value="new">Newest first</option>
          <option value="old">Oldest first</option>
          <option value="score">Top score</option>
          <option value="title">A → Z</option>
        </select>
      </div>

      {usedPresets.length > 0 && (
        <div className="suite-chips">
          <button className={`suite-chip${preset === '' ? ' on' : ''}`} onClick={() => setPreset('')}>Any format</button>
          {usedPresets.map((p) => (
            <button key={p.id} className={`suite-chip${preset === p.id ? ' on' : ''}`} onClick={() => setPreset(preset === p.id ? '' : p.id)} title={p.desc}>
              {p.title}
            </button>
          ))}
        </div>
      )}

      {list.length === 0 ? (
        <p className="lib-empty">
          {all.length === 0
            ? <>Nothing here yet. <button className="lnk" onClick={() => onNav('clips')}>Upload a video</button> and your clips, posters and audio will collect right here.</>
            : <>No assets match this filter. <button className="lnk" onClick={() => { setQ(''); setTab('all'); setPreset(''); }}>Reset filters</button></>}
        </p>
      ) : (
        <div className="assets-grid">
          {list.map((a) => {
            const src = clips.find((c) => c.id === a.id);
            const pre = presetById(a.presetId ?? undefined)?.title;
            return (
              <article key={a.id} className={`asset-card kind-${a.kind}`}>
                <div className="asset-media">
                  {a.kind === 'clip' && playing === a.id && a.url ? (
                    <video src={a.url} controls autoPlay playsInline onEnded={() => setPlaying(null)} />
                  ) : a.thumb ? (
                    <img src={a.thumb} alt="" loading="lazy" />
                  ) : (
                    <span className="asset-ph"><Ic name={a.kind === 'audio' ? 'mic' : 'film'} size={26} /></span>
                  )}
                  {a.kind === 'clip' && !(playing === a.id && a.url) && (
                    <button className="asset-play" aria-label={`Preview ${a.title}`} disabled={!a.url} onClick={() => setPlaying(a.id)}>
                      <Ic name="play" size={16} />
                    </button>
                  )}
                  {a.score != null && <span className="suite-shot-score">{Math.round(a.score)}</span>}
                  <span className={`asset-badge tone-${a.kind === 'clip' ? 'pink' : a.kind === 'image' ? 'blue' : 'amber'}`}>{a.kind}</span>
                </div>
                <div className="asset-body">
                  <strong className="asset-title" title={a.title}>{a.title}</strong>
                  <span className="asset-meta">
                    {fmtDur(a.duration)} · {new Date(a.createdAt).toLocaleDateString()}
                    {pre ? ` · ${pre}` : ''}
                    {a.watermark ? ' · WM' : ''}
                    {a.posted ? ' · posted' : ''}
                  </span>
                  <div className="asset-actions">
                    {a.videoId && <button className="lnk" onClick={() => onOpenVideo(a.videoId!)}>Open project</button>}
                    {src?.transcript && <button className="lnk" onClick={() => void copyTranscript(src)}>Copy captions</button>}
                    {a.url && <a className="lnk" href={a.url} target="_blank" rel="noreferrer" download>Download</a>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="assets-foot">
        <button className="btn btn-outline sm" onClick={() => onNav('suite')}>Back to Suite</button>
      </div>
    </div>
  );
}
