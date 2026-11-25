import { json, parseJSON, clean, registrationPrefix, store } from "../lib/_shared.mjs";

const fieldFor = { shown: "shownAt", event_type_viewed: "eventTypeViewedAt", time_selected: "timeSelectedAt", scheduled: "scheduledAt" };
export default async req => {
  try {
    if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
    const body = await parseJSON(req);
    const slug = clean(body?.slug, 70), id = clean(body?.registrationId, 100), token = clean(body?.trackingToken, 100), activity = clean(body?.activity, 40);
    const field = fieldFor[activity];
    if (!slug || !id || !token || !field) return json({ error: "Invalid tracking request." }, 400);
    const db=store(),keys=[];let cursor;
    do{const page=await db.list(cursor?{prefix:registrationPrefix(slug),cursor}:{prefix:registrationPrefix(slug)});keys.push(...(page.blobs||[]).map(b=>b.key).filter(key=>key.endsWith(':'+id)));cursor=page.cursor;}while(cursor);
    if(keys.length!==1)return json({error:'Registration not found or duplicated.'},404);
    const key=keys[0];
    for(let attempt=0;attempt<5;attempt++){
      const current=await db.getWithMetadata(key,{type:'json'}),registration=current?.data;
      if(!registration||registration.id!==id||registration.trackingToken!==token)return json({error:'Registration not found.'},404);
      if(registration.calendly?.[field])return json({ok:true,calendly:registration.calendly});
      const next={...registration,calendly:{...registration.calendly,[field]:new Date().toISOString()}};
      if((await db.setJSON(key,next,{onlyIfMatch:current.etag})).modified)return json({ok:true,calendly:next.calendly});
    }
    return json({error:'Registration changed. Retry tracking shortly.'},409);
  } catch (error) {
    console.error("calendly activity error", error);
    return json({ error: "Unable to record Calendly activity." }, 500);
  }
};
