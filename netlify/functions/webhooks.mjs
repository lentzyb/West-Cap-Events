import crypto from "node:crypto";
import {
  json,
  requireAdmin,
  parseJSON,
  clean,
  webhookKey,
  readWebhook,
  readRecruiter,
  listAll,
  store
} from "./_shared.mjs";

const normalizeUrl = raw => {
  const value = clean(raw, 500);
  let url;
  try { url = new URL(value); } catch { throw new Error("Enter a valid Bonzo webhook URL."); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || !(host === "app.getbonzo.com" || host.endsWith(".getbonzo.com"))) {
    throw new Error("Webhook URLs must be secure Bonzo URLs ending in getbonzo.com.");
  }
  return url.toString();
};

export default async req => {
  try {
    const auth = requireAdmin(req);
    if (!auth.ok) return auth.response;
    const url = new URL(req.url);
    const id = clean(url.searchParams.get("id"), 100);

    if (req.method === "GET") {
      const webhooks = await listAll("webhook:");
      webhooks.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
      return json({ webhooks });
    }

    if (req.method === "POST") {
      const body = await parseJSON(req);
      if (!body) return json({ error: "Invalid JSON body." }, 400);
      const recruiterId = clean(body.recruiterId, 100);
      const recruiter = await readRecruiter(recruiterId);
      if (!recruiter) return json({ error: "Choose a valid team member." }, 400);
      const name = clean(body.name, 140);
      const campaignName = clean(body.campaignName, 140);
      if (!name) return json({ error: "Webhook name is required." }, 400);
      const webhookUrl = normalizeUrl(body.webhookUrl);
      const now = new Date().toISOString();
      const webhook = {
        id: crypto.randomUUID(),
        name,
        campaignName,
        recruiterId,
        recruiterName: recruiter.name,
        webhookUrl,
        active: true,
        createdAt: now,
        updatedAt: now
      };
      await store().setJSON(webhookKey(webhook.id), webhook);
      return json({ webhook }, 201);
    }

    if (!id) return json({ error: "Webhook ID is required." }, 400);
    const current = await readWebhook(id);
    if (!current) return json({ error: "Webhook not found." }, 404);

    if (req.method === "PATCH") {
      const body = await parseJSON(req);
      if (!body) return json({ error: "Invalid JSON body." }, 400);
      const updated = { ...current, updatedAt: new Date().toISOString() };
      if (Object.hasOwn(body, "active")) updated.active = Boolean(body.active);
      if (Object.hasOwn(body, "name")) {
        const name = clean(body.name, 140);
        if (!name) return json({ error: "Webhook name is required." }, 400);
        updated.name = name;
      }
      if (Object.hasOwn(body, "campaignName")) updated.campaignName = clean(body.campaignName, 140);
      if (Object.hasOwn(body, "webhookUrl")) updated.webhookUrl = normalizeUrl(body.webhookUrl);
      if (Object.hasOwn(body, "recruiterId")) {
        const recruiter = await readRecruiter(body.recruiterId);
        if (!recruiter) return json({ error: "Choose a valid team member." }, 400);
        updated.recruiterId = recruiter.id;
        updated.recruiterName = recruiter.name;
      }
      await store().setJSON(webhookKey(id), updated);
      return json({ webhook: updated });
    }

    if (req.method === "DELETE") {
      await store().delete(webhookKey(id));
      return json({ ok: true });
    }

    return json({ error: "Method not allowed." }, 405);
  } catch (error) {
    console.error("webhooks function error", error);
    return json({ error: error.message || "Unable to process webhook request." }, 500);
  }
};
