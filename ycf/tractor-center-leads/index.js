"use strict";

const crypto = require("node:crypto");
const aws4 = require("aws4");
const nodemailer = require("nodemailer");

let tableReadyPromise;

function parseAllowedOrigins() {
  return String(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function resolveOrigin(event) {
  const headers = event.headers || {};
  return headers.origin || headers.Origin || "";
}

function corsHeaders(origin) {
  const allowedOrigins = parseAllowedOrigins();
  const allowOrigin = allowedOrigins.length === 0 || allowedOrigins.includes(origin) ? origin || "*" : allowedOrigins[0];

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    "Content-Type": "application/json; charset=utf-8"
  };
}

function jsonResponse(statusCode, body, origin) {
  return {
    statusCode,
    headers: corsHeaders(origin),
    body: JSON.stringify(body)
  };
}

function parseEventBody(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  return JSON.parse(raw);
}

function clean(value, limit) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function normalizePhone(value) {
  return clean(value, 64);
}

function validateLead(payload) {
  const lead = {
    id: `lead-${crypto.randomUUID()}`,
    name: clean(payload.name, 120),
    phone: normalizePhone(payload.phone),
    service: clean(payload.service, 160),
    message: clean(payload.message, 2000),
    pageTitle: clean(payload.pageTitle, 160),
    pageUrl: clean(payload.pageUrl, 500)
  };

  if (!lead.name) {
    throw new Error("Укажите имя или компанию.");
  }
  if (!lead.phone || lead.phone.replace(/\D/g, "").length < 10) {
    throw new Error("Укажите корректный номер телефона.");
  }
  if (!lead.service) {
    throw new Error("Укажите направление обращения.");
  }

  return lead;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildLeadMessage(lead) {
  return [
    "Новая заявка с сайта tractor-center.ru",
    `Направление: ${lead.service}`,
    `Имя: ${lead.name}`,
    `Телефон: ${lead.phone}`,
    `Страница: ${lead.pageTitle || "-"}`,
    `URL: ${lead.pageUrl || "-"}`,
    `Комментарий: ${lead.message || "-"}`
  ].join("\n");
}

function getYdbConfig() {
  const endpoint = String(process.env.DOCAPI_ENDPOINT || "").trim();
  const table = String(process.env.YDB_TABLE || "").trim();
  const accessKeyId = String(process.env.DOCAPI_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(process.env.DOCAPI_SECRET_ACCESS_KEY || "").trim();
  const region = String(process.env.DOCAPI_REGION || "ru-central1").trim();

  if (!endpoint || !table || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return { endpoint, table, accessKeyId, secretAccessKey, region };
}

function nowIso() {
  return new Date().toISOString();
}

async function callDocApi(target, payload) {
  const cfg = getYdbConfig();
  if (!cfg) {
    throw new Error("Document API environment is not configured");
  }

  const url = new URL(cfg.endpoint);
  const body = JSON.stringify(payload);
  const request = {
    host: url.host,
    path: url.pathname,
    service: "dynamodb",
    region: cfg.region,
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.0",
      "X-Amz-Target": target
    },
    body
  };

  aws4.sign(request, {
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey
  });

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: request.headers,
    body
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const code = data.__type || data.code || response.status;
    const message = data.message || data.Message || "DocAPI request failed";
    const error = new Error(`${code}: ${message}`);
    error.code = code;
    throw error;
  }

  return data;
}

async function ensureLeadTable() {
  const cfg = getYdbConfig();
  if (!cfg) return { skipped: true, reason: "ydb_not_configured" };
  if (tableReadyPromise) return tableReadyPromise;

  tableReadyPromise = (async () => {
    try {
      await callDocApi("DynamoDB_20120810.DescribeTable", {
        TableName: cfg.table
      });
      return { skipped: false };
    } catch (error) {
      const code = String(error && error.code ? error.code : "");
      if (!code.includes("ResourceNotFoundException")) {
        throw error;
      }
    }

    await callDocApi("DynamoDB_20120810.CreateTable", {
      TableName: cfg.table,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [
        { AttributeName: "id", AttributeType: "S" }
      ],
      KeySchema: [
        { AttributeName: "id", KeyType: "HASH" }
      ]
    });

    return { skipped: false };
  })();

  try {
    return await tableReadyPromise;
  } catch (error) {
    tableReadyPromise = null;
    throw error;
  }
}

async function persistLead(lead, channels) {
  const cfg = getYdbConfig();
  if (!cfg) {
    return { skipped: true, reason: "ydb_not_configured" };
  }

  await ensureLeadTable();

  const createdAt = nowIso();
  const payload = {
    id: lead.id,
    service: lead.service,
    name: lead.name,
    phone: lead.phone,
    message: lead.message || "",
    page_title: lead.pageTitle || "",
    page_url: lead.pageUrl || "",
    created_at: createdAt,
    email_status: channels.email.ok ? (channels.email.skipped ? "skipped" : "sent") : "failed",
    telegram_status: channels.telegram.ok ? (channels.telegram.skipped ? "skipped" : "sent") : "failed",
    email_reason: channels.email.reason || "",
    telegram_reason: channels.telegram.reason || ""
  };

  await callDocApi("DynamoDB_20120810.PutItem", {
    TableName: cfg.table,
    Item: {
      id: { S: lead.id },
      payload: { S: JSON.stringify(payload) },
      created_at: { S: createdAt }
    }
  });

  return { skipped: false };
}

async function sendTelegram(lead) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatIds = String(process.env.TELEGRAM_CHAT_ID || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!token || chatIds.length === 0) {
    return { skipped: true, reason: "telegram_not_configured" };
  }

  const apiBase = String(process.env.TELEGRAM_API_BASE || "https://api.telegram.org").trim().replace(/\/+$/, "");
  const text = buildLeadMessage(lead);

  await Promise.all(chatIds.map(async (chatId) => {
    const response = await fetch(`${apiBase}/bot${token}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      const message = data.description || `Telegram error (${response.status})`;
      throw new Error(message);
    }
  }));

  return { skipped: false };
}

async function sendEmail(lead) {
  const host = String(process.env.SMTP_HOST || "").trim();
  const port = Number(process.env.SMTP_PORT || "465");
  const secure = String(process.env.SMTP_SECURE || "true").trim() !== "false";
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();
  const from = String(process.env.MAIL_FROM || user).trim();
  const to = String(process.env.MAIL_TO || "").trim();

  if (!host || !user || !pass || !from || !to) {
    return { skipped: true, reason: "email_not_configured" };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass
    }
  });

  const subject = `Новая заявка: ${lead.service}`;
  const text = buildLeadMessage(lead);
  const html = [
    "<h2>Новая заявка с сайта tractor-center.ru</h2>",
    `<p><strong>Направление:</strong> ${escapeHtml(lead.service)}</p>`,
    `<p><strong>Имя:</strong> ${escapeHtml(lead.name)}</p>`,
    `<p><strong>Телефон:</strong> ${escapeHtml(lead.phone)}</p>`,
    `<p><strong>Страница:</strong> ${escapeHtml(lead.pageTitle || "-")}</p>`,
    `<p><strong>URL:</strong> ${escapeHtml(lead.pageUrl || "-")}</p>`,
    `<p><strong>Комментарий:</strong><br>${escapeHtml(lead.message || "-")}</p>`
  ].join("");

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html
  });

  return { skipped: false };
}

async function runChannel(name, handler) {
  try {
    const result = await handler();
    return {
      name,
      ok: true,
      skipped: Boolean(result && result.skipped),
      reason: result && result.reason ? result.reason : ""
    };
  } catch (error) {
    return {
      name,
      ok: false,
      skipped: false,
      reason: error instanceof Error ? error.message : "unknown_error"
    };
  }
}

exports.handler = async function handler(event) {
  const origin = resolveOrigin(event);
  const method = String(event.httpMethod || event.requestContext?.http?.method || "GET").toUpperCase();

  if (method === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders(origin),
      body: ""
    };
  }

  if (method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." }, origin);
  }

  try {
    const payload = parseEventBody(event);
    const lead = validateLead(payload);

    const emailResult = await runChannel("email", () => sendEmail(lead));
    const telegramResult = await runChannel("telegram", () => sendTelegram(lead));
    const storageResult = await runChannel("storage", () => persistLead(lead, { email: emailResult, telegram: telegramResult }));
    const configuredChannels = [emailResult, telegramResult].filter((item) => !item.skipped);
    const successfulChannels = configuredChannels.filter((item) => item.ok);

    if (configuredChannels.length === 0) {
      console.error("lead delivery is not configured");
      return jsonResponse(500, { error: "Каналы доставки заявок не настроены." }, origin);
    }

    if (successfulChannels.length === 0) {
      console.error("all lead channels failed", { emailResult, telegramResult });
      return jsonResponse(500, { error: "Не удалось отправить заявку. Попробуйте позже или свяжитесь с нами по телефону." }, origin);
    }

    const partial =
      emailResult.skipped || telegramResult.skipped ||
      !emailResult.ok || !telegramResult.ok ||
      !storageResult.ok;

    return jsonResponse(200, {
      ok: true,
      partial,
      channels: {
        email: emailResult,
        telegram: telegramResult,
        storage: storageResult
      }
    }, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось обработать заявку.";
    const clientError =
      message === "Укажите имя или компанию." ||
      message === "Укажите корректный номер телефона." ||
      message === "Укажите направление обращения.";

    if (!clientError) {
      console.error("lead submission failed", error);
    }

    return jsonResponse(clientError ? 400 : 500, {
      error: clientError ? message : "Не удалось отправить заявку. Попробуйте позже или свяжитесь с нами по телефону."
    }, origin);
  }
};
