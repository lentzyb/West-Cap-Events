/* Local queues are opt-in per device. No admin credentials or API responses enter the service-worker cache. */
(()=>{
'use strict';
const DB='wcl-event-offline-v1',DAY=86400000,MAX_AGE=7*DAY;
let database,activeSync;
const signal=()=>window.dispatchEvent(new Event('wcl-offline-change'));
async function db(){if(database)return database;database=await new Promise((resolve,reject)=>{const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>req.result.createObjectStore('records');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(Error('Device storage is unavailable. Use a regular browser with storage enabled.'));});return database;}
async function transact(mode,action){const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction('records',mode),store=tx.objectStore('records');let result;try{const req=action(store);if(req)req.onsuccess=()=>{result=req.result;};}catch(error){tx.abort();reject(error);return;}tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(Error('Could not save on this device. Free storage before continuing.'));tx.onabort=()=>reject(Error('Device storage write did not finish.'));});}
const get=key=>transact('readonly',s=>s.get(key)),set=(key,value)=>transact('readwrite',s=>s.put(value,key)),del=key=>transact('readwrite',s=>s.delete(key));
async function jobs(){return (await transact('readonly',s=>s.getAll())).filter(v=>v?.kind==='job').sort((a,b)=>(a.sequence||0)-(b.sequence||0)||a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));}
async function prepared(kind,slug){const data=await get('prepared:'+kind+':'+slug);return data&&Date.now()-data.preparedAt<MAX_AGE?data:null;}
async function prepare(kind,slug,data){
 if(!('serviceWorker' in navigator))throw Error('Offline mode requires a browser that supports service workers.');
 await navigator.serviceWorker.register('/offline-worker.js');const registration=await navigator.serviceWorker.ready;
 await new Promise((resolve,reject)=>{const channel=new MessageChannel(),timer=setTimeout(()=>reject(Error('Offline page download timed out. Reconnect and prepare again.')),30000);channel.port1.onmessage=e=>{clearTimeout(timer);e.data?.ok?resolve():reject(Error('Could not download the offline pages.'));};registration.active.postMessage({type:'prepare'},[channel.port2]);});
 await set('prepared:'+kind+':'+slug,{kind:'prepared',...data,preparedAt:Date.now()});
 try{await navigator.storage?.persist?.();}catch{}
 signal();
}
async function localRows(slug){return (await transact('readonly',s=>s.getAll())).filter(v=>v?.kind==='local-row'&&v.slug===slug).map(v=>v.row);}
async function enqueue(type,slug,payload,extra={}){const id=payload.clientRequestId||payload.operationId||crypto.randomUUID();const job={kind:'job',id,type,slug,payload,...extra,createdAt:new Date().toISOString()};let local;
 if(type==='registration'){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('registration:'+id));const rowId=[...new Uint8Array(bytes)].map(n=>n.toString(16).padStart(2,'0')).join('');local={kind:'local-row',slug,row:{id:rowId,name:[payload.firstName,payload.lastName].join(' '),guest:[payload.plusOneFirstName,payload.plusOneLastName].filter(Boolean).join(' '),phoneLast4:String(payload.phone||'').replace(/\D/g,'').slice(-4),attendeeAt:'',guestAt:'',attendeeVersion:'',guestVersion:'',localPending:true}};}
 const database=await db();await new Promise((resolve,reject)=>{const tx=database.transaction('records','readwrite'),s=tx.objectStore('records'),counter=s.get('queue-sequence');counter.onsuccess=()=>{job.sequence=(counter.result?.value||0)+1;s.put({kind:'counter',value:job.sequence},'queue-sequence');s.put(job,'job:'+id);if(local)s.put(local,'local-row:'+slug+':'+id);};tx.oncomplete=resolve;tx.onerror=()=>reject(Error('Could not save on this device.'));tx.onabort=()=>reject(Error('Device storage write did not finish.'));});
 signal();return job;}
async function sync(){
 if(activeSync)return activeSync;
 activeSync=(async()=>{
  if(navigator.onLine===false)return;
  const run=async()=>{
   // Shared tabs use a transactional lease; reopening or retrying a request keeps its stable ID.
   const database=await db(),owner=crypto.randomUUID();let claimed=false;
   await new Promise((resolve,reject)=>{const tx=database.transaction('records','readwrite'),s=tx.objectStore('records'),r=s.get('sync-lease');r.onsuccess=()=>{if(!r.result||r.result.until<Date.now()){s.put({kind:'lease',owner,until:Date.now()+60000},'sync-lease');claimed=true;}};tx.oncomplete=resolve;tx.onerror=reject;});
   if(!claimed)return;
   try{const all=await jobs();all.sort((a,b)=>(a.type==='registration'?0:1)-(b.type==='registration'?0:1)||(a.sequence||0)-(b.sequence||0)||a.createdAt.localeCompare(b.createdAt));
    for(const job of all){
     if(navigator.onLine===false)break;
     await set('sync-lease',{kind:'lease',owner,until:Date.now()+60000});
     if(job.needsReview)continue;
     const endpoint=job.type==='registration'?'registrations':'check-in';
     try{const response=await fetch('/.netlify/functions/'+endpoint+'?slug='+encodeURIComponent(job.slug),{method:'POST',headers:{'content-type':'application/json',...(job.type==='checkin'?{'x-checkin-code':job.token}:{})},body:JSON.stringify(job.payload),signal:AbortSignal.timeout(25000)});let body;try{body=await response.json();}catch{throw Error('No server confirmation received; saved locally for retry.');}
      if(!response.ok){const error=Error(body.error||'Sync was not accepted.');error.permanent=response.status>=400&&response.status<500&&![408,429].includes(response.status);throw error;}
      if(body.ok!==true)throw Error('No server confirmation received; saved locally for retry.');
      await set('receipt:'+job.id,{kind:'receipt',id:job.id,slug:job.slug,type:job.type,at:new Date().toISOString()});await del('job:'+job.id);signal();
     }catch(error){await set('job:'+job.id,{...job,error:error.message,needsReview:!!error.permanent});signal();if(!error.permanent)break;}
    }
   }finally{const lease=await get('sync-lease');if(lease?.owner===owner)await del('sync-lease');}
  };
  if(navigator.locks?.request)await navigator.locks.request('wcl-offline-sync',run);else await run();
 })().finally(()=>{activeSync=null;signal();});return activeSync;
}
async function panel(host,kind,slug,prepareAction){
 const box=document.createElement('section');box.style.cssText='padding:16px;margin:16px 0;border:1px solid #b9c8d3;border-radius:12px;background:#f3f6f9;color:#19354e';
 const title=document.createElement('strong'),status=document.createElement('p'),ready=document.createElement('button'),send=document.createElement('button'),review=document.createElement('div');
 title.textContent='Shared-device offline mode';ready.type=send.type='button';ready.textContent='Prepare this device for offline use';send.textContent='Sync saved entries';send.style.margin='8px';box.append(title,status,ready,send,review);host.append(box);
 let generation=0;
 async function render(){const current=++generation;try{const saved=await prepared(kind,slug),pending=(await jobs()).filter(j=>j.slug===slug);if(current!==generation)return;
  status.textContent=(saved?'Prepared '+new Date(saved.preparedAt).toLocaleString()+'. ':'Not prepared yet. Prepare online within 7 days of the event. ')+(navigator.onLine===false?'Offline. ':'Online. ')+pending.length+' entry(s) saved on this device awaiting sync. '+(pending.some(j=>j.needsReview)?'Some entries need staff attention.':'');
  ready.disabled=navigator.onLine===false;send.disabled=!pending.length||navigator.onLine===false;
  review.replaceChildren();for(const job of pending.filter(j=>j.error)){const line=document.createElement('p');line.textContent=(job.type==='registration'?[job.payload.firstName,job.payload.lastName].join(' '):'Check-in')+': '+job.error;review.append(line);if(job.needsReview){const remove=document.createElement('button');remove.type='button';remove.textContent='Discard this unsynced entry';remove.onclick=async()=>{if(!confirm('Discard this saved entry? It has not synced. Keep a separate record before discarding a registration.'))return;await del('job:'+job.id);if(job.type==='registration')await del('local-row:'+job.slug+':'+job.id);signal();};review.append(remove);}}
 }catch(error){status.textContent=error.message;}}
 ready.onclick=async()=>{ready.disabled=true;status.textContent='Downloading this event for offline use…';try{await prepareAction();await render();status.textContent+=' Keep using this browser. Do not clear its data until all entries sync. Each prepared device works independently while offline.';}catch(error){status.textContent=error.message;}finally{ready.disabled=navigator.onLine===false;}};
 send.onclick=async()=>{send.disabled=true;await sync();await render();};window.addEventListener('wcl-offline-change',render);window.addEventListener('online',()=>{render();sync();});window.addEventListener('offline',render);await render();return {render,box};
}
window.WclOffline={get,set,del,jobs,localRows,prepared,prepare,enqueue,sync,panel};
window.addEventListener('online',sync);setInterval(()=>{if(!document.hidden)sync();},30000);
})();
