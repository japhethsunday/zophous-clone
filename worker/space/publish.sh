#!/usr/bin/env bash
# Copy the worker into the Hugging Face Space repo and push it.
# Usage (from the repo root):  bash worker/space/publish.sh recksdev/cloudnivo-worker
# Git asks for credentials on push: username = your HF username, password = an HF *write* token.
set -euo pipefail

SPACE="${1:?usage: publish.sh <owner>/<space-name>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

git clone --depth 1 "https://huggingface.co/spaces/${SPACE}" "$TMP/space"
cd "$TMP/space"
find . -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +

cp "$ROOT/space/Dockerfile" "$ROOT/space/README.md" "$ROOT/requirements.txt" .
cp -r "$ROOT/cloudnivo_worker" .
find . -name '__pycache__' -prune -exec rm -rf {} +

git add -A
if git diff --cached --quiet; then
  echo "Space already up to date."
  exit 0
fi
git -c user.name="cloudnivo-deploy" -c user.email="deploy@cloudnivo.org" commit -qm "Deploy worker from cloudnivo repo"
git push origin HEAD
echo "Pushed. Build logs: https://huggingface.co/spaces/${SPACE}?logs=build"
