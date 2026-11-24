import {test,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {lookupKey,refreshEventCandidates,checkValidMs} from '../netlify/lib/_bonzo-api.mjs';
import {bonzoMessages,outreachState,eventEnd,saveBonzoMessage} from '../netlify/lib/_bonzo.mjs';
import {reportSnapshot} from '../netlify/lib/_report.mjs';
const event={slug:'event',name:'Why West Cap',date:'2026-01-01',endTime:'12:00',timeZone:'UTC'};
const page=(data,next=null)=>Response.json({data,links:{next}});
const prospectFor=url=>{const match=decodeURIComponent(url).match(/search=(c\d+@example\.com)/);return match?[{id:Number(match[1].match(/\d+/)[0])+1000,email:match[1],phone:'3135550'+match[1].match(/\d+/)[0].padStart(3,'0'),business:{id:2}}]:[];};
function seed(count){globalThis.testDB=new Map([['event:event',event],['recruiter:r',{id:'r',active:true,name:'Recruiter',email:'recruiter@example.com'}]]);for(let i=0;i<count;i++)testDB.set('followup:c'+i,{id:'c'+i,firstName:'Candidate',lastName:String(i).padStart(3,'0'),email:`c${i}@example.com`,phone:'',eventSlug:'event',recruiterId:'r'});}
const refresh=options=>bonzoMessages().then(messages=>refreshEventCandidates(saveBonzoMessage,eventEnd,messages,outreachState,options));
const counts=async()=>(await reportSnapshot()).counts;
const realNow=Date.now;
beforeEach(()=>{process.env.BONZO_API_TOKEN='private-token';process.env.BONZO_API_MIN_INTERVAL_MS='0';delete process.env.BONZO_EVENT_HOOK_CODE;});
afterEach(()=>{delete process.env.BONZO_API_TOKEN;delete process.env.BONZO_API_MIN_INTERVAL_MS;Date.now=realNow;});

test('a Bonzo rate limit pauses verification instead of marking the remaining candidates unverified',async()=>{
 seed(30);let requests=0,rejected=0;
 globalThis.fetch=async url=>{url=String(url);requests++;if(requests===13||requests===40){rejected++;return new Response('',{status:429,headers:{'retry-after':'1'}});}return url.includes('/messages?')?page([]):page(prospectFor(url));};
 const result=await refresh();
 assert.equal(rejected,2);assert.equal(result.remaining,0);assert.equal(result.checked,30);assert.ok(result.rateLimitedUntil);
 const report=await counts();assert.equal(report['Needs outreach'],30);assert.equal(report.Unverified,0);
 assert.ok(![...testDB.values()].some(value=>/rate limit/i.test(value?.error||'')&&value.lookupKey));
});
test('a rate limit longer than the pass budget leaves the rest pending for the next pass, never failed',async()=>{
 seed(9);let requests=0;
 globalThis.fetch=async url=>{url=String(url);requests++;if(requests>6)return new Response('',{status:429,headers:{'retry-after':'120'}});return url.includes('/messages?')?page([]):page(prospectFor(url));};
 const first=await refresh({budgetMs:2000});
 assert.ok(first.remaining>0);assert.ok(first.checked<9);
 const states=[...testDB.entries()].filter(([key])=>key.startsWith('bonzo-lookup:')).map(([,value])=>value);
 assert.ok(states.every(state=>!state.error));
 testDB.delete('bonzo-api:cooldown');testDB.delete('bonzo-refresh:lease');requests=-1000;
 const second=await refresh();assert.equal(second.remaining,0);assert.equal((await counts())['Needs outreach'],9);
});
test('a finished check keeps reporting Needs outreach between hourly refreshes and expires after the validity window',async()=>{
 seed(3);globalThis.fetch=async url=>String(url).includes('/messages?')?page([]):page(prospectFor(String(url)));
 await refresh();assert.equal((await counts())['Needs outreach'],3);
 Date.now=()=>realNow()+70*60000;assert.equal((await counts())['Needs outreach'],3);
 Date.now=()=>realNow()+checkValidMs+60000;assert.equal((await counts()).Unverified,3);
});
test('a re-check in progress or paused by a rate limit keeps the last finished result; a failed re-check does not',async()=>{
 seed(1);const row=testDB.get('followup:c0');let mode='ok';
 globalThis.fetch=async url=>{url=String(url);if(mode==='limited')return new Response('',{status:429,headers:{'retry-after':'120'}});if(mode==='denied'&&url.includes('/messages?'))return new Response('',{status:500});return url.includes('/messages?')?page([]):page(prospectFor(url));};
 await refresh();assert.equal(outreachState(row,event,await bonzoMessages()).eligible,true);
 // Forty minutes later the hourly cycle re-checks, but Bonzo is rate limiting.
 Date.now=()=>realNow()+40*60000;mode='limited';testDB.delete('bonzo-refresh:lease');
 const paused=await refresh({budgetMs:500});assert.equal(paused.remaining,1);
 assert.equal(outreachState(row,event,await bonzoMessages()).status,'Needs post-event outreach (none recorded)');
 // A real failure of the new check cannot be papered over by the older result.
 testDB.delete('bonzo-api:cooldown');testDB.delete('bonzo-refresh:lease');mode='denied';await refresh();
 const state=outreachState(row,event,await bonzoMessages());assert.equal(state.unverified,true);assert.match(state.status,/HTTP 500/);
});
test('continuation passes of one cycle do not repeat finished checks, however long the cycle runs',async()=>{
 seed(6);let requests=0;globalThis.fetch=async url=>{requests++;return String(url).includes('/messages?')?page([]):page(prospectFor(String(url)));};
 const since=realNow()-1000;await refresh({since});const first=requests;assert.ok(first>0);
 Date.now=()=>realNow()+50*60000;testDB.delete('bonzo-refresh:lease');
 const again=await refresh({since});assert.equal(requests,first);assert.equal(again.remaining,0);
 // A new cycle does re-verify.
 testDB.delete('bonzo-refresh:lease');await refresh({since:Date.now()});assert.ok(requests>first);
});
test('messages Bonzo returns without a direction are classified by exact sender or recipient, and old ones cannot block a check',async()=>{
 seed(4);const base={type:'sms',created_at:'2026-01-02T13:00:00Z',updated_at:'2026-01-02T13:00:00Z'};
 const history={
  // Delivered text addressed to the candidate's own number: outreach.
  1000:[{...base,id:1,prospect_id:'1000',status:'delivered',to:'+1 (313) 555-0000',from:'+12485550100'}],
  // Only an inbound reply after the event: not outreach, and not ambiguous.
  1001:[{...base,id:2,prospect_id:'1001',status:'delivered',from:'3135550001',to:'2485550100'}],
  // Unclassifiable delivered message from before the event: irrelevant to post-event outreach.
  1002:[{...base,id:3,prospect_id:'1002',status:'delivered',created_at:'2025-12-20T13:00:00Z',updated_at:'2025-12-20T13:00:00Z'}],
  // Unclassifiable delivered message after the event: stays unverified.
  1003:[{...base,id:4,prospect_id:'1003',status:'delivered'}]
 };
 globalThis.fetch=async url=>{url=String(url);if(!url.includes('/messages?'))return page(prospectFor(url));return page(history[url.match(/prospects\/(\d+)\/messages/)[1]]);};
 await refresh();const rows=Object.fromEntries((await reportSnapshot()).rows.map(row=>[row.lastName,row]));
 assert.equal(rows['000'].category,'Contacted');assert.equal(rows['001'].category,'Needs outreach');assert.equal(rows['002'].category,'Needs outreach');assert.equal(rows['003'].category,'Unverified');
 assert.match(rows['003'].status,/could not be classified/);
 const saved=[...testDB.values()].find(value=>value?.messageId==='1');assert.equal(saved.directionBasis,'contact-match');assert.equal(saved.accepted,true);
 const check=testDB.get(lookupKey(testDB.get('followup:c3')));assert.deepEqual(check.fieldNames,['created_at','id','prospect_id','status','type','updated_at']);
});
test('a candidate missing from the recruiter\'s own records is found under the team, and a true miss is reported as Not in Bonzo',async()=>{
 seed(2);const scoped=[];
 globalThis.fetch=async(url,options)=>{url=String(url);if(url.includes('/messages?'))return page([]);const owner=options.headers['On-Behalf-Of'];scoped.push(owner?'owner':'team');
  // The recruiter owns neither record; a teammate owns candidate 0, nobody has candidate 1.
  return page(!owner&&decodeURIComponent(url).includes('c0@example.com')?prospectFor(url):[]);};
 await refresh();const rows=Object.fromEntries((await reportSnapshot()).rows.map(row=>[row.lastName,row]));
 assert.ok(scoped.includes('owner')&&scoped.includes('team'));
 assert.equal(rows['000'].category,'Needs outreach');
 assert.equal(rows['001'].category,'Not in Bonzo');assert.match(rows['001'].status,/^Not in Bonzo/);
 const state=outreachState(testDB.get('followup:c1'),event,await bonzoMessages());assert.equal(state.eligible,true);assert.equal(state.notInBonzo,true);
 assert.equal((await reportSnapshot()).counts['Not in Bonzo'],1);
});
test('a remembered or linked Bonzo record that no longer exists falls back to search instead of failing the check',async()=>{
 seed(1);const row=testDB.get('followup:c0');
 const {lookupKey:key}=await import('../netlify/lib/_bonzo-api.mjs');
 testDB.set('bonzo-direct:'+key(row).slice('bonzo-lookup:'.length),{prospectId:'777'});
 globalThis.fetch=async url=>{url=String(url);if(url.includes('/prospects/777'))return new Response('',{status:404});return url.includes('/messages?')?page([]):page(prospectFor(url));};
 await refresh();const state=outreachState(row,event,await bonzoMessages());
 assert.equal(state.status,'Needs post-event outreach (none recorded)');
});
test('an unclassified post-event message reports its type, status and the field names Bonzo returned',async()=>{
 seed(1);globalThis.fetch=async url=>{url=String(url);return url.includes('/messages?')?page([{id:9,prospect_id:'1000',type:'sms',status:'delivered',direction:null,body:'private text',user_id:4,created_at:'2026-01-02T13:00:00Z',updated_at:'2026-01-02T13:00:00Z'}]):page(prospectFor(url));};
 await refresh();const status=(await reportSnapshot()).rows[0].status;
 assert.match(status,/direction=null, type=sms, status=delivered/);assert.match(status,/Fields Bonzo returned: body created_at direction id prospect_id status type updated_at user_id/);assert.ok(!status.includes('private text'));
});
test('the recruiter reminder lists a candidate with no Bonzo record and labels them Not in Bonzo',async()=>{
 const {recruiterEmailBody,candidateEligibility}=await import('../netlify/lib/_notifications.mjs');
 seed(2);globalThis.fetch=async(url,options)=>{url=String(url);if(url.includes('/messages?'))return page([]);return page(decodeURIComponent(url).includes('c0@example.com')?prospectFor(url):[]);};
 process.env.NOTIFICATION_SECRET='x'.repeat(40);process.env.URL='https://example.netlify.app';
 try{
  await refresh();const eligible=await candidateEligibility();assert.equal(eligible.counts.eligible,2);assert.equal(eligible.counts.unverified,0);
  const messages=await bonzoMessages();const rows=eligible.rows.map(row=>({...row,notInBonzo:outreachState(row,event,messages).notInBonzo===true}));
  const mail=recruiterEmailBody({id:'r',name:'Recruiter'},rows,'daily');
  assert.match(mail.html,/Not in Bonzo/);assert.match(mail.html,/1 not in Bonzo/);assert.match(mail.text,/Status: Not in Bonzo/);assert.match(mail.text,/Status: Follow-up needed/);
  assert.match(mail.text,/1 of them is marked Not in Bonzo/);
 }finally{delete process.env.NOTIFICATION_SECRET;delete process.env.URL;}
});
