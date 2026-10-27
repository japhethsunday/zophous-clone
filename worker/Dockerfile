FROM python:3.11-slim

# FFmpeg (cut/crop/captions/encode) and a font for burned-in captions.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download the speech model at build time so the first job doesn't wait for it.
ARG WHISPER_MODEL=small
ENV WHISPER_MODEL=${WHISPER_MODEL}
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('${WHISPER_MODEL}', device='cpu', compute_type='int8')"

COPY cloudnivo_worker ./cloudnivo_worker
RUN useradd --create-home worker && chown -R worker /app
USER worker

CMD ["python", "-m", "cloudnivo_worker.main"]
