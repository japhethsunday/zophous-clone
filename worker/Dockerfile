FROM python:3.11-slim

# FFmpeg (cut/crop/captions/encode) and a font for burned-in captions.
# Retries make the build survive brief network/DNS drops.
RUN echo 'Acquire::Retries "10"; Acquire::http::Timeout "60";' > /etc/apt/apt.conf.d/80-retries \
 && apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --retries 10 --timeout 120 -r requirements.txt

# Download the speech model at build time so the first job doesn't wait for it.
ARG WHISPER_MODEL=small
ENV WHISPER_MODEL=${WHISPER_MODEL}
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('${WHISPER_MODEL}', device='cpu', compute_type='int8')"

COPY requirements-extra.txt .
RUN pip install --no-cache-dir --retries 10 --timeout 120 -r requirements-extra.txt

# Kokoro voiceover model (int8, ~114 MB) + voice pack (~28 MB). Apache-2.0 weights.
RUN mkdir -p /app/models/kokoro && cd /app/models/kokoro \
 && python -c "import urllib.request as u; b='https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/'; [u.urlretrieve(b+f, f) for f in ('kokoro-v1.0.int8.onnx', 'voices-v1.0.bin')]"
ENV KOKORO_DIR=/app/models/kokoro

COPY cloudnivo_worker ./cloudnivo_worker
RUN useradd --create-home worker && chown -R worker /app
USER worker

CMD ["python", "-m", "cloudnivo_worker.main"]
