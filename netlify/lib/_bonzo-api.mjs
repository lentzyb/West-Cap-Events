import {messageDirection,directionDescription,directionBasis} from './_bonzo-message.mjs';
export {messageDirection} from './_bonzo-message.mjs';
import crypto from 'node:crypto';
import {store,listAll} from './_shared.mjs';
const email=v=>String(v||'').trim().toLowerCase();
const phone=v=>{const d=String(v||'').replace(/\D/g,'');return d.length===11&&d[0]==='1'?d.slice(1):d};
export const lookupRevision=6;
export const successfulStatus=(type,status)=>['sent','delivered','completed'].includes(status)||(type==='call'&&status==='answered');
export const apiEnabled=()=>Boolean(process.env.BONZO_API_TOKEN?.trim());
export const lookupKey=row=>'bonzo-lookup:'+crypto.createHash('sha256').update(JSON.stringify([email(row.email),phone(row.phone),row.eventSlug,row.recruiterId||''])).digest('hex');
const exact=(row,p)=>{const e=email(row.email),f=phone(row.phone),pe=email(p.email),pf=phone(p.phone);return Boolean((e&&e===pe)||(f.length>=10&&f===pf))&&(!e||!pe||e===pe)&&(!(f.length>=10&&pf.length>=10)||f===pf)};
async function get(path,collection=true,{owner}={}){
 const cooldown=await store().get('bonzo-api:cooldown',{type:'json'});if(cooldown?.until>Date.now())throw Error(cooldown.error);
 let response;try{response=await fetch('https://app.getbonzo.com/api/v3/'+path,{method:'GET',redirect:'error',headers:{accept:'application/json',authorization:'Bearer '+process.env.BONZO_API_TOKEN.trim(),...(owner?{'On-Behalf-Of':owner}:{})},signal:AbortSignal.timeout(20000)});}catch(error){throw Error(error.name==='TimeoutError'||error.name==='AbortError'?'Bonzo request timed out.':'Bonzo connection failed or redirected.');}
 if(response.status===403&&owner){const error=Error('Recruiter-scoped API access is unavailable.');error.ownerScopeDenied=true;throw error;}
 if(!response.ok){const error=response.status===401?'Bonzo rejected the API token.':response.status===403?'Bonzo API permission or account access is missing.':response.status===429?'Bonzo rate limit reached. Try again later.':'Bonzo lookup failed (HTTP '+response.status+').';if([401,403,429].includes(response.status))await store().setJSON('bonzo-api:cooldown',{until:Date.now()+60000,error});throw Error(error);}
 let body;try{body=await response.json();}catch{throw Error('Bonzo returned a non-JSON response.');}if(collection?!Array.isArray(body.data):!body.data||Array.isArray(body.data)||typeof body.data!=='object')throw Error('Bonzo returned an unexpected response.');return body;
}
function hasNext(body,page){if(body.links&&Object.hasOwn(body.links,'next'))return Boolean(body.links.next);if(Number.isInteger(body.meta?.last_page))return page<body.meta.last_page;throw Error('Bonzo pagination could not be verified.');}
const directKey=row=>'bonzo-direct:'+lookupKey(row).slice('bonzo-lookup:'.length);
export function prospectId(value){
 const text=String(value||'').trim();if(/^\d{1,20}$/.test(text))return text;
 try{const url=new URL(text);if(url.protocol==='https:'&&['platform.getbonzo.com','app.getbonzo.com'].includes(url.hostname)&&!url.username&&!url.password){const match=url.pathname.match(/^\/prospect\/(\d{1,20})\/?$/);if(match)return match[1];}}catch{}
 throw Error('Enter a Bonzo prospect URL or numeric prospect ID.');
}
export async function verifyDirectProspect(row,value){
 if(!apiEnabled())throw Error('The Bonzo API token is not configured.');
 const id=prospectId(value),body=await get('prospects/'+id,false),p=body.data;
 if(String(p.id)!==id||!exact(row,p))throw Error('This Bonzo record does not exactly match the candidate contact details. No link was saved.');
 await store().setJSON(directKey(row),{prospectId:id});
 // Revalidate the linked record on the next check; do not reuse a previous no-match cache.
 await store().setJSON(lookupKey(row),{phase:'direct',page:1,prospects:[],prospect:0,reviewed:0,complete:false});
 return {ok:true};
}
// Recover IDs only from this candidate's contact index; never scan global history.
async function indexedProspects(row){
 const db=store(),keys=new Set(),ids=new Set();
 for(const [kind,value] of [['email',email(row.email)],['phone',phone(row.phone)]]){
  if(!value||(kind==='phone'&&value.length<10))continue;
  const prefix='bonzo-contact:'+crypto.createHash('sha256').update(kind+':'+value).digest('hex')+':';
  const page=await db.list({prefix});for(const blob of page.blobs||[])keys.add(blob.key);
 }
 // The index is a discovery hint, never proof of present identity or outreach.
 const entries=[...keys].slice(0,200);
 for(let offset=0;offset<entries.length;offset+=12)await Promise.all(entries.slice(offset,offset+12).map(async key=>{const pointer=await db.get(key,{type:'json'});if(!pointer?.messageKey?.startsWith('bonzo-message:'))return;const m=await db.get(pointer.messageKey,{type:'json'});if(m&&exact(row,m)&&/^\d+$/.test(String(m.prospectId)))ids.add(String(m.prospectId));}));
 return [...ids].slice(0,10);
}
// One bounded API page per step; only exact contacts can lead to message requests.
async function advanceLookup(row,save,boundary){
 const db=store(),key=lookupKey(row),prior=await db.get(key,{type:'json'});
 if(prior?.revision===lookupRevision&&prior.complete&&(boundary===undefined||prior.boundary===boundary)&&Date.now()-Date.parse(prior.checkedAt)<10*60000)return prior;
 let state=prior?.revision===lookupRevision&&!prior.complete&&!prior.error&&(boundary===undefined||prior.boundary===boundary)?prior:{phase:'search',term:0,page:1,prospects:[],prospect:0,reviewed:0,complete:false,boundary,revision:lookupRevision,directions:{outgoing:0,incoming:0,other:0},ownerScopeDenied:prior?.ownerScopeDenied===true};
 const linked=await db.get(directKey(row),{type:'json'});if(state.phase==='search'&&state.term===0&&state.page===1&&!state.indexChecked){state.indexChecked=true;if(linked)state.phase='direct';else {state.indexIds=await indexedProspects(row);state.indexCursor=0;if(state.indexIds.length)state.phase='indexed';}}
 const terms=[email(row.email),phone(row.phone).length>=10?phone(row.phone):''].filter(Boolean);
 try{
  if(!terms.length)throw Error('Candidate needs an email or phone number.');
  if(state.phase==='direct'){
   if(!linked?.prospectId)throw Error('Direct Bonzo link is unavailable.');
   const body=await get('prospects/'+prospectId(linked.prospectId),false),p=body.data;
   if(String(p.id)!==linked.prospectId||!exact(row,p))throw Error('Linked Bonzo record no longer matches this candidate.');
   state={...state,phase:'messages',prospects:[{id:String(p.id),email:email(p.email),phone:phone(p.phone),business:p.business?.id||''}],page:1,prospect:0,boundary};
  }else if(state.phase==='indexed'){
   const id=state.indexIds[state.indexCursor],body=await get('prospects/'+id,false),p=body.data;
   if(String(p.id)===id&&exact(row,p)&&!state.prospects.some(x=>x.id===id))state.prospects.push({id,email:email(p.email),phone:phone(p.phone),business:p.business?.id||''});
   state.indexCursor++;if(state.indexCursor>=state.indexIds.length)state.phase=state.prospects.length?'messages':'search';
  }else if(state.phase==='search'){
   const recruiter=row.recruiterId?await db.get('recruiter:'+row.recruiterId,{type:'json'}):null;
   const owner=state.ownerScopeDenied?undefined:recruiter?.email;
   let body;try{body=await get('prospects?'+new URLSearchParams({search:terms[state.term],...(owner?{}:{show_all:'1'}),defer_count:'1',exact_count:'0',per_page:'25',page:String(state.page)}),true,{owner});}
   catch(error){if(!error.ownerScopeDenied)throw error;state.ownerScopeDenied=true;state={...state,lookupKey:key,checkedAt:new Date().toISOString()};await db.setJSON(key,state);return state;}
   for(const p of body.data){if(exact(row,p)&&/^\d+$/.test(String(p.id))&&!state.prospects.some(x=>x.id===String(p.id)))state.prospects.push({id:String(p.id),email:email(p.email),phone:phone(p.phone),business:p.business?.id||''});}
   if(hasNext(body,state.page)){if(state.page>=5)throw Error('Candidate search is too broad; lookup is incomplete.');state.page++;}
   else{state.term++;state.page=1;if(state.term>=terms.length){state.phase='messages';if(!state.prospects.length)state={...state,complete:true,outcome:'no_match'};}}
  }else{
   const p=state.prospects[state.prospect];
   const body=await get('prospects/'+p.id+'/messages?page='+state.page);
   for(const m of body.data){
    state.reviewed++;const normalized=messageDirection(m),direction=normalized==='unknown'?'other':normalized;state.directionSamples||=[];const sample=directionDescription(m);if(!state.directionSamples.includes(sample)&&state.directionSamples.length<5)state.directionSamples.push(sample);state.directions||={outgoing:0,incoming:0,other:0};state.directions[direction]++;const created=Date.parse(m.created_at);if(Number.isFinite(created)&&(!state.newestAt||created>Date.parse(state.newestAt)))state.newestAt=new Date(created).toISOString();
    if(String(m.prospect_id)!==p.id)throw Error('Bonzo returned a message for a different prospect.');
    if(normalized==='outgoing')try{await save({event:'messages.outgoing.updated',prospect:{id:p.id,email:p.email,phone:p.phone,business:{id:p.business}},additional:{message:{...m,direction:normalized,_directionBasis:directionBasis(m)}}});}catch(error){throw Error(error.message==='Invalid message timestamp.'?'Bonzo message timestamp is missing, ambiguous or invalid.':error.message==='Missing message or prospect ID.'?'Bonzo message identifier is missing.':error.message==='Conflicting prospect IDs.'?'Bonzo message prospect identifier conflicts.':'Saving Bonzo message metadata failed.');}
   }
   const confirmed=Number.isFinite(boundary)&&body.data.some(m=>{const created=Date.parse(m.created_at),sent=m.send_at?Date.parse(m.send_at):created;return messageDirection(m)==='outgoing'&&successfulStatus(m.type,m.status)&&!m.error_message&&['sms','email','call','voicemail'].includes(m.type)&&Math.max(created,sent)>boundary&&Math.max(created,sent)<=Date.now();});
   if(confirmed)state={...state,complete:true,confirmed:true,outcome:'found'};
   else if(hasNext(body,state.page)){if(state.page>=100)throw Error('Candidate message history exceeded the lookup limit. Check is incomplete.');state.page++;}
   else{state.prospect++;state.page=1;if(state.prospect>=state.prospects.length)state={...state,complete:true,outcome:'found'};}
  }
  if(state.complete&&state.directions?.other>0&&state.outcome==='found'&&!state.confirmed){state.complete=false;state.error='Bonzo direction is unrecognized: '+(state.directionSamples||[]).join('; ')+'. Outreach remains unverified.';}
  state={...state,lookupKey:key,checkedAt:new Date().toISOString()};await db.setJSON(key,state);return state;
 }catch(error){state={...state,lookupKey:key,complete:false,error:['Direct Bonzo link is unavailable.','Linked Bonzo record no longer matches this candidate.','Bonzo rejected the API token.','Bonzo API permission or account access is missing.','Bonzo rate limit reached. Try again later.','Candidate needs an email or phone number.','Candidate search is too broad; lookup is incomplete.','Bonzo returned a message for a different prospect.','Candidate message history exceeded the lookup limit. Check is incomplete.','Bonzo pagination could not be verified.','Bonzo returned an unexpected response.','Bonzo request timed out.','Bonzo connection failed or redirected.','Bonzo returned a non-JSON response.','Bonzo message timestamp is missing, ambiguous or invalid.','Bonzo message identifier is missing.','Bonzo message prospect identifier conflicts.','Saving Bonzo message metadata failed.'].includes(error.message)||/^Bonzo lookup failed \(HTTP [1-5][0-9]{2}\)\.$/.test(error.message)?error.message:'Bonzo check could not finish. Please retry.',checkedAt:new Date().toISOString()};state.error+=' Stage: '+(['direct','indexed'].includes(state.phase)?'direct prospect access':state.phase==='search'?'candidate search':'candidate messages')+'.';await db.setJSON(key,state);return state;}
}
export async function lookupStep(row,save,boundary){
 const db=store(),key='bonzo-api-lease:'+lookupKey(row).slice('bonzo-lookup:'.length),prior=await db.getWithMetadata(key,{type:'json'});
 if(prior?.data?.expiresAt>Date.now())return {busy:true,complete:false,reviewed:0};
 const lease={owner:crypto.randomUUID(),expiresAt:Date.now()+60000};
 if(!(await db.setJSON(key,lease,prior?{onlyIfMatch:prior.etag}:{onlyIfNew:true})).modified)return {busy:true,complete:false,reviewed:0};
 try{return await advanceLookup(row,save,boundary);}finally{const current=await db.getWithMetadata(key,{type:'json'});if(current?.data?.owner===lease.owner)await db.setJSON(key,{...lease,expiresAt:0},{onlyIfMatch:current.etag});}
}
export async function refreshEventCandidates(save,eventEnd,messages=[],outreachState=()=>({}),{budgetMs=4*60000}={}){
 if(!apiEnabled())return {remaining:0,checked:0};
 const db=store(),leaseKey='bonzo-refresh:lease',prior=await db.getWithMetadata(leaseKey,{type:'json'});
 if(prior?.data?.expiresAt>Date.now())return {busy:true,remaining:0,checked:0};
 const lease={owner:crypto.randomUUID(),expiresAt:Date.now()+6*60000};
 if(!(await db.setJSON(leaseKey,lease,prior?{onlyIfMatch:prior.etag}:{onlyIfNew:true})).modified)return {busy:true,remaining:0,checked:0};
 try{
 const [rows,events,checks]=await Promise.all([listAll('followup:'),listAll('event:'),listAll('bonzo-lookup:')]);
 const eventMap=new Map(events.map(e=>[e.slug,e])),checkMap=new Map(checks.map(c=>[c.lookupKey,c]));
 const external=new Set(events.filter(e=>!e.archived&&e.questionnaire!=='internal'&&eventEnd(e)!==null&&eventEnd(e)<=Date.now()).map(e=>e.slug));
 const unique=[...new Map(rows.filter(r=>!r.importRemoved&&external.has(r.eventSlug)&&!outreachState(r,eventMap.get(r.eventSlug),messages).contactedAt).map(r=>[lookupKey(r),r])).values()];
 // Unchecked candidates go first; a slow or failing search cannot starve the tail forever.
 unique.sort((a,b)=>(Date.parse(checkMap.get(lookupKey(a))?.checkedAt)||0)-(Date.parse(checkMap.get(lookupKey(b))?.checkedAt)||0));
 const deadline=Date.now()+budgetMs;let checked=0,offset=0;
 for(;offset<unique.length&&Date.now()<deadline;offset+=3){await Promise.all(unique.slice(offset,offset+3).map(async row=>{let result;do{result=await lookupStep(row,save,eventEnd(eventMap.get(row.eventSlug)));if(result.busy)break;}while(!result.complete&&!result.error&&Date.now()<deadline);checked++;}));}
 const result={remaining:Math.max(0,unique.length-offset),checked,total:unique.length,at:new Date().toISOString()};await db.setJSON('bonzo-refresh:latest',result);return result;
 }finally{const current=await db.getWithMetadata(leaseKey,{type:'json'});if(current?.data?.owner===lease.owner)await db.setJSON(leaseKey,{...lease,expiresAt:0},{onlyIfMatch:current.etag});}
}
