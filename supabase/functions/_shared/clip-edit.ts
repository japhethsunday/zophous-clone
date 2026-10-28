// Validation for clip edits. Shared by the clips-render Edge Function and the web editor,
// so the browser rejects exactly what the server rejects.

export const CAPTION_STYLE_IDS = ['bold', 'clean', 'boxed', 'pop', 'none'] as const;
export const ASPECT_IDS = ['9:16', '1:1', '4:5', '16:9'] as const;
export const MIN_CLIP_SECONDS = 3;
export const MAX_CLIP_SECONDS = 180;

export type CaptionStyleId = (typeof CAPTION_STYLE_IDS)[number];
export type AspectId = (typeof ASPECT_IDS)[number];

export type ClipEdit = {
  start: number;
  end: number;
  captionStyle: CaptionStyleId;
  aspect: AspectId;
  /** Horizontal crop centre, 0 (left) to 1 (right). null = follow the detected face. */
  cropX: number | null;
  title: string | null;
};

export type EditCheck = { ok: true; edit: ClipEdit } | { ok: false; error: string; message: string };

const round = (n: number) => Math.round(n * 100) / 100;

export function validateRenderEdit(body: Record<string, unknown>, sourceSeconds: number): EditCheck {
  const start = Number(body.start);
  const end = Number(body.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
    return { ok: false, error: 'bad_range', message: 'The end must come after the start.' };
  }
  if (sourceSeconds > 0 && end > sourceSeconds + 1) {
    return { ok: false, error: 'bad_range', message: 'The clip runs past the end of the video.' };
  }
  const len = end - start;
  if (len < MIN_CLIP_SECONDS) return { ok: false, error: 'too_short', message: `Clips must be at least ${MIN_CLIP_SECONDS} seconds.` };
  if (len > MAX_CLIP_SECONDS) return { ok: false, error: 'too_long', message: `Clips can be up to ${MAX_CLIP_SECONDS / 60} minutes.` };

  const captionStyle = String(body.captionStyle ?? 'bold') as CaptionStyleId;
  if (!CAPTION_STYLE_IDS.includes(captionStyle)) return { ok: false, error: 'bad_style', message: 'Unknown caption style.' };
  const aspect = String(body.aspect ?? '9:16') as AspectId;
  if (!ASPECT_IDS.includes(aspect)) return { ok: false, error: 'bad_aspect', message: 'Unknown aspect ratio.' };

  let cropX: number | null = null;
  if (body.cropX !== null && body.cropX !== undefined) {
    cropX = Number(body.cropX);
    if (!Number.isFinite(cropX) || cropX < 0 || cropX > 1) return { ok: false, error: 'bad_crop', message: 'Framing must be between 0 and 1.' };
    cropX = Math.round(cropX * 1000) / 1000;
  }
  const rawTitle = body.title == null ? '' : String(body.title).trim();
  return {
    ok: true,
    edit: { start: round(start), end: round(end), captionStyle, aspect, cropX, title: rawTitle ? rawTitle.slice(0, 200) : null },
  };
}
