import crypto from 'node:crypto';
import {store,listAll} from './_shared.mjs';
import {apiEnabled,lookupKey,lookupStep,successfulStatus} from './_bonzo-api.mjs';
const digest=v=>crypto.createHash('sha256').update(v).digest('hex');
const email=v=>String(v||'').trim().toLowerCase();
const phone=v=>{const d=String(v||'').replace(/\D/g,'');return d.length===11&&d[0]==='1'?d.slice(1):d};
export const bonzoEnabled=()=>Boolean(process.env.BONZO_EVENT_HOOK_CODE?.trim())||apiEnabled();
export function authorizedBonzo(value){const expected=process.env.BONZO_EVENT_HOOK_CODE?.trim();if(!expected)return false;const a=Buffer.from(expected),b=Buffer.from(String(value||''));return a.length===b.length&&crypto.timingSafeEqual(a,b)}
const instant=v=>typeof v==='string'&&/(Z|[+-]\d\d:\d\d)$/i.test(v)&&Number.isFinite(Date.parse(v))?Date.parse(v):NaN;
// Missing or ambiguous local end times must be corrected, never guessed as an event boundary.
export function eventEnd(event){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(event?.date||'')||!/^\d{2}:\d{2}$/.test(event?.endTime||''))return null;
 try{const desired=event.date+'T'+event.endTime;const base=Date.parse(desired+':00Z');const zone=event.timeZone||'America/Detroit';const f=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});const local=t=>{const p=Object.fromEntries(f.formatToParts(new Date(t)).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`};const offsets=new Set([-86400000,0,86400000].map(delta=>Date.parse(local(base+delta)+':00Z')-(base+delta)));const matches=[...offsets].map(o=>base-o).filter(t=>local(t)===desired);return matches.length===1?matches[0]:null}catch{return null}
}
const indexPrefix = (kind,value) => 'bonzo-contact:'+digest(kind+':'+value)+':';
async function indexMessage(message) {
 if(!message?.id)return;
 const contacts=[email(message.email)&&['email',email(message.email)],phone(message.phone).length>=10&&['phone',phone(message.phone)]].filter(Boolean);
 await Promise.all(contacts.map(([kind,value])=>store().setJSON(indexPrefix(kind,value)+digest(message.id),{messageKey:message.id},{onlyIfNew:true})));
}
export async function requestBonzoIndex() {
 try{const origin=new URL(process.env.NOTIFICATION_SITE_URL||process.env.URL||'');if(origin.protocol!=='https:'||(process.env.NOTIFICATION_SECRET||'').length<32)return {queued:false};
 const response=await fetch(origin.origin+'/.netlify/functions/notification-worker-background',{method:'POST',headers:{'content-type':'application/json','x-notification-secret':process.env.NOTIFICATION_SECRET},body:JSON.stringify({bonzoIndexOnly:true}),signal:AbortSignal.timeout(4000)});return {queued:response.status===202};
 }catch{return {queued:false};}
}
export async function runBonzoIndex() {
 if(apiEnabled())return {status:'complete',skipped:true};
 const db=store(),key='bonzo-index:v1',leaseKey='bonzo-index:lease';
 const prior=await db.getWithMetadata(leaseKey,{type:'json'});
 if(prior?.data?.expiresAt>Date.now())return {busy:true};
 const lease={owner:crypto.randomUUID(),expiresAt:Date.now()+16*60000};
 if(!(await db.setJSON(leaseKey,lease,prior?{onlyIfMatch:prior.etag}:{onlyIfNew:true})).modified)return {busy:true};
 try{
  let state=await db.get(key,{type:'json'})||{status:'pending',processed:0,lastKey:''};
  if(state.status==='complete')return state;
  // The list contains keys only. Message bodies are read once during this resumable migration.
  const listed=await db.list({prefix:'bonzo-message:'});
  const remaining=(listed.blobs||[]).filter(blob=>blob.key>(state.lastKey||'')).sort((a,b)=>a.key.localeCompare(b.key));
  const selected=remaining.slice(0,300);
  for(let offset=0;offset<selected.length;offset+=10){
   const batch=selected.slice(offset,offset+10);
   await Promise.all(batch.map(async blob=>{const message=await db.get(blob.key,{type:'json'});if(message)await indexMessage({...message,id:blob.key});}));
   state={status:'running',processed:state.processed+batch.length,lastKey:batch.at(-1).key,updatedAt:new Date().toISOString()};
   await db.setJSON(key,state);
  }
  state={...state,status:remaining.length>selected.length?'running':'complete',updatedAt:new Date().toISOString()};
  await db.setJSON(key,state);return state;
 }catch(error){const state=await db.get(key,{type:'json'})||{processed:0,lastKey:''};await db.setJSON(key,{...state,status:'paused',updatedAt:new Date().toISOString()});throw error;}
 finally{const current=await db.getWithMetadata(leaseKey,{type:'json'});if(current?.data?.owner===lease.owner)await db.setJSON(leaseKey,{...lease,expiresAt:0},{onlyIfMatch:current.etag});}
}
export async function saveBonzoMessage(payload){
 if(!['messages.outgoing.created','messages.outgoing.updated'].includes(payload?.event))return {ignored:true};
 const p=payload.prospect,m=payload.additional?.message;
 if(!p||!m||!['string','number'].includes(typeof m.id)||!['string','number'].includes(typeof p.id))throw Error('Missing message or prospect ID.');
 if(String(m.prospect_id??m.prospect?.id??p.id)!==String(p.id))throw Error('Conflicting prospect IDs.');
 const created=instant(m.created_at),updated=instant(m.updated_at||m.created_at),scheduled=m.send_at?instant(m.send_at):created;
 if(!Number.isFinite(created)||!Number.isFinite(updated)||!Number.isFinite(scheduled)||updated>Date.now()+300000)throw Error('Invalid message timestamp.');
 const contact={email:email(p.email),phone:phone(p.phone)};
 const accepted=m.direction==='outgoing'&&successfulStatus(m.type,m.status)&&!m.error_message&&Math.max(created,scheduled)<=Date.now()&&['sms','email','call','voicemail'].includes(m.type);
 const rejectionReason=accepted?'':m.direction!=='outgoing'?'Message direction is not outgoing':m.error_message?'Bonzo reported a send error':!successfulStatus(m.type,m.status)?'Message status does not confirm a successful send or answered call':!['sms','email','call','voicemail'].includes(m.type)?'Message type is not supported':'Message is scheduled for the future';
 const key='bonzo-message:'+digest(`${p.business?.id||''}:${p.id}:${m.id}`),s=store();
 for(let attempt=0;attempt<5;attempt++){
  const old=await s.getWithMetadata(key,{type:'json'});
  if(old&&(old.data.updated>updated||(old.data.updated===updated&&old.data.parserVersion===2))){await indexMessage(old.data);return {duplicate:true};}
  const row={id:key,parserVersion:2,direction:['outgoing','incoming'].includes(m.direction)?m.direction:'other',prospectId:String(p.id),messageId:String(m.id),...contact,type:m.type,status:m.status,campaign:Boolean(m.campaign_id),sentAt:Math.max(created,scheduled),updated,accepted,rejectionReason,receivedAt:new Date().toISOString()};
  const result=await s.setJSON(key,row,old?{onlyIfMatch:old.etag}:{onlyIfNew:true});if(result.modified){await indexMessage(row);await s.setJSON('bonzo-hook:latest',{at:row.receivedAt});return {saved:true}}
 }
 throw Error('Concurrent update; retry delivery.');
}
function matchesContact(row,message){const e=email(row.email),p=phone(row.phone);const sharedEmail=Boolean(e&&message.email),sharedPhone=p.length>=10&&message.phone?.length>=10;if(!sharedEmail&&!sharedPhone)return false;return (!sharedEmail||e===message.email)&&(!sharedPhone||p===message.phone)}
export function outreachState(row,event,messages,now=Date.now()){
 if(!bonzoEnabled())return {eligible:true,status:'Active follow-up'};
 const end=eventEnd(event);if(end===null)return {eligible:false,status:'Set event end date, time and time zone'};
 if(now<end)return {eligible:false,status:'Waiting for event to end'};
 const contact=messages.filter(m=>m.accepted&&m.sentAt>end&&m.sentAt<=now&&matchesContact(row,m)).sort((a,b)=>b.sentAt-a.sentAt)[0];
 if(!contact&&apiEnabled()){const check=messages.find(m=>m.lookupKey===lookupKey(row));if(check?.revision!==2||!check?.complete||check.outcome!=='found'||(check.boundary!==undefined&&check.boundary!==end)||Date.now()-Date.parse(check.checkedAt)>10*60000)return {eligible:false,status:check?.error||check?.outcome==='no_match'?'Bonzo check unverified: '+(check?.error||'No matching prospect visible to this API account'):'Bonzo verification pending',unverified:true};}
 return contact?{eligible:false,status:'Contacted in Bonzo',contactedAt:new Date(contact.sentAt).toISOString(),contactType:contact.type,campaign:contact.campaign}:{eligible:true,status:'Needs post-event outreach (none recorded)'};
}
export async function bonzoMessages(){
 if(!bonzoEnabled())return [];
 if(!apiEnabled())return listAll('bonzo-message:');
 const [rows,checks]=await Promise.all([listAll('followup:'),listAll('bonzo-lookup:')]);
 const prefixes=new Set(rows.flatMap(row=>[email(row.email)&&indexPrefix('email',email(row.email)),phone(row.phone).length>=10&&indexPrefix('phone',phone(row.phone))].filter(Boolean)));
 const keys=new Set();for(const prefix of prefixes){const page=await store().list({prefix});for(const blob of page.blobs||[])keys.add(blob.key);}
 const messages=new Map();const entries=[...keys];for(let i=0;i<entries.length;i+=12)await Promise.all(entries.slice(i,i+12).map(async key=>{const pointer=await store().get(key,{type:'json'});if(pointer?.messageKey){const m=await store().get(pointer.messageKey,{type:'json'});if(m)messages.set(pointer.messageKey,m);}}));
 return [...messages.values(),...checks.filter(check=>check.lookupKey)];
}
export async function bonzoStatus(){return {enabled:bonzoEnabled(),lastReceivedAt:(await store().get('bonzo-hook:latest',{type:'json'}))?.at||'',endpoint:'https://westcap-events.netlify.app/.netlify/functions/bonzo-events',apiConfigured:apiEnabled(),history:apiEnabled()?'Targeted Bonzo API checks are enabled. Only matched event candidates are checked; incomplete checks hold reminders.':'Only activity received after the hook is connected is tracked. Earlier Bonzo history has not been imported.'}}

export async function bonzoDiagnostic(id, cursor='') {
 const row=await store().get('followup:'+id,{type:'json'});
 if(!row)return null;
 const db=store();
 let apiCheck=null;
 if(apiEnabled()&&!cursor){const event=await db.get('event:'+row.eventSlug,{type:'json'});apiCheck=await lookupStep(row,saveBonzoMessage,eventEnd(event));if(!apiCheck.complete||apiCheck.error)return {lookupPending:!apiCheck.error,lookupError:apiCheck.error||'',reviewed:apiCheck.reviewed||0,candidate:[row.firstName,row.lastName].filter(Boolean).join(' '),event:row.eventName,messages:[],scanned:0};}
 const indexStatus=apiEnabled()?{status:'complete'}:await db.get('bonzo-index:v1',{type:'json'});
 if(indexStatus?.status!=='complete')return {indexPending:true,indexStatus:indexStatus||{status:'pending',processed:0},candidate:[row.firstName,row.lastName].filter(Boolean).join(' '),event:row.eventName};
 let offset=0;if(cursor){offset=Number(cursor);if(!Number.isInteger(offset)||offset<0)throw Error('Invalid diagnostic cursor.');}
 const prefixes=[email(row.email)&&indexPrefix('email',email(row.email)),phone(row.phone).length>=10&&indexPrefix('phone',phone(row.phone))].filter(Boolean);
 const [event,lastRejected,pages]=await Promise.all([db.get('event:'+row.eventSlug,{type:'json'}),db.get('bonzo-hook:last-rejected',{type:'json'}),Promise.all(prefixes.map(prefix=>db.list({prefix})))]);
 const indexKeys=[...new Map(pages.flatMap(page=>(page.blobs||[]).map(blob=>[blob.key.split(':').at(-1),blob.key]))).values()].sort();
 const selected=indexKeys.slice(offset,offset+60),messageMap=new Map();
 for(let start=0;start<selected.length;start+=12){await Promise.all(selected.slice(start,start+12).map(async key=>{const pointer=await db.get(key,{type:'json'});if(pointer?.messageKey){const message=await db.get(pointer.messageKey,{type:'json'});if(message)messageMap.set(pointer.messageKey,message);}}));}
 const messages=[...messageMap.values()],keys=selected;
 const nextCursor=offset+selected.length<indexKeys.length?String(offset+selected.length):'';
 const end=eventEnd(event),state=outreachState(row,event,messages);
 const related=messages.filter(m=>(email(row.email)&&email(row.email)===m.email)||(phone(row.phone).length>=10&&phone(row.phone)===m.phone));
 const evidence=related.sort((a,b)=>b.sentAt-a.sentAt).map(m=>{
  const emailMatch=Boolean(email(row.email)&&email(row.email)===m.email),phoneMatch=Boolean(phone(row.phone).length>=10&&phone(row.phone)===m.phone);
  const conflict=Boolean((email(row.email)&&m.email&&!emailMatch)||(phone(row.phone).length>=10&&m.phone?.length>=10&&!phoneMatch));
  const reason=conflict?'Email or phone differs; contact match rejected':end===null?'Event end settings need correction':m.sentAt<=end?'Message was sent before the event ended':m.sentAt>Date.now()?'Message timestamp is in the future':!m.accepted?(m.rejectionReason||'Older saved validation result; a fresh API check is needed'):'Qualifying post-event outreach';
  return {direction:m.direction||'not recorded',validationReason:m.rejectionReason||(!m.accepted?'Older saved validation result; a fresh API check is needed':''),messageId:m.messageId,prospectId:m.prospectId,type:m.type,status:m.status,emailMatch,phoneMatch,contactConflict:conflict,sentAt:Number.isFinite(m.sentAt)?new Date(m.sentAt).toISOString():'',receivedAt:m.receivedAt,qualifies:m.accepted&&!conflict&&end!==null&&m.sentAt>end&&m.sentAt<=Date.now(),reason};
 });
 return {nextCursor,scanned:keys.length,candidate:[row.firstName,row.lastName].filter(Boolean).join(' '),event:row.eventName,eventEnd:end===null?'':new Date(end).toISOString(),apiCheck:apiCheck?{outcome:apiCheck.outcome,checkedAt:apiCheck.checkedAt,reviewed:apiCheck.reviewed,directions:apiCheck.directions,newestAt:apiCheck.newestAt}:null,status:state.status,relatedMessages:evidence.length,messages:evidence,lastRejected:lastRejected||null,explanation:!related.length?'No saved Bonzo message matches this candidate’s email or phone. Their presence in Bonzo alone does not prove a message delivery reached this site.':evidence.some(m=>m.qualifies)?'A qualifying post-event message is saved. A fresh report should show Contacted.':'Related messages were received but none satisfy all outreach rules. See the reasons below.'};
}
