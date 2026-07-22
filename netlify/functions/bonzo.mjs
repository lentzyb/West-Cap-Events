import { json, requireAdmin } from "./_shared.mjs";

export default async req => {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  return json({
    mode: "webhook",
    configured: true,
    message: "Bonzo webhook routing is enabled. Webhook URLs are stored separately for each team member on each event."
  });
};
