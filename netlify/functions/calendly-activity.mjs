import { json, parseJSON, clean, registrationPrefix, listAll, store } from "./_shared.mjs";

const fieldFor = { shown: "shownAt", event_type_viewed: "eventTypeViewedAt", time_selected: "timeSelectedAt", scheduled: "scheduledAt" };
export default async req => {
  try {
    if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
    const body = await parseJSON(req);
    const slug = clean(body?.slug, 70), id = clean(body?.registrationId, 100), token = clean(body?.trackingToken, 100), activity = clean(body?.activity, 40);
    const field = fieldFor[activity];
    if (!slug || !id || !token || !field) return json({ error: "Invalid tracking request." }, 400);
    const rows = await listAll(registrationPrefix(slug));
    const registration = rows.find(x => x.id === id && x.trackingToken === token);
    if (!registration) return json({ error: "Registration not found." }, 404);
    registration.calendly = registration.calendly || {};
    if (!registration.calendly[field]) registration.calendly[field] = new Date().toISOString();
    const key = `${registrationPrefix(slug)}${registration.createdAt}:${registration.id}`;
    await store().setJSON(key, registration);
    return json({ ok: true, calendly: registration.calendly });
  } catch (error) {
    console.error("calendly activity error", error);
    return json({ error: "Unable to record Calendly activity." }, 500);
  }
};
