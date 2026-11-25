import {duplicatePreview,mergeDuplicates,undoMerge,registrationMergeBusy} from '../lib/_registration-merge.mjs';
import {queueCandidate,kickWorker,normPhone} from "../lib/_notifications.mjs";
import crypto from "node:crypto";
import { json, requireAdmin, parseJSON, clean, slugify, registrationPrefix, readEvent, readRecruiter, listAll, store } from "../lib/_shared.mjs";
import { sendBonzoWebhook } from "../lib/webhook-client.mjs";

const responseFor=async registration=>{
 const recruiter=registration.recruiterId?await readRecruiter(registration.recruiterId):null;
 return json({ok:true,candidateId:registration.candidateId,trackingToken:registration.trackingToken,calendly:recruiter?.showCalendly&&recruiter.calendlyUrl?{enabled:true,url:recruiter.calendlyUrl,recruiterName:recruiter.name}:{enabled:false},message:'You’re registered! We look forward to seeing you.',webhookSync:registration.webhookSync.status,registration},201);
};
const fingerprint=body=>crypto.createHash('sha256').update(JSON.stringify(['firstName','lastName','email','phone','nmlsId','recruiterId','plusOneFirstName','plusOneLastName'].map(k=>String(body[k]??'').trim()))).digest('hex');
const editableFields=['firstName','lastName','email','phone','nmlsId','plusOneFirstName','plusOneLastName'];
const editVersion=row=>crypto.createHash('sha256').update(JSON.stringify(editableFields.map(key=>row[key]??''))).digest('hex');
async function refreshFollowup(registration){
 const rows=(await listAll('followup:')).filter(row=>row.eventSlug===registration.eventSlug&&row.sourceType==='registration'&&row.sourceId===registration.id);
 for(const row of rows){let saved=false;for(let attempt=0;attempt<3;attempt++){const current=await store().getWithMetadata('followup:'+row.id,{type:'json'});if(!current||current.data.sourceId!==registration.id){saved=true;break;}const result=await store().setJSON('followup:'+row.id,{...current.data,firstName:registration.firstName,lastName:registration.lastName,email:registration.email,phone:normPhone(registration.phone),updatedAt:new Date().toISOString()},{onlyIfMatch:current.etag});if(result.modified){saved=true;break;}}if(!saved)throw Error('Follow-up details changed concurrently.');}
}
export default async req => {
  try {
    const url = new URL(req.url);
    const slug = slugify(url.searchParams.get("slug") || "");
    if (!slug) return json({ error: "Event slug is required." }, 400);

    const action=url.searchParams.get('action');
    if(req.method==='POST'&&['merge-duplicates','undo-merge'].includes(action)){
      const auth=requireAdmin(req);if(!auth.ok)return auth.response;
      try{const body=await parseJSON(req)||{};if(action==='merge-duplicates'){if(body.batchId&&!/^[a-f0-9-]{36}$/.test(body.batchId))return json({error:'Choose a valid merge batch.'},400);return json(await mergeDuplicates(slug,{batchId:body.batchId}));}if(!/^[a-f0-9-]{36}$/.test(body.batchId||''))return json({error:'Choose a valid merge batch.'},400);return json(await undoMerge(slug,body.batchId));}catch(error){return json({error:error.message},409);}
    }
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

        for(let attempt=0;attempt<5;attempt++){
          const current=await store().getWithMetadata(key,{type:'json'});if(!current)throw Error('Saved registration was not found.');
          const merged={...current.data,webhookSync:registration.webhookSync};
          const result=await store().setJSON(key,merged,{onlyIfMatch:current.etag});if(result.modified){Object.assign(registration,merged);break;}if(attempt===4)throw Error('Registration changed while saving delivery status.');
        }
        try { await queueCandidate({...registration,sourceType:"registration"}); await kickWorker(); } catch { console.error("Notification queue failed; registration remains saved."); }
      }
      return responseFor(registration);
    }

    const auth = requireAdmin(req);
    if (!auth.ok) return auth.response;

    if(req.method==='PATCH'){
      if(await registrationMergeBusy(slug))return json({error:'Duplicate cleanup is running. Wait a moment and retry.'},409);
      const body=await parseJSON(req);
      if(!body||typeof body.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(body.id)||typeof body.editVersion!=='string')return json({error:'Choose a registration and refresh before editing.'},400);
      const db=store(),keys=[];let cursor;
      do{const page=await db.list(cursor?{prefix:registrationPrefix(slug),cursor}:{prefix:registrationPrefix(slug)});keys.push(...(page.blobs||[]).map(b=>b.key).filter(key=>key.endsWith(':'+body.id)));cursor=page.cursor;}while(cursor);
      const active=[];for(const key of keys){const current=await db.getWithMetadata(key,{type:'json'});if(current&&!current.data.mergedInto)active.push({key,current});}
      if(!active.length)return json({error:'Registration not found.'},404);
      if(active.length!==1)return json({error:'This registration has duplicate stored records. Run duplicate cleanup before editing.'},409);
      const {key,current}=active[0];
      if(!current||current.data.id!==body.id)return json({error:'Registration not found.'},404);
      if(editVersion(current.data)!==body.editVersion)return json({error:'Someone changed this registration. Close the editor, refresh registrations and try again.'},409);
      const next={...current.data};
      for(const field of editableFields)if(Object.hasOwn(body,field)){if(typeof body[field]!=='string')return json({error:'Registration details must be text.'},400);next[field]=clean(body[field],field==='email'?150:field==='phone'||field==='nmlsId'?40:80);}
      next.email=String(next.email||'').toLowerCase();
      if(!next.firstName||!next.lastName||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email))return json({error:'Enter first name, last name and a valid email address.'},400);
      if(Boolean(next.plusOneFirstName)!==Boolean(next.plusOneLastName))return json({error:'Enter both names for the plus-one, or leave both blank.'},400);
      const guestChanged=[next.plusOneFirstName||'',next.plusOneLastName||''].join(' ')!==[current.data.plusOneFirstName||'',current.data.plusOneLastName||''].join(' ');
      next.updatedAt=new Date().toISOString();
      const saved=await db.setJSON(key,next,{onlyIfMatch:current.etag});
      if(!saved.modified)return json({error:'The registration changed while saving. Refresh and try again.'},409);
      let attendanceRefreshPending=false,followupRefreshPending=false;
      if(guestChanged){try{const rowId=crypto.createHash('sha256').update('registration:'+next.id).digest('hex');await db.setJSON(`checkin:${slug}:${rowId}:guest`,{id:rowId,person:'guest',checked:false,version:crypto.randomUUID(),at:new Date().toISOString()});}catch{attendanceRefreshPending=true;}}
      try{await refreshFollowup(next);}catch{followupRefreshPending=true;}
      return json({ok:true,registration:{...next,editVersion:editVersion(next)},attendanceRefreshPending,followupRefreshPending});
    }

    if(req.method==='GET'&&action==='duplicates')return json(await duplicatePreview(slug));
    if (req.method === "GET") {
      const registrations = await listAll(registrationPrefix(slug));
      registrations.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      return json({ registrations:registrations.map(row=>({...row,editVersion:editVersion(row)})),merge:await store().get('registration-merge-latest:'+slug,{type:'json'}) });
    }

    return json({ error: "Method not allowed." }, 405);
  } catch (error) {
    console.error("registrations function error", error);
    return json({ error: "Unable to process registration request.", details: error.message }, 500);
  }
};
