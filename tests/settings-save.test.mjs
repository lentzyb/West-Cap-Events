import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import notifications from '../netlify/functions/notifications.mjs';
beforeEach(()=>{globalThis.testDB=new Map();Object.assign(process.env,{ADMIN_PASSWORD:'test-admin',EMAIL_PROVIDER:'gmail',GMAIL_USER:'test@gmail.com',GMAIL_APP_PASSWORD:'abcdefghijklmnop',NOTIFICATION_SECRET:'x'.repeat(40),NOTIFICATION_SITE_URL:'https://example.com'})});
const req=(body)=>new Request('https://example.com/notifications'+(body?'':'?view=settings'),{method:body?'POST':'GET',headers:{'x-admin-password':'test-admin','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
test('both On and Off settings persist and are returned by lightweight settings read',async()=>{for(const enabled of [true,false,true]){for(const action of ['settings','report-settings']){const r=await notifications(req({action,enabled,hour:14,timeZone:'America/New_York',email:'brian@example.com'}));assert.equal(r.status,200);assert.equal((await r.json()).settings.enabled,enabled)}const saved=await (await notifications(req())).json();assert.equal(saved.settings.enabled,enabled);assert.equal(saved.reportSettings.enabled,enabled);assert.equal(saved.reportSettings.email,'brian@example.com');assert.equal(saved.settings.hour,14);assert.deepEqual(Object.keys(saved).sort(),['reportSettings','settings']);}});
test('HTML timeouts, including HTTP 200, cannot be treated as successful saves',async()=>{const source=readFileSync(new URL('../public/admin.js',import.meta.url),'utf8');const fn=source.slice(source.indexOf('async function api('),source.indexOf('\nconst esc='));for(const status of [200,504]){const ctx=vm.createContext({authHeaders:()=>({}),fetch:async()=>new Response('<HTML>Inactivity Timeout</HTML>',{status,headers:{'content-type':'text/html'}})});vm.runInContext(fn,ctx);await assert.rejects(()=>ctx.api('/notifications',{method:'POST',body:'{}'}),/timed out or returned an unexpected response/);}});
test('delivery status loads without scanning candidate or Bonzo message bodies',async()=>{
 globalThis.testDB.set('followup:unreadable',()=>{throw Error('Candidate body should not be read')});
 globalThis.testDB.set('bonzo-message:unreadable',()=>{});
 globalThis.testDB.set('recruiter-request:pending',{id:'pending',status:'pending',createdAt:'2026-11-18T15:00:00Z'});
 globalThis.testDB.set('notification-worker:status',{status:'failed',error:'Check worker logs'});
 const response=await notifications(new Request('https://example.com/notifications?view=status',{headers:{'x-admin-password':'test-admin'}}));
 assert.equal(response.status,200);const result=await response.json();assert.deepEqual(result.rows,[]);assert.equal(result.requests.length,1);assert.equal(result.worker.status,'failed');
});
test('bulk candidate recovery reuses a snapshot and preserves registration priority',async()=>{
 const {queueCandidate}=await import('../netlify/functions/_notifications.mjs');const known=[];
 const candidate={id:'first',eventSlug:'test',eventName:'Test',recruiterId:'recruiter',email:'person@example.com',firstName:'Person',sourceType:'registration'};
 await queueCandidate(candidate,known);assert.equal(known.length,1);
 globalThis.testDB.set('followup:unreadable',()=>{});
 const duplicate=await queueCandidate({...candidate,id:'imported',sourceType:'imported'},known);
 assert.equal(duplicate.reason,'existing registration takes priority');assert.equal(known.length,1);
 const again=await queueCandidate(candidate,known);assert.equal(again.id,known[0].id);
});
