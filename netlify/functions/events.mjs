import { json, requireAdmin, parseJSON, clean, slugify, eventKey, readEvent, listAll, store } from "./_shared.mjs";

const normalizeRoutes = body => {
  const rawRoutes = Array.isArray(body.recruiterRoutes) ? body.recruiterRoutes : [];
  return rawRoutes
    .map(route => ({
      recruiterId: clean(route?.recruiterId, 100),
      webhookUrl: clean(route?.webhookUrl, 500)
    }))
    .filter(route => route.recruiterId && route.webhookUrl);
};

export default async req => {
  try {
    const url = new URL(req.url);
    const requestedSlug = slugify(url.searchParams.get("slug") || "");

    if (req.method === "GET" && requestedSlug) {
      const event = await readEvent(requestedSlug);
      if (!event || event.archived) return json({ error: "Event not found." }, 404);
      return json({ event });
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
      if (!body) return json({ error: "Invalid JSON." }, 400);

      const name = clean(body.name, 100);
      const finalSlug = slugify(body.slug || name);
      const recruiterRoutes = normalizeRoutes(body);

      if (!name || !finalSlug) return json({ error: "Event name is required." }, 400);
      if (!recruiterRoutes.length) return json({ error: "Select at least one team member and enter that person's Bonzo webhook URL." }, 400);
      if (await readEvent(finalSlug)) return json({ error: "That event URL is already in use." }, 409);

      const now = new Date().toISOString();
      const event = {
        id: crypto.randomUUID(),
        name,
        slug: finalSlug,
        date: clean(body.date, 30),
        time: clean(body.time, 30),
        location: clean(body.location, 180),
        description: clean(body.description, 1000),
        recruiterIds: recruiterRoutes.map(route => route.recruiterId),
        recruiterRoutes,
        archived: false,
        createdAt: now,
        updatedAt: now
      };

      await store().setJSON(eventKey(finalSlug), event);
      return json({ event }, 201);
    }

    if (req.method === "PATCH" && requestedSlug) {
      const current = await readEvent(requestedSlug);
      if (!current) return json({ error: "Event not found." }, 404);
      const body = (await parseJSON(req)) || {};
      const routes = body.recruiterRoutes === undefined ? (current.recruiterRoutes || []) : normalizeRoutes(body);

      const updated = {
        ...current,
        name: body.name === undefined ? current.name : clean(body.name, 100),
        date: body.date === undefined ? current.date : clean(body.date, 30),
        time: body.time === undefined ? current.time : clean(body.time, 30),
        location: body.location === undefined ? current.location : clean(body.location, 180),
        description: body.description === undefined ? current.description : clean(body.description, 1000),
        recruiterIds: routes.length ? routes.map(route => route.recruiterId) : (current.recruiterIds || []),
        recruiterRoutes: routes,
        archived: body.archived === undefined ? Boolean(current.archived) : Boolean(body.archived),
        updatedAt: new Date().toISOString()
      };

      await store().setJSON(eventKey(requestedSlug), updated);
      return json({ event: updated });
    }

    return json({ error: "Method not allowed." }, 405);
  } catch (error) {
    console.error("events function error", error);
    return json({ error: "Unable to process event request.", details: error.message }, 500);
  }
};
