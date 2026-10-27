import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import AppShell from './app-shell';
import './style.css';

/* ---------- shared bits ---------- */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="eyebrow">✦ {children}</div>;
}

function CheckPill() {
  return (
    <div className="check-pill">
      <span className="check-dot">✓</span> Free plan · No credit card · 30-day money-back guarantee
    </div>
  );
}

function Stars({ count = 40 }: { count?: number }) {
  const stars = useRef(
    Array.from({ length: count }, (_, i) => ({
      id: i,
      top: Math.random() * 100,
      left: Math.random() * 100,
      size: Math.random() * 2 + 1,
      opacity: Math.random() * 0.5 + 0.15,
      delay: Math.random() * 4,
    })),
  );
  return (
    <div className="starfield" aria-hidden="true">
      {stars.current.map((s) => (
        <span
          key={s.id}
          style={{
            top: `${s.top}%`,
            left: `${s.left}%`,
            width: s.size,
            height: s.size,
            opacity: s.opacity,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ---------- nav ---------- */

function Nav() {
  return (
    <header className="nav-wrap">
      <nav className="nav">
        <a className="logo" href="#top">
          <span className="logo-mark">C</span> Cloudnivo
        </a>
        <div className="nav-links">
          <a href="#top">Home</a>
          <a href="#/about">About</a>
          <a href="#pricing">Pricing</a>
        </div>
        <a className="btn btn-light" href="#/app">
          Get Started →
        </a>
      </nav>
    </header>
  );
}

/* ---------- clip card mock ---------- */

function ClipCard({
  caption,
  highlight,
  tint,
  label,
}: {
  caption: string;
  highlight: string;
  tint: string;
  label: string;
}) {
  return (
    <div className="clip-card" style={{ background: tint }}>
      <div className="clip-top">
        <span className="clip-src">{label}</span>
        <span className="clip-score">90</span>
      </div>
      <div className="clip-caption">
        {caption} <em>{highlight}</em>
      </div>
      <div className="clip-bars">
        {Array.from({ length: 24 }).map((_, i) => (
          <span key={i} style={{ height: 3 + ((i * 7) % 10) }} />
        ))}
      </div>
    </div>
  );
}

/* ---------- hero ---------- */

const HERO_CHIPS = [
  'Bodycam POV sprinting from a mystery',
  'Ranking my top 5 conspiracy theories',
  'Ring cam catches the unthinkable',
  'UGC ad: skincare routine that went viral',
  'Untold history storytime, dramatic tone',
];

function Hero() {
  const [link, setLink] = useState('');
  const [idea, setIdea] = useState('');

  const goClip = () => {
    if (link.trim()) sessionStorage.setItem('cn_link', link.trim());
    location.hash = '#/app';
  };
  const goGen = () => {
    if (idea.trim()) sessionStorage.setItem('cn_gen_prompt', idea.trim());
    location.hash = '#/app/gen';
  };

  return (
    <section className="hero" id="top">
      <Eyebrow>AI-Powered Video Clipping</Eyebrow>
      <h1>
        Your long videos,
        <br />
        turned into <span className="serif">daily shorts</span>.
      </h1>
      <p className="sub">
        Paste a link and get captioned, scored clips — or describe what you want and our AI
        <br className="desktop-br" /> generates it. Both live in one studio.
      </p>
      <div className="hero-inputs">
        <div className="hero-input-row">
          <input
            className="hero-input"
            placeholder="Paste a YouTube, podcast or stream link…"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && goClip()}
          />
          <button className="btn btn-purple" onClick={goClip}>
            Get free clips
          </button>
        </div>
        <div className="hero-input-row alt">
          <input
            className="hero-input"
            placeholder="Or describe what AI should make — a bodycam POV, a UGC ad…"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && goGen()}
          />
          <button className="btn btn-ghost" onClick={goGen}>
            Generate it →
          </button>
        </div>
        <div className="hero-chips">
          {HERO_CHIPS.map((c) => (
            <button
              key={c}
              className="hero-chip"
              onClick={() => {
                setIdea(c);
                setLink('');
              }}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      <p className="hero-stats">
        <strong>202,000+</strong> clips made by <strong>25,000+</strong> creators
      </p>
      <CheckPill />
      <div className="clip-row">
        <ClipCard
          label="TikTok"
          caption="SCREAMED 'I COULDN'T EVEN FACE'"
          highlight="MY TEAM"
          tint="linear-gradient(165deg,#F3E7D3,#EAD9BC 60%,#E2CCAA)"
        />
        <ClipCard
          label="Reels"
          caption="I AM CAN'T WIN IT IF WE CAN'T EVEN RUN"
          highlight="SEC OFFENSE"
          tint="linear-gradient(165deg,#E1E8F4,#D2DDEE 60%,#C4D2E8)"
        />
        <ClipCard
          label="Shorts"
          caption="THEY TOLD ME I TALK TOO MUCH, SO I MAKE SURE TO MAKE EVERY WORD COUNT."
          highlight="EVERY WORD"
          tint="linear-gradient(165deg,#E4EBDD,#D6E2CB 60%,#C7D8B9)"
        />
        <ClipCard
          label="Reels"
          caption="WE'RE NOT DONE YET — WATCH WHAT HAPPENS NEXT"
          highlight="BE NEXT"
          tint="linear-gradient(165deg,#F6E4DA,#EFD2C2 60%,#E8C0AC)"
        />
      </div>
    </section>
  );
}

/* ---------- smart cropping ---------- */

function SmartCropping() {
  return (
    <section className="section">
      <Eyebrow>Smart Cropping</Eyebrow>
      <h2>
        Cropping that <span className="serif">follows the speaker</span>
      </h2>
      <p className="sub">
        No dead-center crops that cut off whoever's talking. The box tracks the active speaker, and
        that's exactly what lands in your vertical clip.
      </p>
      <div className="crop-visual">
        <div className="crop-before">
          <div className="crop-chip">BEFORE · SOURCE + CROP BOX</div>
          <div className="crop-frame">
            <div className="crop-speakers">
              <div className="speaker" />
              <div className="speaker active">
                <div className="crop-box">
                  <span />
                </div>
              </div>
              <div className="speaker" />
              <div className="speaker" />
            </div>
            <div className="crop-lower">TEXAS TECH SEASON PREVIEW</div>
          </div>
        </div>
        <div className="crop-arrow">→</div>
        <div className="crop-after">
          <div className="crop-chip green">AFTER</div>
          <div className="crop-vertical">
            <div className="cv-caption">
              POTENTIALLY (LEGALLY) A STARTER NOW, ACTUALLY
            </div>
            <div className="cv-body" />
            <div className="cv-lower">TEXAS TECH SEC</div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- one upload ---------- */

function OneUpload() {
  return (
    <section className="section" id="how">
      <Eyebrow>One Upload</Eyebrow>
      <h2>
        One long video, <span className="serif">a whole library</span>
      </h2>
      <p className="sub">
        Paste a link to a podcast, stream, or webinar, and Cloudnivo returns a batch of captioned,
        scored, ready-to-post clips.
      </p>
      <div className="library-visual">
        <div className="library-source">
          <div className="ls-bar">
            <span className="ls-dot" /> ↑ 1 long upload <span className="ls-badge">● Analyzing</span>
          </div>
          <div className="ls-body">
            <div className="ls-face" />
            <div className="ls-figures">
              <span /><span /><span /><span />
            </div>
          </div>
        </div>
        <div className="library-lines" aria-hidden="true">
          <svg viewBox="0 0 400 60" preserveAspectRatio="none">
            <path d="M200 0 C 120 30, 60 30, 40 60" />
            <path d="M200 0 C 200 25, 200 35, 200 60" />
            <path d="M200 0 C 280 30, 340 30, 360 60" />
          </svg>
        </div>
        <div className="library-clips">
          <div className="mini-clip a">PLAYERS WHO DID 3 PICK 6 GAMES IN A ROW</div>
          <div className="mini-clip b">ARE YOU KIDDING ME? THIS IS INSANE</div>
          <div className="mini-clip c">THEY TOLD ME I TALK TOO MUCH</div>
        </div>
      </div>
    </section>
  );
}

/* ---------- viral dna steps ---------- */

const DNA_STEPS = [
  { n: '01', t: 'Paste a link', d: 'Any long video: a YouTube link, podcast, stream or webinar.' },
  { n: '02', t: 'AI clips what performs', d: "It cuts the moments your audience is most likely to watch." },
  { n: '03', t: 'You post', d: 'Captioned, vertical, ready for TikTok, Reels & Shorts.' },
  { n: '04', t: 'Cloudnivo learns', d: "Every clip's performance feeds your viral DNA profile." },
  { n: '05', t: 'Sharper next time', d: 'The next batch is tuned to what actually worked for you.' },
];

function ViralDna() {
  return (
    <section className="section">
      <Eyebrow>Your Viral DNA</Eyebrow>
      <h2>
        Every clip builds your <span className="serif">viral DNA</span>
      </h2>
      <p className="sub">
        Most tools just cut clips. Cloudnivo learns from every post, building a profile of what your
        audience rewards, so each upload is sharper than the last.
      </p>
      <div className="dna-grid">
        {DNA_STEPS.map((s) => (
          <div className="dna-card" key={s.n}>
            <span className="dna-n">{s.n}</span>
            <h3>{s.t}</h3>
            <p>{s.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- studio ---------- */

function Studio() {
  return (
    <section className="section studio">
      <div className="studio-copy">
        <div className="eyebrow left">✦ Inside the Studio</div>
        <h2>
          It learns your <span className="serif">viral DNA</span>.
        </h2>
        <p className="sub left">
          Every clip you post feeds a profile of what actually works for your audience. Measured,
          not guessed. So the next batch isn't random; it's tuned to you.
        </p>
        <ul className="studio-list">
          <li>
            <strong>● Hook effectiveness</strong>
            Which openers actually earn the view, measured by hook type.
          </li>
          <li>
            <strong>● Category performance</strong>
            What topics and formats your audience rewards, ranked.
          </li>
          <li>
            <strong>● Visual-element impact</strong>
            Facecam, captions, b-roll: what lifts your viral rate.
          </li>
        </ul>
      </div>
      <div className="studio-panel">
        <div className="sp-bar">
          <span className="ls-dot" /> DNA Profile · Performance <span className="sp-live">+ Live</span>
        </div>
        <div className="sp-title">DNA PROFILE</div>
        {[
          { label: 'Shock-statement hooks', w: 86 },
          { label: 'Trivia reveals', w: 72 },
          { label: 'Storytime openers', w: 64 },
          { label: 'Question hooks', w: 51 },
        ].map((r) => (
          <div className="sp-row" key={r.label}>
            <span>{r.label}</span>
            <div className="sp-track">
              <div className="sp-fill" style={{ width: `${r.w}%` }} />
            </div>
            <em>{r.w}</em>
          </div>
        ))}
        <div className="sp-title">CATEGORY PERFORMANCE</div>
        {[
          { label: 'Untold history', w: 78 },
          { label: 'Sports moments', w: 66 },
          { label: 'Creator drama', w: 44 },
        ].map((r) => (
          <div className="sp-row" key={r.label}>
            <span>{r.label}</span>
            <div className="sp-track">
              <div className="sp-fill alt" style={{ width: `${r.w}%` }} />
            </div>
            <em>{r.w}</em>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- coach ---------- */

function Coach() {
  return (
    <section className="section">
      <div className="eyebrow">✦ Built-in Coach</div>
      <h2>Know why it worked.</h2>
      <p className="sub">
        Every clip comes back with a read on its hook, tone, and exactly why it performed, plus
        statistically driven ideas for what to make next. It's a growth coach, not just a cutter.
      </p>
      <div className="coach-card">
        <div className="coach-row">
          <span className="coach-k">Hook</span>
          <span className="coach-v">shocking statement</span>
        </div>
        <div className="coach-row">
          <span className="coach-k">Tone</span>
          <span className="coach-v">somber, informative</span>
        </div>
        <div className="coach-row">
          <span className="coach-k">Why it performed</span>
          <span className="coach-v">leverages untold trivia → curiosity</span>
        </div>
        <div className="coach-ideas">
          <div className="coach-k">Next clip ideas</div>
          <ol>
            <li>Add B-roll of the subjects for visual context.</li>
            <li>Use dynamic zooms on the reveal for emphasis.</li>
          </ol>
        </div>
      </div>
    </section>
  );
}

/* ---------- stats ---------- */

function Stats() {
  const stats = [
    { v: '202K+', l: 'Clips Made' },
    { v: '25K+', l: 'Creators' },
    { v: '48K', l: 'Hours Saved' },
    { v: '8M+', l: 'Views Generated' },
  ];
  return (
    <section className="stats-row">
      {stats.map((s) => (
        <div className="stat" key={s.l}>
          <div className="stat-v">{s.v}</div>
          <div className="stat-l">{s.l}</div>
        </div>
      ))}
    </section>
  );
}

/* ---------- publish & track ---------- */

function PublishTrack() {
  return (
    <section className="section">
      <Eyebrow>Publish &amp; Track</Eyebrow>
      <h2>
        Post everywhere. <span className="serif">Track everything.</span>
      </h2>
      <p className="sub">
        Publish straight to TikTok and YouTube without leaving the studio, then watch views and
        engagement roll back in. That data is what sharpens your next clips. The loop closes here.
      </p>
      <div className="publish-visual">
        <div className="pub-chips">
          <span className="pub-chip">TikTok</span>
          <span className="pub-chip">YouTube</span>
          <span className="pub-chip">Reels</span>
        </div>
        <div className="pub-toast">✓ Posted to TikTok</div>
        <div className="pub-graph">
          {Array.from({ length: 14 }).map((_, i) => (
            <span key={i} style={{ height: 12 + ((i * i * 3) % 80) }} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- features ---------- */

const FEATURES = [
  { icon: '✂️', t: 'AI clipping', d: 'Finds the highest-potential moments and cuts them for you.' },
  { icon: '💬', t: 'Animated captions', d: 'Word-by-word captions styled for TikTok, Reels & Shorts.' },
  { icon: '🎯', t: 'Speaker tracking', d: 'Smart 9:16 cropping that follows the active speaker.' },
  { icon: '🧬', t: 'Viral DNA profile', d: 'Learns what your audience rewards with every post.' },
  { icon: '📈', t: 'Virality scoring', d: 'Every clip comes back scored before you post it.' },
  { icon: '🗓️', t: 'Scheduling', d: 'Plan and auto-post to TikTok and YouTube from the studio.' },
  { icon: '⚡', t: 'Turbo downloads', d: 'Clips ready in about 10 seconds on paid plans.' },
  { icon: '🎨', t: 'Brand kits', d: 'Fonts, colors and watermarks applied across workspaces.' },
];

function Features() {
  return (
    <section className="section" id="features">
      <Eyebrow>Features</Eyebrow>
      <h2>
        Everything you need <span className="serif">to go viral</span>
      </h2>
      <div className="features-grid">
        {FEATURES.map((f) => (
          <div className="feature-card" key={f.t}>
            <span className="feature-icon">{f.icon}</span>
            <h3>{f.t}</h3>
            <p>{f.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- why cloudnivo ---------- */

function WhyCloudnivo() {
  return (
    <section className="section" id="why">
      <Eyebrow>Why Cloudnivo</Eyebrow>
      <h2>
        Smarter clips, <span className="serif">and 2× the minutes</span>.
      </h2>
      <p className="sub">
        You came for the AI that actually grows your account. The bonus: you also get more than
        double the video processing, at the exact same price.
      </p>
      <div className="compare">
        <div className="compare-col them">
          <div className="compare-head">Them</div>
          <div className="compare-row">150 minutes / mo</div>
          <div className="compare-row">Clips without feedback</div>
          <div className="compare-row">Manual posting</div>
        </div>
        <div className="compare-col us">
          <div className="compare-head">Cloudnivo</div>
          <div className="compare-row">300+ minutes / mo — 2× the minutes</div>
          <div className="compare-row">Viral DNA learns every post</div>
          <div className="compare-row">Schedule &amp; post in one place</div>
        </div>
      </div>
    </section>
  );
}

/* ---------- who it's for ---------- */

const AUDIENCE = [
  { icon: '🎙️', t: 'Podcasters', d: 'Turn every episode into a week of shorts that actually get found.' },
  { icon: '🎮', t: 'Streamers', d: 'Pull the funniest, most-clipped moments from hours of VODs automatically.' },
  { icon: '🎓', t: 'Coaches & creators', d: 'Repurpose long-form lessons into hooks that grow your audience.' },
  { icon: '🏢', t: 'Agencies', d: 'Ship 10× the client clips with brand kits and multi-workspace seats.' },
];

function WhoFor() {
  return (
    <section className="section">
      <Eyebrow>Who it's for</Eyebrow>
      <h2>
        Built for anyone <span className="serif">with long videos</span>
      </h2>
      <div className="audience-grid">
        {AUDIENCE.map((a) => (
          <div className="audience-card" key={a.t}>
            <span className="audience-icon">{a.icon}</span>
            <h3>{a.t}</h3>
            <p>{a.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- faq ---------- */

const FAQS = [
  {
    q: 'Do I keep the rights to my clips?',
    a: "Cloudnivo never claims ownership of your content. You keep whatever rights you bring, and we never resell or repost it. You're responsible for having the rights to what you upload or clip: clipping content you don't own, without permission or a valid fair-use basis, can infringe the original creator's copyright.",
  },
  {
    q: 'What video formats and lengths work?',
    a: 'Paste a YouTube link, or upload any MP4 or MOV up to 3 GB: podcasts, streams, webinars, interviews. Clips export in 9:16 ready for TikTok, Reels, and Shorts.',
  },
  {
    q: 'How long does it take?',
    a: 'Most videos are analyzed and clipped in minutes, not hours. Upload, and your captioned, scored clips are ready to download.',
  },
  {
    q: 'Do I need editing skills?',
    a: 'None. The AI finds the moments, cuts them, adds captions, and reframes to vertical. You just pick your favorites and post.',
  },
  {
    q: 'Is there really a free plan?',
    a: 'Yes. The Free plan gives you 60 clipping minutes every month, with AI clips, captions and hooks. Spend them on one long video or split them across up to three shorter ones (each video uses a minimum of 20 minutes). Clips carry a Cloudnivo watermark, and you can make 1 clip a month watermark-free. No credit card required, and new subscribers get a 30-day money-back guarantee.',
  },
];

function Faq() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section className="section" id="faq">
      <Eyebrow>Questions</Eyebrow>
      <h2>
        Everything you might <span className="serif">be wondering</span>
      </h2>
      <div className="faq-list">
        {FAQS.map((f, i) => (
          <div className={`faq-item${open === i ? ' open' : ''}`} key={f.q}>
            <button className="faq-q" onClick={() => setOpen(open === i ? null : i)}>
              {f.q}
              <span className="faq-toggle">{open === i ? '−' : '+'}</span>
            </button>
            {open === i && <div className="faq-a">{f.a}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- testimonial ---------- */

function Testimonial() {
  return (
    <section className="section">
      <div className="testimonial">
        <p className="quote">
          "Before it was a product, this was how Daniel grew his own show,{' '}
          <span className="serif">Dmac Pods</span>, one clip at a time."
        </p>
        <div className="quote-stats">
          <span>🎬 5.3K Followers in 3 Months</span>
          <span>📈 1.3M Likes</span>
          <span>🎙️ Podcaster · Dmac Pods</span>
        </div>
      </div>
    </section>
  );
}

/* ---------- pricing ---------- */

const PLANS = [
  {
    name: 'Free',
    tagline: 'Try Cloudnivo on real videos, every month.',
    price: '$0',
    per: '/mo',
    badge: 'Free forever',
    feats: [
      '60 clipping minutes a month, across up to 3 videos',
      'AI clips, captions & hooks',
      'Engagement heatmap to pick your best window',
      '1 Workspace',
      '2 Turbo Downloads a month',
      'Cloudnivo watermark on clips',
    ],
    cta: 'Start for free',
    featured: false,
  },
  {
    name: 'Creator Starter',
    tagline: 'Get started clipping long-form videos into shorts.',
    price: '$15',
    per: '/mo',
    badge: '200 minutes / mo · +33% more minutes than OpusClip Starter',
    feats: [
      '200 minutes of video / mo',
      '3 Studio clips / mo, each with a Director edit',
      'Watermark-free clips',
      'Turbo Downloads: clips ready in about 10 seconds',
      'DNA Profile & performance analytics',
      'TikTok & YouTube scheduling + direct posting',
      '1 Workspace · Email support',
    ],
    cta: 'Get Creator Starter',
    featured: false,
  },
  {
    name: 'Creator Pro',
    tagline: 'More clips from your long-form videos, faster.',
    price: '$29',
    per: '/mo',
    badge: '600 minutes / mo · 2× more minutes than OpusClip Pro',
    feats: [
      '600 minutes of video / mo',
      '3 Studio clips / mo, each with a Director edit',
      'Watermark-free clips',
      'Turbo Downloads: clips ready in about 10 seconds',
      'DNA Profile & performance analytics',
      'TikTok & YouTube scheduling + direct posting',
      '3 Workspaces · Priority support',
    ],
    cta: 'Get Creator Pro',
    featured: true,
  },
];

function Pricing() {
  return (
    <section className="section" id="pricing">
      <Eyebrow>Pricing</Eyebrow>
      <h2>
        Start free, <span className="serif">scale when you're ready</span>
      </h2>
      <p className="sub">Start for free with 60 clipping minutes a month. No credit card required.</p>
      <div className="plans">
        {PLANS.map((p) => (
          <div className={`plan${p.featured ? ' featured' : ''}`} key={p.name}>
            {p.featured && <div className="plan-flag">Most popular</div>}
            <h3>{p.name}</h3>
            <p className="plan-tag">{p.tagline}</p>
            <div className="plan-price">
              <strong>{p.price}</strong>
              <span>{p.per}</span>
            </div>
            <div className="plan-badge">{p.badge}</div>
            <ul>
              {p.feats.map((f) => (
                <li key={f}>
                  <span className="li-check">✓</span> {f}
                </li>
              ))}
            </ul>
            <a className={`btn plan-btn${p.featured ? ' btn-purple' : ' btn-outline'}`} href="#top">
              {p.cta}
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- prompt library teaser ---------- */

const LIBRARY_TEASER = [
  { cat: 'Shorts', t: 'Bodycam POV', d: 'First-person sprint-cam format that hooks in one second.' },
  { cat: 'Shorts', t: 'Ring cam story', d: 'Doorbell-footage storytelling — curiosity loop built in.' },
  { cat: 'Marketing', t: 'UGC product ad', d: 'Handheld creator-style ad script for any product.' },
  { cat: 'Story', t: 'Animal story', d: 'Nature-documentary narration over generated footage.' },
  { cat: 'Shorts', t: 'Ranking video', d: 'Countdown list format engineered for rewatching.' },
  { cat: 'Image', t: 'Product shot', d: 'Studio-lit hero images ready for posts and ads.' },
];

function PromptLibraryTeaser() {
  return (
    <section className="section" id="prompts">
      <Eyebrow>Viral Prompt Library</Eyebrow>
      <h2>
        Don't start from a <span className="serif">blank prompt</span>
      </h2>
      <p className="sub">
        Every generation can start from a proven viral format. Pick one, tweak it, generate — the
        full library lives inside the studio.
      </p>
      <div className="pl-grid">
        {LIBRARY_TEASER.map((p) => (
          <div className="pl-card" key={p.t}>
            <em>{p.cat}</em>
            <h3>{p.t}</h3>
            <p>{p.d}</p>
            <a className="pl-use" href="#/app/gen">
              Use in studio →
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- cta + footer ---------- */

function Cta() {
  return (
    <section className="section cta">
      <div className="cta-trio">
        <div>
          <strong>202K+</strong>
          <span>clips made</span>
        </div>
        <div>
          <strong>8M+</strong>
          <span>views generated</span>
        </div>
        <div>
          <strong>48K</strong>
          <span>hours saved</span>
        </div>
      </div>
      <h2>
        Start making <span className="serif">viral clips</span> today
      </h2>
      <p className="sub">
        Join thousands of creators turning long videos into short-form gold. Start for free, no
        credit card required.
      </p>
      <a className="btn btn-purple big" href="#/app">
        Start for free
      </a>
      <CheckPill />
    </section>
  );
}

/* ---------- sub pages ---------- */

function PageShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  return (
    <div className="page">
      <Stars />
      <Nav />
      <main>
        <section className="section in-view" style={{ paddingTop: 80 }}>
          {children}
        </section>
      </main>
      <Footer />
    </div>
  );
}

function AboutPage() {
  return (
    <PageShell>
      <Eyebrow>Our Story</Eyebrow>
      <h2>
        Built for creators, <span className="serif">by creators.</span>
      </h2>
      <p className="sub">
        Cloudnivo started with a simple obsession: why does creating viral content take so long? We
        built the tool we wished existed. Every creator deserves the same editing power that big
        studios have. AI should do the grunt work. You should focus on creating.
      </p>
      <div className="audience-grid" style={{ marginTop: 40 }}>
        {[
          ['✦ Simplicity First', 'We strip away complexity so creators can focus on what they do best: creating. Every feature earns its place.'],
          ['⚡ Speed is a Feature', "Waiting kills momentum. We obsess over making Cloudnivo faster at every step, from upload to export."],
          ['🤝 Creator-Led', "We build with creators, not for them. Every decision starts with the question: does this make a creator's life easier?"],
          ['🔍 Radical Transparency', 'We share our roadmap, our mistakes, and our wins openly. Trust is built through honesty, not polish.'],
        ].map(([t, d]) => (
          <div className="audience-card" key={t}>
            <h3>{t}</h3>
            <p>{d}</p>
          </div>
        ))}
      </div>
      <h2 style={{ marginTop: 70 }}>
        Hi, I'm <span className="serif">Daniel McCord.</span>
      </h2>
      <p className="sub">
        I started Cloudnivo because when I was beginning my entrepreneurial journey, there was no
        guide. Around that time I started my podcast, Dmac Pods, and one problem kept surfacing:
        creating viral clips was eating hours I didn't have as a college student. With a background
        in computer science, I built a product that automatically finds and edits viral clips.
      </p>
      <div className="quote-stats" style={{ justifyContent: 'center' }}>
        <span>🎬 5.3K Followers in 3 Months</span>
        <span>📈 1.3M Likes</span>
        <span>🎙️ Podcaster · Dmac Pods</span>
      </div>
      <h2 style={{ marginTop: 70 }}>
        From idea <span className="serif">to impact</span>
      </h2>
      <div className="dna-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 40 }}>
        {[
          ['Spring 2023', 'The Idea is Born', 'Cloudnivo began as a business plan generator for aspiring entrepreneurs.'],
          ['Fall 2024', 'Pivot to Clips', 'Manual clip editing ate my podcast hours — so Cloudnivo pivoted to AI clipping.'],
          ['Fall 2025', 'Public Launch', 'Officially launched to the public, and never stopped improving.'],
        ].map(([when, t, d]) => (
          <div className="dna-card" key={t}>
            <span className="dna-n">{when}</span>
            <h3>{t}</h3>
            <p>{d}</p>
          </div>
        ))}
      </div>
    </PageShell>
  );
}

function CommunityPage() {
  return (
    <PageShell>
      <Eyebrow>Community</Eyebrow>
      <h2>
        Create better content, <span className="serif">together.</span>
      </h2>
      <p className="sub">
        Our Discord is the heart of Cloudnivo. Thousands of creators share tips, get support, and
        celebrate wins every day.
      </p>
      <div className="features-grid" style={{ marginTop: 44 }}>
        {[
          ['🛟', 'Direct Support', 'Get help directly from the Cloudnivo team and experienced community members.'],
          ['🎁', 'Exclusive Giveaways', 'Regular giveaways for free minutes, premium features, and more.'],
          ['🎓', 'Tutorials & Tips', 'Exclusive tutorials, workflow tips, and content-creation strategies.'],
          ['🚀', 'Early Access', 'Be the first to try new features and shape the product with feedback.'],
        ].map(([ic, t, d]) => (
          <div className="feature-card" key={t}>
            <span className="feature-icon">{ic}</span>
            <h3>{t}</h3>
            <p>{d}</p>
          </div>
        ))}
      </div>
    </PageShell>
  );
}

function LegalPage({ kind }: { kind: 'terms' | 'privacy' | 'dmca' }) {
  const copy: Record<string, [string, string]> = {
    terms: [
      'Terms of Service',
      "Cloudnivo never claims ownership of your content. You keep whatever rights you bring, and we never resell or repost it. You're responsible for having the rights to what you upload or clip: clipping content you don't own, without permission or a valid fair-use basis, can infringe the original creator's copyright. Plans are month-to-month, minutes reset monthly and do not roll over, and new subscribers get a 30-day money-back guarantee.",
    ],
    privacy: [
      'Privacy Policy',
      'We collect the minimum data needed to run your studio: your account email, the videos and clips you create, and performance data from accounts you explicitly connect. We use essential and analytics cookies to run and improve Cloudnivo. We never sell your data, and you can delete your account and data at any time from Settings.',
    ],
    dmca: [
      'DMCA Policy',
      'Cloudnivo responds to valid DMCA takedown notices. If you believe content on Cloudnivo infringes your copyright, send a notice identifying the work, the allegedly infringing material, and your contact information. Repeat infringers lose access. You are responsible for having the rights to what you clip.',
    ],
  };
  const [title, body] = copy[kind];
  return (
    <PageShell>
      <Eyebrow>Legal</Eyebrow>
      <h2>{title}</h2>
      <p className="sub" style={{ textAlign: 'left', maxWidth: 640 }}>
        {body}
      </p>
    </PageShell>
  );
}

function ToolPage({ name }: { name: string }) {
  const titles: Record<string, string> = {
    'free-ai-clip-maker': 'Free AI clip maker for TikTok, Reels and Shorts',
    'youtube-clip-maker': 'YouTube clip maker that finds the rewatched moments',
    'podcast-clip-maker': 'Podcast clip maker for every episode',
    'twitch-clip-maker': 'Twitch clip maker for hours of VODs',
  };
  return (
    <PageShell>
      <Eyebrow>{name.replace(/-/g, ' ')}</Eyebrow>
      <h2>{titles[name] ?? name}</h2>
      <p className="sub">
        Paste a link or upload a video, and the AI picks the moments most likely to hold attention,
        cuts them to 9:16, adds captions and a hook, and scores each clip so you know which to post
        first. The free plan gives you 60 minutes a month, no credit card.
      </p>
      <div className="dna-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 44 }}>
        {[
          ['01', 'Paste or upload', 'A YouTube link, or an MP4/MOV up to 3 GB.'],
          ['02', 'AI picks the window', 'It reads which parts viewers rewatch most. You can drag it.'],
          ['03', 'Post the winners', 'Vertical clips with captions and hooks, each scored.'],
        ].map(([n, t, d]) => (
          <div className="dna-card" key={n}>
            <span className="dna-n">{n}</span>
            <h3>{t}</h3>
            <p>{d}</p>
          </div>
        ))}
      </div>
      <a className="btn btn-purple big" href="#/app" style={{ marginTop: 40 }}>
        Try it free
      </a>
    </PageShell>
  );
}

/* ---------- footer ---------- */

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <a className="logo" href="#top">
          <span className="logo-mark">C</span> Cloudnivo
        </a>
        <div className="footer-links">
          <a href="#/about">About</a>
          <a href="#/community">Community</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
          <a href="#/terms">Terms</a>
          <a href="#/privacy">Privacy</a>
          <a href="#/dmca">DMCA</a>
        </div>
        <p>© 2026 Cloudnivo. Turn long videos into daily shorts.</p>
      </div>
    </footer>
  );
}

/* ---------- app / router ---------- */

function useRoute() {
  const [route, setRoute] = useState(location.hash || '#/');
  useEffect(() => {
    const h = () => setRoute(location.hash || '#/');
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  return route;
}

function Landing() {
  return (
    <div className="page">
      <Stars />
      <Nav />
      <main>
        <Hero />
        <SmartCropping />
        <OneUpload />
        <ViralDna />
        <Studio />
        <Coach />
        <Stats />
        <PublishTrack />
        <Features />
        <PromptLibraryTeaser />
        <WhyCloudnivo />
        <WhoFor />
        <Faq />
        <Testimonial />
        <Pricing />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}

function App() {
  const route = useRoute();
  if (route.startsWith('#/app')) return <AppShell />;
  if (route === '#/about') return <AboutPage />;
  if (route === '#/community') return <CommunityPage />;
  if (route === '#/terms') return <LegalPage kind="terms" />;
  if (route === '#/privacy') return <LegalPage kind="privacy" />;
  if (route === '#/dmca') return <LegalPage kind="dmca" />;
  const toolMatch = route.match(/^#\/tools\/([a-z-]+)$/);
  if (toolMatch) return <ToolPage name={toolMatch[1]} />;
  return <Landing />;
}

createRoot(document.getElementById('root')!).render(<App />);
