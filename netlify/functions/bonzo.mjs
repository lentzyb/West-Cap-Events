import { json, requireAdmin } from "./_shared.mjs";
export default async req => {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  return json({ mode: "webhook-library", configured: true, message: "Bonzo campaign library routing is enabled. Save each webhook once, then select it while creating events." });
};
