#!/usr/bin/env bash
set -euo pipefail

FUNCTION_NAME="${FUNCTION_NAME:-tractor-center-leads}"
RUNTIME="${RUNTIME:-nodejs22}"
ENTRYPOINT="${ENTRYPOINT:-index.handler}"
MEMORY="${MEMORY:-128m}"
TIMEOUT="${TIMEOUT:-10s}"
SERVICE_ACCOUNT_ID="${SERVICE_ACCOUNT_ID:-aje9p2fm9s3s5vs1v49j}"
DOCAPI_ENDPOINT="${DOCAPI_ENDPOINT:-https://docapi.serverless.yandexcloud.net/ru-central1/b1gb2504o430tgd3aetb/etnbh2eusmmf5eo30ce4}"
DOCAPI_REGION="${DOCAPI_REGION:-ru-central1}"
DOCAPI_ACCESS_KEY_ID="${DOCAPI_ACCESS_KEY_ID:-}"
DOCAPI_SECRET_ACCESS_KEY="${DOCAPI_SECRET_ACCESS_KEY:-}"
YDB_TABLE="${YDB_TABLE:-lead_requests}"
ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-https://tractor-center.ru,https://www.tractor-center.ru,https://antonlozkin.github.io}"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ZIP_PATH="$SRC_DIR/../tractor-center-leads.zip"

if [[ -z "${DOCAPI_ACCESS_KEY_ID}" || -z "${DOCAPI_SECRET_ACCESS_KEY}" ]]; then
  echo "DOCAPI_ACCESS_KEY_ID and DOCAPI_SECRET_ACCESS_KEY are required"
  exit 1
fi

(
  cd "$SRC_DIR"
  npm install --omit=dev --silent
  rm -f "$ZIP_PATH"
  zip -rq "$ZIP_PATH" index.js package.json node_modules
)

if ! yc serverless function get --name "$FUNCTION_NAME" >/dev/null 2>&1; then
  yc serverless function create --name "$FUNCTION_NAME" >/dev/null
fi

yc serverless function version create \
  --function-name "$FUNCTION_NAME" \
  --runtime "$RUNTIME" \
  --entrypoint "$ENTRYPOINT" \
  --memory "$MEMORY" \
  --execution-timeout "$TIMEOUT" \
  --service-account-id "$SERVICE_ACCOUNT_ID" \
  --source-path "$ZIP_PATH" \
  --environment "ALLOWED_ORIGINS=${ALLOWED_ORIGINS}" \
  --environment "DOCAPI_ENDPOINT=${DOCAPI_ENDPOINT}" \
  --environment "DOCAPI_REGION=${DOCAPI_REGION}" \
  --environment "DOCAPI_ACCESS_KEY_ID=${DOCAPI_ACCESS_KEY_ID}" \
  --environment "DOCAPI_SECRET_ACCESS_KEY=${DOCAPI_SECRET_ACCESS_KEY}" \
  --environment "YDB_TABLE=${YDB_TABLE}" \
  --environment "SMTP_HOST=${SMTP_HOST:-}" \
  --environment "SMTP_PORT=${SMTP_PORT:-465}" \
  --environment "SMTP_SECURE=${SMTP_SECURE:-true}" \
  --environment "SMTP_USER=${SMTP_USER:-}" \
  --environment "SMTP_PASS=${SMTP_PASS:-}" \
  --environment "MAIL_FROM=${MAIL_FROM:-${SMTP_USER:-}}" \
  --environment "MAIL_TO=${MAIL_TO:-}" \
  --environment "TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN:-}" \
  --environment "TELEGRAM_CHAT_ID=${TELEGRAM_CHAT_ID:-}" \
  --environment "TELEGRAM_API_BASE=${TELEGRAM_API_BASE:-https://api.telegram.org}" \
  >/dev/null

yc serverless function allow-unauthenticated-invoke --name "$FUNCTION_NAME" >/dev/null

URL="$(yc serverless function get --name "$FUNCTION_NAME" --format json | python3 -c 'import json,sys; print(json.load(sys.stdin)["http_invoke_url"])')"

echo "Deployed: $FUNCTION_NAME"
echo "URL: $URL"
echo
echo "Set this in config.yaml -> settings.lead_form_endpoint"
