# TractorCenter Leads Function

HTTP function for form submissions from `tractor-center.ru`.

## What it does

- accepts JSON заявки from the site;
- sends notifications to email through SMTP;
- sends notifications to one or more Telegram chats through a bot;
- supports CORS for the static frontend.

## Required env vars for production

- `MAIL_TO`
- `SMTP_HOST`
- `SMTP_USER`
- `SMTP_PASS`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `DOCAPI_ACCESS_KEY_ID`
- `DOCAPI_SECRET_ACCESS_KEY`

Optional:

- `SMTP_PORT` default `465`
- `SMTP_SECURE` default `true`
- `MAIL_FROM` default `SMTP_USER`
- `ALLOWED_ORIGINS`
- `FUNCTION_NAME`
- `DOCAPI_ENDPOINT`
- `DOCAPI_REGION`
- `YDB_TABLE`

## Deploy

```bash
cd ycf/tractor-center-leads
MAIL_TO='tractorcentr@yandex.ru' \
SMTP_HOST='smtp.yandex.ru' \
SMTP_USER='tractorcentr@yandex.ru' \
SMTP_PASS='<app-password>' \
TELEGRAM_BOT_TOKEN='<bot-token>' \
TELEGRAM_CHAT_ID='<chat-id>' \
DOCAPI_ACCESS_KEY_ID='<docapi-access-key-id>' \
DOCAPI_SECRET_ACCESS_KEY='<docapi-secret-key>' \
./deploy.sh
```

After deploy, copy the printed function URL into `config.yaml`:

```yaml
settings:
  lead_form_endpoint: "https://functions.yandexcloud.net/..."
```
