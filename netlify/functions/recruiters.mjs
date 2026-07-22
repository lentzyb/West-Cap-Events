import { json, requireAdmin, parseJSON, clean, recruiterKey, listAll, store } from "./_shared.mjs";

export default async req => {
  try {
    const auth = requireAdmin(req);
    if (!auth.ok) return auth.response;
    const url = new URL(req.url);
    const id = clean(url.searchParams.get("id"), 100);

    if (req.method === "GET") {
      const recruiters = await listAll("recruiter:");
      recruiters.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
      return json({ recruiters });
    }

    if (req.method === "POST") {
      const body = await parseJSON(req);
      if (!body) return json({ error: "Invalid JSON." }, 400);
      const name = clean(body.name, 120);
      if (!name) return json({ error: "Team member name is required." }, 400);
      const now = new Date().toISOString();
      const recruiter = { id: crypto.randomUUID(), name, active: body.active !== false, createdAt: now, updatedAt: now };
      await store().setJSON(recruiterKey(recruiter.id), recruiter);
      return json({ recruiter }, 201);
    }

    if (req.method === "PATCH" && id) {
      const current = await store().get(recruiterKey(id), { type: "json" });
      if (!current) return json({ error: "Team member not found." }, 404);
      const body = (await parseJSON(req)) || {};
      const updated = {
        ...current,
        name: body.name === undefined ? current.name : clean(body.name, 120),
        active: body.active === undefined ? Boolean(current.active) : Boolean(body.active),
        updatedAt: new Date().toISOString()
      };
      if (!updated.name) return json({ error: "Team member name is required." }, 400);
      await store().setJSON(recruiterKey(id), updated);
      return json({ recruiter: updated });
    }

    if (req.method === "DELETE" && id) {
      await store().delete(recruiterKey(id));
      return json({ ok: true });
    }

    return json({ error: "Method not allowed." }, 405);
  } catch (error) {
    console.error("recruiters function error", error);
    return json({ error: "Unable to process team member request.", details: error.message }, 500);
  }
};
