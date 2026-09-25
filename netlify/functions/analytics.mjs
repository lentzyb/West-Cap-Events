import { json, requireAdmin, parseJSON, listAll, store } from "./_shared.mjs";
import { getConversionData } from './_monday.mjs';
export default async req=>{try{if(req.method!=="POST")return json({error:"Method not allowed."},405);const body=await parseJSON(req)||{};let auth=requireAdmin(req);if(!auth.ok&&body.adminPassword){const expected=process.env.ADMIN_PASSWORD||"";if(String(body.adminPassword)===expected)auth={ok:true};}if(!auth.ok){console.warn('analytics auth rejected',{method:req.method,hasAdminHeader:Boolean(req.headers.get('x-admin-password')),hasBodyPassword:Boolean(body.adminPassword),hasConfiguredPassword:Boolean(process.env.ADMIN_PASSWORD)});return auth.response;}
 const [events,registrations]=await Promise.all([listAll('event:'),listAll('registration:')]);const eventMap=new Map(events.map(e=>[e.slug,e])),byEvent=new Map(),byRecruiter=new Map();let completed=0,failed=0,calendlyShown=0,calendlySelected=0,calendlyScheduled=0;
 for(const r of registrations){const slug=r.eventSlug||'unknown',sync=r.webhookSync||r.bonzoSync||{},status=sync.status||'unknown',cal=r.calendly||{};if(status==='completed')completed++;if(status==='failed')failed++;if(cal.shownAt)calendlyShown++;if(cal.timeSelectedAt)calendlySelected++;if(cal.scheduledAt)calendlyScheduled++;
  const er=byEvent.get(slug)||{slug,name:r.eventName||eventMap.get(slug)?.name||slug,total:0,completed:0,failed:0,calendlyShown:0,calendlySelected:0,calendlyScheduled:0,recruiters:{},joined:0,volume:0,convertedCandidates:[]};er.total++;if(status==='completed')er.completed++;if(status==='failed')er.failed++;if(cal.shownAt)er.calendlyShown++;if(cal.timeSelectedAt)er.calendlySelected++;if(cal.scheduledAt)er.calendlyScheduled++;const rn=r.referredBy||'Unassigned';er.recruiters[rn]=(er.recruiters[rn]||0)+1;byEvent.set(slug,er);
  const rr=byRecruiter.get(rn)||{name:rn,total:0,completed:0,failed:0};rr.total++;if(status==='completed')rr.completed++;if(status==='failed')rr.failed++;byRecruiter.set(rn,rr)}
 let monday={configured:false,matches:[],possibleMatches:[]},mondayError='';try{monday=await getConversionData(registrations)}catch(e){mondayError=e.message}
 // Orientation and Active Roster both count as joined. Deduplicate by Monday item before
 // attribution so a candidate can never count twice just because they moved groups or
 // registered more than once. The saved attribution remains permanent afterward.
 const attributionStore=store();
 const uniqueMondayMatches=new Map();
 for(const m of monday.matches||[]){
   if(!m.mondayItemId)continue;
   const prior=uniqueMondayMatches.get(String(m.mondayItemId));
   const stamp=x=>String(x?.registration?.createdAt||x?.registration?.registeredAt||x?.registration?.timestamp||'');
   if(!prior||stamp(m)<stamp(prior))uniqueMondayMatches.set(String(m.mondayItemId),m);
 }
 for(const m of uniqueMondayMatches.values()){
   if(!m.joined||!m.registration?.id)continue;
   const key=`conversion:monday:${m.mondayItemId}`;
   const existing=await attributionStore.get(key,{type:'json'});
   const now=new Date().toISOString();
   const attribution={
     registrationId:m.registration.id,
     candidateId:m.registration.candidateId||'',
     eventSlug:m.registration.eventSlug||'unknown',
     eventName:m.registration.eventName||'',
     candidateName:`${m.registration.firstName||''} ${m.registration.lastName||''}`.trim(),
     mondayItemId:m.mondayItemId||existing?.mondayItemId||'',
     mondayName:m.mondayName||existing?.mondayName||'',
     convertedAt:existing?.convertedAt||now,
     lastSeenInJoinedGroupAt:now,
     stageAtConversion:existing?.stageAtConversion||m.stage||'Joined WCL',
     matchMethod:m.matchMethod||existing?.matchMethod||'',
     volume:(m.volume||existing?.volume||0)
   };
   await attributionStore.setJSON(key,attribution);
 }
 const rawAttributions=await listAll('conversion:');
 // Backward-compatible reporting dedupe: if an older build saved a registration-keyed
 // attribution and this build saved the same Monday candidate, count that person once.
 const dedupedAttributions=new Map();
 for(const a of rawAttributions){const k=a.mondayItemId?`monday:${a.mondayItemId}`:`registration:${a.registrationId}`;if(!dedupedAttributions.has(k))dedupedAttributions.set(k,a);}
 const attributions=[...dedupedAttributions.values()];
 const registrationById=new Map(registrations.map(r=>[r.id,r]));
 let joined=0,totalVolume=0;
 for(const a of attributions){
   const r=registrationById.get(a.registrationId);
   if(!r)continue;
   joined++;totalVolume+=a.volume||0;
   const slug=a.eventSlug||r.eventSlug||'unknown',er=byEvent.get(slug);
   if(er){er.joined++;er.volume+=a.volume||0;er.convertedCandidates.push({name:a.candidateName||`${r.firstName||''} ${r.lastName||''}`.trim(),mondayName:a.mondayName||'',stage:a.stageAtConversion||'Joined WCL',volume:a.volume||0,matchMethod:a.matchMethod||'Saved joined-candidate match',email:r.email||'',phone:r.phone||'',convertedAt:a.convertedAt||''})}
 }
 const eventAnalytics=[...byEvent.values()].sort((a,b)=>b.total-a.total);for(const e of eventAnalytics)e.conversionRate=e.total?Math.round((e.joined/e.total)*1000)/10:0;
 return json({summary:{events:events.length,activeEvents:events.filter(e=>!e.archived).length,registrations:registrations.length,completed,failed,calendlyShown,calendlySelected,calendlyScheduled,bookingRate:calendlyShown?Math.round(calendlyScheduled/calendlyShown*100):0,successRate:registrations.length?Math.round(completed/registrations.length*100):0,joined,conversionRate:registrations.length?Math.round(joined/registrations.length*1000)/10:0,totalVolume},events:eventAnalytics,recruiters:[...byRecruiter.values()].sort((a,b)=>b.total-a.total),monday:{configured:monday.configured,mondayItems:monday.mondayItems||0,matched:(monday.matches||[]).length,persistedAttributions:attributions.length,possibleMatches:(monday.possibleMatches||[]).length,diagnostics:(monday.diagnostics||[]).slice(0,25),nameSourceDiagnostics:(monday.nameSourceDiagnostics||[]).slice(0,100),error:mondayError,board:monday.board||null,detected:monday.detected||null,orientationGroup:monday.orientationGroup||null,activeRosterGroup:monday.activeRosterGroup||null,recruitingGroups:monday.recruitingGroups||[]}})
 }catch(error){console.error('analytics function error',error);return json({error:'Unable to load analytics.',details:error.message},500)}};
