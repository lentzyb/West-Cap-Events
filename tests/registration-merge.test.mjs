import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {duplicatePreview,mergeDuplicates,undoMerge} from '../netlify/lib/_registration-merge.mjs';
import {listAll} from '../netlify/lib/_shared.mjs';
import registrations from '../netlify/functions/registrations.mjs';
import checkin from '../netlify/functions/check-in.mjs';
const hash=id=>crypto.createHash('sha256').update('registration:'+id).digest('hex');
const key=id=>'registration:hp:2026-11-24T12:00:00Z:'+id;
const row=(id,extra={})=>({id,eventSlug:'hp',eventName:'Holiday Party',firstName:'Jane',lastName:'Smith',email:'jane@example.com',phone:'3135551212',createdAt:'2026-11-24T12:00:00Z',candidateId:'WCL-'+id,trackingToken:'token-'+id,webhookSync:{status:'skipped'},calendly:{scheduledAt:'kept'},...extra});
beforeEach(()=>{process.env.ADMIN_PASSWORD='test-admin';globalThis.testDB=new Map([['event:hp',{slug:'hp',name:'Holiday Party',questionnaire:'internal'}],['checkin-access:hp',{token:'staff-test'}]]);globalThis.fetch=async()=>{throw Error('Merge must not send requests');};});
const attendance=(body)=>checkin(new Request('https://test.local/check-in?slug=hp&offline=1',{method:body?'POST':'GET',headers:{'x-checkin-code':'staff-test','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));
test('clear duplicates merge missing guest data and retain registration IDs, attendance, backups and aliases',async()=>{
 testDB.set(key('one'),row('one'));testDB.set(key('two'),row('two',{email:'JANE@example.com',plusOneFirstName:'John',plusOneLastName:'Smith'}));
 testDB.set('checkin:hp:'+hash('two')+':attendee',{id:hash('two'),person:'attendee',at:'2026-12-04T23:00:00Z'});testDB.set('checkin:hp:'+hash('two')+':guest',{id:hash('two'),person:'guest',at:'2026-12-04T23:01:00Z'});
 const preview=await duplicatePreview('hp');assert.equal(preview.safeGroups.length,1);const result=await mergeDuplicates('hp');assert.equal(result.removedDuplicates,1);assert.equal(result.remainingGroups,0);
 const active=await listAll('registration:hp:');assert.equal(active.length,1);assert.equal(active[0].id,'one');assert.equal(active[0].trackingToken,'token-one');assert.equal(active[0].plusOneFirstName,'John');assert.equal(testDB.get(key('two')).mergedInto,'one');
 const roster=await(await attendance()).json();assert.equal(roster.total,2);assert.equal(roster.checked,2);assert.equal(roster.aliases[hash('two')],hash('one'));
 assert.equal((await attendance({id:hash('two'),person:'attendee',checked:true})).status,200);
 assert.ok(testDB.get('registration-merge-backup:hp:'+result.batchId).changes.length>=3);
});
test('conflicting people, guests, phone numbers and name-only matches are held for review',async()=>{
 for(const extra of [{firstName:'Other'},{plusOneFirstName:'Other',plusOneLastName:'Guest'},{phone:'2485551212'}]){testDB.set(key('one'),row('one',{plusOneFirstName:'First',plusOneLastName:'Guest'}));testDB.set(key('two'),row('two',extra));const result=await mergeDuplicates('hp');assert.equal(result.removedDuplicates,0);assert.ok(result.review.length);assert.equal((await listAll('registration:hp:')).length,2);}
 testDB.set(key('two'),row('two',{email:'different@example.com',phone:'2485551212'}));const preview=await duplicatePreview('hp');assert.equal(preview.safeGroups.length,0);assert.ok(preview.review.some(r=>r.reasons.some(x=>x.includes('Same name'))));
});
test('same person in different events is never merged and stale data cannot be undone over a later edit',async()=>{
 testDB.set(key('one'),row('one'));testDB.set(key('two'),row('two'));testDB.set('registration:other:one',row('other',{eventSlug:'other'}));const result=await mergeDuplicates('hp');assert.equal((await listAll('registration:other:')).length,1);
 const saved=testDB.get(key('one'));testDB.set(key('one'),{...saved,firstName:'Edited after merge'});await assert.rejects(()=>undoMerge('hp',result.batchId),/changed after/);assert.equal(testDB.get(key('one')).firstName,'Edited after merge');
});
test('undo restores originals, plus-ones and counts without losing stored data',async()=>{
 const one=row('one'),two=row('two',{plusOneFirstName:'John',plusOneLastName:'Smith'});testDB.set(key('one'),one);testDB.set(key('two'),two);const result=await mergeDuplicates('hp');await undoMerge('hp',result.batchId);assert.deepEqual(testDB.get(key('one')),one);assert.deepEqual(testDB.get(key('two')),two);assert.equal((await listAll('registration:hp:')).length,2);assert.equal((await(await attendance()).json()).total,3);
});
test('bounded passes resume the same batch and repeated completion is idempotent',async()=>{
 for(let i=0;i<4;i++)for(const suffix of ['a','b'])testDB.set(key(i+suffix),row(i+suffix,{firstName:'Person'+i,email:'person'+i+'@example.com',phone:''}));
 let result=await mergeDuplicates('hp',{maxGroups:1});const id=result.batchId;assert.equal(result.remainingGroups,3);while(result.remainingGroups)result=await mergeDuplicates('hp',{batchId:id,maxGroups:1});assert.equal(result.batchId,id);assert.equal(result.removedDuplicates,4);assert.equal((await listAll('registration:hp:')).length,4);assert.equal((await mergeDuplicates('hp',{batchId:id})).removedDuplicates,4);await undoMerge('hp',id);assert.equal((await listAll('registration:hp:')).length,8);
});
test('scrub requires admin and external events are excluded',async()=>{
 const response=await registrations(new Request('https://test.local/registrations?slug=hp&action=merge-duplicates',{method:'POST',body:'{}'}));assert.equal(response.status,401);testDB.set('event:hp',{slug:'hp',questionnaire:'external'});await assert.rejects(()=>mergeDuplicates('hp'),/internal event/);
});
