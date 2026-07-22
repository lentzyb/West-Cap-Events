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
export const registrationPrefix = slug => `registration:${slug}:`;

export const parseJSON = async req => { try { return await req.json(); } catch { return null; } };

export const requireAdmin = req => {
  const expected = process.env.ADMIN_PASSWORD || "";
  const supplied = req.headers.get("x-admin-password") || "";
  if (!expected) return { ok: false, response: json({ error: "ADMIN_PASSWORD is not configured in Netlify." }, 500) };
  const a = Buffer.from(expected); const b = Buffer.from(supplied);
  const valid = a.length === b.length && crypto.timingSafeEqual(a, b);
  return valid ? { ok: true } : { ok: false, response: json({ error: "Incorrect admin password." }, 401) };
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
