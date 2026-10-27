# Cloudnivo clipping worker

A self-hosted, free, open-source pipeline that turns an uploaded long video into captioned 9:16 clips.

| Step | Tool |
|---|---|
| Transcript + word timings | faster-whisper (`small` model, CPU, int8) |
| Moment candidates + pacing score | `moments.py` (pure Python) |
| Meaning-based ranking, titles | Ollama + `qwen2.5:3b` (falls back to the heuristic if unavailable) |
| Speaker-centered 9:16 crop | OpenCV face detection |
| Captions, watermark, encode | FFmpeg (ASS subtitles, libx264) |

The worker polls Supabase for `jobs` with `kind = 'clipping'` and claims one at a time
(`claim_clipping_job`, `FOR UPDATE SKIP LOCKED`). It reports progress to `jobs` and `videos`,
writes clips to the private `outputs` bucket and the `clips` table, then keeps the reserved
minutes (`clip_minutes_settle`) or returns them (`clip_minutes_release`). Failed jobs retry up to
3 times; jobs from a crashed worker are re-queued after 30 minutes.

## Run on an Oracle Cloud Always Free VM

1. **Create the VM.** cloud.oracle.com → Compute → Instances → Create.
   - Image: **Ubuntu 22.04**. Shape: **Ampere VM.Standard.A1.Flex**, 4 OCPU / 24 GB (Always Free).
   - Download the SSH key it offers. No inbound ports are needed: the worker only makes outbound calls.
2. **Install Docker** (SSH in as `ubuntu`):
   ```bash
   curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker ubuntu && exit
   ```
3. **Get the code and configure** (SSH in again):
   ```bash
   git clone https://github.com/japhethsunday/zophous-clone.git && cd zophous-clone/worker
   cp .env.example .env && nano .env   # paste the service_role key from Supabase → Settings → API
   ```
4. **Start it:**
   ```bash
   docker compose up -d --build
   docker compose logs -f worker      # "worker <host> started", then jobs as they arrive
   ```
5. **Update later:** `git pull && docker compose up -d --build`.

The service role key bypasses database security. Keep it only in `worker/.env` on the server.
Never commit it, and rotate it in Supabase if the server is ever shared.

## Speed on 4 Ampere cores (expected, not yet measured)

- Transcription with `small`: roughly 0.3–0.5× real time (a 30-minute video takes about 10–15 minutes).
- Ranking with `qwen2.5:3b`: about 1–3 minutes per video.
- Rendering: about 20–40 seconds per clip.

Use `WHISPER_MODEL=base` for faster, slightly less accurate transcripts.

## Tests

```bash
pip install pytest && PYTHONPATH=. pytest tests
```
