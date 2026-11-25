import crypto from 'node:crypto';
import {store,registrationPrefix,readEvent} from './_shared.mjs';
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const rowId=id=>crypto.createHash('sha256').update('registration:'+id).digest('hex');
const text=v=>String(v||'').trim();
const name=v=>text(v).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const email=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(v))?text(v).toLowerCase():'';
const phone=v=>{let n=text(v).replace(/\D/g,'');if(n.length===11&&n[0]==='1')n=n.slice(1);return n.length>=10&&!/^(\d)\1+$/.test(n)?n:'';};
export const mergeLeaseKey=slug=>'registration-merge-lease:'+slug;
export async function registrationMergeBusy(slug){return (await store().get(mergeLeaseKey(slug),{type:'json'}))?.until>Date.now();}
async function rawRecords(slug){const db=store(),keys=[];let cursor;do{const page=await db.list(cursor?{prefix:registrationPrefix(slug),cursor}:{prefix:registrationPrefix(slug)});keys.push(...(page.blobs||[]).map(b=>b.key));cursor=page.cursor;}while(cursor);const rows=[];for(let offset=0;offset<keys.length;offset+=8)await Promise.all(keys.slice(offset,offset+8).map(async key=>{const current=await db.getWithMetadata(key,{type:'json'});if(current&&!current.data.mergedInto)rows.push({key,...current});}));return rows;}
function assess(records){
 const conflicts=[];if(records.length>20)conflicts.push('Large duplicate group; manual review required');
 const unique=fn=>new Set(records.map(r=>fn(r.data)).filter(Boolean));
 if(unique(r=>name(r.firstName)+'|'+name(r.lastName)).size!==1||records.some(r=>!name(r.data.firstName)||!name(r.data.lastName)))conflicts.push('Attendee names differ');
 for(const [label,fn] of [['email addresses',r=>email(r.email)],['phone numbers',r=>phone(r.phone)],['NMLS IDs',r=>text(r.nmlsId)],['assigned team members',r=>text(r.recruiterId)],['plus-ones',r=>[name(r.plusOneFirstName),name(r.plusOneLastName)].join('|')==='|'?'':[name(r.plusOneFirstName),name(r.plusOneLastName)].join('|')]])if(unique(fn).size>1)conflicts.push('Conflicting '+label);
 if(records.some(r=>Boolean(text(r.data.plusOneFirstName))!==Boolean(text(r.data.plusOneLastName))))conflicts.push('Incomplete plus-one names');
 return conflicts;
}
function groupRecords(records){
 const parent=records.map((_,i)=>i),find=i=>parent[i]===i?i:parent[i]=find(parent[i]);const contacts=new Map();
 records.forEach((record,i)=>{for(const key of [email(record.data.email)&&'e:'+email(record.data.email),phone(record.data.phone)&&'p:'+phone(record.data.phone)].filter(Boolean)){if(contacts.has(key))parent[find(i)]=find(contacts.get(key));else contacts.set(key,i);}});
 const groups=new Map();records.forEach((record,i)=>{const root=find(i);if(!groups.has(root))groups.set(root,[]);groups.get(root).push(record);});
 const safe=[],review=[];
 for(const group of groups.values())if(group.length>1){const conflicts=assess(group);(conflicts.length?review:safe).push({records:group,conflicts});}
 // A name alone can be a clue for review, never sufficient proof for a merge.
 const names=new Map();records.forEach((r,i)=>{const key=name(r.data.firstName)+'|'+name(r.data.lastName);if(key==='|')return;if(!names.has(key))names.set(key,[]);names.get(key).push({r,root:find(i)});});
 for(const group of names.values())if(new Set(group.map(x=>x.root)).size>1)review.push({records:group.map(x=>x.r),conflicts:['Same name with different contact details; review required']});
 return {safe,review};
}
function publicGroup(group){return {attendee:[group.records[0].data.firstName,group.records[0].data.lastName].filter(Boolean).join(' '),records:group.records.length,reasons:group.conflicts};}
export async function duplicatePreview(slug){const records=await rawRecords(slug),groups=groupRecords(records);return {scanned:records.length,safeGroups:groups.safe.map(publicGroup),review:groups.review.map(publicGroup)};}
async function lock(slug,run){const db=store(),key=mergeLeaseKey(slug),old=await db.getWithMetadata(key,{type:'json'});if(old?.data.until>Date.now())throw Error('A registration scrub is already running. Refresh shortly.');const lease={owner:crypto.randomUUID(),until:Date.now()+4*60000};if(!(await db.setJSON(key,lease,old?{onlyIfMatch:old.etag}:{onlyIfNew:true})).modified)throw Error('A registration scrub is already running.');try{return await run();}finally{const current=await db.getWithMetadata(key,{type:'json'});if(current?.data.owner===lease.owner)await db.setJSON(key,{...lease,until:0},{onlyIfMatch:current.etag});}}
async function applyChange(db,change){const current=await db.getWithMetadata(change.key,{type:'json'});if(digest(current?.data??null)!==digest(change.before))throw Error('Registration or attendance changed during the scrub. Refresh and retry.');const result=await db.setJSON(change.key,change.after,current?{onlyIfMatch:current.etag}:{onlyIfNew:true});if(!result.modified)throw Error('A record changed during the scrub. Refresh and retry.');}
async function restoreChange(db,change){const current=await db.getWithMetadata(change.key,{type:'json'});if(digest(current?.data??null)!==digest(change.after))throw Error('Records changed after this merge. Review them before undoing.');if(change.before===null)await db.delete(change.key);else if(!(await db.setJSON(change.key,change.before,{onlyIfMatch:current.etag})).modified)throw Error('A record changed during undo.');}
export async function mergeDuplicates(slug,{batchId:requestedBatchId,maxGroups=3}={}){
 const event=await readEvent(slug);if(!event||event.questionnaire!=='internal')throw Error('Automatic merging is available for internal event registrations only.');
 return lock(slug,async()=>{
 const db=store(),records=await rawRecords(slug),groups=groupRecords(records),latest=await db.get('registration-merge-latest:'+slug,{type:'json'});
 const batchId=requestedBatchId||(latest?.status==='running'?latest.id:crypto.randomUUID()),batchKey='registration-merge-backup:'+slug+':'+batchId;
 const previous=await db.get(batchKey,{type:'json'});
 if(previous&&!['running','completed'].includes(previous.status))throw Error('The previous scrub needs review before continuing.');
 const batch=previous||{id:batchId,slug,eventName:event.name,status:'running',at:new Date().toISOString(),scanned:records.length,removedDuplicates:0,mergedGroups:0,review:groups.review.map(publicGroup),changes:[]};
 if(batch.slug!==slug)throw Error('Merge batch belongs to a different event.');
 const summary=remainingGroups=>({ok:true,batchId,id:batchId,status:batch.status,at:batch.at,scanned:batch.scanned,mergedGroups:batch.mergedGroups,removedDuplicates:batch.removedDuplicates,review:batch.review,remainingGroups});
 if(batch.status==='completed')return summary(0);
 await db.setJSON(batchKey,batch);await db.setJSON('registration-merge-latest:'+slug,summary(groups.safe.length));
 let processed=0;
 for(const group of groups.safe.slice(0,maxGroups)){
  const sorted=group.records.sort((a,b)=>String(a.data.createdAt||'').localeCompare(String(b.data.createdAt||''))||a.key.localeCompare(b.key)),keep=sorted[0],others=sorted.slice(1),next={...keep.data};
  for(const source of sorted)for(const field of ['firstName','lastName','email','phone','nmlsId','plusOneFirstName','plusOneLastName','recruiterId','referredBy'])if(!text(next[field])&&text(source.data[field]))next[field]=source.data[field];
  next.mergedRegistrationIds=[...new Set([...(next.mergedRegistrationIds||[]),...others.flatMap(r=>[r.data.id,...(r.data.mergedRegistrationIds||[])])])];next.updatedAt=new Date().toISOString();next.mergeBatchId=batchId;
  const changes=[{key:keep.key,before:keep.data,after:next}];
  for(const source of others)changes.push({key:source.key,before:source.data,after:{...source.data,mergedInto:keep.data.id,mergeBatchId:batchId,mergedAt:new Date().toISOString()}});
  const primary=rowId(keep.data.id);
  for(const source of others){const oldId=rowId(source.data.id);if(oldId===primary)continue;const key='registration-merge-alias:'+slug+':'+oldId;changes.push({key,before:await db.get(key,{type:'json'}),after:{id:oldId,targetRowId:primary,batchId}});}
  for(const person of ['attendee','guest']){
   if(person==='guest'&&!next.plusOneFirstName)continue;
   const values=[];for(const source of sorted){const key=`checkin:${slug}:${rowId(source.data.id)}:${person}`,value=await db.get(key,{type:'json'});if(value)values.push(value);}
   if(!values.length)continue;
   values.sort((a,b)=>String(b.at||'').localeCompare(String(a.at||''))||Number(a.checked!==false)-Number(b.checked!==false));
   const key=`checkin:${slug}:${primary}:${person}`;changes.push({key,before:await db.get(key,{type:'json'}),after:{...values[0],id:primary,person,version:crypto.randomUUID()}});
  }
  // Persist originals and intended writes before changing any live record.
  const start=batch.changes.length;batch.changes.push(...changes);await db.setJSON(batchKey,batch);let applied=0;
  try{for(const change of changes){await applyChange(db,change);applied++;}batch.mergedGroups++;batch.removedDuplicates+=others.length;processed++;}
  catch(error){let rollbackFailed=false;for(const change of changes.slice(0,applied).reverse())try{await restoreChange(db,change);}catch{rollbackFailed=true;}batch.status=rollbackFailed?'needs_review':'stopped';batch.error=error.message;batch.changes=batch.changes.slice(0,start+(rollbackFailed?applied:0));await db.setJSON(batchKey,batch);await db.setJSON('registration-merge-latest:'+slug,summary(groups.safe.length-processed));throw Error(rollbackFailed?'Scrub paused after a concurrent change. Originals are backed up; review the batch before continuing.':error.message);}
  await db.setJSON(batchKey,batch);
 }
 const remainingGroups=Math.max(0,groups.safe.length-processed);batch.status=remainingGroups?'running':'completed';batch.review=groups.review.map(publicGroup);await db.setJSON(batchKey,batch);const result=summary(remainingGroups);await db.setJSON('registration-merge-latest:'+slug,result);
 return result;
 });
}
export async function undoMerge(slug,id){return lock(slug,async()=>{const db=store(),key='registration-merge-backup:'+slug+':'+id,batch=await db.get(key,{type:'json'});if(!batch||!['completed','stopped'].includes(batch.status))throw Error('This batch is unavailable for undo.');for(const change of batch.changes){const current=await db.get(change.key,{type:'json'});if(digest(current)!==digest(change.after))throw Error('Records changed after this merge. Review them before undoing.');}for(const change of [...batch.changes].reverse())await restoreChange(db,change);await db.setJSON(key,{...batch,status:'undone',undoneAt:new Date().toISOString()});await db.setJSON('registration-merge-latest:'+slug,{id,status:'undone',at:new Date().toISOString()});return {ok:true};});}
