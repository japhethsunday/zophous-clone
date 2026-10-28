// Paint the area to change over an image. The mask is white where painted, black elsewhere.
import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';

export type MaskHandle = { mask: (width: number, height: number) => string | null; clear: () => void; painted: () => boolean };

export default forwardRef<MaskHandle, { src: string; label: string }>(function MaskPainter({ src, label }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const [brush, setBrush] = useState(40);
  const [hasPaint, setHasPaint] = useState(false);
  const drawing = useRef(false);

  const fit = () => {
    const c = canvas.current, i = img.current;
    if (!c || !i) return;
    c.width = i.clientWidth; c.height = i.clientHeight;
    setHasPaint(false);
  };
  useEffect(() => { setHasPaint(false); }, [src]);

  useImperativeHandle(ref, () => ({
    painted: () => hasPaint,
    clear: () => { const c = canvas.current; c?.getContext('2d')?.clearRect(0, 0, c.width, c.height); setHasPaint(false); },
    mask: (width, height) => {
      const c = canvas.current;
      if (!c || !hasPaint) return null;
      const out = document.createElement('canvas');
      out.width = width; out.height = height;
      const ctx = out.getContext('2d')!;
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, width, height);
      // Painted pixels (any alpha) become pure white.
      const tmp = document.createElement('canvas');
      tmp.width = width; tmp.height = height;
      const t = tmp.getContext('2d')!;
      t.drawImage(c, 0, 0, width, height);
      const d = t.getImageData(0, 0, width, height);
      for (let p = 0; p < d.data.length; p += 4) {
        const on = d.data[p + 3] > 10;
        d.data[p] = d.data[p + 1] = d.data[p + 2] = on ? 255 : 0; d.data[p + 3] = 255;
      }
      ctx.putImageData(d, 0, 0);
      return out.toDataURL('image/png').split(',')[1];
    },
  }), [hasPaint]);

  const stroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvas.current;
    if (!c || !drawing.current) return;
    const r = c.getBoundingClientRect();
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = 'rgba(255, 210, 63, 0.55)';
    ctx.beginPath();
    ctx.arc(e.clientX - r.left, e.clientY - r.top, brush / 2, 0, Math.PI * 2);
    ctx.fill();
    if (!hasPaint) setHasPaint(true);
  };

  return (
    <div className="mask">
      <div className="mask-stage">
        <img ref={img} src={src} alt="" onLoad={fit} draggable={false} />
        <canvas
          ref={canvas}
          aria-label={label}
          onPointerDown={(e) => { drawing.current = true; e.currentTarget.setPointerCapture(e.pointerId); stroke(e); }}
          onPointerMove={stroke}
          onPointerUp={() => { drawing.current = false; }}
          onPointerCancel={() => { drawing.current = false; }}
        />
      </div>
      <div className="mask-tools">
        <label>Brush <input type="range" min={10} max={120} value={brush} onChange={(e) => setBrush(Number(e.target.value))} aria-label="Brush size" /></label>
        <button type="button" className="btn btn-ghost xs" onClick={() => { const c = canvas.current; c?.getContext('2d')?.clearRect(0, 0, c.width, c.height); setHasPaint(false); }}>Clear</button>
        <span className="mask-hint">{hasPaint ? 'Painted area will change' : 'Paint over the area to change'}</span>
      </div>
    </div>
  );
});
