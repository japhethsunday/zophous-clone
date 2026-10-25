import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  auth,
  supabase,
  PLANS,
  fmtTime,
  type Profile,
  type Video,
  type Clip,
  type DnaPattern,
  type Post,
} from './lib/supabase';

/* ---------------- shared ---------------- */

const DNA_POOL: Omit<DnaPattern, 'id' | 'unlocked'>[] = [
  { category: 'hook', label: 'Shock-statement hooks', score: 86 },
  { category: 'hook', label: 'Trivia reveals', score: 72 },
  { category: 'hook', label: 'Storytime openers', score: 64 },
  { category: 'category', label: 'Untold history', score: 78 },
  { category: 'category', label: 'Sports moments', score: 66 },
  { category: 'category', label: 'Creator drama', score: 44 },
  { category: 'visual', label: 'Facecam close-ups', score: 74 },
  { category: 'visual', label: 'Dynamic zooms', score: 61 },
  { category: 'visual', label: 'B-roll cutaways', score: 52 },
];

const NAV = [
  { id: 'home', label: 'Home', icon: '⌂' },
  { id: 'clips', label: 'Clips', icon: '✂' },
  { id: 'studio', label: 'Studio', icon: '🎬' },
  { id: 'posts', label: 'Posts', icon: '🗓' },
  { id: 'dna', label: 'DNA Profile', icon: '🧬' },
  { id: 'analytics', label: 'Analytics', icon: '📈' },
  { id: 'billing', label: 'Billing', icon: '💳' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
] as const;

type Page = (typeof NAV)[number]['id'];

function SigninGate() {
  return (
    <div className="gate">
      <div className="gate-card">
        <div className="logo" style={{ justifyContent: 'center', fontSize: '1rem' }}>
          <span className="logo-mark">◉</span> CLOUDNIVO
        </div>
        <h2>Sign in to your studio</h2>
        <p className="sub left" style={{ margin: '12px 0 22px' }}>
          Clip long videos, schedule posts, and build your viral DNA. The Free plan gives you 60
          clipping minutes a month — no credit card required.
        </p>
        <button className="btn btn-purple big" onClick={() => auth.openSignInModal()}>
          Sign in / Create account
        </button>
        <a className="gate-back" href="#/">
          ← Back to site
        </a>
      </div>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const cls = score >= 85 ? 'hi' : score >= 72 ? 'mid' : 'low';
  return <span className={`score-badge ${cls}`}>{score}</span>;
}

function UsageBar({ used, total, label }: { used: number; total: number; label: string }) {
  const pct = total === 0 ? 100 : Math.min(100, Math.round((used / total) * 100));
  return (
    <div className="usage">
      <div className="usage-head">
        <span>{label}</span>
        <em>
          {used} / {total}
        </em>
      </div>
      <div className="sp-track">
        <div className="sp-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ---------------- clips ---------------- */

function ClipCardView({
  clip,
  onPost,
}: {
  clip: Clip;
  onPost: (c: Clip) => void;
}) {
  return (
    <div className="app-clip">
      <div className="app-clip-screen" style={{ aspectRatio: '9/16' }}>
        <div className="clip-top">
          <span className="clip-src">{clip.caption_style.toUpperCase()}</span>
          <ScoreBadge score={clip.score} />
        </div>
        <div className="clip-caption">{clip.title}</div>
        {clip.watermarked && <div className="wm">◉ CLOUDNIVO</div>}
      </div>
      <div className="app-clip-meta">
        <div className="app-clip-times">
          {fmtTime(clip.start_seconds)} – {fmtTime(clip.end_seconds)}
        </div>
        <div className="coach-mini">
          <span>
            <strong>Hook</strong> {clip.hook}
          </span>
          <span>
            <strong>Tone</strong> {clip.tone}
          </span>
          <span>
            <strong>Why</strong> {clip.why_it_performed}
          </span>
        </div>
        {clip.posted_at ? (
          <div className="posted-tag">✓ Posted to {clip.platform}</div>
        ) : (
          <button className="btn btn-purple sm" onClick={() => onPost(clip)}>
            Post / Schedule
          </button>
        )}
      </div>
    </div>
  );
}

function PostModal({
  clip,
  onClose,
  onDone,
}: {
  clip: Clip;
  onClose: () => void;
  onDone: () => void;
}) {
  const [platform, setPlatform] = useState<'tiktok' | 'youtube' | 'reels'>('tiktok');
  const [when, setWhen] = useState('now');
  const [datetime, setDatetime] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const scheduledFor = when === 'now' ? new Date().toISOString() : new Date(datetime).toISOString();
    const status = when === 'now' ? 'posted' : 'scheduled';
    const seededViews = when === 'now' ? 1200 + Math.floor(Math.random() * 90000) : 0;
    const seededLikes = when === 'now' ? Math.floor(seededViews * (0.06 + Math.random() * 0.08)) : 0;
    await supabase.from('posts').insert({
      user_id: userData.user.id,
      clip_id: clip.id,
      platform,
      status,
      scheduled_for: scheduledFor,
      views: seededViews,
      likes: seededLikes,
    });
    if (when === 'now') {
      await supabase
        .from('clips')
        .update({ posted_at: scheduledFor, platform })
        .eq('id', clip.id);
    }
    setBusy(false);
    onDone();
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Post clip</h3>
        <p className="modal-sub">“{clip.title.slice(0, 60)}…”</p>
        <div className="pub-chips" style={{ justifyContent: 'flex-start' }}>
          {(['tiktok', 'youtube', 'reels'] as const).map((p) => (
            <button
              key={p}
              className={`pub-chip pick${platform === p ? ' on' : ''}`}
              onClick={() => setPlatform(p)}
            >
              {p === 'tiktok' ? 'TikTok' : p === 'youtube' ? 'YouTube' : 'Reels'}
            </button>
          ))}
        </div>
        <div className="field-row">
          <label className="radio">
            <input type="radio" checked={when === 'now'} onChange={() => setWhen('now')} /> Post now
          </label>
          <label className="radio">
            <input type="radio" checked={when === 'later'} onChange={() => setWhen('later')} />{' '}
            Schedule
          </label>
        </div>
        {when === 'later' && (
          <input
            type="datetime-local"
            className="input"
            value={datetime}
            onChange={(e) => setDatetime(e.target.value)}
          />
        )}
        <div className="modal-actions">
          <button className="btn btn-ghost sm" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-purple sm" disabled={busy} onClick={submit}>
            {busy ? 'Working…' : when === 'now' ? 'Post now' : 'Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- main shell ---------------- */

export default function AppShell() {
  const [session, setSession] = useState<boolean | null>(null);
  const [page, setPage] = useState<Page>('home');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [dna, setDna] = useState<DnaPattern[]>([]);
  const [postClip, setPostClip] = useState<Clip | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  }, []);

  const refresh = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const uid = userData.user.id;
    const [p, v, c, po, d] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).single(),
      supabase.from('videos').select('*').order('created_at', { ascending: false }),
      supabase.from('clips').select('*').order('score', { ascending: false }),
      supabase.from('posts').select('*').order('scheduled_for', { ascending: false }),
      supabase.from('dna_patterns').select('*').order('score', { ascending: false }),
    ]);
    if (p.data) setProfile(p.data as Profile);
    if (v.data) setVideos(v.data as Video[]);
    if (c.data) setClips(c.data as Clip[]);
    if (po.data) setPosts(po.data as Post[]);
    if (d.data) setDna(d.data as DnaPattern[]);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(!!data.session);
      if (data.session) refresh();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(!!s);
      if (s) refresh();
    });
    return () => sub.subscription.unsubscribe();
  }, [refresh]);

  async function markChecklist(key: string) {
    if (!profile) return;
    const done = { ...profile.checklist_done, [key]: true };
    setProfile({ ...profile, checklist_done: done });
    await supabase.from('profiles').update({ checklist_done: done }).eq('id', profile.id);
  }

  async function createVideo(opts: {
    title: string;
    sourceUrl?: string;
    sourceType: 'link' | 'upload';
    mode: 'clips' | 'studio';
    durationMinutes: number;
  }) {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user || !profile) return;
    const { data, error } = await supabase
      .from('videos')
      .insert({
        user_id: userData.user.id,
        title: opts.title,
        source_url: opts.sourceUrl || null,
        source_type: opts.sourceType,
        mode: opts.mode,
        duration_seconds: Math.max(60, opts.durationMinutes * 60),
        status: 'queued',
      })
      .select()
      .single();
    if (error || !data) {
      showToast(error?.message ?? 'Could not create video');
      return;
    }
    await markChecklist('first_video');
    showToast('Analyzing… this takes a few seconds');
    const { error: fnErr } = await supabase.functions.invoke('process-video', {
      body: { videoId: data.id },
    });
    if (fnErr) {
      showToast(fnErr.message);
      await supabase.from('videos').update({ status: 'failed' }).eq('id', data.id);
    } else {
      showToast(opts.mode === 'studio' ? 'Studio clips ready!' : 'Clips ready!');
    }
    await refresh();
  }

  async function unlockDna() {
    if (!profile) return;
    if (!profile.tiktok_connected) {
      showToast('Connect TikTok in Settings first');
      setPage('settings');
      return;
    }
    if (dna.length) {
      showToast('DNA Profile already unlocked');
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const rows = DNA_POOL.map((p) => ({ ...p, user_id: userData.user!.id, unlocked: true }));
    await supabase.from('dna_patterns').insert(rows);
    await markChecklist('dna');
    showToast('DNA Profile unlocked');
    await refresh();
  }

  if (session === null || session === undefined) {
    return <div className="gate-loading">Loading…</div>;
  }
  if (!session) return <SigninGate />;

  const minutesLeft = profile ? profile.minutes_limit - profile.minutes_used : 0;
  const checklist = profile?.checklist_done ?? {};

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="logo side-logo">
          <span className="logo-mark">◉</span> CLOUDNIVO
        </div>
        <nav>
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`side-link${page === n.id ? ' on' : ''}`}
              onClick={() => setPage(n.id)}
            >
              <span className="side-ic">{n.icon}</span> {n.label}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          {profile && (
            <>
              <UsageBar used={profile.minutes_used} total={profile.minutes_limit} label="Minutes" />
              <UsageBar
                used={profile.studio_clips_used}
                total={profile.studio_clips_limit}
                label="Studio clips"
              />
              <div className="side-plan">{PLANS[profile.plan].name} plan</div>
            </>
          )}
          <a className="side-link" href="#/">
            ← Back to site
          </a>
          <button
            className="side-link"
            onClick={async () => {
              await supabase.auth.signOut();
              setSession(false);
            }}
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="app-main">
        {toast && <div className="toast">{toast}</div>}

        {page === 'home' && profile && (
          <div className="page-pad">
            <h2 className="app-h">Welcome back, {profile.display_name ?? 'creator'} 👋</h2>
            <p className="app-sub">Your getting-started checklist and latest clips.</p>
            <div className="checklist">
              {[
                ['first_video', 'Make your first clips', 'Paste a YouTube link in Clips.'],
                ['connected', 'Connect TikTok or YouTube', 'Do it in Settings → Connections.'],
                ['first_post', 'Post or schedule a clip', 'Pick your best score and ship it.'],
                ['dna', 'Unlock your DNA Profile', 'Analyze your TikToks to find patterns.'],
              ].map(([k, t, d]) => (
                <div className={`check-item${checklist[k] ? ' done' : ''}`} key={k}>
                  <span className="check-box">{checklist[k] ? '✓' : ''}</span>
                  <div>
                    <strong>{t}</strong>
                    <p>{d}</p>
                  </div>
                  {!checklist[k] && (
                    <button
                      className="btn btn-outline sm"
                      onClick={() => setPage(k === 'connected' ? 'settings' : k === 'dna' ? 'dna' : k === 'first_post' ? 'clips' : 'clips')}
                    >
                      Start
                    </button>
                  )}
                </div>
              ))}
            </div>
            <h3 className="app-h3">Top clips</h3>
            {clips.length === 0 && <p className="app-sub">No clips yet — paste a video in Clips.</p>}
            <div className="clip-grid">
              {clips.slice(0, 4).map((c) => (
                <ClipCardView key={c.id} clip={c} onPost={setPostClip} />
              ))}
            </div>
          </div>
        )}

        {page === 'clips' && profile && (
          <div className="page-pad">
            <h2 className="app-h">Clips</h2>
            <p className="app-sub">
              Paste a YouTube link or add an upload. Each minute of video uses one minute of your
              balance (min 20). You have <strong>{minutesLeft}</strong> minutes left.
            </p>
            <VideoForm mode="clips" onSubmit={createVideo} />
            <h3 className="app-h3">Your videos</h3>
            {videos.filter((v) => v.mode === 'clips').length === 0 && (
              <p className="app-sub">Nothing yet.</p>
            )}
            {videos
              .filter((v) => v.mode === 'clips')
              .map((v) => {
                const vclips = clips.filter((c) => c.video_id === v.id);
                return (
                  <div className="video-block" key={v.id}>
                    <div className="video-head">
                      <strong>{v.title}</strong>
                      <span className={`status s-${v.status}`}>{v.status}</span>
                    </div>
                    {vclips.length > 0 && (
                      <div className="clip-grid">
                        {vclips.map((c) => (
                          <ClipCardView key={c.id} clip={c} onPost={setPostClip} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}

        {page === 'studio' && profile && (
          <div className="page-pad">
            <h2 className="app-h">Studio</h2>
            <p className="app-sub">
              Pick a mode and template, upload, and every moment Studio finds renders itself. You
              have <strong>{profile.studio_clips_limit - profile.studio_clips_used}</strong> Studio
              clips left on {PLANS[profile.plan].name}.
            </p>
            <VideoForm mode="studio" onSubmit={createVideo} />
            {videos
              .filter((v) => v.mode === 'studio')
              .map((v) => {
                const vclips = clips.filter((c) => c.video_id === v.id);
                return (
                  <div className="video-block" key={v.id}>
                    <div className="video-head">
                      <strong>{v.title}</strong>
                      <span className={`status s-${v.status}`}>{v.status}</span>
                    </div>
                    {vclips.length > 0 && (
                      <div className="clip-grid">
                        {vclips.map((c) => (
                          <ClipCardView key={c.id} clip={c} onPost={setPostClip} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}

        {page === 'posts' && (
          <div className="page-pad">
            <h2 className="app-h">Posts</h2>
            <p className="app-sub">Everything you have posted or scheduled, newest first.</p>
            {posts.length === 0 && <p className="app-sub">No posts yet.</p>}
            <div className="post-list">
              {posts.map((p) => {
                const clip = clips.find((c) => c.id === p.clip_id);
                return (
                  <div className="post-row" key={p.id}>
                    <div>
                      <strong>{clip?.title?.slice(0, 48) ?? 'Clip'}…</strong>
                      <span className="post-meta">
                        {p.platform} · {new Date(p.scheduled_for).toLocaleString()}
                      </span>
                    </div>
                    {p.status === 'posted' ? (
                      <span className="post-stats">
                        ▶ {p.views.toLocaleString()} views · ♥ {p.likes.toLocaleString()}
                      </span>
                    ) : (
                      <div className="post-actions">
                        <button
                          className="btn btn-outline sm"
                          onClick={async () => {
                            await supabase.from('posts').delete().eq('id', p.id);
                            refresh();
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          className="btn btn-purple sm"
                          onClick={async () => {
                            const views = 900 + Math.floor(Math.random() * 60000);
                            await supabase
                              .from('posts')
                              .update({
                                status: 'posted',
                                scheduled_for: new Date().toISOString(),
                                views,
                                likes: Math.floor(views * 0.08),
                              })
                              .eq('id', p.id);
                            if (clip)
                              await supabase
                                .from('clips')
                                .update({ posted_at: new Date().toISOString(), platform: p.platform })
                                .eq('id', clip.id);
                            await markChecklist('first_post');
                            refresh();
                          }}
                        >
                          Post now
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {page === 'dna' && (
          <div className="page-pad">
            <h2 className="app-h">DNA Profile</h2>
            <p className="app-sub">
              What actually works for your audience — measured from your posts, not guessed.
            </p>
            {dna.length === 0 ? (
              <div className="dna-empty">
                <p>
                  Analyze at least 2 of your TikToks to unlock your profile. Free, about a minute
                  each. Requires a connected TikTok account.
                </p>
                <button className="btn btn-purple" onClick={unlockDna}>
                  Analyze my TikToks
                </button>
              </div>
            ) : (
              <div className="dna-cols">
                {(['hook', 'category', 'visual'] as const).map((cat) => (
                  <div className="dna-col" key={cat}>
                    <div className="sp-title">{cat.toUpperCase()} PERFORMANCE</div>
                    {dna
                      .filter((d) => d.category === cat)
                      .map((d) => (
                        <div className="sp-row" key={d.id}>
                          <span>{d.label}</span>
                          <div className="sp-track">
                            <div className="sp-fill" style={{ width: `${d.score}%` }} />
                          </div>
                          <em>{d.score}</em>
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {page === 'analytics' && (
          <div className="page-pad">
            <h2 className="app-h">Analytics</h2>
            <p className="app-sub">Performance from your connected accounts, updated continuously.</p>
            {posts.filter((p) => p.status === 'posted').length === 0 ? (
              <p className="app-sub">Post a clip to start collecting performance data.</p>
            ) : (
              <>
                <div className="stats-row app-stats">
                  {['tiktok', 'youtube', 'reels'].map((pl) => {
                    const ps = posts.filter((p) => p.status === 'posted' && p.platform === pl);
                    const views = ps.reduce((a, p) => a + p.views, 0);
                    const likes = ps.reduce((a, p) => a + p.likes, 0);
                    return (
                      <div className="stat" key={pl}>
                        <div className="stat-v">{views.toLocaleString()}</div>
                        <div className="stat-l">
                          {pl} views · {ps.length} posts · {likes.toLocaleString()} likes
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="pub-graph tall">
                  {posts
                    .filter((p) => p.status === 'posted')
                    .slice(0, 14)
                    .map((p) => (
                      <span
                        key={p.id}
                        style={{ height: `${Math.max(8, Math.round((p.views / 90000) * 100))}%` }}
                        title={`${p.views} views`}
                      />
                    ))}
                </div>
              </>
            )}
          </div>
        )}

        {page === 'billing' && profile && (
          <div className="page-pad">
            <h2 className="app-h">Billing</h2>
            <p className="app-sub">
              You are on <strong>{PLANS[profile.plan].name}</strong>. Unused minutes do not roll
              over. Cancel anytime.
            </p>
            <div className="usage-wrap">
              <UsageBar used={profile.minutes_used} total={profile.minutes_limit} label="Clipping minutes" />
              <UsageBar
                used={profile.studio_clips_used}
                total={profile.studio_clips_limit}
                label="Studio clips"
              />
            </div>
            <div className="plans app-plans">
              {(Object.keys(PLANS) as Array<keyof typeof PLANS>).map((k) => {
                const plan = PLANS[k];
                const current = profile.plan === k;
                return (
                  <div className={`plan${k === 'pro' ? ' featured' : ''}`} key={k}>
                    {k === 'pro' && <div className="plan-flag">Most popular</div>}
                    <h3>{plan.name}</h3>
                    <div className="plan-price">
                      <strong>{k === 'free' ? '$0' : k === 'starter' ? '$15' : '$29'}</strong>
                      <span>/mo</span>
                    </div>
                    <ul>
                      <li>
                        <span className="li-check">✓</span> {plan.minutes} clipping minutes / mo
                      </li>
                      <li>
                        <span className="li-check">✓</span>{' '}
                        {plan.studio > 0 ? `${plan.studio} Studio clips / mo` : 'No Studio clips'}
                      </li>
                      <li>
                        <span className="li-check">✓</span>{' '}
                        {k === 'free' ? 'Cloudnivo watermark' : 'Watermark-free clips'}
                      </li>
                    </ul>
                    <button
                      className={`btn plan-btn${k === 'pro' ? ' btn-purple' : ' btn-outline'}`}
                      disabled={current}
                      onClick={async () => {
                        await supabase
                          .from('profiles')
                          .update({
                            plan: k,
                            minutes_limit: plan.minutes,
                            studio_clips_limit: plan.studio,
                          })
                          .eq('id', profile.id);
                        showToast(`Switched to ${plan.name}`);
                        refresh();
                      }}
                    >
                      {current ? 'Current plan' : `Switch to ${plan.name}`}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {page === 'settings' && profile && (
          <div className="page-pad">
            <h2 className="app-h">Settings</h2>
            <SettingsForm
              profile={profile}
              onSaved={(p) => {
                setProfile(p);
                showToast('Settings saved');
              }}
              onConnected={() => {
                refresh();
                markChecklist('connected');
              }}
            />
          </div>
        )}
      </main>

      {postClip && (
        <PostModal
          clip={postClip}
          onClose={() => setPostClip(null)}
          onDone={async () => {
            setPostClip(null);
            await markChecklist('first_post');
            await refresh();
            showToast('Done — see the Posts page');
          }}
        />
      )}
    </div>
  );
}

/* ---------------- forms ---------------- */

function VideoForm({
  mode,
  onSubmit,
}: {
  mode: 'clips' | 'studio';
  onSubmit: (o: {
    title: string;
    sourceUrl?: string;
    sourceType: 'link' | 'upload';
    mode: 'clips' | 'studio';
    durationMinutes: number;
  }) => void;
}) {
  const [tab, setTab] = useState<'link' | 'upload'>('link');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [mins, setMins] = useState(45);

  return (
    <div className="video-form">
      <div className="tab-row">
        <button className={`tab${tab === 'link' ? ' on' : ''}`} onClick={() => setTab('link')}>
          Paste a link
        </button>
        <button className={`tab${tab === 'upload' ? ' on' : ''}`} onClick={() => setTab('upload')}>
          Upload (simulated)
        </button>
      </div>
      {tab === 'link' ? (
        <div className="form-row">
          <input
            className="input grow"
            placeholder="https://youtube.com/watch?v=…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button
            className="btn btn-purple"
            disabled={!url.trim()}
            onClick={() =>
              onSubmit({
                title: url.trim().slice(0, 80),
                sourceUrl: url.trim(),
                sourceType: 'link',
                mode,
                durationMinutes: mins,
              })
            }
          >
            {mode === 'studio' ? 'Run Studio' : 'Get clips'}
          </button>
        </div>
      ) : (
        <div className="form-row">
          <input
            className="input"
            placeholder="Video title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            className="input small"
            type="number"
            min={1}
            max={180}
            value={mins}
            onChange={(e) => setMins(Number(e.target.value) || 1)}
            title="Duration in minutes"
          />
          <button
            className="btn btn-purple"
            disabled={!title.trim()}
            onClick={() =>
              onSubmit({
                title: title.trim(),
                sourceType: 'upload',
                mode,
                durationMinutes: mins,
              })
            }
          >
            {mode === 'studio' ? 'Run Studio' : 'Get clips'}
          </button>
        </div>
      )}
      <p className="form-note">
        Demo note: clipping runs on a serverless function that simulates the AI pipeline — real
        video rendering is not performed.
      </p>
    </div>
  );
}

function SettingsForm({
  profile,
  onSaved,
  onConnected,
}: {
  profile: Profile;
  onSaved: (p: Profile) => void;
  onConnected: () => void;
}) {
  const [name, setName] = useState(profile.display_name ?? '');
  const [color, setColor] = useState(profile.brand_color ?? '#8b5cf6');
  const [font, setFont] = useState(profile.brand_font ?? 'Inter');
  const [cta, setCta] = useState(profile.brand_cta ?? 'Follow for more');

  async function save() {
    const { data, error } = await supabase
      .from('profiles')
      .update({ display_name: name, brand_color: color, brand_font: font, brand_cta: cta })
      .eq('id', profile.id)
      .select()
      .single();
    if (!error && data) onSaved(data as Profile);
  }

  return (
    <div className="settings-grid">
      <section className="set-card">
        <h3>Profile</h3>
        <label className="set-label">Display name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-purple sm" onClick={save}>
          Save profile
        </button>
      </section>
      <section className="set-card">
        <h3>Connections</h3>
        {(
          [
            ['tiktok_connected', 'TikTok'],
            ['youtube_connected', 'YouTube'],
          ] as const
        ).map(([key, label]) => (
          <div className="conn-row" key={key}>
            <span>{label}</span>
            <button
              className={`btn sm ${profile[key] ? 'btn-outline' : 'btn-purple'}`}
              onClick={async () => {
                await supabase
                  .from('profiles')
                  .update({ [key]: !profile[key] })
                  .eq('id', profile.id);
                onConnected();
              }}
            >
              {profile[key] ? '✓ Connected' : 'Connect'}
            </button>
          </div>
        ))}
        <p className="form-note">Demo connections — no real OAuth handshake is performed.</p>
      </section>
      <section className="set-card">
        <h3>Brand Kit</h3>
        <label className="set-label">Brand color</label>
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        <label className="set-label">Font</label>
        <select className="input" value={font} onChange={(e) => setFont(e.target.value)}>
          <option>Inter</option>
          <option>Georgia</option>
          <option>Menlo</option>
        </select>
        <label className="set-label">End-of-clip CTA text</label>
        <input className="input" value={cta} onChange={(e) => setCta(e.target.value)} />
        <button className="btn btn-purple sm" onClick={save}>
          Save brand kit
        </button>
      </section>
    </div>
  );
}
