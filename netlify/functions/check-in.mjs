import {registrationMergeBusy} from '../lib/_registration-merge.mjs';
import crypto from 'node:crypto';
import {json,requireAdmin,parseJSON,store,listAll,readEvent,slugify,registrationPrefix} from '../lib/_shared.mjs';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const normalize = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
async function roster(slug) {
  const [registrations,imports] = await Promise.all([listAll(registrationPrefix(slug)),listAll(`attendee:${slug}:`)]);
  const contacts = new Set(), rows = [];
  for (const [type, sources] of [['registration',registrations],['import',imports]]) {
    for (const source of sources) {
      const email=String(source.email||'').trim().toLowerCase(), phone=String(source.phone||'').replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');
      const keys=[email&&'email:'+email,phone.length>=10&&'phone:'+phone].filter(Boolean);
      if(type==='import'&&keys.some(key=>contacts.has(key)))continue;
      keys.forEach(key=>contacts.add(key));
      const guest=[source.plusOneFirstName,source.plusOneLastName].filter(Boolean).join(' ').trim();
      rows.push({id:hash(`${type}:${source.id}`),name:[source.firstName,source.lastName].filter(Boolean).join(' ').trim()||'Unnamed attendee',guest,phoneLast4:phone.slice(-4),source:type});
    }
  }
  return rows;
}
export default async req => {
  try {
    const url=new URL(req.url),slug=slugify(url.searchParams.get('slug'));
    if(!slug)return json({error:'Choose an event.'},400);
    const event=await readEvent(slug);if(!event)return json({error:'Event not found.'},404);
    const db=store(),accessKey='checkin-access:'+slug;
    if(req.method==='POST'&&url.searchParams.get('action')==='access') {
      const auth=requireAdmin(req);if(!auth.ok)return auth.response;
      const body=await parseJSON(req)||{};
      let access=await db.get(accessKey,{type:'json'});
      if(!access||body.rotate===true){
        const value={token:crypto.randomBytes(32).toString('hex'),createdAt:new Date().toISOString()};
        await db.setJSON(accessKey,value,access?{}:{onlyIfNew:true});
        access=await db.get(accessKey,{type:'json'});
      }
      return json({url:`${url.origin}/check-in.html?event=${encodeURIComponent(slug)}#${access.token}`});
    }
    const access=await db.get(accessKey,{type:'json'}),given=req.headers.get('x-checkin-code')||'';
    if(!access||!given||!crypto.timingSafeEqual(Buffer.from(hash(given)),Buffer.from(hash(access.token))))return json({error:'This check-in link is invalid or has been replaced. Ask the event organizer for a new link.'},403);
    if(!['GET','POST'].includes(req.method))return json({error:'Method not allowed.'},405);
    const rows=await roster(slug);
    if(req.method==='POST') {
      if(await registrationMergeBusy(slug))return json({error:'Registration cleanup is running. Retry check-in shortly.'},409);
      const body=await parseJSON(req)||{},alias=await db.get('registration-merge-alias:'+slug+':'+String(body.id||''),{type:'json'}),row=rows.find(row=>row.id===(alias?.targetRowId||body.id));
      if(!row||!['attendee','guest'].includes(body.person)||(body.person==='guest'&&!row.guest))return json({error:'Attendee not found. Refresh and search again.'},404);
      if(body.person==='guest'&&Object.hasOwn(body,'guestName')&&body.guestName!==row.guest)return json({error:'This plus-one changed. Refresh the attendee list before checking in the guest.'},409);
      if(typeof body.checked!=='boolean')return json({error:'Choose a check-in status.'},400);
      const key=`checkin:${slug}:${row.id}:${body.person}`;
      if(body.operationId){
        if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.operationId)||typeof body.baseVersion!=='string')return json({error:'Invalid offline check-in operation.'},400);
        for(let attempt=0;attempt<3;attempt++){
          const current=await db.getWithMetadata(key,{type:'json'}),value=current?.data;
          if(value?.version===body.operationId)return json({ok:true});
          const alreadyChecked=!!value&&value.checked!==false;
          if(body.checked&&alreadyChecked)return json({ok:true});
          if((value?.version||value?.at||'')!==body.baseVersion)return json({error:'Attendance changed on another device. Refresh online and review this saved change.'},409);
          const saved=await db.setJSON(key,{id:row.id,person:body.person,checked:body.checked,version:body.operationId,at:new Date().toISOString()},current?{onlyIfMatch:current.etag}:{onlyIfNew:true});if(saved.modified)return json({ok:true});
        }
        return json({error:'Attendance is being updated. Retry sync shortly.'},409);
      }
      if(body.checked){const current=await db.getWithMetadata(key,{type:'json'});if(!current||current.data.checked===false){const result=await db.setJSON(key,{id:row.id,person:body.person,at:new Date().toISOString()},current?{onlyIfMatch:current.etag}:{onlyIfNew:true});if(!result.modified)return json({error:'Attendance changed. Refresh and try again.'},409);}}
      else await db.delete(key);
      return json({ok:true});
    }
    const records=await listAll(`checkin:${slug}:`),lookup=new Map(records.map(record=>[`${record.id}:${record.person}`,record]));
    const total=rows.reduce((sum,row)=>sum+1+Boolean(row.guest),0);
    let checked=0;
    for(const row of rows){const attendee=lookup.get(row.id+':attendee'),guest=lookup.get(row.id+':guest');row.attendeeAt=attendee&&attendee.checked!==false?attendee.at:'';row.guestAt=row.guest&&guest&&guest.checked!==false?guest.at:'';row.attendeeVersion=attendee?.version||attendee?.at||'';row.guestVersion=guest?.version||guest?.at||'';checked+=Boolean(row.attendeeAt)+Boolean(row.guestAt);}
    const query=normalize(url.searchParams.get('q')).split(' ').filter(Boolean);
    const matches=rows.filter(row=>query.every(word=>normalize(row.name+' '+row.guest).includes(word))).sort((a,b)=>a.name.localeCompare(b.name));
    const aliases=Object.fromEntries((await listAll('registration-merge-alias:'+slug+':')).map(a=>[a.id,a.targetRowId]));
    return json({aliases,event:{name:event.name,date:event.date,location:event.location},total,checked,remaining:total-checked,matched:matches.length,rows:url.searchParams.get('offline')==='1'?matches:matches.slice(0,50)});
  }catch(error){console.error('Check-in request failed',error.message);return json({error:'Unable to update check-in. Refresh to verify attendance before trying again.'},500);}
};
