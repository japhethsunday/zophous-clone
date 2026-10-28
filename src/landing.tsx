// Cloudnivo landing sections ("Studio split" layout).
// Split hero with a live pipeline preview, a 3-step timeline, and a bento grid of what
// the product really does today.

import React, { useEffect, useState } from 'react';

/* ---------- hero ---------- */

const STAGES = ['Uploading', 'Transcribing', 'Finding moments', 'Captioning', 'Ready'] as const;

function PipelinePreview() {
  // Loops through the real worker stages so visitors see how a long video becomes clips.
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setStep(STAGES.length - 1);
      return;
    }
    const t = setInterval(() => setStep((s) => (s + 1) % (STAGES.length + 1)), 1400);
    return () => clearInterval(t);
  }, []);
  const done = Math.min(step, STAGES.length - 1);
  const ready = step >= STAGES.length - 1;

  return (
    <div className="pipe" aria-label="Example: a 42-minute podcast becoming three short clips">
      <div className="pipe-head">
        <span className="pipe-dot" />
        <strong>podcast-episode-12.mp4</strong>
        <em>42:10</em>
      </div>
      <ol className="pipe-steps">
        {STAGES.map((s, i) => (
          <li key={s} className={i < done || ready ? 'done' : i === done ? 'now' : ''}>
            <span className="pipe-tick" aria-hidden="true">{i < done || ready ? '✓' : i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
      <div className={`pipe-clips${ready ? ' show' : ''}`}>
        {[
          { t: 'The one habit that doubled my output', s: 91 },
          { t: 'Why most launches fail in week one', s: 84 },
          { t: 'Stop writing intros. Start here.', s: 78 },
        ].map((c) => (
          <div className="pipe-clip" key={c.t}>
            <div className="pipe-thumb" aria-hidden="true">
              <span className="pipe-cap">{c.t.split(' ').slice(-2).join(' ')}</span>
            </div>
            <div className="pipe-meta">
              <span>{c.t}</span>
              <b>{c.s}</b>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SplitHero() {
  const [idea, setIdea] = useState('');
  const goGen = () => {
    if (idea.trim()) sessionStorage.setItem('cn_gen_prompt', idea.trim());
    location.hash = '#/app/gen';
  };

  return (
    <section className="hero2" id="top">
      <div className="hero2-copy">
        <span className="hero2-kicker">Clip · Generate · Story</span>
        <h1>
          One studio for <span className="serif">every short</span> you make.
        </h1>
        <p className="sub">
          Drop in a long video and get captioned vertical clips. Or type an idea and Cloudnivo
          writes, voices and renders it for you.
        </p>
        <div className="hero2-actions">
          <a className="btn btn-purple big" href="#/app/clips">
            Upload a video
          </a>
          <a className="btn btn-outline big" href="#how">
            See how it works
          </a>
        </div>
        <label className="hero2-idea">
          <span>Or start from an idea</span>
          <div className="hero2-idea-row">
            <input
              className="input"
              placeholder="e.g. Why octopuses are the smartest animals in the ocean"
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && goGen()}
            />
            <button className="btn btn-light" onClick={goGen}>
              Create →
            </button>
          </div>
        </label>
        <p className="hero2-note">Free plan · No credit card · Cancel anytime</p>
      </div>
      <div className="hero2-visual">
        <PipelinePreview />
      </div>
    </section>
  );
}

/* ---------- how it works ---------- */

const STEPS = [
  { n: '01', title: 'Bring a video or an idea', body: 'Upload an MP4, MOV or WebM, or describe the short you want.' },
  { n: '02', title: 'AI does the heavy lifting', body: 'Transcripts, best moments, vertical framing, captions, voiceover and scenes.' },
  { n: '03', title: 'Download and post', body: 'Every result is saved to your library, ready for TikTok, Reels and Shorts.' },
];

export function HowItWorks() {
  return (
    <section className="section how" id="how">
      <h2>How it works</h2>
      <ol className="how-line">
        {STEPS.map((s) => (
          <li key={s.n}>
            <span className="how-n">{s.n}</span>
            <strong>{s.title}</strong>
            <p>{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ---------- bento ---------- */

export function Bento() {
  return (
    <section className="section" id="features">
      <h2>
        Everything in <span className="serif">one place</span>
      </h2>
      <p className="sub">The tools below are live today. Each one saves its results to your library.</p>
      <div className="bento">
        <a className="bento-card big" href="#/app/clips">
          <span className="bento-tag">Clips</span>
          <strong>Long video → short clips</strong>
          <p>Speech is transcribed, the strongest 20–60 second moments are picked and scored, and each clip is cropped to 9:16 around the speaker.</p>
          <div className="bento-art clips" aria-hidden="true"><i /><i /><i /></div>
        </a>
        <a className="bento-card" href="#/app/gen">
          <span className="bento-tag">Story video</span>
          <strong>Topic → narrated video</strong>
          <p>Script, natural voiceover, a scene for every line and captions in 30–90 seconds of video.</p>
        </a>
        <a className="bento-card" href="#/app/gen">
          <span className="bento-tag">Generate</span>
          <strong>Text → video and images</strong>
          <p>Open models for quick vertical clips and stills, plus premium models when you need them.</p>
        </a>
        <div className="bento-card">
          <span className="bento-tag">Captions</span>
          <strong>Word-by-word captions</strong>
          <p>Bold, readable captions that highlight each word as it is spoken.</p>
        </div>
        <a className="bento-card wide" href="#/app/brand">
          <span className="bento-tag">Brand kit</span>
          <strong>Your colours, font and call to action</strong>
          <p>Save your brand once and apply it to what you create.</p>
        </a>
      </div>
    </section>
  );
}
