# Hugging Face Space (Docker SDK) build of the Cloudnivo clipping worker.
# Free CPU Space: 2 vCPU / 16 GB. Runs every job kind: clipping, clip re-renders and generation.
# With CF_ACCOUNT_ID + CF_API_TOKEN secrets, transcription, ranking and images use Cloudflare
# Workers AI (free tier); otherwise local Whisper base + the heuristic ranker are used.
FROM python:3.11-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

# Spaces run as uid 1000.
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user PATH=/home/user/.local/bin:$PATH \
    WHISPER_MODEL=base PORT=7860 OLLAMA_URL=http://127.0.0.1:1 HF_HOME=/home/user/.cache/huggingface
WORKDIR /home/user/app

COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('base', device='cpu', compute_type='int8')"

# Generation extras (gradio_client for Hugging Face ZeroGPU models, Kokoro voiceover).
COPY --chown=user requirements-extra.txt .
RUN pip install --no-cache-dir --user -r requirements-extra.txt
RUN mkdir -p /home/user/models/kokoro && cd /home/user/models/kokoro \
 && python -c "import urllib.request as u; b='https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/'; [u.urlretrieve(b+f, f) for f in ('kokoro-v1.0.int8.onnx', 'voices-v1.0.bin')]"
ENV KOKORO_DIR=/home/user/models/kokoro

COPY --chown=user cloudnivo_worker ./cloudnivo_worker
EXPOSE 7860
CMD ["python", "-m", "cloudnivo_worker.main"]
