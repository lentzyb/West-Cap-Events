import { json, requireAdmin } from "./_shared.mjs";
import { bonzoConfigured } from "./bonzo-client.mjs";

export default async req => {
  const auth = requireAdmin(req); if (!auth.ok) return auth.response;
  if (req.method !== "GET") return json({ error: "Method not allowed." }, 405);
  return json({
    configured: bonzoConfigured(),
    baseUrl: process.env.BONZO_API_BASE_URL || "https://app.getbonzo.com/api",
    createProspectPath: process.env.BONZO_CREATE_PROSPECT_PATH || "/v3/prospects/create-or-update-and-message",
    assignmentMethod: "assigned_to (team member Bonzo email)"
  });
};
