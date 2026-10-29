import crypto from 'node:crypto';
import {runNotifications} from './_notifications.mjs';
export default async req=>{const expected=process.env.NOTIFICATION_SECRET||'',given=req.headers.get('x-notification-secret')||'';const a=Buffer.from(expected),b=Buffer.from(given);if(req.method!=='POST'||expected.length<32||a.length!==b.length||!crypto.timingSafeEqual(a,b))return new Response(null,{status:403});const body=await req.json().catch(()=>({}));try{await runNotifications({daily:body.daily===true})}catch{console.error('Notification worker paused or failed; inspect admin notification status.')}};
