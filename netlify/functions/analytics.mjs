import { json, requireAdmin, listAll } from "./_shared.mjs";

export default async req => {
  try {
    const auth = requireAdmin(req);
    if (!auth.ok) return auth.response;
    if (req.method !== "GET") return json({ error: "Method not allowed." }, 405);

    const [events, registrations] = await Promise.all([listAll("event:"), listAll("registration:")]);
    const eventMap = new Map(events.map(event => [event.slug, event]));
    const byEvent = new Map();
    const byRecruiter = new Map();
    let completed = 0;
    let failed = 0;

    for (const registration of registrations) {
      const slug = registration.eventSlug || "unknown";
      const sync = registration.webhookSync || registration.bonzoSync || {};
      const status = sync.status || "unknown";
      if (status === "completed") completed += 1;
      if (status === "failed") failed += 1;

      const eventRow = byEvent.get(slug) || { slug, name: registration.eventName || eventMap.get(slug)?.name || slug, total: 0, completed: 0, failed: 0, recruiters: {} };
      eventRow.total += 1;
      if (status === "completed") eventRow.completed += 1;
      if (status === "failed") eventRow.failed += 1;
      const recruiterName = registration.referredBy || "Unassigned";
      eventRow.recruiters[recruiterName] = (eventRow.recruiters[recruiterName] || 0) + 1;
      byEvent.set(slug, eventRow);

      const recruiterRow = byRecruiter.get(recruiterName) || { name: recruiterName, total: 0, completed: 0, failed: 0 };
      recruiterRow.total += 1;
      if (status === "completed") recruiterRow.completed += 1;
      if (status === "failed") recruiterRow.failed += 1;
      byRecruiter.set(recruiterName, recruiterRow);
    }

    const eventAnalytics = [...byEvent.values()].sort((a, b) => b.total - a.total);
    const recruiterAnalytics = [...byRecruiter.values()].sort((a, b) => b.total - a.total);
    return json({
      summary: { events: events.length, activeEvents: events.filter(e => !e.archived).length, registrations: registrations.length, completed, failed, successRate: registrations.length ? Math.round((completed / registrations.length) * 100) : 0 },
      events: eventAnalytics,
      recruiters: recruiterAnalytics
    });
  } catch (error) {
    console.error("analytics function error", error);
    return json({ error: "Unable to load analytics.", details: error.message }, 500);
  }
};