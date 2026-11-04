import {json} from './_shared.mjs';
import {bonzoEnabled,authorizedBonzo,saveBonzoMessage} from './_bonzo.mjs';
export default async req=>{
 if(req.method!=='POST')return json({error:'Method not allowed.'},405);
 if(!bonzoEnabled())return json({error:'Bonzo receiver is not configured.'},503);
 if(!authorizedBonzo(req.headers.get('x-bonzo-code')))return json({error:'Unauthorized.'},401);
 try{if(Number(req.headers.get('content-length'))>262144)return json({error:'Payload too large.'},413);const text=await req.text();if(Buffer.byteLength(text)>262144)return json({error:'Payload too large.'},413);let payload;try{payload=JSON.parse(text)}catch{return json({error:'Invalid JSON.'},400)};try{return json({ok:true,...await saveBonzoMessage(payload)})}catch(error){if(error.message==='Concurrent update; retry delivery.')throw error;return json({error:'Invalid message payload.'},400)}}catch{return json({error:'Unable to save activity. Retry delivery.'},500)}
};
