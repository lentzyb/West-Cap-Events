import { json, requireAdmin, parseJSON, clean, slugify, registrationPrefix, readEvent, readRecruiter, listAll, store } from "./_shared.mjs";
import { createBonzoProspect } from "./bonzo-client.mjs";

export default async req => {
  try {
    const url = new URL(req.url); const slug = slugify(url.searchParams.get("slug") || "");
    if (!slug) return json({ error:"Event slug is required." },400);

    if (req.method === "POST") {
      const event = await readEvent(slug); if (!event || event.archived) return json({ error:"Event not found." },404);
      const body = await parseJSON(req); if (!body) return json({ error:"Invalid JSON." },400);
      const recruiter = await readRecruiter(body.recruiterId);
      if (!recruiter || !recruiter.active || !(event.recruiterIds||[]).includes(recruiter.id)) return json({ error:"Please select a valid West Capital team member." },400);

      const registration = {
        id:crypto.randomUUID(), eventSlug:slug, eventName:event.name,
        firstName:clean(body.firstName,80), lastName:clean(body.lastName,80), nmlsId:clean(body.nmlsId,40),
        phone:clean(body.phone,40), email:clean(body.email,150).toLowerCase(), recruiterId:recruiter.id, referredBy:recruiter.name,
        createdAt:new Date().toISOString(),
        bonzoSync:{ status:"pending", attemptedAt:null, completedAt:null, httpStatus:null, error:null }
      };
      if (!registration.firstName || !registration.lastName || !registration.nmlsId || !registration.phone || !registration.email || !registration.referredBy) return json({ error:"All registration fields are required." },400);
      const key = `${registrationPrefix(slug)}${registration.createdAt}:${registration.id}`;
      await store().setJSON(key, registration);
      try {
        registration.bonzoSync.attemptedAt = new Date().toISOString();
        const result = await createBonzoProspect({ registration, recruiterEmail: recruiter.email });
        registration.bonzoSync = { status:"completed", attemptedAt:registration.bonzoSync.attemptedAt, completedAt:new Date().toISOString(), httpStatus:result.status, error:null };
      } catch (error) {
        console.error("Bonzo sync failed", error);
        registration.bonzoSync = { status:"failed", attemptedAt:registration.bonzoSync.attemptedAt || new Date().toISOString(), completedAt:null, httpStatus:error.status || null, error:clean(error.message,500) };
      }
      await store().setJSON(key, registration);
      return json({ ok:true, message:"You’re registered! We look forward to seeing you.", bonzoSync:registration.bonzoSync.status, registration },201);
    }

    const auth = requireAdmin(req); if (!auth.ok) return auth.response;
    if (req.method === "GET") {
      const registrations = await listAll(registrationPrefix(slug));
      registrations.sort((a,b)=>String(b.createdAt||"").localeCompare(String(a.createdAt||"")));
      return json({ registrations });
    }
    return json({ error:"Method not allowed." },405);
  } catch (error) {
    console.error("registrations function error",error);
    return json({ error:"Unable to process registration request.", details:error.message },500);
  }
};
