# Clip workspace upgrade: progress

Branch `feat/clip-workspace`, 2026-10-28. Labels: **VERIFIED** (tested here), **INFERRED**, **NOT VERIFIED**.

## 1. What was there (audit)

| Area | Finding | Status |
|---|---|---|
| Clipping | Real pipeline in `worker/`: faster-whisper transcript → heuristic + optional Ollama ranking → OpenCV face crop → FFmpeg ASS captions → 9:16 MP4 in the `outputs` bucket | VERIFIED (ran it, see §5) |
| Editing | None. A clip could only be watched or downloaded. Trim, captions, format and title were fixed at first render | VERIFIED |
| Clips UI | 9:16 native `<video>` players as cards, letter grades, a "breakdown" panel with hard-coded hashtags and filler sentences, a "whose videos" modal whose buttons did nothing, and an empty state telling users to paste a URL (only uploads work) | VERIFIED |
| Dead simulated code | Studio, DNA, Analytics, Posts and the old `process-video` path were unreachable from navigation but still in the bundle | VERIFIED |
| Upload | No progress feedback; no drag and drop | VERIFIED |
| Routing | Sidebar changed state but not the URL, so Back did nothing and pages could not be linked | VERIFIED |
| Settings | "Email me when my clips are ready" toggle only flipped local state | VERIFIED |
| Worker deps | `faster-whisper==1.1.1` with an unpinned PyAV. PyAV 17+ removed an argument it passes, so transcription crashes on a fresh build | VERIFIED (reproduced) |
| Bundle | One 545 KB script for landing and app | VERIFIED |

## 2. Everygen research (REA)

Captured with REA (`capture_web_screenshot` over CDP) on `/home`, `/tools/auto-captions` and `/tools/shorts-studio`, plus the official `/llms-full.txt`. Signed-out only: the authenticated app was not accessed.

- **Everygen has no long-video-to-clips tool.** VERIFIED from its own docs: it generates video and images (15 models), and its one editing tool is Auto Captions. The home page offers "Clip a YouTube video" as a Wizard prompt chip; what Wizard does with it needs sign-in (NOT VERIFIED).
- **Auto Captions** (closest overlap): one calm drop zone, explicit limits shown as chips (MP4/WebM/MOV, up to 100 MB, up to 2 min), caption language picker, "crop-and-trim step" for longer or wider clips, restyle after transcription. Adopted: the explicit limits line and the single drop zone. Not adopted: their 2-minute cap (Cloudnivo takes up to 3 hours).
- **Visual language:** white canvas, SF Pro/Geist, one blue accent, left sidebar, large rounded hero and image tiles. Cloudnivo deliberately does not copy it (see §3).
- **Weak spots seen:** a promo banner above the app, rounded image-heavy tool tiles that push work below the fold, no visible processing state before sign-in.

Implication: Cloudnivo competes on the clipping workflow itself, where Everygen has nothing comparable. Effort went into review, trim, restyle and re-render rather than generation breadth.

## 3. Design decisions ("cutting room", v4)

- One signature colour, `--signal #FFD23F`: the same yellow the renderer uses for the spoken word. In the UI it only means playing, selected or in range.
- Ink (`#15171C`) for primary actions. Graphite (`--stage #1B1D22`) only behind video, as in pro editors.
- Schibsted Grotesk for the UI. Mono only for timecodes and keyboard shortcuts. No uppercase micro-labels.
- Removed: violet gradient button, rainbow tool icons, mono-caps eyebrows, letter grades, fake breakdown copy.
- Skills: only `frontend-design` is installed in this environment (`/mnt/skills/public/frontend-design`); it was read and followed (token plan, review against generic defaults, screenshots for self-critique). The other four requested skills (UI/UX Pro Max, Frontend UI Engineering, UI Skills, Frontend UI/UX Engineering) are **not installed here** and were not used.

## 4. What changed

| Phase | Change |
|---|---|
| A | Removed unreachable simulated pages and code (−610 lines). Upload via signed URL + XHR with real progress and cancel. Drag and drop. URL routing with deep links (`#/app/clips/<project>`). Browser test harness with a fake Supabase backend (`tests/e2e/`). |
| B | v4 token layer in `src/style.css`; `src/clips/clips.css` for the new screens. |
| C | **Clips library** (`src/clips/ClipsLibrary.tsx`): drop zone with limits and minute cost before upload, project rows with filmstrips and named processing stages. **Clip editor** (`src/clips/ClipWorkspace.tsx`): clip list ranked by score, rendered/live preview, transcript timeline with draggable keyboard-accessible handles (←/→ 0.1 s, Shift 1 s), word-snapping, I/O/J/L/Space shortcuts, five caption styles, four formats, face-follow or manual framing, title, download, delete with confirm, unsaved-changes guard. Live preview draws captions over the source in the browser using the same style data as the renderer. |
| D | `clips-render` Edge Function (validation shared with the browser in `supabase/functions/_shared/clip-edit.ts`, one render per clip at a time, max 4 per user, no minutes charged). Worker `clip_render` job: reuses the saved transcript, renders, swaps the clip's file, deletes the old one, never touches the clip on failure. Clipping jobs now save `transcript.json`. Caption styles + formats defined once in `worker/cloudnivo_worker/caption_styles.json`. PyAV pinned. |
| E | New dashboard (resume projects, recent clips, start actions). Removed fake email toggle. Labels normalised on Generate/Brand/Settings. App shell lazy-loaded. |

No database migration was needed: `jobs.kind` is free text and `clip_edits` already existed.

## 5. Tests actually run

| Test | Result |
|---|---|
| `npm run build` (tsc + vite) | pass |
| Vitest: `tests/*.test.ts` (pricing, uploads, caption grouping, edit validation) | 25/25 pass |
| Worker pytest: moments, every style × format ASS output, crop maths, transcript round trip, real FFmpeg re-render | 13/13 pass |
| Browser e2e `tests/e2e/clips.e2e.cjs` (real app, fake backend): bad file rejected, upload + progress + queue, open editor, live captions, keyboard trim, word seek, format reshapes frame, render payload + progress + completion, clip switching, delete confirm, back nav, no page errors | 15/15 pass |
| Real pipeline on a 56 s two-voice speech video (Kokoro TTS), 4 CPU cores, Whisper `base` | Clipping 24.9 s (transcribe 8.2 s, render 16.6 s), 1 clip 1080×1920 with captions. Re-render (boxed, 4:5, framing 0.7, trimmed) 11.6 s with no re-transcription, output 1080×1350, 36.5 s. Frames inspected. |
| No horizontal scroll at 375 px on all 6 app pages | pass |
| Every interactive control named; visible focus on first 25 Tab stops (dashboard, library, editor) | pass |
| Landing JS | 545 KB → 214 KB (155.6 → 67.1 KB gzip) |

## 6. Not deployed / not verified

- **`clips-render` Edge Function is not deployed** and **the worker update is not published** (the Hugging Face Space needs the owner's token). Until both ship, "Render changes" returns an error toast; nothing else breaks.
- Not tested against the live Supabase project or with a real signed-in account.
- Storage file-size limit on the Supabase project is unknown; uploads above it now show a clear 413 message.
- Live preview framing in "follow face" mode shows the frame centre; the face position is only known to the worker.
- Projects clipped before this change have no `transcript.json`: their live preview shows no captions (renders still caption them by transcribing the clip range).
- A failed project cannot be retried in place; the user uploads again (minutes were already returned).
- Mobile Safari not tested (Chromium only).
- Settings still shows two disabled "Coming soon" placeholders (social connections, reaction library); left as is.

## 7. Remaining work

1. Deploy `clips-render`, republish the worker (`bash worker/space/publish.sh recksdev/cloudnivo-worker`), then run one real edit on production.
2. Return the detected face position from clipping into `clip_edits` so the live preview frames like the render.
3. Retry for failed projects using the stored source.
4. Batch actions (render all, download all as zip).
