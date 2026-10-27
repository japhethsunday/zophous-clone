# Open-Source Stack for Phases 3–9

Checked 2026-10-27 via the GitHub API (stars · license · last push).

**Rule:** the software is free, but running it still needs a computer. Anything that needs a GPU is not free to host at scale. The plan below keeps every paid-only piece optional.

## Selected tools

| Need | Tool | License | Stars | Runs on CPU? | Notes |
|---|---|---|---|---|---|
| Cut, crop, burn captions, render | FFmpeg | LGPL/GPL | 66k | Yes | Called as a separate program, so the license doesn't spread to Cloudnivo's code |
| Transcription + word timings | faster-whisper | MIT | 26k | Yes (small/base models) | whisper.cpp (MIT, 55k) is the alternative |
| Word-level alignment | WhisperX | BSD-2 | 25k | Slow on CPU | Optional upgrade |
| Scene/shot boundaries | PySceneDetect | BSD-3 | 5k | Yes | Helps pick clean cut points |
| Face tracking for 9:16 reframe | MediaPipe | Apache-2.0 | 37k | Yes | Face detection per frame, then smoothed crop path |
| Moment ranking, titles, scripts | Ollama + an open model (e.g. Qwen2.5 3B/7B) | MIT (models vary) | 185k | Yes, slowish | Replaces paid LLM calls; 7B needs ~8 GB RAM |
| Voiceover (TTS) | Kokoro-82M | Apache-2.0 | 10k | Yes | Piper is **archived**, so it isn't used |
| Reference design | openshorts | MIT | 7k | — | An open "long video → shorts" pipeline to learn from |
| Reference design | AI-Youtube-Shorts-Generator | MIT | 6k | — | Same idea, simpler |

## Not used, and why

| Tool | Reason |
|---|---|
| audiocraft / MusicGen | The code is MIT, but **model weights are CC-BY-NC (non-commercial)**. Use a royalty-free music library instead |
| Wan2.1, LTX-Video (AI video generation) | Apache-2.0, but they **need a GPU** (minutes per clip on high-end cards). They aren't free to host. Optional, if you have a GPU PC |
| Remotion | Source-available; companies above a size need a paid license |
| Postiz (social scheduler) | AGPL-3.0, which would force open-sourcing the whole app if embedded. Call the official TikTok/YouTube APIs directly instead |
| yt-dlp (YouTube download) | Free (Unlicense), but downloading YouTube videos breaks YouTube's Terms of Service. Uploads go first; any link import is limited to the user's own channel |

## What each phase becomes

| Phase | Free approach | Still needs |
|---|---|---|
| 3 Clipping | Worker: FFmpeg + faster-whisper + PySceneDetect + MediaPipe + Ollama ranking. Uses Phase 2 jobs, storage and ledger | A worker host (see below) |
| 4 Generation | Images/video stay optional. Use open models on a GPU only if you have one | A GPU, or paid keys |
| 5 Long-form | Ollama script, Kokoro voice, images optional, FFmpeg render, a royalty-free music folder | Worker host |
| 6 Posting/analytics | The official TikTok and YouTube APIs are free to call | Free developer accounts and app review (weeks) |
| 7 Payments | No open-source replacement for a payment processor. Stripe has no monthly fee (it charges per sale) | A Stripe account when you're ready to charge |
| 9 Testing | Vitest and Playwright (both free) | — |

## Free places to run the worker

| Option | Cost | Limits |
|---|---|---|
| Oracle Cloud Always Free (4 ARM cores, 24 GB RAM) | $0 | Signup needs card verification; capacity sometimes unavailable |
| Hugging Face Spaces (free CPU, 2 vCPU, 16 GB) | $0 | Sleeps when idle; slower |
| Your own PC | $0 | Must stay on and online |
