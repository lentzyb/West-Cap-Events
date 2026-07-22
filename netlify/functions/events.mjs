import { json, requireAdmin, parseJSON, clean, slugify, eventKey, readEvent, readRecruiter, readWebhook, listAll, store } from "./_shared.mjs";

const normalizeRoutes = async body => {
  const rawRoutes = Array.isArray(body.recruiterRoutes) ? body.recruiterRoutes : [];
  const routes = [];
  for (const route of rawRoutes) {
    const recruiterId = clean(route?.recruiterId, 100);
    const webhookId = clean(route?.webhookId, 100);
    if (!recruiterId || !webhookId) continue;
    const [recruiter, webhook] = await Promise.all([readRecruiter(recruiterId), readWebhook(webhookId)]);
    if (!recruiter?.active) throw new Error("One of the selected team members is inactive or missing.");
    if (!webhook?.active || webhook.recruiterId !== recruiterId) throw new Error(`Choose an active webhook assigned to ${recruiter.name}.`);
    routes.push({
      recruiterId,
      webhookId,
      webhookName: webhook.name,
      campaignName: webhook.campaignName || "",
      webhookUrl: webhook.webhookUrl
    });
  }
  return routes;
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
      events.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      return json({ events });
    }

    if (req.method === "POST") {
      const body = await parseJSON(req);
      if (!body) return json({ error: "Invalid JSON body." }, 400);
      const name = clean(body.name, 100);
      const slug = slugify(body.slug || name);
      if (!name || !slug) return json({ error: "Event name is required." }, 400);
      if (await readEvent(slug)) return json({ error: "That event URL is already in use." }, 409);
      const recruiterRoutes = await normalizeRoutes(body);
      if (!recruiterRoutes.length) return json({ error: "Select at least one team member and webhook." }, 400);
      const now = new Date().toISOString();
      const event = {
        name,
        slug,
        date: clean(body.date, 100),
        time: clean(body.time, 100),
        location: clean(body.location, 180),
        description: clean(body.description, 1000),
        recruiterIds: recruiterRoutes.map(route => route.recruiterId),
        recruiterRoutes,
        archived: false,
        createdAt: now,
        updatedAt: now
      };
      await store().setJSON(eventKey(slug), event);
      return json({ event }, 201);
    }

    if (req.method === "PATCH") {
      if (!requestedSlug) return json({ error: "Event slug is required." }, 400);
      const event = await readEvent(requestedSlug);
      if (!event) return json({ error: "Event not found." }, 404);
      const body = await parseJSON(req);
      if (!body) return json({ error: "Invalid JSON body." }, 400);
      const updated = { ...event, updatedAt: new Date().toISOString() };
      if (Object.hasOwn(body, "archived")) updated.archived = Boolean(body.archived);
      await store().setJSON(eventKey(event.slug), updated);
      return json({ event: updated });
    }

    return json({ error: "Method not allowed." }, 405);
  } catch (error) {
    console.error("events function error", error);
    return json({ error: error.message || "Unable to process event request." }, 500);
  }
};
