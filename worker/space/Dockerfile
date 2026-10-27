# Hugging Face Space (Docker SDK) build of the Cloudnivo clipping worker.
# Free CPU Space: 2 vCPU / 16 GB. No Ollama here (too slow on 2 cores): moments are
# ranked by the built-in heuristic. Set OLLAMA_URL in Space secrets to use a remote Ollama.
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

COPY --chown=user cloudnivo_worker ./cloudnivo_worker
EXPOSE 7860
CMD ["python", "-m", "cloudnivo_worker.main"]
