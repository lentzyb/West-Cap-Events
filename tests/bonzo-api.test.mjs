import {test,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {lookupStep,lookupKey,refreshEventCandidates} from '../netlify/functions/_bonzo-api.mjs';
import {bonzoDiagnostic,bonzoMessages,outreachState,eventEnd,saveBonzoMessage} from '../netlify/functions/_bonzo.mjs';
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
 assert.equal(result.messages.length,1);assert.equal(result.messages[0].qualifies,true);assert.equal(result.apiCheck.outcome,'found');assert.equal(calls.length,3);assert.ok(calls.every(url=>url.startsWith('https://app.getbonzo.com/api/v3/')));
 assert.equal(calls.filter(url=>url.includes('/messages?')).length,1);
 const messages=await bonzoMessages();assert.equal(outreachState(row,event,messages).status,'Contacted in Bonzo');
 assert.ok(!JSON.stringify([...testDB.values()]).includes('private message'));assert.ok(!JSON.stringify([...testDB.values()]).includes('private-token'));
});
test('no visible match, conflicting contact and API errors hold reminders rather than claiming no outreach',async()=>{
 globalThis.fetch=async()=>page([{...prospect,email:'other@example.com'}]);let state=await finish();assert.equal(state.outcome,'no_match');assert.equal(outreachState(row,event,await bonzoMessages()).eligible,false);
 testDB.delete(lookupKey(row));globalThis.fetch=async()=>new Response('secret error',{status:403});state=await lookupStep(row,saveBonzoMessage);assert.match(state.error,/permission/);assert.ok(!JSON.stringify(state).includes('secret error'));assert.equal(outreachState(row,event,await bonzoMessages()).unverified,true);
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
 const {reportSnapshot}=await import('../netlify/functions/_report.mjs');
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
