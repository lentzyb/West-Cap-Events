import {test,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {lookupStep,lookupKey,refreshEventCandidates} from '../netlify/lib/_bonzo-api.mjs';
import {bonzoDiagnostic,bonzoMessages,outreachState,eventEnd,saveBonzoMessage} from '../netlify/lib/_bonzo.mjs';
const row={id:'candidate',email:'person@example.com',phone:'3135551212',eventSlug:'event',recruiterId:'recruiter'};
const event={slug:'event',date:'2026-01-01',endTime:'12:00',timeZone:'UTC'};
const prospect={id:12,email:'PERSON@example.com',phone:'+13135551212',business:{id:2}};
const message={id:'31',prospect_id:'12',direction:'outgoing',status:'sent',type:'sms',created_at:'2026-01-02T13:00:00Z',updated_at:'2026-01-02T13:00:00Z',content:'private message'};
const page=(data,next=null)=>Response.json({data,links:{next}});
let calls;
beforeEach(()=>{globalThis.testDB=new Map([['event:event',event],['followup:candidate',row],['recruiter:recruiter',{id:'recruiter',active:true,email:'recruiter@example.com'}]]);process.env.BONZO_API_TOKEN='private-token';delete process.env.BONZO_EVENT_HOOK_CODE;calls=[];globalThis.fetch=async(url,options)=>{calls.push(String(url));assert.equal(options.method,'GET');assert.equal(options.headers.authorization,'Bearer private-token');return page(String(url).includes('/messages?')?[message]:[prospect]);};});
afterEach(()=>{delete process.env.BONZO_API_TOKEN;});
async function finish(){let state;do{state=await lookupStep(row,saveBonzoMessage);}while(!state.complete&&!state.error);return state;}
test('targeted diagnostic bypasses global indexing, verifies exact prospect and never reads unrelated messages',async()=>{
 testDB.set('bonzo-message:unrelated',{content:'unrelated history'});
 let result;do{result=await bonzoDiagnostic('candidate');}while(result.lookupPending);
 assert.equal(result.messages.length,1);assert.equal(result.messages[0].qualifies,true);assert.equal(result.apiCheck.outcome,'found');assert.equal(calls.length,5);assert.ok(calls.every(url=>url.startsWith('https://app.getbonzo.com/api/v3/')));
 assert.equal(calls.filter(url=>url.includes('/messages?')).length,1);
 const messages=await bonzoMessages();assert.equal(outreachState(row,event,messages).status,'Contacted in Bonzo');
 assert.ok(!JSON.stringify([...testDB.values()]).includes('private message'));assert.ok(!JSON.stringify([...testDB.values()]).includes('private-token'));
});
test('no visible match, conflicting contact and API errors hold reminders rather than claiming no outreach',async()=>{
 globalThis.fetch=async()=>page([{...prospect,email:'other@example.com'}]);let state=await finish();assert.equal(state.outcome,'no_match');assert.equal(outreachState(row,event,await bonzoMessages()).eligible,false);
 testDB.delete(lookupKey(row));globalThis.fetch=async()=>new Response('secret error',{status:403});state=await finish();assert.match(state.error,/permission/);assert.ok(!JSON.stringify(state).includes('secret error'));assert.equal(outreachState(row,event,await bonzoMessages()).unverified,true);
});
test('pagination stays on validated prospect, rejects conflicting message IDs and ignores incoming messages',async()=>{
 let messagePages=0;globalThis.fetch=async url=>{if(!String(url).includes('/messages?'))return page([prospect]);messagePages++;return messagePages===1?page([{...message,direction:'incoming'}],'https://evil.example/?token=steal'):page([{...message,prospect_id:'999'}]);};
 const state=await finish();assert.match(state.error,/different prospect/);assert.equal((await bonzoMessages()).filter(x=>x.messageId).length,0);assert.equal(messagePages,2);
});
test('verified no qualifying messages permits reminders, cached checks avoid repeated API calls and expire safely',async()=>{
 globalThis.fetch=async url=>page(String(url).includes('/messages?')?[]:[prospect]);await finish();assert.equal(outreachState(row,event,await bonzoMessages()).eligible,true);
 globalThis.fetch=async()=>{throw Error('cached lookup must not fetch')};assert.equal((await lookupStep(row,saveBonzoMessage)).complete,true);
 const state=testDB.get(lookupKey(row));testDB.set(lookupKey(row),{...state,checkedAt:'2020-01-01T00:00:00Z'});assert.equal(outreachState(row,event,await bonzoMessages()).eligible,false);
});
test('background refresh excludes internal, future and archived events',async()=>{
 testDB.set('event:event',{...event,questionnaire:'internal'});await refreshEventCandidates(saveBonzoMessage,eventEnd);assert.equal(calls.length,0);
 testDB.set('event:event',{...event,date:'2099-01-01'});await refreshEventCandidates(saveBonzoMessage,eventEnd);assert.equal(calls.length,0);
 testDB.set('event:event',{...event,archived:true});await refreshEventCandidates(saveBonzoMessage,eventEnd);assert.equal(calls.length,0);
});
test('a broad search never fetches unrelated message histories and remains unverified',async()=>{
 globalThis.fetch=async url=>{assert.ok(!String(url).includes('/messages'));return page([{...prospect,id:99,email:'different@example.com',phone:'5555555555'}],'next');};
 const state=await finish();assert.match(state.error,/too broad/);assert.equal(outreachState(row,event,await bonzoMessages()).eligible,false);
});
test('API queued, failed, incoming and pre-event activity cannot qualify as contact',async()=>{
 const {reportSnapshot}=await import('../netlify/lib/_report.mjs');
 globalThis.fetch=async url=>page(String(url).includes('/messages?')?[
  {...message,id:'1',status:'queued'},
  {...message,id:'2',status:'failed',error_message:'failed'},
  {...message,id:'3',direction:'incoming'},
  {...message,id:'4',created_at:'2025-12-31T12:00:00Z',updated_at:'2025-12-31T12:00:00Z'}
 ]:[prospect]);
 await finish();const messages=await bonzoMessages();assert.equal(outreachState(row,event,messages).eligible,true);assert.equal(messages.filter(m=>m.messageId).length,3);
 testDB.delete(lookupKey(row));const snapshot=await reportSnapshot();assert.equal(snapshot.rows[0].category,'Unverified');
});
test('candidate history stops at proof of post-event outreach and background skips contacted candidates',async()=>{
 globalThis.fetch=async url=>{calls.push(String(url));return String(url).includes('/messages?')?page([message],'more-history'):page([prospect]);};
 let result;do{result=await bonzoDiagnostic('candidate');}while(result.lookupPending);
 assert.equal(result.messages[0].qualifies,true);assert.equal(calls.filter(x=>x.includes('/messages?')).length,1);
 const count=calls.length;await refreshEventCandidates(saveBonzoMessage,eventEnd,await bonzoMessages(),outreachState);assert.equal(calls.length,count);
});
test('diagnostics preserve safe HTTP, timeout, JSON and timestamp failure reasons without raw response details',async()=>{
 for(const [response,expected] of [
  [async()=>new Response('private provider details',{status:500}),/HTTP 500/],
  [async()=>new Response('private HTML',{status:200}),/non-JSON/],
  [async()=>{throw new DOMException('private request URL','TimeoutError')},/timed out/]
 ]){testDB.delete(lookupKey(row));globalThis.fetch=response;const state=await lookupStep(row,saveBonzoMessage);assert.match(state.error,expected);assert.match(state.error,/Stage: candidate search/);assert.ok(!JSON.stringify(state).includes('private '));}
 testDB.delete(lookupKey(row));globalThis.fetch=async url=>page(String(url).includes('/messages?')?[{...message,created_at:'2026-01-02 13:00:00'}]:[prospect]);const state=await finish();assert.match(state.error,/timestamp/);assert.match(state.error,/Stage: candidate messages/);
});

test('candidate search scopes to the configured recruiter with bounded pages and deferred counts',async()=>{
 globalThis.fetch=async (url,options)=>{const u=new URL(url);assert.equal(options.headers['On-Behalf-Of'],'recruiter@example.com');assert.equal(u.searchParams.has('show_all'),false);assert.equal(u.searchParams.get('defer_count'),'1');assert.equal(u.searchParams.get('exact_count'),'0');assert.equal(u.searchParams.get('per_page'),'25');return page([prospect]);};
 assert.equal((await lookupStep(row,saveBonzoMessage)).error,undefined);
});
test('direct prospect link validates the exact record and bypasses search on subsequent checks',async()=>{
 const {verifyDirectProspect,prospectId}=await import('../netlify/lib/_bonzo-api.mjs');
 assert.equal(prospectId('https://platform.getbonzo.com/prospect/12'),'12');assert.throws(()=>prospectId('https://evil.example/prospect/12'));
 globalThis.fetch=async url=>{calls.push(String(url));assert.ok(!String(url).includes('search='));return String(url).includes('/messages?')?page([message]):Response.json({data:prospect,last_subject:''});};
 await verifyDirectProspect(row,'https://platform.getbonzo.com/prospect/12');let result;do{result=await bonzoDiagnostic('candidate');}while(result.lookupPending);
 assert.equal(result.messages[0].qualifies,true);assert.ok(calls.some(url=>url.endsWith('/prospects/12')));
});
test('direct prospect access denial and conflicting contact cannot save a link or fetch messages',async()=>{
 const {verifyDirectProspect}=await import('../netlify/lib/_bonzo-api.mjs');
 globalThis.fetch=async()=>new Response('',{status:403});await assert.rejects(()=>verifyDirectProspect(row,'12'),/permission/);assert.ok(![...testDB.keys()].some(k=>k.startsWith('bonzo-direct:')));
 testDB.delete('bonzo-api:cooldown');globalThis.fetch=async()=>Response.json({data:{...prospect,email:'wrong@example.com'}});await assert.rejects(()=>verifyDirectProspect(row,'12'),/does not exactly match/);assert.ok(![...testDB.keys()].some(k=>k.startsWith('bonzo-direct:')));
});
test('API direction aliases and explicit flags recognize post-event outgoing messages without counting incoming replies',async()=>{
 const {messageDirection}=await import('../netlify/lib/_bonzo-api.mjs');
 for(const value of ['outbound','OUT',' Outgoing ','outcoming',{value:'outgoing'}])assert.equal(messageDirection({direction:value}),'outgoing');
 assert.equal(messageDirection({is_outgoing:true}),'outgoing');assert.equal(messageDirection({is_incoming:true}),'incoming');
 assert.equal(messageDirection({direction:'incoming',is_outgoing:true}),'unknown');assert.equal(messageDirection({direction:1}),'unknown');
 globalThis.fetch=async url=>page(String(url).includes('/messages?')?[
  {...message,id:'31',direction:'INBOUND'},
  {...message,id:'32',direction:'OUTBOUND'}
 ]:[prospect]);
 let result;do{result=await bonzoDiagnostic('candidate');}while(result.lookupPending);
 assert.equal(result.messages.filter(m=>m.qualifies).length,1);assert.equal(result.apiCheck.directions.outgoing,1);assert.equal(result.apiCheck.directions.incoming,1);assert.equal(result.apiCheck.directions.other,0);
 assert.equal(outreachState(row,event,await bonzoMessages()).status,'Contacted in Bonzo');
});
test('unknown direction values cannot certify no outreach; report and reminders remain unverified',async()=>{
 globalThis.fetch=async url=>page(String(url).includes('/messages?')?[{...message,direction:1}]:[prospect]);
 const state=await finish();assert.equal(state.complete,false);assert.match(state.error,/direction=number:1/);assert.equal(outreachState(row,event,await bonzoMessages()).eligible,false);assert.equal(outreachState(row,event,await bonzoMessages()).unverified,true);
 const {reportSnapshot}=await import('../netlify/lib/_report.mjs');assert.equal((await reportSnapshot()).rows[0].category,'Unverified');
});
test('null direction with positive sent SMS evidence counts the follow-up, while delivered replies and answered calls do not',async()=>{
 const {messageDirection}=await import('../netlify/lib/_bonzo-api.mjs');
 assert.equal(messageDirection({...message,direction:null}),'outgoing');
 for(const m of [{...message,direction:null,status:'delivered'},{...message,direction:null,status:'queued'},{...message,direction:null,status:'failed'},{...message,direction:null,type:'call',status:'answered'},{...message,direction:1},{...message,direction:'incoming'}])assert.notEqual(messageDirection(m),'outgoing');
 globalThis.fetch=async url=>page(String(url).includes('/messages?')?[
  {...message,id:'41',direction:null,status:'delivered'},
  {...message,id:'42',direction:null,status:'sent'},
  {...message,id:'43',direction:null,type:'call',status:'answered'}
 ]:[prospect]);
 let result;do{result=await bonzoDiagnostic('candidate');}while(result.lookupPending);
 assert.ok(!result.lookupError);assert.equal(result.messages.filter(m=>m.qualifies).length,1);assert.equal(result.messages.find(m=>m.messageId==='42').directionBasis,'sent-status');
 assert.equal(outreachState(row,event,await bonzoMessages()).status,'Contacted in Bonzo');
});
test('automatic lookup reuses contact-index prospect IDs after fresh identity validation',async()=>{
 await saveBonzoMessage({event:'messages.outgoing.updated',prospect,additional:{message:{...message,id:'older',created_at:'2025-01-01T00:00:00Z',updated_at:'2025-01-01T00:00:00Z',direction:null,type:'call',status:'answered'}}});
 calls=[];globalThis.fetch=async url=>{calls.push(String(url));assert.ok(!String(url).includes('search='));return String(url).includes('/messages?')?page([message]):Response.json({data:prospect});};
 let result;do{result=await bonzoDiagnostic('candidate');}while(result.lookupPending);
 assert.equal(result.messages.some(m=>m.qualifies),true);assert.equal(calls.length,2);assert.ok(calls[0].endsWith('/prospects/12'));assert.ok(calls[1].includes('/prospects/12/messages?'));
});
test('stale indexed identity is rejected and falls back to permitted exact search',async()=>{
 testDB.delete('recruiter:recruiter');
 await saveBonzoMessage({event:'messages.outgoing.updated',prospect,additional:{message:{...message,created_at:'2025-01-01T00:00:00Z',updated_at:'2025-01-01T00:00:00Z'}}});
 calls=[];globalThis.fetch=async url=>{calls.push(String(url));assert.ok(!String(url).includes('/messages?'));return String(url).includes('/prospects/12')?Response.json({data:{...prospect,email:'other@example.com',phone:'5555555555'}}):page([]);};
 const result=await finish();assert.equal(result.outcome,'no_match');assert.equal(calls.filter(u=>u.includes('show_all=1')).length,2);
});
test('team-wide search discovers a prospect omitted from the default list and invalidates old no-match cache',async()=>{
 testDB.delete('recruiter:recruiter');
 testDB.set(lookupKey(row),{lookupKey:lookupKey(row),revision:4,complete:true,outcome:'no_match',checkedAt:new Date().toISOString()});
 globalThis.fetch=async url=>{calls.push(String(url));const u=new URL(url);if(u.pathname.endsWith('/messages'))return page([message]);assert.equal(u.searchParams.get('show_all'),'1');assert.equal(u.searchParams.get('per_page'),'25');return page([prospect]);};
 let result;do{result=await bonzoDiagnostic('candidate');}while(result.lookupPending);assert.equal(result.messages.some(m=>m.qualifies),true);assert.equal(calls.filter(u=>u.includes('/messages?')).length,1);
});
test('one-candidate search status does not load unrelated follow-ups or lookup records',async()=>{
 testDB.set('followup:unrelated',()=>{});testDB.set('bonzo-lookup:unrelated',()=>{});
 const messages=await bonzoMessages([row]);assert.deepEqual(messages,[]);
});
test('denied recruiter scope falls back without global cooldown or sending messages',async()=>{
 let denied=0;globalThis.fetch=async(url,options)=>{calls.push(String(url));if(options.headers['On-Behalf-Of']){denied++;return new Response(null,{status:403});}return page(String(url).includes('/messages?')?[message]:[prospect]);};
 const state=await finish();assert.equal(state.outcome,'found');assert.equal(denied,1);assert.equal(testDB.has('bonzo-api:cooldown'),false);assert.equal(state.ownerScopeDenied,true);
});
test('background refresh checkpoints unfinished candidates and does not overlap another refresh',async()=>{
 for(let i=0;i<6;i++)testDB.set('followup:'+i,{...row,id:String(i),email:`person${i}@example.com`,phone:'',recruiterId:''});testDB.delete('followup:candidate');
 const now=Date.now;let clock=now();Date.now=()=>clock;
 try{globalThis.fetch=async()=>{clock+=1000;return page([]);};const result=await refreshEventCandidates(saveBonzoMessage,eventEnd,[],()=>({}),{budgetMs:500});assert.equal(result.checked,3);assert.equal(result.remaining,3);assert.equal(testDB.get('bonzo-refresh:latest').remaining,3);
 testDB.set('bonzo-refresh:lease',{owner:'other',expiresAt:clock+10000});assert.equal((await refreshEventCandidates(saveBonzoMessage,eventEnd)).busy,true);
 }finally{Date.now=now;}
});
