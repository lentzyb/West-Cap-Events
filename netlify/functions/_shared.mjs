import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

const STORE_NAME = "wcl-event-platform-v2";
export const store = () => getStore(STORE_NAME);

export const json = (data, status = 200, extraHeaders = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders
    }
  });

export const clean = (value, max = 300) => String(value ?? "").trim().slice(0, max);
export const slugify = value => clean(value, 100).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
export const eventKey = slug => `event:${slug}`;
export const recruiterKey = id => `recruiter:${id}`;
export const webhookKey = id => `webhook:${id}`;
export const registrationPrefix = slug => `registration:${slug}:`;

export const parseJSON = async req => { try { return await req.json(); } catch { return null; } };

const ADMIN_SESSION_COOKIE = "wcl_admin_session";
const ADMIN_SESSION_MAX_AGE = 60 * 60 * 12; // 12 hours

const safeEqual = (left, right) => {
  const a = Buffer.from(String(left ?? ""));
  const b = Buffer.from(String(right ?? ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const sessionSignature = (issuedAt, secret) =>
  crypto.createHmac("sha256", secret).update(String(issuedAt)).digest("hex");

export const createAdminSessionCookie = () => {
  const secret = process.env.ADMIN_PASSWORD || "";
  if (!secret) return "";
  const issuedAt = Math.floor(Date.now() / 1000);
  const token = `${issuedAt}.${sessionSignature(issuedAt, secret)}`;
  return `${ADMIN_SESSION_COOKIE}=${token}; Path=/; Max-Age=${ADMIN_SESSION_MAX_AGE}; HttpOnly; Secure; SameSite=Strict`;
};

const hasValidAdminSession = req => {
  const secret = process.env.ADMIN_PASSWORD || "";
  if (!secret) return false;
  const cookieHeader = req.headers.get("cookie") || "";
  const cookies = Object.fromEntries(cookieHeader.split(";").map(part => {
    const i = part.indexOf("=");
    return i < 0 ? [part.trim(), ""] : [part.slice(0, i).trim(), part.slice(i + 1).trim()];
  }).filter(([key]) => key));
  const token = cookies[ADMIN_SESSION_COOKIE] || "";
  const [issuedRaw, signature = ""] = token.split(".");
  const issuedAt = Number(issuedRaw);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(issuedAt) || issuedAt > now + 60 || now - issuedAt > ADMIN_SESSION_MAX_AGE) return false;
  return safeEqual(signature, sessionSignature(issuedAt, secret));
};

export const requireAdmin = req => {
  const expected = process.env.ADMIN_PASSWORD || "";
  if (!expected) return { ok: false, response: json({ error: "ADMIN_PASSWORD is not configured in Netlify." }, 500) };

  // Existing clients may continue authenticating with the password header.
  const supplied = req.headers.get("x-admin-password") || "";
  if (safeEqual(expected, supplied)) return { ok: true, method: "header" };

  // Once /auth succeeds, an HttpOnly signed session cookie authenticates
  // subsequent admin requests automatically, including Monday analytics.
  if (hasValidAdminSession(req)) return { ok: true, method: "session" };

  return { ok: false, response: json({ error: "Incorrect admin password." }, 401) };
};

export const listAll = async prefix => {
  const s = store(); const values = []; let cursor;
  do {
    const page = await s.list(cursor ? { prefix, cursor } : { prefix });
    for (const blob of page.blobs || []) {
      const value = await s.get(blob.key, { type: "json" });
      if (value) values.push(value);
    }
    cursor = page.cursor;
  } while (cursor);
  return values;
};

export const readEvent = async rawSlug => {
  const slug = slugify(rawSlug); if (!slug) return null;
  const direct = await store().get(eventKey(slug), { type: "json" });
  if (direct) return direct;
  const events = await listAll("event:");
  return events.find(event => slugify(event?.slug || event?.name || "") === slug) || null;
};

export const readRecruiter = async rawId => {
  const id = clean(rawId, 100); if (!id) return null;
  return await store().get(recruiterKey(id), { type: "json" });
};

export const readWebhook = async rawId => {
  const id = clean(rawId, 100); if (!id) return null;
  return await store().get(webhookKey(id), { type: "json" });
};
