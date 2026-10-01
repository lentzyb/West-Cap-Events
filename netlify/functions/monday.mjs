import { json, requireAdmin } from './_shared.mjs';
import { getBoardMeta, getMondayConfig, saveMondayConfig, getConversionData } from './_monday.mjs';
export default async req=>{try{const auth=requireAdmin(req);if(!auth.ok)return auth.response;
 if(req.method==='GET'){const board=await getBoardMeta(),config=await getMondayConfig();return json({connected:true,board,config});}
 if(req.method==='POST'){const body=await req.json();if(body?.action==='save-config')return json({ok:true,config:await saveMondayConfig(body)});if(body?.action==='test')return json({ok:true,board:await getBoardMeta()});return json({error:'Unknown action.'},400)}
 return json({error:'Method not allowed.'},405);}catch(error){console.error('monday function error',error);return json({connected:false,error:error.message},500)}};
