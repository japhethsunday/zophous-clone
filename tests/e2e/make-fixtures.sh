#!/usr/bin/env bash
# Generates the small media files the browser tests serve (kept out of git).
set -euo pipefail
cd "$(dirname "$0")" && mkdir -p fixtures && cd fixtures
ffmpeg -loglevel error -y -f lavfi -i "testsrc2=size=1280x720:rate=30:duration=90" -f lavfi -i "sine=frequency=330:duration=90" \
  -vf "drawbox=x=540:y=200:w=200:h=260:color=0xE8B48A@1:t=fill" -c:v libx264 -preset veryfast -crf 34 -c:a aac -b:a 48k -shortest source.mp4
ffmpeg -loglevel error -y -ss 10 -t 20 -i source.mp4 -vf "crop=404:720:438:0,scale=540:960" -c:v libx264 -preset veryfast -crf 34 -c:a aac clip.mp4
ffmpeg -loglevel error -y -ss 1 -i clip.mp4 -frames:v 1 -vf scale=270:-2 thumb.jpg
