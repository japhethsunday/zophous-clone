import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import AppShell from './app-shell';
import { Bento, HowItWorks, SplitHero } from './landing';
import './style.css';

/* ---------- shared bits ---------- */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="eyebrow">✦ {children}</div>;
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
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
          <a href="#/about">About</a>
        </div>
        <a className="btn btn-light" href="#/app">
          Get Started →
        </a>
      </nav>
    </header>
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
    a: 'Yes. The Free plan gives you 60 clipping minutes every month, with AI clips, captions and hooks. Spend them on one long video or split them across up to three shorter ones (each video uses a minimum of 20 minutes). Clips carry a Cloudnivo watermark, and you can make 1 clip a month watermark-free. No credit card required.',
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
    badge: '200 minutes / mo',
    feats: [
      '200 minutes of video / mo',
      '3 Studio clips / mo, each with a Director edit',
      'Watermark-free clips',
      'Turbo Downloads: clips ready in about 10 seconds',
      'DNA Profile & analytics (coming soon)',
      'TikTok & YouTube posting (coming soon)',
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
    badge: '600 minutes / mo · Most popular',
    feats: [
      '600 minutes of video / mo',
      '3 Studio clips / mo, each with a Director edit',
      'Watermark-free clips',
      'Turbo Downloads: clips ready in about 10 seconds',
      'DNA Profile & analytics (coming soon)',
      'TikTok & YouTube posting (coming soon)',
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
      <p className="sub">Free every month. Upgrade only when you need more minutes.</p>
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
          <strong>Clip</strong>
          <span>long videos into shorts</span>
        </div>
        <div>
          <strong>Generate</strong>
          <span>video from a prompt</span>
        </div>
        <div>
          <strong>Keep</strong>
          <span>every asset in one place</span>
        </div>
      </div>
      <h2>
        Make your next short <span className="serif">today</span>
      </h2>
      <p className="sub">Upload a video or start from an idea. The free plan needs no credit card.</p>
      <a className="btn btn-purple big" href="#/app">
        Start for free
      </a>
      <p className="hero2-note">Free plan · No credit card · Cancel anytime</p>
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
      "Cloudnivo never claims ownership of your content. You keep whatever rights you bring, and we never resell or repost it. You're responsible for having the rights to what you upload or clip: clipping content you don't own, without permission or a valid fair-use basis, can infringe the original creator's copyright. Plans are month-to-month, minutes reset monthly and do not roll over.",
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
        first. You can start on the free plan, no card needed.
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
      <Nav />
      <main>
        <SplitHero />
        <HowItWorks />
        <Bento />
        <PromptLibraryTeaser />
        <WhoFor />
        <Pricing />
        <Faq />
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
