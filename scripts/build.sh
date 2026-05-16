#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

mkdir -p .bin
BIN=".bin/notepub"

if [[ ! -x "$BIN" ]]; then
  OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
  ARCH="$(uname -m)"
  case "$ARCH" in
    x86_64) ARCH="amd64" ;;
    arm64|aarch64) ARCH="arm64" ;;
    *) echo "Unsupported arch: $ARCH"; exit 1 ;;
  esac
  URL="https://github.com/cookiespooky/notepub/releases/latest/download/notepub_${OS}_${ARCH}"
  curl -fsSL "$URL" -o "$BIN"
  chmod +x "$BIN"
fi

"$BIN" validate --config ./config.yaml --rules ./rules.yaml
"$BIN" index --config ./config.yaml --rules ./rules.yaml
"$BIN" build --config ./config.yaml --rules ./rules.yaml --dist ./dist
