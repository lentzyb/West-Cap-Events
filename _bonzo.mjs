import crypto from 'node:crypto';
import {store,listAll} from './_shared.mjs';
const digest=v=>crypto.createHash('sha256').update(v).digest('hex');
const email=v=>String(v||'').trim().toLowerCase();
const phone=v=>{const d=String(v||'').replace(/\D/g,'');return d.length===11&&d[0]==='1'?d.slice(1):d};
export const bonzoEnabled=()=>Boolean(process.env.BONZO_EVENT_HOOK_CODE?.trim());
export function authorizedBonzo(value){const expected=process.env.BONZO_EVENT_HOOK_CODE?.trim();if(!expected)return false;const a=Buffer.from(expected),b=Buffer.from(String(value||''));return a.length===b.length&&crypto.timingSafeEqual(a,b)}
const instant=v=>typeof v==='string'&&/(Z|[+-]\d\d:\d\d)$/i.test(v)&&Number.isFinite(Date.parse(v))?Date.parse(v):NaN;
// Missing or ambiguous local end times must be corrected, never guessed as an event boundary.
export function eventEnd(event){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(event?.date||'')||!/^\d{2}:\d{2}$/.test(event?.endTime||''))return null;
 try{const desired=event.date+'T'+event.endTime;const base=Date.parse(desired+':00Z');const zone=event.timeZone||'America/Detroit';const f=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});const local=t=>{const p=Object.fromEntries(f.formatToParts(new Date(t)).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`};const offsets=new Set([-86400000,0,86400000].map(delta=>Date.parse(local(base+delta)+':00Z')-(base+delta)));const matches=[...offsets].map(o=>base-o).filter(t=>local(t)===desired);return matches.length===1?matches[0]:null}catch{return null}
}
export async function saveBonzoMessage(payload){
 if(!['messages.outgoing.created','messages.outgoing.updated'].includes(payload?.event))return {ignored:true};
 const p=payload.prospect,m=payload.additional?.message;
 if(!p||!m||!['string','number'].includes(typeof m.id)||!['string','number'].includes(typeof p.id))throw Error('Missing message or prospect ID.');
 if(String(m.prospect_id??m.prospect?.id??p.id)!==String(p.id))throw Error('Conflicting prospect IDs.');
 const created=instant(m.created_at),updated=instant(m.updated_at||m.created_at),scheduled=m.send_at?instant(m.send_at):created;
 if(!Number.isFinite(created)||!Number.isFinite(updated)||!Number.isFinite(scheduled)||updated>Date.now()+300000)throw Error('Invalid message timestamp.');
 const contact={email:email(p.email),phone:phone(p.phone)};
 const accepted=m.direction==='outgoing'&&['sent','delivered','completed'].includes(m.status)&&!m.error_message&&Math.max(created,scheduled)<=Date.now()&&['sms','email','call','voicemail'].includes(m.type);
 const key='bonzo-message:'+digest(`${p.business?.id||''}:${p.id}:${m.id}`),s=store();
 for(let attempt=0;attempt<5;attempt++){
  const old=await s.getWithMetadata(key,{type:'json'});
  if(old&&old.data.updated>=updated)return {duplicate:true};
  const row={id:key,prospectId:String(p.id),messageId:String(m.id),...contact,type:m.type,status:m.status,campaign:Boolean(m.campaign_id),sentAt:Math.max(created,scheduled),updated,accepted,receivedAt:new Date().toISOString()};
  const result=await s.setJSON(key,row,old?{onlyIfMatch:old.etag}:{onlyIfNew:true});if(result.modified){await s.setJSON('bonzo-hook:latest',{at:row.receivedAt});return {saved:true}}
 }
 throw Error('Concurrent update; retry delivery.');
}
function matchesContact(row,message){const e=email(row.email),p=phone(row.phone);const sharedEmail=Boolean(e&&message.email),sharedPhone=p.length>=10&&message.phone?.length>=10;if(!sharedEmail&&!sharedPhone)return false;return (!sharedEmail||e===message.email)&&(!sharedPhone||p===message.phone)}
export function outreachState(row,event,messages,now=Date.now()){
 if(!bonzoEnabled())return {eligible:true,status:'Active follow-up'};
 const end=eventEnd(event);if(end===null)return {eligible:false,status:'Set event end date, time and time zone'};
 if(now<end)return {eligible:false,status:'Waiting for event to end'};
 const contact=messages.filter(m=>m.accepted&&m.sentAt>end&&m.sentAt<=now&&matchesContact(row,m)).sort((a,b)=>b.sentAt-a.sentAt)[0];
 return contact?{eligible:false,status:'Contacted in Bonzo',contactedAt:new Date(contact.sentAt).toISOString(),contactType:contact.type,campaign:contact.campaign}:{eligible:true,status:'Needs post-event outreach (none recorded)'};
}
export const bonzoMessages=()=>bonzoEnabled()?listAll('bonzo-message:'):Promise.resolve([]);
export async function bonzoStatus(){return {enabled:bonzoEnabled(),lastReceivedAt:(await store().get('bonzo-hook:latest',{type:'json'}))?.at||'',endpoint:'https://westcap-events.netlify.app/.netlify/functions/bonzo-events',history:'Only activity received after the hook is connected is tracked. Earlier Bonzo history has not been imported.'}}
