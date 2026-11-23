import crypto from 'node:crypto';
import {json,requireAdmin,parseJSON,store,listAll,readEvent,slugify,registrationPrefix} from './_shared.mjs';
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
      const body=await parseJSON(req)||{},row=rows.find(row=>row.id===body.id);
      if(!row||!['attendee','guest'].includes(body.person)||(body.person==='guest'&&!row.guest))return json({error:'Attendee not found. Refresh and search again.'},404);
      if(typeof body.checked!=='boolean')return json({error:'Choose a check-in status.'},400);
      const key=`checkin:${slug}:${row.id}:${body.person}`;
      if(body.checked)await db.setJSON(key,{id:row.id,person:body.person,at:new Date().toISOString()},{onlyIfNew:true});
      else await db.delete(key);
      return json({ok:true});
    }
    const records=await listAll(`checkin:${slug}:`),lookup=new Map(records.map(record=>[`${record.id}:${record.person}`,record.at]));
    const total=rows.reduce((sum,row)=>sum+1+Boolean(row.guest),0);
    let checked=0;
    for(const row of rows){row.attendeeAt=lookup.get(row.id+':attendee')||'';row.guestAt=row.guest?lookup.get(row.id+':guest')||'':'';checked+=Boolean(row.attendeeAt)+Boolean(row.guestAt);}
    const query=normalize(url.searchParams.get('q')).split(' ').filter(Boolean);
    const matches=rows.filter(row=>query.every(word=>normalize(row.name+' '+row.guest).includes(word))).sort((a,b)=>a.name.localeCompare(b.name));
    return json({event:{name:event.name,date:event.date,location:event.location},total,checked,remaining:total-checked,matched:matches.length,rows:matches.slice(0,50)});
  }catch(error){console.error('Check-in request failed',error.message);return json({error:'Unable to update check-in. Refresh to verify attendance before trying again.'},500);}
};
