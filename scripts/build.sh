#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PROD_BASE_URL="https://tractor-center.ru"

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
rm -rf ./.notepub
"$BIN" index --config ./config.yaml --rules ./rules.yaml
"$BIN" build --config ./config.yaml --rules ./rules.yaml --dist ./dist
rm -rf ./dist/media
cp -R ./media ./dist/media
cp ./CNAME ./dist/CNAME
cp ./.notepub/artifacts/robots.txt ./dist/robots.txt
cp ./.notepub/artifacts/sitemap.xml ./dist/sitemap.xml
cp ./.notepub/artifacts/sitemap-index.xml ./dist/sitemap-index.xml
cp ./.notepub/artifacts/sitemap-0001.xml ./dist/sitemap-0001.xml

# Normalize any dev URLs the generator leaves in static HTML and metadata.
if rg -l 'http://127\.0\.0\.1:8080' ./dist >/tmp/tractor-center-build-files.txt; then
  xargs -I{} env LC_ALL=C perl -0pi -e "s|http://127\\.0\\.0\\.1:8080|$PROD_BASE_URL|g" "{}" </tmp/tractor-center-build-files.txt
fi
