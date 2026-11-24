import {queueCandidate,kickWorker} from "../lib/_notifications.mjs";
import crypto from "node:crypto";
import { json, requireAdmin, parseJSON, clean, slugify, registrationPrefix, readEvent, readRecruiter, listAll, store } from "../lib/_shared.mjs";
import { sendBonzoWebhook } from "../lib/webhook-client.mjs";

const responseFor=async registration=>{
 const recruiter=registration.recruiterId?await readRecruiter(registration.recruiterId):null;
 return json({ok:true,candidateId:registration.candidateId,trackingToken:registration.trackingToken,calendly:recruiter?.showCalendly&&recruiter.calendlyUrl?{enabled:true,url:recruiter.calendlyUrl,recruiterName:recruiter.name}:{enabled:false},message:'You’re registered! We look forward to seeing you.',webhookSync:registration.webhookSync.status,registration},201);
};
const fingerprint=body=>crypto.createHash('sha256').update(JSON.stringify(['firstName','lastName','email','phone','nmlsId','recruiterId','plusOneFirstName','plusOneLastName'].map(k=>String(body[k]??'').trim()))).digest('hex');
export default async req => {
  try {
    const url = new URL(req.url);
    const slug = slugify(url.searchParams.get("slug") || "");
    if (!slug) return json({ error: "Event slug is required." }, 400);

    if (req.method === "POST") {
      const event = await readEvent(slug);
      if (!event || event.archived) return json({ error: "Event not found." }, 404);

      const body = await parseJSON(req);
      if (!body) return json({ error: "Invalid JSON." }, 400);

      const requestId=body.clientRequestId||'';
      if(requestId&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(requestId))return json({error:'Invalid registration request ID.'},400);
      const stableKey=requestId?registrationPrefix(slug)+'offline:'+requestId:null;
      if(stableKey){const saved=await store().get(stableKey,{type:'json'});if(saved){if(saved.requestFingerprint!==fingerprint(body))return json({error:'This request ID was already used for different registration details.'},409);return responseFor(saved);}}
      const internal = event.questionnaire === "internal";
      const routes = internal ? [] : (event.recruiterRoutes ?? []);
      const plusOneFirstName = internal ? clean(body.plusOneFirstName, 80) : "";
      const plusOneLastName = internal ? clean(body.plusOneLastName, 80) : "";
      if (Boolean(plusOneFirstName) !== Boolean(plusOneLastName)) {
        return json({ error: "Enter both names for your plus-one, or leave both blank." }, 400);
      }
      const recruiter = routes.length ? await readRecruiter(body.recruiterId) : null;
      const route = routes.find(item => item.recruiterId === recruiter?.id);
      if (routes.length && (!recruiter?.active || !route?.webhookUrl)) {
        return json({ error: "Please select a valid West Capital team member." }, 400);
      }

      const registrationId = requestId || crypto.randomUUID();
      const trackingToken = crypto.randomBytes(24).toString("hex");
      const candidateId = `WCL-${new Date().getFullYear().toString().slice(-2)}-${registrationId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
      const registration = {
        id: registrationId,
        ...(requestId?{requestFingerprint:fingerprint(body)}:{}),
        candidateId,
        trackingToken,
        eventSlug: slug,
        eventName: event.name,
        firstName: clean(body.firstName, 80),
        lastName: clean(body.lastName, 80),
        nmlsId: internal ? "" : clean(body.nmlsId, 40),
        ...(plusOneFirstName ? { plusOneFirstName, plusOneLastName } : {}),
        phone: clean(body.phone, 40),
        email: clean(body.email, 150).toLowerCase(),
        recruiterId: recruiter?.id ?? "",
        referredBy: recruiter?.name ?? "",
        createdAt: new Date().toISOString(),
        webhookSync: { status: route ? "pending" : "skipped", attemptedAt: null, completedAt: null, httpStatus: null, error: null },
        calendly: { shownAt: null, eventTypeViewedAt: null, timeSelectedAt: null, scheduledAt: null }
      };

      if (!registration.firstName || !registration.lastName || !registration.email || (!internal && (!registration.nmlsId || !registration.phone))) {
        return json({ error: "All registration fields are required." }, 400);
      }

      const key = stableKey || `${registrationPrefix(slug)}${registration.createdAt}:${registration.id}`;
      const saved=await store().setJSON(key, registration,{onlyIfNew:true});
      if(!saved.modified){const existing=await store().get(key,{type:'json'});if(existing?.requestFingerprint!==registration.requestFingerprint)return json({error:'This registration request conflicts with a saved entry.'},409);return responseFor(existing);}

      if (route) {
        try {
          registration.webhookSync.attemptedAt = new Date().toISOString();
          const result = await sendBonzoWebhook({ webhookUrl: route.webhookUrl, registration });
          registration.webhookSync = {
            status: "completed",
            attemptedAt: registration.webhookSync.attemptedAt,
            completedAt: new Date().toISOString(),
            httpStatus: result.status,
            error: null
          };
        } catch (error) {
          console.error("Bonzo webhook failed", error);
          registration.webhookSync = {
            status: "failed",
            attemptedAt: registration.webhookSync.attemptedAt || new Date().toISOString(),
            completedAt: null,
            httpStatus: error.status || null,
            error: clean(error.message, 500)
          };
        }

        await store().setJSON(key, registration);
        try { await queueCandidate({...registration,sourceType:"registration"}); await kickWorker(); } catch { console.error("Notification queue failed; registration remains saved."); }
      }
      return responseFor(registration);
    }

    const auth = requireAdmin(req);
    if (!auth.ok) return auth.response;

    if (req.method === "GET") {
      const registrations = await listAll(registrationPrefix(slug));
      registrations.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      return json({ registrations });
    }

    return json({ error: "Method not allowed." }, 405);
  } catch (error) {
    console.error("registrations function error", error);
    return json({ error: "Unable to process registration request.", details: error.message }, 500);
  }
};
