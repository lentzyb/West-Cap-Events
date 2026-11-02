import crypto from 'node:crypto';
import {reportStatus,reportConfig,validateReport,reportSnapshot,reportCSV} from './_report.mjs';
import {bonzoStatus} from './_bonzo.mjs';
import {publicEmailSettings,sendSelfTest} from './_email.mjs';
import {json,requireAdmin,parseJSON,store,listAll} from './_shared.mjs';
import {config,readiness,notificationRows,kickWorker,reasons} from './_notifications.mjs';
export default async req=>{const auth=requireAdmin(req);if(!auth.ok)return auth.response;try{
 if(req.method==='GET'){const [settings,rows,run,jobs,bonzo,report]=await Promise.all([config(),notificationRows(),store().get('notification-run:latest',{type:'json'}),listAll('mailjob:'),bonzoStatus(),reportStatus()]);return json({report,bonzo,settings,email:publicEmailSettings(),readiness:readiness(),rows,run,deliveries:jobs.map(({id,kind,status,createdAt,sentAt,error,recruiterId})=>({id,kind,status,createdAt,sentAt,error,recruiterId})).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,50)})}
 if(req.method!=='POST')return json({error:'Method not allowed.'},405);const b=await parseJSON(req)||{};
 if(b.action==='settings'){const old=await config();const next={trackingSince:old.trackingSince||new Date().toISOString(),enabled:b.enabled===true,hour:Number(b.hour??old.hour),timeZone:String(b.timeZone||old.timeZone)};if(!Number.isInteger(next.hour)||next.hour<0||next.hour>23)return json({error:'Choose an hour between 0 and 23.'},400);try{new Intl.DateTimeFormat('en',{timeZone:next.timeZone}).format()}catch{return json({error:'Choose a valid time zone.'},400)}if(next.enabled&&Object.values(readiness()).some(v=>!v))return json({error:'Complete the email, secret and site URL setup before enabling notifications.'},400);await store().setJSON('config:notifications',next);return json({ok:true,settings:next})}
 if(b.action==='report-settings'){try{const next=validateReport({...await reportConfig(),...b});await store().setJSON('config:daily-report',next);return json({ok:true,settings:next})}catch(error){return json({error:error.message},400)}}
 if(b.action==='report-now'){const requestId=b.requestId||crypto.randomUUID();if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(requestId))return json({error:'Invalid report request ID.'},400);return json({ok:true,requestId,...await kickWorker(false,{reportOnly:true,reportRequestId:requestId})})}
 if(b.action==='report-csv')return json({csv:reportCSV(await reportSnapshot())});
 if(b.action==='test-email'){try{await sendSelfTest();return json({ok:true,message:'Gmail accepted the test email to your configured Gmail address. Check Inbox, Sent and Spam.'})}catch(error){return json({error:error.message},400)}}
 if(b.action==='run')return json({ok:true,...await kickWorker(false)});
 if(['stop','resume'].includes(b.action)){const row=await store().get('followup:'+String(b.id),{type:'json'});if(!row)return json({error:'Candidate not found.'},404);if(b.action==='stop'&&!reasons.includes(b.reason))return json({error:'Choose a reason.'},400);await store().setJSON('followup-stop:'+row.id,{id:row.id,stopped:b.action==='stop',reason:b.action==='stop'?b.reason:'',at:new Date().toISOString(),by:'admin'});return json({ok:true})}
 return json({error:'Unknown action.'},400);
}catch{return json({error:'Unable to update notifications.'},500)}};
