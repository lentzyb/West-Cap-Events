import {test,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import hook from '../netlify/functions/bonzo-events.mjs';
import {eventEnd,outreachState,bonzoMessages} from '../netlify/functions/_bonzo.mjs';
import {queueCandidate,runNotifications,notificationRows} from '../netlify/functions/_notifications.mjs';
let sent;
const end=Date.now()-3*86400000;
const event={slug:'test',name:'Test',date:new Date(end).toISOString().slice(0,10),endTime:'12:00',timeZone:'UTC'};
const boundary=eventEnd(event);
const candidate={id:'p1',eventSlug:'test',eventName:'Test',recruiterId:'r1',email:'person@example.com',phone:'3135551212'};
function payload(overrides={},extra={}){return {event:'messages.outgoing.created',prospect:{id:11,email:'PERSON@example.com',phone:'+13135551212',business:{id:2}},additional:{message:{id:1,prospect_id:11,type:'sms',status:'sent',direction:'outgoing',created_at:new Date(boundary+3600000).toISOString(),updated_at:new Date(boundary+3600000).toISOString(),campaign_id:3,...overrides}},...extra}}
const req=(p,code='test-hook-secret')=>new Request('https://example.com/.netlify/functions/bonzo-events',{method:'POST',headers:{'x-bonzo-code':code},body:JSON.stringify(p)});
beforeEach(()=>{globalThis.testDB=new Map([['event:test',event],['recruiter:r1',{id:'r1',name:'Recruiter',email:'recruiter@example.com',active:true}],['config:notifications',{enabled:true,hour:0,timeZone:'UTC'}]]);Object.assign(process.env,{BONZO_EVENT_HOOK_CODE:'test-hook-secret',EMAIL_PROVIDER:'resend',RESEND_API_KEY:'test',NOTIFICATION_FROM_EMAIL:'events@example.com',NOTIFICATION_SECRET:'x'.repeat(40),NOTIFICATION_SITE_URL:'https://example.com'});delete process.env.MONDAY_API_TOKEN;sent=[];globalThis.fetch=async(url,options)=>{assert.ok(String(url).includes('api.resend.com'),'no Monday or Bonzo API calls expected');sent.push(JSON.parse(options.body));return Response.json({id:'sent-'+sent.length})}});
afterEach(()=>{delete process.env.BONZO_EVENT_HOOK_CODE});
test('receiver rejects unauthenticated activity; stores no message text or security code',async()=>{assert.equal((await hook(req(payload(),'wrong'))).status,401);assert.equal(testDB.size,3);assert.equal((await hook(req(payload({content:'private body'})))).status,200);const messages=await bonzoMessages();assert.equal(messages.length,1);assert.equal(messages[0].campaign,true);const serialized=JSON.stringify(messages);assert.ok(!serialized.includes('private body'));assert.ok(!serialized.includes('test-hook-secret'));assert.equal((await hook(new Request('https://x',{method:'GET'}))).status,405)});
test('outreach captured before upload suppresses initial and daily reminders and exposes contacted state',async()=>{await hook(req(payload()));await queueCandidate(candidate);await runNotifications({daily:true});assert.equal(sent.length,0);const rows=await notificationRows();assert.equal(rows[0].status,'Contacted in Bonzo');assert.equal(rows[0].campaign,true);});
test('pre-event, incoming, queued, failed and campaign enrollment do not count',async()=>{for(const [i,p] of [payload({id:1,created_at:new Date(boundary-3600000).toISOString(),updated_at:new Date(boundary-3600000).toISOString()}),payload({id:2,direction:'incoming'}),payload({id:3,status:'queued'}),payload({id:4,status:'failed',error_message:'failed'}),payload({id:5},{event:'prospects.campaigns.updated'})].entries()){assert.equal((await hook(req(p))).status,200)}await queueCandidate(candidate);await runNotifications();assert.equal(sent.length,1)});
test('duplicates and old updates do not overwrite newer message state',async()=>{const p=payload();await hook(req(p));await hook(req(p));assert.equal((await bonzoMessages()).length,1);const newer=payload({status:'failed',updated_at:new Date(boundary+7200000).toISOString()},{event:'messages.outgoing.updated'});await hook(req(newer));await hook(req(p));assert.equal((await bonzoMessages())[0].accepted,false)});
test('message updates from queued to sent complete contact; duplicate deliveries do not email',async()=>{await hook(req(payload({status:'queued'})));await queueCandidate(candidate);assert.equal((await notificationRows())[0].status,'Needs post-event outreach (none recorded)');await hook(req(payload({status:'sent',updated_at:new Date(boundary+7200000).toISOString()},{event:'messages.outgoing.updated'})));await runNotifications();assert.equal(sent.length,0)});
test('matching is event-specific and conflicting email/phone cannot suppress another candidate',async()=>{await hook(req(payload()));const messages=await bonzoMessages();assert.equal(outreachState(candidate,event,messages).eligible,false);assert.equal(outreachState({...candidate,email:'other@example.com'},event,messages).eligible,true);const later={...event,date:new Date(boundary+86400000).toISOString().slice(0,10)};assert.equal(outreachState(candidate,later,messages).eligible,true)});
test('missing end time and future events wait; DST end uses event timezone',async()=>{assert.equal(eventEnd({...event,endTime:''}),null);assert.equal(eventEnd({date:'2026-07-21',endTime:'15:00',timeZone:'America/New_York'}),Date.parse('2026-07-21T19:00:00Z'));assert.equal(eventEnd({date:'2026-11-01',endTime:'01:30',timeZone:'America/New_York'}),null);assert.equal(outreachState(candidate,{...event,endTime:''},[]).eligible,false);assert.equal(outreachState(candidate,{...event,date:'2099-01-01'},[]).eligible,false)});
test('receiver validates IDs and timestamps and ignores unrelated events',async()=>{assert.equal((await hook(req(payload({prospect_id:999})))).status,400);assert.equal((await hook(req(payload({created_at:'yesterday'})))).status,400);assert.equal((await hook(req({event:'tasks.created'}))).status,200);assert.equal((await bonzoMessages()).length,0)});
test('no Bonzo setup retains existing independent reminders and never exposes stale errors',async()=>{delete process.env.BONZO_EVENT_HOOK_CODE;await queueCandidate(candidate);await runNotifications();assert.equal(sent.length,1)});
test('pending batches recheck Bonzo before retrying and cancel contacted candidates',async()=>{await queueCandidate(candidate);globalThis.fetch=async()=>{throw Error('temporary send failure')};await runNotifications();assert.ok([...testDB.values()].some(j=>j.status==='pending'&&j.payload));await hook(req(payload()));globalThis.fetch=async()=>{throw Error('must not send contacted candidate')};const r=await runNotifications();assert.equal(r.failed,0);assert.ok([...testDB.values()].some(j=>j.status==='cancelled'&&j.payload))});
test('phone-only attendee matches normalized contact; outreach does not bypass manual opt-out',async()=>{await hook(req(payload()));await queueCandidate({...candidate,email:''});assert.equal((await notificationRows())[0].status,'Contacted in Bonzo');const row=(await notificationRows())[0];testDB.set('followup-stop:'+row.id,{id:row.id,stopped:true,reason:'Dropped out'});assert.equal((await notificationRows())[0].status,'Stopped');await runNotifications();assert.equal(sent.length,0)});
test('candidate diagnostic distinguishes missing delivery, conflicting contact, queued status and valid post-event messages',async()=>{
 const {bonzoDiagnostic,runBonzoIndex}=await import('../netlify/functions/_bonzo.mjs');await runBonzoIndex();await queueCandidate(candidate);const id=(await notificationRows())[0].id;
 let result=await bonzoDiagnostic(id);assert.equal(result.relatedMessages,0);assert.match(result.explanation,/No saved Bonzo message/);
 await hook(req(payload({id:1,status:'queued'})));await hook(req(payload({id:2},{prospect:{id:11,email:'different@example.com',phone:'+13135551212'}})));await hook(req(payload({id:3})));
 result=await bonzoDiagnostic(id);assert.equal(result.relatedMessages,3);assert.equal(result.messages.filter(m=>m.qualifies).length,1);assert.ok(result.messages.some(m=>m.contactConflict));assert.ok(result.messages.some(m=>m.reason.includes('status does not')));assert.equal(result.status,'Contacted in Bonzo');assert.ok(!JSON.stringify(result).includes('test-hook-secret'));assert.ok(!JSON.stringify(result).includes('person@example.com'));
});
test('invalid authenticated hook deliveries record a safe rejection reason without message text',async()=>{
 const {bonzoDiagnostic,runBonzoIndex}=await import('../netlify/functions/_bonzo.mjs');await runBonzoIndex();await queueCandidate(candidate);const id=(await notificationRows())[0].id;
 const response=await hook(req(payload({created_at:'not-a-date',content:'private message text'})));assert.equal(response.status,400);
 const result=await bonzoDiagnostic(id);assert.equal(result.lastRejected.reason,'Invalid message timestamp.');assert.ok(!JSON.stringify(result).includes('private message text'));
});
test('indexed diagnostic reads only the candidate activity after one background pass',async()=>{
 const {bonzoDiagnostic,runBonzoIndex}=await import('../netlify/functions/_bonzo.mjs');await runBonzoIndex();await queueCandidate(candidate);const id=(await notificationRows())[0].id;
 for(let i=0;i<125;i++)testDB.set('bonzo-message:batch-'+i,{id:'batch-'+i,messageId:String(i),prospectId:'11',email:i===124?candidate.email:'unrelated@example.com',phone:'',type:'sms',status:'sent',accepted:true,sentAt:boundary+3600000,receivedAt:new Date().toISOString()});
 testDB.delete('bonzo-index:v1');await runBonzoIndex();let cursor='',count=0,found=false,calls=0;do{const result=await bonzoDiagnostic(id,cursor);assert.ok(result.scanned<=60);count+=result.scanned;found ||=result.messages.some(message=>message.qualifies);cursor=result.nextCursor;calls++;}while(cursor);assert.equal(count,1);assert.equal(calls,1);assert.equal(found,true);
});

test('background index resumes, avoids concurrent work and uses current message state',async()=>{
 const {runBonzoIndex,bonzoDiagnostic}=await import('../netlify/functions/_bonzo.mjs');await queueCandidate(candidate);const id=(await notificationRows())[0].id;
 for(let i=0;i<310;i++){const key='bonzo-message:'+String(i).padStart(4,'0');testDB.set(key,{id:key,messageId:String(i),email:i===309?candidate.email:'other@example.com',phone:'',accepted:true,type:'sms',status:'sent',sentAt:boundary+3600000});}
 assert.equal((await bonzoDiagnostic(id)).indexPending,true);
 const first=await runBonzoIndex();assert.equal(first.processed,300);assert.equal(first.status,'running');const second=await runBonzoIndex();assert.equal(second.processed,310);assert.equal(second.status,'complete');assert.equal((await bonzoDiagnostic(id)).messages.length,1);
 testDB.set('bonzo-message:0309',{...testDB.get('bonzo-message:0309'),accepted:false,status:'failed'});assert.equal((await bonzoDiagnostic(id)).messages[0].qualifies,false);
 testDB.set('bonzo-index:lease',{owner:'other',expiresAt:Date.now()+60000});assert.equal((await runBonzoIndex()).busy,true);
});

test('fresh payload revalidates legacy rejected metadata at the same provider timestamp',async()=>{
 const {saveBonzoMessage}=await import('../netlify/functions/_bonzo.mjs');await saveBonzoMessage(payload());
 const key=[...testDB.keys()].find(key=>key.startsWith('bonzo-message:'));const old=testDB.get(key);delete old.parserVersion;delete old.rejectionReason;old.accepted=false;testDB.set(key,old);
 await saveBonzoMessage(payload());assert.equal(testDB.get(key).accepted,true);assert.equal(testDB.get(key).direction,'outgoing');assert.equal(testDB.get(key).parserVersion,2);
});
test('answered outgoing calls count as contact only after the event',async()=>{
 const {saveBonzoMessage}=await import('../netlify/functions/_bonzo.mjs');await saveBonzoMessage(payload({type:'call',status:'answered'}));const messages=await bonzoMessages();assert.equal(outreachState(candidate,event,messages).status,'Contacted in Bonzo');
 assert.equal(outreachState(candidate,{...event,date:'2099-01-01'},messages).status,'Waiting for event to end');
 await saveBonzoMessage(payload({id:2,type:'call',status:'answered',direction:'incoming'}));assert.equal((await bonzoMessages()).find(m=>m.messageId==='2').accepted,false);
});
