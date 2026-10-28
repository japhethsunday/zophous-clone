// Studio: chat-first image creation with real tools, backed by Cloudflare Workers AI (edge/index.ts).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MaskPainter, { type MaskHandle } from './MaskPainter';
import {
  ASPECTS, MODELS, StudioError, deleteAssets, fitTo, fileToDataUrl, loadAssets, loadImage, saveImages, studio, toModelImage,
  type Asset, type ModelKey,
} from './api';
import './studio.css';

export type Tool = 'chat' | 'create' | 'restyle' | 'edit' | 'remove' | 'extend' | 'describe';
const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: 'chat', label: 'Chat', hint: 'Describe it; the assistant picks the tool and settings' },
  { id: 'create', label: 'Create', hint: 'Text to image with five models' },
  { id: 'restyle', label: 'Restyle', hint: 'New look for an image you have' },
  { id: 'edit', label: 'Edit area', hint: 'Paint an area and describe the change' },
  { id: 'remove', label: 'Remove object', hint: 'Paint something away' },
  { id: 'extend', label: 'Extend', hint: 'Grow an image to a new shape' },
  { id: 'describe', label: 'Image to prompt', hint: 'Get a prompt from any image' },
];
const STYLES: { id: string; label: string; suffix: string }[] = [
  { id: 'none', label: 'No style', suffix: '' },
  { id: 'photo', label: 'Photo', suffix: ', professional photograph, natural light, 50mm lens, high detail' },
  { id: 'cinematic', label: 'Cinematic', suffix: ', cinematic film still, dramatic lighting, shallow depth of field, color graded' },
  { id: 'anime', label: 'Anime', suffix: ', anime illustration, clean line art, vibrant cel shading' },
  { id: '3d', label: '3D render', suffix: ', 3D render, soft studio lighting, octane, smooth materials' },
  { id: 'illustration', label: 'Illustration', suffix: ', editorial illustration, flat shapes, textured paper' },
  { id: 'logo', label: 'Logo', suffix: ', minimal vector logo mark, flat colors, centered on plain background, no mockup' },
  { id: 'product', label: 'Product shot', suffix: ', studio product photography, seamless backdrop, softbox lighting, reflections' },
  { id: 'headshot', label: 'Headshot', suffix: ', professional corporate headshot, soft key light, neutral backdrop, sharp eyes' },
];
const EXTEND_TO = ['1:1', '4:3', '3:4', '16:9', '9:16'] as const;
type Msg = { role: 'user' | 'assistant'; text: string; images?: Asset[]; image?: string; pending?: boolean };

const ratio = (a: string) => { const [w, h] = a.split(':').map(Number); return w / h; };

export default function Studio({ tool, onTool, showToast }: { tool: Tool; onTool: (t: Tool) => void; showToast: (m: string) => void }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Asset[]>([]);

  // Shared settings across tools.
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState<ModelKey>('flux-schnell');
  const [aspect, setAspect] = useState<string>('1:1');
  const [count, setCount] = useState(2);
  const [style, setStyle] = useState('none');
  const [negative, setNegative] = useState('');
  const [seed, setSeed] = useState('');
  const [strength, setStrength] = useState(0.65);
  const [input, setInput] = useState<string | null>(null);
  const [extendTo, setExtendTo] = useState<string>('16:9');
  const [described, setDescribed] = useState('');
  const mask = useRef<MaskHandle>(null);

  // Chat.
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [attach, setAttach] = useState<string | null>(null);
  const chatEnd = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    setAssets(await loadAssets());
    try { setUsage(await studio.usage()); } catch { /* shown on next action */ }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ block: 'end' }); }, [msgs]);
  useEffect(() => { setError(null); }, [tool]);

  const run = async (label: string, fn: () => Promise<void>, clear = true) => {
    setBusy(label); setError(null);
    if (clear) setResults([]);
    try { await fn(); } catch (e) {
      const msg = e instanceof StudioError || e instanceof Error ? e.message : 'Something went wrong.';
      setError(msg);
    } finally {
      setBusy(null);
      try { setUsage(await studio.usage()); } catch { /* ignore */ }
    }
  };

  const fullPrompt = () => prompt.trim() + (STYLES.find((s) => s.id === style)?.suffix ?? '');
  const seedVal = seed.trim() === '' ? null : Number(seed);
  const modelInfo = MODELS.find((m) => m.key === model)!;

  const keep = (saved: Asset[]) => { setResults(saved); setAssets((a) => [...saved, ...a]); };

  const create = () => run('Creating', async () => {
    if (!prompt.trim()) throw new StudioError('prompt', 'Describe what you want to create.');
    const r = await studio.generate({ prompt: fullPrompt(), model, aspect: modelInfo.square ? '1:1' : aspect, count, negative: modelInfo.negative ? negative : undefined, seed: seedVal });
    keep(await saveImages(r.images, { prompt: fullPrompt(), model, aspect: modelInfo.square ? '1:1' : aspect, tool: 'create' }));
  });

  const inpaintWith = async (src: string, maskB64: string | 'full', p: string, s: number, toolName: string) => {
    const img = await toModelImage(src);
    let m = maskB64;
    if (m === 'full') {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      m = c.toDataURL('image/png').split(',')[1];
    }
    const r = await studio.inpaint({ prompt: p, image: img.b64, mask: m, strength: s, seed: seedVal });
    return saveImages(await Promise.all(r.images.map((x) => fitTo(x, img.width, img.height))), { prompt: p, model: 'sd15-inpaint', aspect: `${img.width}:${img.height}`, tool: toolName });
  };

  const restyle = () => run('Restyling', async () => {
    if (!input) throw new StudioError('image', 'Add an image to restyle.');
    if (!prompt.trim()) throw new StudioError('prompt', 'Describe the new look.');
    keep(await inpaintWith(input, 'full', fullPrompt(), strength, 'restyle'));
  });

  const paintEdit = (toolName: 'edit' | 'remove') => run(toolName === 'edit' ? 'Editing' : 'Removing', async () => {
    if (!input) throw new StudioError('image', 'Add an image first.');
    if (toolName === 'edit' && !prompt.trim()) throw new StudioError('prompt', 'Describe what should appear in the painted area.');
    const img = await toModelImage(input);
    const m = mask.current?.mask(img.width, img.height);
    if (!m) throw new StudioError('mask', 'Paint over the area to change first.');
    const p = toolName === 'remove' ? 'empty background, seamless continuation of the surroundings, nothing there' : prompt.trim();
    keep(await inpaintWith(input, m, p, toolName === 'remove' ? 0.95 : 0.85, toolName));
    mask.current?.clear();
  });

  const extend = () => run('Extending', async () => {
    if (!input) throw new StudioError('image', 'Add an image to extend.');
    const src = await loadImage(input);
    const target = ratio(extendTo);
    const long = 768;
    const W = Math.round((target >= 1 ? long : long * target) / 8) * 8;
    const H = Math.round((target >= 1 ? long / target : long) / 8) * 8;
    const fit = Math.min(W / src.naturalWidth, H / src.naturalHeight);
    const w = src.naturalWidth * fit, h = src.naturalHeight * fit, x = (W - w) / 2, y = (H - h) / 2;
    if (Math.abs(w - W) < 16 && Math.abs(h - H) < 16) throw new StudioError('shape', 'The image already has this shape. Pick a different one.');
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d')!;
    ctx.filter = 'blur(24px)'; ctx.drawImage(src, 0, 0, W, H); ctx.filter = 'none';
    ctx.drawImage(src, x, y, w, h);
    const mc = document.createElement('canvas'); mc.width = W; mc.height = H;
    const m = mc.getContext('2d')!; m.fillStyle = '#fff'; m.fillRect(0, 0, W, H); m.fillStyle = '#000';
    m.fillRect(x + 6, y + 6, w - 12, h - 12); // small overlap so the seam blends
    const p = (prompt.trim() || 'continue the scene naturally, same style, lighting and perspective');
    const r = await studio.inpaint({ prompt: p, image: c.toDataURL('image/png').split(',')[1], mask: mc.toDataURL('image/png').split(',')[1], strength: 1, seed: seedVal });
    keep(await saveImages(await Promise.all(r.images.map((i) => fitTo(i, W, H))), { prompt: p, model: 'sd15-inpaint', aspect: extendTo, tool: 'extend' }));
  });

  const describe = () => run('Reading the image', async () => {
    if (!input) throw new StudioError('image', 'Add an image to describe.');
    const img = await toModelImage(input, 1024);
    setDescribed((await studio.describe(img.b64)).prompt);
  }, false);

  const enhance = () => run('Improving the prompt', async () => {
    if (!prompt.trim()) throw new StudioError('prompt', 'Write a short idea first.');
    setPrompt((await studio.enhance(prompt)).prompt);
  }, false);

  const send = () => {
    const text = draft.trim();
    if (!text || busy) return;
    const history = msgs.slice(-6).map((m) => ({ role: m.role, text: m.text }));
    const image = attach;
    setMsgs((m) => [...m, { role: 'user', text, image: image ?? undefined }, { role: 'assistant', text: 'Thinking…', pending: true }]);
    setDraft(''); setAttach(null);
    void run('Working', async () => {
      const replace = (msg: Msg) => setMsgs((m) => [...m.slice(0, -1), msg]);
      try {
        const plan = await studio.plan(text, Boolean(image), history);
        const a = plan.action;
        if (a.type === 'none') { replace({ role: 'assistant', text: plan.reply }); return; }
        replace({ role: 'assistant', text: `${plan.reply}\nMaking it now…`, pending: true });
        let saved: Asset[];
        if (a.type === 'restyle' && image) saved = await inpaintWith(image, 'full', a.prompt, a.strength, 'restyle');
        else {
          const info = MODELS.find((m) => m.key === a.model)!;
          const asp = info.square ? '1:1' : a.aspect;
          const r = await studio.generate({ prompt: a.prompt, model: a.model, aspect: asp, count: a.count });
          saved = await saveImages(r.images, { prompt: a.prompt, model: a.model, aspect: asp, tool: 'chat' });
        }
        setAssets((x) => [...saved, ...x]);
        replace({ role: 'assistant', text: `${plan.reply}\n${MODELS.find((m) => m.key === (a.type === 'restyle' ? 'sdxl-base' : a.model))?.label ?? 'Model'} · ${a.type === 'restyle' ? 'restyle' : a.aspect}`, images: saved });
      } catch (e) {
        replace({ role: 'assistant', text: e instanceof Error ? e.message : 'Something went wrong.' });
        throw e;
      }
    }, false);
  };

  const pickFile = async (f: File | undefined, set: (v: string) => void) => {
    if (!f) return;
    try { set(await fileToDataUrl(f)); } catch (e) { setError(e instanceof Error ? e.message : 'Could not read the file.'); }
  };

  const useAsset = (a: Asset) => {
    if (!a.url) return;
    if (tool === 'chat') setAttach(a.url);
    else if (tool === 'create') { onTool('restyle'); setInput(a.url); }
    else setInput(a.url);
    showToast('Image added');
  };

  const download = async (list: Asset[]) => {
    for (const a of list) {
      if (!a.url) continue;
      const blob = await (await fetch(a.url)).blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `cloudnivo-${a.tool}-${a.id.slice(0, 8)}.${blob.type.includes('jpeg') ? 'jpg' : 'png'}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 4000);
    }
  };

  const remove = async () => {
    const list = assets.filter((a) => selected.has(a.id));
    if (!list.length || !window.confirm(`Delete ${list.length} ${list.length === 1 ? 'image' : 'images'} for good?`)) return;
    await deleteAssets(list);
    setAssets((x) => x.filter((a) => !selected.has(a.id)));
    setResults((x) => x.filter((a) => !selected.has(a.id)));
    setSelected(new Set());
    showToast('Deleted');
  };

  const meta = TOOLS.find((t) => t.id === tool)!;
  const needsImage = ['restyle', 'edit', 'remove', 'extend', 'describe'].includes(tool);
  const selectedList = useMemo(() => assets.filter((a) => selected.has(a.id)), [assets, selected]);

  const imagePicker = (
    <div className="st-input">
      {input ? (
        tool === 'edit' || tool === 'remove'
          ? <MaskPainter ref={mask} src={input} label={tool === 'edit' ? 'Paint the area to change' : 'Paint what to remove'} />
          : <img className="st-input-img" src={input} alt="Your image" />
      ) : (
        <label className="st-drop">
          <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { void pickFile(e.target.files?.[0], setInput); e.target.value = ''; }} />
          <strong>Add an image</strong>
          <span>PNG, JPG or WebP, or pick one from your assets</span>
        </label>
      )}
      {input && <button type="button" className="btn btn-ghost xs" onClick={() => setInput(null)}>Change image</button>}
    </div>
  );

  return (
    <div className="studio">
      <nav className="st-tools" aria-label="Studio tools">
        {TOOLS.map((t) => (
          <button key={t.id} className={tool === t.id ? 'on' : ''} aria-current={tool === t.id ? 'page' : undefined} onClick={() => onTool(t.id)} title={t.hint}>
            {t.label}
          </button>
        ))}
      </nav>

      <section className="st-main" aria-label={meta.label}>
        <header className="st-head">
          <div>
            <h1>{meta.label}</h1>
            <p>{meta.hint}</p>
          </div>
          {usage && <span className="st-usage" title="Free images per day, resets at midnight UTC">{Math.max(0, usage.limit - usage.used)} of {usage.limit} free images left today</span>}
        </header>

        {tool === 'chat' ? (
          <div className="st-chat">
            <div className="st-msgs" aria-live="polite">
              {msgs.length === 0 && (
                <div className="st-chat-empty">
                  <p>Say what you want. The assistant writes the prompt, picks the model and shape, and makes it.</p>
                  <div className="st-chips">
                    {['A vertical poster for a jazz night in Lagos', 'Logo for a coffee brand called Ember', 'Product shot of a matte black water bottle on stone', 'Turn my photo into a watercolor painting'].map((s) => (
                      <button key={s} type="button" onClick={() => setDraft(s)}>{s}</button>
                    ))}
                  </div>
                </div>
              )}
              {msgs.map((m, i) => (
                <div key={i} className={`msg msg-${m.role}${m.pending ? ' pending' : ''}`}>
                  {m.image && <img className="msg-attach" src={m.image} alt="Attached" />}
                  <p>{m.text}</p>
                  {m.images && (
                    <div className="msg-grid">
                      {m.images.map((a) => (
                        <figure key={a.id}>
                          {a.url && <img src={a.url} alt={a.prompt} />}
                          <figcaption>
                            <button type="button" className="btn btn-outline xs" onClick={() => void download([a])}>Download</button>
                            <button type="button" className="btn btn-ghost xs" onClick={() => setAttach(a.url)}>Edit this</button>
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div ref={chatEnd} />
            </div>
            <form className="st-composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
              {attach && (
                <span className="st-attach"><img src={attach} alt="Attached" /><button type="button" aria-label="Remove attached image" onClick={() => setAttach(null)}>×</button></span>
              )}
              <label className="st-clip" title="Attach an image">
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { void pickFile(e.target.files?.[0], setAttach); e.target.value = ''; }} />
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 11.5 12.5 20a5.5 5.5 0 0 1-7.8-7.8l8.5-8.5a3.7 3.7 0 0 1 5.2 5.2l-8.5 8.5a1.8 1.8 0 0 1-2.6-2.6l7.8-7.8" /></svg>
                <span className="sr-only">Attach an image</span>
              </label>
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} placeholder="Describe an image, or attach one and say how to change it"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} aria-label="Message" />
              <button className="btn btn-primary" type="submit" disabled={!draft.trim() || !!busy}>Send</button>
            </form>
          </div>
        ) : (
          <div className="st-panel">
            <div className="st-form">
              {needsImage && imagePicker}

              {tool === 'describe' ? (
                <>
                  <button className="btn btn-primary" disabled={!input || !!busy} onClick={describe}>{busy ?? 'Get prompt'}</button>
                  {described && (
                    <div className="st-described">
                      <p>{described}</p>
                      <div className="st-row">
                        <button className="btn btn-outline sm" onClick={() => { void navigator.clipboard?.writeText(described); showToast('Copied'); }}>Copy</button>
                        <button className="btn btn-outline sm" onClick={() => { setPrompt(described); onTool('create'); }}>Create with this prompt</button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {tool !== 'remove' && (
                    <div className="fld">
                      <label className="field-label" htmlFor="st-prompt">
                        {tool === 'edit' ? 'What should appear in the painted area' : tool === 'extend' ? 'What to add around it (optional)' : tool === 'restyle' ? 'The new look' : 'Prompt'}
                      </label>
                      <textarea id="st-prompt" className="input" rows={tool === 'create' ? 4 : 3} value={prompt} onChange={(e) => setPrompt(e.target.value)}
                        placeholder={tool === 'create' ? 'A red fox curled up in fresh snow at dawn' : tool === 'restyle' ? 'Watercolor painting, soft washes' : tool === 'extend' ? 'More beach and sky' : 'A golden retriever sitting'} />
                      {tool === 'create' && (
                        <div className="st-row">
                          <button type="button" className="btn btn-ghost xs" onClick={enhance} disabled={!prompt.trim() || !!busy}>Improve prompt</button>
                          <button type="button" className="btn btn-ghost xs" onClick={() => onTool('describe')}>Image to prompt</button>
                        </div>
                      )}
                    </div>
                  )}

                  {(tool === 'create' || tool === 'restyle') && (
                    <fieldset className="fld">
                      <legend className="field-label">Style</legend>
                      <div className="st-pills">
                        {STYLES.map((s) => (
                          <button type="button" key={s.id} className={style === s.id ? 'on' : ''} aria-pressed={style === s.id} onClick={() => setStyle(s.id)}>{s.label}</button>
                        ))}
                      </div>
                    </fieldset>
                  )}

                  {tool === 'create' && (
                    <>
                      <fieldset className="fld">
                        <legend className="field-label">Model</legend>
                        <div className="st-models">
                          {MODELS.map((m) => (
                            <label key={m.key} className={model === m.key ? 'on' : ''}>
                              <input type="radio" name="model" className="sr-only" checked={model === m.key} onChange={() => setModel(m.key)} />
                              <strong>{m.label}</strong><span>{m.note}</span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      <fieldset className="fld" disabled={modelInfo.square}>
                        <legend className="field-label">Shape{modelInfo.square ? ' (this model makes squares)' : ''}</legend>
                        <div className="st-pills">
                          {ASPECTS.map((a) => (
                            <button type="button" key={a} className={(modelInfo.square ? '1:1' : aspect) === a ? 'on' : ''} aria-pressed={aspect === a} onClick={() => setAspect(a)}>{a}</button>
                          ))}
                        </div>
                      </fieldset>
                      <div className="fld">
                        <label className="field-label" htmlFor="st-count">Number of images: {count}</label>
                        <input id="st-count" type="range" min={1} max={4} value={count} onChange={(e) => setCount(Number(e.target.value))} />
                      </div>
                      <details className="fld st-adv">
                        <summary>More settings</summary>
                        {modelInfo.negative && (
                          <>
                            <label className="field-label" htmlFor="st-neg">Leave out</label>
                            <input id="st-neg" className="input" value={negative} onChange={(e) => setNegative(e.target.value)} placeholder="blurry, text, extra fingers" />
                          </>
                        )}
                        <label className="field-label" htmlFor="st-seed">Seed (same seed + prompt = same image)</label>
                        <input id="st-seed" className="input" inputMode="numeric" value={seed} onChange={(e) => setSeed(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Random" />
                      </details>
                    </>
                  )}

                  {tool === 'restyle' && (
                    <div className="fld">
                      <label className="field-label" htmlFor="st-strength">How much to change: {Math.round(strength * 100)}%</label>
                      <input id="st-strength" type="range" min={0.3} max={0.95} step={0.05} value={strength} onChange={(e) => setStrength(Number(e.target.value))} />
                    </div>
                  )}

                  {tool === 'extend' && (
                    <fieldset className="fld">
                      <legend className="field-label">New shape</legend>
                      <div className="st-pills">
                        {EXTEND_TO.map((a) => <button type="button" key={a} className={extendTo === a ? 'on' : ''} aria-pressed={extendTo === a} onClick={() => setExtendTo(a)}>{a}</button>)}
                      </div>
                    </fieldset>
                  )}

                  <button className="btn btn-primary st-go" disabled={!!busy || (needsImage && !input)}
                    onClick={tool === 'create' ? create : tool === 'restyle' ? restyle : tool === 'edit' ? () => paintEdit('edit') : tool === 'remove' ? () => paintEdit('remove') : extend}>
                    {busy ? `${busy}…` : tool === 'create' ? `Create ${count > 1 ? `${count} images` : 'image'}` : tool === 'restyle' ? 'Restyle' : tool === 'edit' ? 'Apply edit' : tool === 'remove' ? 'Remove' : 'Extend'}
                  </button>
                </>
              )}
              {error && <p className="st-error" role="alert">{error}</p>}
            </div>

            <div className="st-results" aria-live="polite">
              {busy && <div className="st-working" role="status"><span className="st-spin" aria-hidden="true" />{busy}… usually 5 to 20 seconds</div>}
              {!busy && results.length === 0 && <p className="st-empty">Results appear here and are saved to your assets automatically.</p>}
              <div className="st-grid">
                {results.map((a) => (
                  <figure key={a.id}>
                    {a.url && <img src={a.url} alt={a.prompt} />}
                    <figcaption>
                      <button type="button" className="btn btn-outline xs" onClick={() => void download([a])}>Download</button>
                      <button type="button" className="btn btn-ghost xs" onClick={() => { setInput(a.url); if (tool === 'create') onTool('restyle'); }}>Use as input</button>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      <aside className="st-assets" aria-label="Your assets">
        <div className="st-assets-head">
          <h2>Assets <span>{assets.length}</span></h2>
          {selectedList.length > 0 && (
            <div className="st-row">
              <button className="btn btn-outline xs" onClick={() => void download(selectedList)}>Download {selectedList.length}</button>
              <button className="btn btn-ghost xs st-del" onClick={() => void remove()}>Delete</button>
            </div>
          )}
        </div>
        {assets.length === 0 ? (
          <p className="st-empty">Everything you make lands here.</p>
        ) : (
          <ul className="st-asset-grid">
            {assets.map((a) => (
              <li key={a.id} className={selected.has(a.id) ? 'sel' : ''}>
                <button type="button" className="st-asset" onClick={() => useAsset(a)} title={`Use: ${a.prompt}`}>
                  {a.url ? <img src={a.url} alt={a.prompt} loading="lazy" /> : <span />}
                </button>
                <input type="checkbox" aria-label="Select image" checked={selected.has(a.id)}
                  onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(a.id); else n.delete(a.id); return n; })} />
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
