import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {IDBFactory} from 'fake-indexeddb';
import registrations from '../netlify/functions/registrations.mjs';
import checkin from '../netlify/functions/check-in.mjs';
const source=await readFile(new URL('../public/offline.js',import.meta.url),'utf8');
let factory;
beforeEach(()=>{factory=new IDBFactory();globalThis.testDB=new Map([['event:party',{slug:'party',name:'Party',date:'2026-12-04',questionnaire:'internal'}],['checkin-access:party',{token:'staff-test'}]]);});
function client(fetch=()=>{throw Error('Network unavailable');}){const window=new EventTarget(),navigator={onLine:false};const context=vm.createContext({window,navigator,indexedDB:factory,crypto:webcrypto,Event,TextEncoder,Uint8Array,AbortSignal,structuredClone,fetch,setInterval:()=>0,setTimeout,clearTimeout,console});vm.runInContext(source,context);return {offline:window.WclOffline,navigator};}
const post=(handler,body,path,headers={})=>handler(new Request('https://test.local/.netlify/functions/'+path,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)}));
const payload=()=>({clientRequestId:webcrypto.randomUUID(),firstName:'Offline',lastName:'Guest',email:'guest@example.com',plusOneFirstName:'Plus',plusOneLastName:'One'});
test('offline entries survive browser reopening and a lost confirmation sync creates exactly one registration',async()=>{
 let attempts=0;const body=payload();const first=client();await first.offline.enqueue('registration','party',body);assert.equal((await first.offline.jobs()).length,1);
 const reopened=client(async(url,options)=>{const response=await post(registrations,JSON.parse(options.body),'registrations?slug=party');if(++attempts===1)throw Error('Connection dropped after saving');return response;});
 reopened.navigator.onLine=true;await reopened.offline.sync();assert.equal((await reopened.offline.jobs()).length,1);assert.equal([...testDB.keys()].filter(k=>k.startsWith('registration:')).length,1);
 await reopened.offline.sync();assert.equal((await reopened.offline.jobs()).length,0);assert.equal([...testDB.keys()].filter(k=>k.startsWith('registration:')).length,1);
 const saved=[...testDB.values()].find(r=>r.id===body.clientRequestId);assert.equal(saved.plusOneFirstName,'Plus');assert.equal((await reopened.offline.localRows('party')).length,1);
});
test('queue order is stable when offline check-in and undo happen within the same millisecond',async()=>{
 const c=client();const now=Date.now;const one=webcrypto.randomUUID(),two=webcrypto.randomUUID();
 try{Date.now=()=>1000;await c.offline.enqueue('checkin','party',{operationId:one,id:'row',person:'attendee',checked:true,baseVersion:''});await c.offline.enqueue('checkin','party',{operationId:two,id:'row',person:'attendee',checked:false,baseVersion:one});}finally{Date.now=now;}
 assert.deepEqual(Array.from(await c.offline.jobs(),j=>j.id),[one,two]);
});
test('rejected entries remain visible for review and are never silently discarded',async()=>{
 const c=client(async()=>Response.json({error:'Event not found.'},{status:404}));await c.offline.enqueue('registration','party',payload());c.navigator.onLine=true;await c.offline.sync();const jobs=await c.offline.jobs();assert.equal(jobs.length,1);assert.equal(jobs[0].needsReview,true);assert.match(jobs[0].error,/Event not found/);
});
test('registration request IDs prevent concurrent duplicates and reject changed payloads',async()=>{
 const body=payload();const results=await Promise.all([post(registrations,body,'registrations?slug=party'),post(registrations,body,'registrations?slug=party')]);assert.ok(results.every(r=>r.status===201));assert.equal([...testDB.keys()].filter(k=>k.startsWith('registration:')).length,1);
 const conflict=await post(registrations,{...body,email:'other@example.com'},'registrations?slug=party');assert.equal(conflict.status,409);
});
test('prepared check-in downloads the entire authorized roster and offline changes preserve guest counts',async()=>{
 for(let i=0;i<65;i++)testDB.set('registration:party:'+i,{id:String(i),firstName:'Guest',lastName:String(i),email:`g${i}@example.com`,...(i===0?{plusOneFirstName:'Plus',plusOneLastName:'One'}:{})});
 const req=path=>checkin(new Request('https://test.local/.netlify/functions/check-in?slug=party'+path,{headers:{'x-checkin-code':'staff-test'}}));
 const normal=await(await req('')).json(),full=await(await req('&offline=1')).json();assert.equal(normal.rows.length,50);assert.equal(full.rows.length,65);assert.equal(full.total,66);
 const row=full.rows.find(r=>r.guest),id=webcrypto.randomUUID(),body={operationId:id,id:row.id,person:'guest',checked:true,baseVersion:''};
 assert.equal((await post(checkin,body,'check-in?slug=party',{'x-checkin-code':'staff-test'})).status,200);assert.equal((await post(checkin,body,'check-in?slug=party',{'x-checkin-code':'staff-test'})).status,200);assert.equal((await(await req('')).json()).checked,1);
 const undo={...body,operationId:webcrypto.randomUUID(),checked:false,baseVersion:id};assert.equal((await post(checkin,undo,'check-in?slug=party',{'x-checkin-code':'staff-test'})).status,200);assert.equal((await(await req('')).json()).checked,0);
 const stale={...undo,operationId:webcrypto.randomUUID(),baseVersion:''};assert.equal((await post(checkin,stale,'check-in?slug=party',{'x-checkin-code':'staff-test'})).status,409);
 assert.equal((await post(checkin,{id:row.id,person:'guest',checked:true},'check-in?slug=party',{'x-checkin-code':'staff-test'})).status,200);assert.equal((await(await req('')).json()).checked,1);
 assert.equal((await checkin(new Request('https://test.local/check-in?slug=party&offline=1'))).status,403);
});
test('offline page cache ignores API requests, admin pages, POSTs and other origins',async()=>{
 const handlers={},self={location:{origin:'https://test.local'},addEventListener:(type,handler)=>handlers[type]=handler};vm.runInNewContext(await readFile(new URL('../public/offline-worker.js',import.meta.url),'utf8'),{self,URL,Response,fetch:async()=>{throw Error('offline');},caches:{open:async()=>({match:async()=>new Response('cached page')})}});
 for(const [url,method,mode] of [['https://test.local/.netlify/functions/check-in?slug=party','GET','cors'],['https://test.local/admin','GET','navigate'],['https://test.local/event/party','POST','navigate'],['https://third.test/event/party','GET','navigate']]){let used=false;handlers.fetch({request:{url,method,mode},respondWith:()=>used=true});assert.equal(used,false);}
 let result;handlers.fetch({request:{url:'https://test.local/event/party',method:'GET',mode:'navigate'},respondWith:r=>result=r});assert.equal(await(await result).text(),'cached page');
});
