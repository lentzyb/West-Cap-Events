import { json, requireAdmin } from "./_shared.mjs";

export default async req => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;

  return json({ ok: true });
};
