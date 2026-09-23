import { json, requireAdmin, parseJSON, clean, slugify, eventKey, readEvent, readRecruiter, readWebhook, listAll, store } from "./_shared.mjs";

const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || "");
const validTime = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value || "");

const normalizeRoutes = async body => {
  const rawRoutes = Array.isArray(body.recruiterRoutes) ? body.recruiterRoutes : [];
  const routes = [];
  const seen = new Set();
  for (const route of rawRoutes) {
    const recruiterId = clean(route?.recruiterId, 100);
    const webhookId = clean(route?.webhookId, 100);
    if (!recruiterId || !webhookId || seen.has(recruiterId)) continue;
    const [recruiter, webhook] = await Promise.all([readRecruiter(recruiterId), readWebhook(webhookId)]);
    if (!recruiter?.active) throw new Error("One of the selected team members is inactive or missing.");
    if (!webhook?.active || webhook.recruiterId !== recruiterId) throw new Error(`Choose an active webhook assigned to ${recruiter.name}.`);
    seen.add(recruiterId);
    routes.push({ recruiterId, webhookId, webhookName: webhook.name, campaignName: webhook.campaignName || "", webhookUrl: webhook.webhookUrl });
  }
  return routes;
};

const eventFields = async (body, existing = null) => {
  const name = clean(body.name ?? existing?.name, 100);
  const date = clean(body.date ?? existing?.date, 10);
  const startTime = clean(body.startTime ?? existing?.startTime ?? existing?.time, 5);
  const endTime = clean(body.endTime ?? existing?.endTime, 5);
  if (!name) throw new Error("Event name is required.");
  if (!validDate(date)) throw new Error("Choose a valid event date.");
  if (!validTime(startTime)) throw new Error("Choose a valid start time.");
  if (endTime && !validTime(endTime)) throw new Error("Choose a valid end time.");
  if (endTime && endTime <= startTime) throw new Error("End time must be later than start time.");
  const recruiterRoutes = await normalizeRoutes(body);
  if (!recruiterRoutes.length) throw new Error("Select at least one team member and webhook.");
  return {
    name,
    date,
    startTime,
    endTime,
    time: startTime,
    timeZone: clean(body.timeZone ?? existing?.timeZone ?? "America/Detroit", 80),
    location: clean(body.location ?? existing?.location, 180),
    description: clean(body.description ?? existing?.description, 1000),
    recruiterIds: recruiterRoutes.map(route => route.recruiterId),
    recruiterRoutes
  };
};

export default async req => {
  try {
    const url = new URL(req.url);
    const requestedSlug = slugify(url.searchParams.get("slug") || "");

    if (req.method === "GET" && requestedSlug) {
      const event = await readEvent(requestedSlug);
      if (!event || event.archived) return json({ error: "Event not found." }, 404);
      const { recruiterRoutes, ...publicEvent } = event;
      return json({ event: publicEvent });
    }

    const auth = requireAdmin(req);
    if (!auth.ok) return auth.response;

    if (req.method === "GET") {
      const events = await listAll("event:");
      events.sort((a, b) => String(b.date || b.createdAt || "").localeCompare(String(a.date || a.createdAt || "")));
      return json({ events });
    }

    if (req.method === "POST") {
      const body = await parseJSON(req);
      if (!body) return json({ error: "Invalid JSON body." }, 400);
      const fields = await eventFields(body);
      const slug = slugify(body.slug || fields.name);
      if (!slug) return json({ error: "Event URL is required." }, 400);
      if (await readEvent(slug)) return json({ error: "That event URL is already in use." }, 409);
      const now = new Date().toISOString();
      const event = { ...fields, slug, archived: false, createdAt: now, updatedAt: now };
      await store().setJSON(eventKey(slug), event);
      return json({ event }, 201);
    }

    if (req.method === "PATCH") {
      if (!requestedSlug) return json({ error: "Event slug is required." }, 400);
      const event = await readEvent(requestedSlug);
      if (!event) return json({ error: "Event not found." }, 404);
      const body = await parseJSON(req);
      if (!body) return json({ error: "Invalid JSON body." }, 400);
      let updated = { ...event, updatedAt: new Date().toISOString() };
      if (Object.hasOwn(body, "archived") && Object.keys(body).length === 1) {
        updated.archived = Boolean(body.archived);
      } else {
        const fields = await eventFields(body, event);
        updated = { ...updated, ...fields };
        if (Object.hasOwn(body, "archived")) updated.archived = Boolean(body.archived);
      }
      await store().setJSON(eventKey(event.slug), updated);
      return json({ event: updated });
    }

    return json({ error: "Method not allowed." }, 405);
  } catch (error) {
    console.error("events function error", error);
    const status = /required|valid|Select|Choose|later/.test(error.message || "") ? 400 : 500;
    return json({ error: error.message || "Unable to process event request." }, status);
  }
};