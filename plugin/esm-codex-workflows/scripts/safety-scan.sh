#!/usr/bin/env bash
set -euo pipefail

echo "Checking for environment files..."
find . -name ".env" -o -name ".env.*" | grep -v "./.env.example" && {
  echo "Blocked: local environment file found." >&2
  exit 1
} || true

echo "Checking for generated media..."
find . \( -path './.git' -o -path './node_modules' -o -path './plugin/*/node_modules' \) -prune -o -type f \( -name "*.mp4" -o -name "*.mov" -o -name "*.wav" -o -name "*.mp3" -o -name "*.jpg" -o -name "*.jpeg" -o -name "*.png" -o -name "*.webp" \) -print | grep . && {
  echo "Blocked: generated media or images found." >&2
  exit 1
} || true

echo "Scanning for common secret patterns..."
if rg -n --hidden --glob '!/.git/**' --glob '!package-lock.json' --glob '!.env.example' \
  "(API[_-]?KEY|SECRET|TOKEN|PASSWORD|COOKIE|PRIVATE KEY|BEGIN RSA|BEGIN OPENSSH|access_token|client_secret)\\s*[:=]" .; then
  echo "Blocked: possible secret pattern found." >&2
  exit 1
fi

echo "Safety scan passed."
