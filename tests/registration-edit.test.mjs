import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import registrations from '../netlify/functions/registrations.mjs';
import checkin from '../netlify/functions/check-in.mjs';
import calendly from '../netlify/functions/calendly-activity.mjs';
const id='11111111-1111-4111-8111-111111111111',key='registration:party:2026-11-24T12:00:00.000Z:'+id;
let original,outbound;
beforeEach(()=>{process.env.ADMIN_PASSWORD='test-admin';original={id,candidateId:'WCL-26-ABC',trackingToken:'tracking-test',eventSlug:'party',eventName:'Party',firstName:'Brian',lastName:'Example',email:'brian@example.com',phone:'3135551212',nmlsId:'123',createdAt:'2026-11-24T12:00:00.000Z',recruiterId:'recruiter',referredBy:'Recruiter',webhookSync:{status:'completed',httpStatus:200},calendly:{scheduledAt:'2026-11-24T13:00:00Z'}};globalThis.testDB=new Map([['event:party',{slug:'party',name:'Party',date:'2026-12-04',questionnaire:'internal'}],[key,original],['checkin-access:party',{token:'staff-test'}]]);outbound=0;globalThis.fetch=async()=>{outbound++;throw Error('Editing must not send outreach or CRM requests');};});
const req=(method,body,slug='party',auth=true)=>new Request('https://test.local/registrations?slug='+slug,{method,headers:{'content-type':'application/json',...(auth?{'x-admin-password':'test-admin'}:{})},...(body?{body:JSON.stringify(body)}:{})});
async function entry(){return (await(await registrations(req('GET'))).json()).registrations[0];}
async function edit(values,version){return registrations(req('PATCH',{id,editVersion:version??(await entry()).editVersion,...values}));}
async function attendance(){return (await(await checkin(new Request('https://test.local/check-in?slug=party&offline=1',{headers:{'x-checkin-code':'staff-test'}}))).json());}
test('admin can add a plus-one and totals, roster and stable registration metadata update together',async()=>{
 assert.equal((await attendance()).total,1);const response=await edit({plusOneFirstName:'Amy',plusOneLastName:'Example'});assert.equal(response.status,200);assert.equal((await response.json()).ok,true);const saved=testDB.get(key);for(const field of ['id','candidateId','trackingToken','createdAt','recruiterId','referredBy'])assert.equal(saved[field],original[field]);assert.deepEqual(saved.webhookSync,original.webhookSync);assert.deepEqual(saved.calendly,original.calendly);assert.equal((await attendance()).total,2);assert.equal((await attendance()).rows[0].guest,'Amy Example');assert.equal([...testDB.keys()].filter(k=>k.startsWith('registration:')).length,1);assert.equal(outbound,0);
});
test('contact corrections update existing follow-up rows without new IDs, receipts or sends',async()=>{
 testDB.set('followup:stable',{id:'stable',eventSlug:'party',sourceType:'registration',sourceId:id,firstName:'Brian',lastName:'Example',email:'brian@example.com',phone:'3135551212',recruiterId:'recruiter'});testDB.set('notification-receipt:stable:recruiter',{id:'stable',at:'old'});
 const response=await edit({firstName:'Bryan',email:'NEW@example.com',phone:'+1 (248) 555-1212'});assert.equal(response.status,200);assert.equal(testDB.get('followup:stable').email,'new@example.com');assert.equal(testDB.get('followup:stable').phone,'2485551212');assert.equal(testDB.get('followup:stable').firstName,'Bryan');assert.equal([...testDB.keys()].filter(k=>k.startsWith('followup:')).length,1);assert.equal(testDB.get('notification-receipt:stable:recruiter').at,'old');assert.equal(outbound,0);
});
test('edits require admin, paired guest names, valid contact data and a current edit version',async()=>{
 assert.equal((await registrations(req('PATCH',{id,editVersion:'anything',firstName:'Bad'},'party',false))).status,401);
 assert.equal((await edit({plusOneFirstName:'Only first'})).status,400);assert.equal((await edit({email:'invalid'})).status,400);assert.equal((await edit({email:'bad@@example.com'})).status,400);assert.equal((await edit({firstName:''})).status,400);
 const version=(await entry()).editVersion;assert.equal((await edit({firstName:'Updated'},version)).status,200);assert.equal((await edit({lastName:'Stale'},version)).status,409);assert.equal(testDB.get(key).lastName,'Example');
 assert.equal((await registrations(req('PATCH',{id,editVersion:version,firstName:'Wrong event'},'other'))).status,404);
});
test('replacing a guest resets guest attendance and rejects old offline guest identity',async()=>{
 await edit({plusOneFirstName:'Old',plusOneLastName:'Guest'});const row=(await attendance()).rows[0];const post=body=>checkin(new Request('https://test.local/check-in?slug=party',{method:'POST',headers:{'content-type':'application/json','x-checkin-code':'staff-test'},body:JSON.stringify(body)}));
 assert.equal((await post({id:row.id,person:'guest',checked:true,guestName:'Old Guest'})).status,200);assert.equal((await attendance()).checked,1);
 await edit({plusOneFirstName:'New',plusOneLastName:'Guest'});assert.equal((await attendance()).checked,0);assert.equal((await post({id:row.id,person:'guest',checked:true,guestName:'Old Guest',operationId:crypto.randomUUID(),baseVersion:''})).status,409);
 assert.equal((await edit({plusOneFirstName:'',plusOneLastName:''})).status,200);assert.equal((await attendance()).total,1);
});
test('offline registration replay and Calendly tracking preserve edited details and use the existing record',async()=>{
 const clientRequestId=crypto.randomUUID(),body={clientRequestId,firstName:'Offline',lastName:'Guest',email:'offline@example.com'};const created=await(await registrations(req('POST',body,'party',false))).json();const rows=(await(await registrations(req('GET'))).json()).registrations;const row=rows.find(r=>r.id===clientRequestId);
 assert.equal((await registrations(req('PATCH',{id:row.id,editVersion:row.editVersion,plusOneFirstName:'Plus',plusOneLastName:'One'}))).status,200);
 const replay=await(await registrations(req('POST',body,'party',false))).json();assert.equal(replay.registration.plusOneFirstName,'Plus');
 const response=await calendly(new Request('https://test.local/calendly-activity',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({slug:'party',registrationId:row.id,trackingToken:created.trackingToken,activity:'shown'})}));assert.equal(response.status,200);assert.equal([...testDB.keys()].filter(k=>k.startsWith('registration:')).length,2);const saved=testDB.get('registration:party:offline:'+clientRequestId);assert.equal(saved.plusOneFirstName,'Plus');assert.ok(saved.calendly.shownAt);
});
test('concurrent edits cannot silently overwrite one another',async()=>{
 const version=(await entry()).editVersion;const results=await Promise.all([edit({firstName:'First'},version),edit({firstName:'Second'},version)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
});
