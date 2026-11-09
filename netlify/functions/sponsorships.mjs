import crypto from "node:crypto";
import { clean, eventKey, json, listAll, parseJSON, requireAdmin, store } from "./_shared.mjs";

export default async function sponsorships(req) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    if (req.method === "GET") {
      const [events, entries] = await Promise.all([listAll("event:"), listAll("sponsorship:")]);
      return json({
        events: events.map(({ slug, name, date, archived }) => ({ slug, name, date, archived })),
        entries: entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      });
    }
    if (!["POST", "PATCH"].includes(req.method)) return json({ error: "Method not allowed." }, 405);

    const body = await parseJSON(req);
    if (!body) return json({ error: "Enter the sponsorship details." }, 400);
    const sponsor = clean(body.sponsor, 160);
    const amount = String(body.amount ?? "").trim();
    if (!sponsor) return json({ error: "Enter a sponsor name." }, 400);
    if (!/^\d{1,9}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
      return json({ error: "Enter a positive dollar amount with up to two decimal places." }, 400);
    }
    const db = store();
    const event = await db.get(eventKey(clean(body.eventSlug, 100)), { type: "json" });
    if (!event) return json({ error: "Choose an existing event." }, 400);

    const updating = req.method === "PATCH";
    const id = updating ? clean(body.id, 36) : crypto.randomUUID();
    if (updating && !/^[a-f0-9-]{36}$/.test(id)) return json({ error: "Invalid sponsorship ID." }, 400);
    const key = "sponsorship:" + id;
    const previous = updating ? await db.getWithMetadata(key, { type: "json" }) : null;
    if (updating && !previous) return json({ error: "Sponsorship not found." }, 404);
    if (previous && previous.data.revision !== body.revision) {
      return json({ error: "Someone updated this sponsorship. Refresh and reopen it before editing." }, 409);
    }
    const now = new Date().toISOString();
    const entry = {
      id, sponsor, eventSlug: event.slug, eventName: event.name,
      amountCents: Math.round(Number(amount) * 100),
      revision: crypto.randomUUID(),
      createdAt: previous?.data.createdAt ?? now,
      updatedAt: now
    };
    const result = await db.setJSON(key, entry, previous ? { onlyIfMatch: previous.etag } : { onlyIfNew: true });
    if (!result.modified) return json({ error: "The record changed. Refresh before editing again." }, 409);
    return json({ entry }, updating ? 200 : 201);
  } catch (error) {
    console.error("Sponsorship request failed", error);
    return json({ error: "Could not access the sponsorship tracker. Try again shortly." }, 500);
  }
}
