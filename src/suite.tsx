/* ============================================================
   SUITE — creator-suite style home (OpenArt layout language),
   rebuilt entirely in the Cloudnivo "Aurora" theme. It mirrors
   the structure (prompt bar, agents row, presets rail, tool
   grid, model cards, inspiration feed) but every destination,
   tool and piece of copy is Cloudnivo's own. Existing theme
   tokens, radii, tones and components only — no restyle.
   ============================================================ */
import { useState } from 'react';
import type { Clip, Profile, Video } from './lib/supabase';
import { stageLabel } from './clips/ClipsLibrary';
import { VIRAL_PRESETS, fmtDur } from './suite-data';
import { SuiteIcon } from './suite-icons';
import './clips/clips.css';

export type SuiteDest = 'home' | 'suite' | 'assets' | 'director' | 'clips' | 'gen' | 'brand' | 'settings';

type Preset = import('./suite-data').ClipFormat;

/* ---------------- data (Cloudnivo's own tools & formats) ---------------- */

const STARTER_PROMPTS: [string, string][] = [
  ['Turn my podcast into shorts', 'Clip a long talk into captioned 9:16 moments.'],
  ['Product ad for my store', 'A 15-second energetic ad from a prompt.'],
  ['A 30s story about how octopuses think', 'Narrated story video with scenes and captions.'],
  ['Explainer for my SaaS signup flow', 'Calm, clear explainer with voiceover.'],
];

type Tool = { id: string; name: string; desc: string; badge?: string; icon: string; tone: string; go?: SuiteDest; prompt?: string };

const SUITE_TOOLS: Tool[] = [
  { id: 'clip', name: 'Clip a video', desc: 'Long upload in, captioned shorts out', icon: 'scissors', tone: 'pink', go: 'clips' },
  { id: 'story', name: 'Story video', desc: 'Script, voiceover, scenes and captions from a prompt', badge: 'AI', icon: 'film', tone: 'violet', prompt: 'Create a narrated story video about ' },
  { id: 'motion', name: 'Motion clip', desc: 'Short AI motion clip, 480p', icon: 'sparkles', tone: 'green', prompt: 'A short motion clip: subject, motion, lighting, mood — ' },
  { id: 'image', name: 'Still image', desc: 'FLUX images from a prompt', icon: 'diamond', tone: 'blue', prompt: 'An image of ' },
  { id: 'captions', name: 'Relabel captions', desc: 'Restyle word-by-word captions on any finished clip', icon: 'type', tone: 'amber', go: 'clips' },
  { id: 'schedule', name: 'Schedule posts', desc: 'Queue clips to TikTok, Reels and Shorts', badge: 'NEW', icon: 'calendar', tone: 'teal', go: 'settings' },
  { id: 'brand', name: 'Brand kit', desc: 'Lock colors, fonts and logo into every clip', icon: 'palette', tone: 'pink', go: 'brand' },
  { id: 'dna', name: 'Clip DNA', desc: 'Patterns that made your clips perform', icon: 'chart', tone: 'violet', go: 'clips' },
  { id: 'assets', name: 'Assets library', desc: 'Every clip, poster and stem in one searchable grid', icon: 'layers', tone: 'blue', go: 'assets' },
  { id: 'director', name: 'Director mode', desc: 'Your long videos as scored production boards', icon: 'megaphone', tone: 'violet', go: 'director' },
];

type ModelCard = { name: string; tag: string; desc: string; icon: string; tone: string; go: SuiteDest };

const LATEST_MODELS: ModelCard[] = [
  { name: 'Story video', tag: 'Narration pipeline', desc: 'Script, voiceover, scene renders and burned-in captions in one job.', icon: 'film', tone: 'pink', go: 'gen' },
  { name: 'Wan 2.2', tag: 'Motion model', desc: 'Fast 480p text-to-video for b-roll, loops and teasers.', icon: 'sparkles', tone: 'green', go: 'gen' },
  { name: 'FLUX', tag: 'Image model', desc: 'Stills for thumbnails, posters and brand frames.', icon: 'diamond', tone: 'blue', go: 'gen' },
  { name: 'Whisper moment finder', tag: 'Transcription', desc: 'Word-level transcription plus hook scoring across your whole upload.', icon: 'mic', tone: 'amber', go: 'clips' },
];

type InspireCat = { name: string; blurb: string; filter: string };

const INSPIRE_CATS: InspireCat[] = [
  { name: 'Podcasts', blurb: 'Punchlines, hot takes and quote cards pulled from long talks', filter: 'podcast' },
  { name: 'Education', blurb: 'Explainers and concept clips that teach in under a minute', filter: 'explainer' },
  { name: 'Marketing', blurb: 'Product ads, offers and UGC-style promos', filter: 'ad' },
  { name: 'Stories', blurb: 'Narrated AI stories with scenes and voiceover', filter: 'story' },
  { name: 'Gaming', blurb: 'Stream highlights, clutch moments and montages', filter: 'gaming' },
  { name: 'Interviews', blurb: 'Q&A splits with speaker-tracked faces', filter: 'interview' },
];

/* ---------------- section header ---------------- */

function SectionHead({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="sec-row">
      <h2 className="lib-h2">{title}</h2>
      {action && <button className="lnk" onClick={onAction}>{action}</button>}
    </div>
  );
}

/* ---------------- main page ---------------- */

export default function SuitePage({
  profile, clips, videos, onNav, onOpenVideo, onPrompt,
}: {
  profile: Profile;
  clips: Clip[];
  videos: Video[];
  onNav: (p: SuiteDest) => void;
  onOpenVideo: (id: string) => void;
  onPrompt: (text: string) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [cat, setCat] = useState<string>('');
  const first = (profile.display_name ?? '').split(/[\s@._-]/)[0];
  const minutesLeft = profile.minutes_limit - profile.minutes_used;

  const projects = videos.filter((v) => v.mode === 'clips').slice(0, 3);
  const gallery = [...clips].filter((c) => c.thumb_url)
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).slice(0, 12);

  const feed = cat
    ? gallery.filter((c) => (c.title ?? '').toLowerCase().includes(cat))
    : gallery;

  const run = (text: string) => { if (text.trim()) onPrompt(text.trim()); };

  return (
    <div className="page-pad suite">
      {/* greeting + prompt bar */}
      <h1 className="home-h1 serif">{first ? `What are we making today, ${first}?` : 'What are we making today?'}</h1>
      <form className="suite-bar" onSubmit={(e) => { e.preventDefault(); run(prompt); }}>
        <span className="suite-bar-ic"><SuiteIcon name="sparkles" size={18} /></span>
        <input
          className="suite-bar-input"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe what you want to make — a clip, a story, an ad…"
          aria-label="Creation prompt"
        />
        <button className="btn btn-purple sm" type="submit" disabled={!prompt.trim()}>Create</button>
      </form>
      <div className="suite-chips">
        {STARTER_PROMPTS.map(([label]) => (
          <button key={label} className="suite-chip" onClick={() => { setPrompt(label); run(label); }}>{label}</button>
        ))}
      </div>

      {/* agents row — two headline workflows */}
      <section aria-labelledby="s-agents">
        <SectionHead title="AGENTS" />
        <div className="suite-cards two">
          <button className="suite-card" onClick={() => onNav('clips')}>
            <span className="tool-ic tone-pink"><SuiteIcon name="chat" size={18} /></span>
            <strong>Clip Mode</strong>
            <span className="suite-card-sub">Upload a long video, get scored captioned shorts. {minutesLeft} minutes left this month.</span>
          </button>
          <button className="suite-card" onClick={() => onNav('gen')}>
            <span className="tool-ic tone-cyan"><SuiteIcon name="megaphone" size={18} /></span>
            <strong>Studio Mode</strong>
            <span className="suite-card-sub">Full videos from a single prompt — script, voiceover, scenes and captions.</span>
          </button>
        </div>
      </section>

      {/* pinned projects */}
      <section aria-labelledby="s-proj">
        <SectionHead title="Your projects" action="Open in Director" onAction={() => onNav('director')} />
        {projects.length === 0 ? (
          <p className="lib-empty">Nothing here yet. <button className="lnk" onClick={() => onNav('clips')}>Upload your first video</button> and it will show up right here.</p>
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
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* presets — ids mirror FORMATS in worker/cloudnivo_worker/moments.py,
          so the same eight formats score clips in the pipeline */}
      <section aria-labelledby="s-pre">
        <SectionHead title="Trending clip presets" action="Use on any project" onAction={() => onNav('clips')} />
        <div className="suite-rail">
          {VIRAL_PRESETS.map((p) => (
            <article key={p.id} className="suite-tile">
              <span className="suite-tic-badge">{p.format}</span>
              <strong>{p.title}</strong>
              <p>{p.desc}</p>
              <button className="btn btn-outline sm" onClick={() => onPrompt(p.prompt)}>Use</button>
            </article>
          ))}
        </div>
      </section>

      {/* tools grid */}
      <section aria-labelledby="s-tools">
        <SectionHead title="Get started with tools" />
        <div className="suite-grid">
          {SUITE_TOOLS.map((t) => (
            <button
              key={t.id}
              className="suite-tool"
              onClick={() => (t.prompt ? onPrompt(t.prompt) : onNav(t.go ?? 'home'))}
            >
              <span className={`tool-ic tone-${t.tone}`}><SuiteIcon name={t.icon} size={16} /></span>
              <span className="suite-tool-txt">
                <strong>{t.name}{t.badge && <em className="suite-badge">{t.badge}</em>}</strong>
                <span>{t.desc}</span>
              </span>
              <SuiteIcon name="arrow" size={14} />
            </button>
          ))}
        </div>
      </section>

      {/* models */}
      <section aria-labelledby="s-models">
        <SectionHead title="Latest models" action="Open Studio" onAction={() => onNav('gen')} />
        <div className="suite-cards four">
          {LATEST_MODELS.map((m) => (
            <button key={m.name} className="suite-card tall" onClick={() => onNav(m.go)}>
              <span className={`tool-ic tone-${m.tone}`}><SuiteIcon name={m.icon} size={16} /></span>
              <strong>{m.name}</strong>
              <em>{m.tag}</em>
              <p>{m.desc}</p>
            </button>
          ))}
        </div>
      </section>

      {/* inspirations */}
      <section aria-labelledby="s-insp">
        <SectionHead title="Inspirations" action={cat ? 'Clear filter' : 'Open assets'} onAction={() => (cat ? setCat('') : onNav('assets'))} />
        <div className="suite-chips">
          {INSPIRE_CATS.map((c) => (
            <button key={c.name} className={`suite-chip${cat === c.filter ? ' on' : ''}`} onClick={() => setCat(cat === c.filter ? '' : c.filter)} title={c.blurb}>
              {c.name}
            </button>
          ))}
        </div>
        {feed.length === 0 ? (
          <p className="lib-empty">Finished clips appear here as inspiration once they render.</p>
        ) : (
          <div className="suite-feed">
            {feed.map((c) => (
              <button key={c.id} className="suite-shot" onClick={() => c.video_id && onOpenVideo(c.video_id)} aria-label={`Open clip ${c.title ?? ''}`}>
                <img src={c.thumb_url!} alt="" loading="lazy" />
                {c.score != null && <span className="suite-shot-score">{Math.round(c.score)}</span>}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
