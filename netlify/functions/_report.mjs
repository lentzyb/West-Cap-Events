import crypto from 'node:crypto';
import {store,listAll} from './_shared.mjs';
import {emailConfig,emailReadiness,sendEmail} from './_email.mjs';
import {notificationRows,sameContact,localSchedule,esc} from './_notifications.mjs';
import {bonzoEnabled,bonzoMessages,outreachState,eventEnd,bonzoStatus} from './_bonzo.mjs';
const defaults={enabled:true,email:'blentz@westcapitallending.com',hour:9,timeZone:'America/New_York'};
export const reportConfig=async()=>({...defaults,...await store().get('config:daily-report',{type:'json'})});
export function validateReport(input){const next={enabled:input.enabled===true,email:String(input.email||'').trim().toLowerCase(),hour:Number(input.hour),timeZone:String(input.timeZone||'')};if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(next.email))throw Error('Enter one valid report email address.');if(!Number.isInteger(next.hour)||next.hour<0||next.hour>23)throw Error('Choose a report hour between 0 and 23.');try{new Intl.DateTimeFormat('en',{timeZone:next.timeZone}).format()}catch{throw Error('Choose a valid report time zone.')}return next}
const buckets=['Needs outreach','Contacted','Stopped','Waiting / setup needed','Inactive','Unverified'];
function category(row,event){if(row.status==='Stopped')return 'Stopped';if(['Event archived','Removed from imported list','Recruiter inactive'].includes(row.status))return 'Inactive';if(row.contactedAt)return 'Contacted';if(eventEnd(event)===null||eventEnd(event)>Date.now())return 'Waiting / setup needed';return bonzoEnabled()?'Needs outreach':'Unverified'}
export async function reportSnapshot(){
 const [tracked,events,recruiters,registrations,attendees,messages,bonzo]=await Promise.all([notificationRows(),listAll('event:'),listAll('recruiter:'),listAll('registration:'),listAll('attendee:'),bonzoMessages(),bonzoStatus()]);
 const rows=[...tracked];const eventMap=new Map(events.map(e=>[e.slug,e]));
 // Include unassigned and missing-contact audience too, with registrations taking precedence over imports.
 for(const source of [...registrations,...attendees]){
  if(rows.some(r=>r.eventSlug===source.eventSlug&&(r.sourceId===source.id||sameContact(r,source))))continue;
  const event=eventMap.get(source.eventSlug),recruiter=recruiters.find(r=>r.id===source.recruiterId),outreach=outreachState(source,event,messages);
  rows.push({...source,recruiterName:recruiter?.name||'Unassigned',recruiterEmail:recruiter?.email||'',eventName:event?.name||source.eventName||source.eventSlug,status:source.importRemoved?'Removed from imported list':!event||event.archived?'Event archived':recruiter&&!recruiter.active?'Recruiter inactive':outreach.status,contactedAt:outreach.contactedAt||'',contactType:outreach.contactType||'',campaign:outreach.campaign||false});
 }
 const result=rows.filter(r=>eventMap.has(r.eventSlug)&&!eventMap.get(r.eventSlug).archived).map(r=>({...r,category:category(r,eventMap.get(r.eventSlug))})).sort((a,b)=>String(a.eventName||'').localeCompare(b.eventName||'')||String(a.recruiterName||'').localeCompare(b.recruiterName||'')||String(a.lastName||'').localeCompare(b.lastName||''));
 return {at:new Date().toISOString(),bonzo,rows:result,counts:Object.fromEntries(buckets.map(k=>[k,result.filter(r=>r.category===k).length]))};
}
function csvCell(value){let s=String(value??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'}
export function reportCSV(snapshot){const columns=['Category','Event','Recruiter','Candidate','Email','Phone','Contacted at (UTC)','Channel','Campaign','Status','Stop reason'];return '\uFEFF'+[columns,...snapshot.rows.map(r=>[r.category,r.eventName,r.recruiterName,`${r.firstName||''} ${r.lastName||''}`.trim(),r.email,r.phone,r.contactedAt,r.contactType,r.campaign?'Yes':'No',r.status,r.reason])].map(row=>row.map(csvCell).join(',')).join('\r\n')}
export function reportEmail(snapshot,cfg,day){
 const warning=snapshot.bonzo.enabled?'Contacted means Bonzo recorded a sent message after the event ended, including campaigns. Needs outreach means none recorded; earlier history and missed hook deliveries are not verified.':'Bonzo tracking is not connected. Outreach is unverified; no candidate is reported as confirmed uncontacted.';
 const summary=buckets.map(k=>`${k}: ${snapshot.counts[k]}`).join(' · ');
 const sections=buckets.map(k=>{const rows=snapshot.rows.filter(r=>r.category===k);const table=rows.slice(0,50).map(r=>`<tr><td>${esc(r.eventName)}</td><td>${esc(r.recruiterName)}</td><td>${esc(`${r.firstName||''} ${r.lastName||''}`.trim()||r.email||'Unnamed')}</td><td>${esc(r.contactedAt?new Date(r.contactedAt).toLocaleString('en-US',{timeZone:cfg.timeZone})+(r.campaign?' · Campaign':''):r.reason||r.status)}</td></tr>`).join('');return `<h2>${esc(k)} (${rows.length})</h2>${rows.length?`<table cellpadding="7" border="1" style="border-collapse:collapse"><thead><tr><th>Event</th><th>Recruiter</th><th>Candidate</th><th>Details</th></tr></thead><tbody>${table}</tbody></table>${rows.length>50?'<p>First 50 shown. The attached CSV includes every row.</p>':''}`:'<p>None.</p>'}`}).join('');
 return {from:emailConfig().from,to:[cfg.email],subject:`Event outreach report — ${day}`,text:`Daily event outreach report\n${summary}\n\n${warning}\n\nThe attached CSV contains all candidates, grouped by event and recruiter, including contact times and stopped reminders. Times in the CSV are UTC. View the site: https://westcap-events.netlify.app/admin`,html:`<div style="font-family:Arial,sans-serif;color:#18334d"><h1>Daily event outreach report</h1><p>${esc(day)} · ${esc(cfg.timeZone)} · ${snapshot.rows.length} candidate/event records</p><p>${esc(summary)}</p><p>${esc(warning)}</p>${snapshot.bonzo.lastReceivedAt?`<p>Last Bonzo activity received: ${esc(snapshot.bonzo.lastReceivedAt)}</p>`:''}${sections}<p>Complete report attached as CSV. <a href="https://westcap-events.netlify.app/admin">Open event site</a></p></div>`,attachments:[{filename:`event-outreach-${day}.csv`,content:Buffer.from(reportCSV(snapshot)).toString('base64')}]};
}
export async function runDailyReport({force=false,requestId,now=new Date()}={}){
 const cfg=await reportConfig();if(!cfg.enabled&&!force)return {disabled:true};const schedule=localSchedule(cfg,now);if(!force&&!schedule.due)return {notDue:true};if(Object.values(emailReadiness()).some(v=>!v))throw Error('Email setup is incomplete.');
 if(force&&requestId!==undefined&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(requestId))throw Error('Invalid report request ID.');
 const identity=force?'manual:'+(requestId||crypto.randomUUID()):schedule.day;
 const s=store(),key='reportjob:'+crypto.createHash('sha256').update(identity+':'+cfg.email).digest('hex'),leaseKey='daily-report:lease';const old=await s.getWithMetadata(leaseKey,{type:'json'});if(old?.data?.expiresAt>Date.now())return {busy:true};const lease={owner:crypto.randomUUID(),expiresAt:Date.now()+16*60000};const acquired=await s.setJSON(leaseKey,lease,old?{onlyIfMatch:old.etag}:{onlyIfNew:true});if(!acquired.modified)return {busy:true};
 try{
  let job=await s.get(key,{type:'json'});const provider=emailConfig().provider;
  if(job?.status==='sending'){job={...job,status:'needs_review',error:'Report delivery was interrupted. Check the sender Sent folder.'};await s.setJSON(key,job)}
  if(job&&['sent','needs_review'].includes(job.status))return {status:job.status};
  if(job&&(job.provider!==provider||Date.now()-Date.parse(job.createdAt)>23*3600000)){await s.setJSON(key,{...job,status:'needs_review',error:'Report delivery window or provider changed. Verify prior delivery.'});return {status:'needs_review'}}
  if(!job){const snapshot=await reportSnapshot(),payload=reportEmail(snapshot,cfg,schedule.day);if(force)payload.subject='On-demand '+payload.subject;if(JSON.stringify(payload).length>8*1024*1024)throw Error('Report exceeds email size limit. Download the CSV from Admin.');job={id:key,kind:force?'manual':'daily',status:'pending',provider,recipient:cfg.email,day:schedule.day,counts:snapshot.counts,payload,createdAt:new Date().toISOString()};await s.setJSON(key,job)}
  const current=await reportConfig();if((!current.enabled&&!force)||current.email!==cfg.email)return {cancelled:true};
  if(provider==='gmail')await s.setJSON(key,{...job,status:'sending'});
  try{const sent=await sendEmail(job.payload,{idempotencyKey:key});await s.setJSON(key,{...job,status:'sent',sentAt:new Date().toISOString(),providerId:sent.id});return {status:'sent'}}catch(error){await s.setJSON(key,{...job,status:error.deliveryUncertain?'needs_review':'pending',error:error.message});throw error}
 }finally{const current=await s.getWithMetadata(leaseKey,{type:'json'});if(current?.data?.owner===lease.owner)await s.setJSON(leaseKey,{...lease,expiresAt:0},{onlyIfMatch:current.etag})}
}
export async function reportStatus(){const jobs=(await listAll('reportjob:')).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));return {lastRun:await store().get('daily-report:last-run',{type:'json'}),settings:await reportConfig(),deliveries:jobs.slice(0,10).map(({kind,status,recipient,day,sentAt,error})=>({kind:kind||'daily',status,recipient,day,sentAt,error}))}}
