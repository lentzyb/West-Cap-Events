import { store, listAll } from './_shared.mjs';

const API='https://api.monday.com/v2';
const CONFIG_KEY='config:monday';
export const normalizeEmail=v=>String(v||'').trim().toLowerCase();
export const normalizePhone=v=>{let d=String(v||'').replace(/\D/g,''); if(d.length===11&&d.startsWith('1'))d=d.slice(1); return d;};
const moneyNumber=v=>{if(v==null)return 0; const s=String(v).trim().toLowerCase().replace(/[$,\s]/g,''); const m=s.match(/^(-?[\d.]+)\s*([kmb])?$/); if(!m)return Number(s.replace(/[^0-9.-]/g,''))||0; const mult={k:1e3,m:1e6,b:1e9}[m[2]]||1; return (Number(m[1])||0)*mult;};

export async function mondayRequest(query,variables={}){
 const token=process.env.MONDAY_API_TOKEN; if(!token) throw new Error('MONDAY_API_TOKEN is not configured in Netlify.');
 const r=await fetch(API,{method:'POST',headers:{Authorization:token,'Content-Type':'application/json'},body:JSON.stringify({query,variables})});
 const data=await r.json(); if(!r.ok||data.errors?.length) throw new Error(data.errors?.map(e=>e.message).join('; ')||`Monday API error ${r.status}`); return data.data;
}
export async function getMondayConfig(){return (await store().get(CONFIG_KEY,{type:'json'}))||{emailColumnId:'',phoneColumnId:'',stageColumnId:'',volumeColumnId:'',joinedStages:['Confirmed','Orientation']};}
export async function saveMondayConfig(input){const current=await getMondayConfig(); const cfg={...current,emailColumnId:String(input.emailColumnId||''),phoneColumnId:String(input.phoneColumnId||''),stageColumnId:String(input.stageColumnId||''),volumeColumnId:String(input.volumeColumnId||''),joinedStages:Array.isArray(input.joinedStages)?input.joinedStages.map(String).filter(Boolean):current.joinedStages}; await store().setJSON(CONFIG_KEY,cfg); return cfg;}
export async function getBoardMeta(){
 const boardId=process.env.MONDAY_BOARD_ID; if(!boardId) throw new Error('MONDAY_BOARD_ID is not configured in Netlify.');
 const q=`query($ids:[ID!]!){boards(ids:$ids){id name columns{id title type}}}`; const d=await mondayRequest(q,{ids:[String(boardId)]}); const b=d.boards?.[0]; if(!b)throw new Error('Monday board not found or token cannot access it.'); return b;
}
export async function getAllMondayItems(){
 const boardId=process.env.MONDAY_BOARD_ID; if(!boardId) throw new Error('MONDAY_BOARD_ID is not configured in Netlify.');
 const first=`query($ids:[ID!]!,$limit:Int!){boards(ids:$ids){items_page(limit:$limit){cursor items{id name group{id title} column_values{id text value}}}}}`;
 let d=await mondayRequest(first,{ids:[String(boardId)],limit:500}); let page=d.boards?.[0]?.items_page; if(!page) return []; let items=[...(page.items||[])], cursor=page.cursor;
 const next=`query($cursor:String!,$limit:Int!){next_items_page(cursor:$cursor,limit:$limit){cursor items{id name group{id title} column_values{id text value}}}}`;
 while(cursor){d=await mondayRequest(next,{cursor,limit:500}); page=d.next_items_page; items.push(...(page?.items||[])); cursor=page?.cursor;}
 return items;
}
const cv=(item,id)=>item.column_values?.find(c=>c.id===id)?.text||'';
const normTitle=v=>String(v||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ');
const firstColumn=(columns,names)=>{const wanted=names.map(normTitle);return columns.find(c=>wanted.includes(normTitle(c.title)))||null};
const fuzzyColumn=(columns,terms)=>columns.find(c=>terms.some(t=>normTitle(c.title).includes(t)))||null;
export async function resolveMondayConfig(){
 const saved=await getMondayConfig();
 const board=await getBoardMeta();
 const columns=board.columns||[];
 const email=columns.find(c=>c.id===saved.emailColumnId)||firstColumn(columns,['Personal Email','Email','Email Address']);
 const phone=columns.find(c=>c.id===saved.phoneColumnId)||firstColumn(columns,['Cell Phone','Phone','Phone Number','Mobile Phone']);
 const stage=columns.find(c=>c.id===saved.stageColumnId)||firstColumn(columns,['Stage','Status','Recruiting Stage']);
 const volume=columns.find(c=>c.id===saved.volumeColumnId)||firstColumn(columns,['Production Volume','Annual Volume','Previous Volume','12 Month Volume','12-Month Volume','TTM Volume','Volume'])||fuzzyColumn(columns,['production volume','annual volume','previous volume','12 month volume','ttm volume']);
 const config={...saved,emailColumnId:email?.id||'',phoneColumnId:phone?.id||'',stageColumnId:stage?.id||'',volumeColumnId:volume?.id||''};
 return {board,columns,config,detected:{email:email?{id:email.id,title:email.title}:null,phone:phone?{id:phone.id,title:phone.title}:null,stage:stage?{id:stage.id,title:stage.title}:null,volume:volume?{id:volume.id,title:volume.title}:null}};
}
export async function getConversionData(registrations){
 const resolved=await resolveMondayConfig(); const config=resolved.config; const required=config.emailColumnId&&config.phoneColumnId&&config.stageColumnId;
 if(!required) return {configured:false,config,matches:[],possibleMatches:[],mondayItems:0,board:resolved.board,detected:resolved.detected};
 const items=await getAllMondayItems(); const emails=new Map(),phones=new Map();
 for(const item of items){const e=normalizeEmail(cv(item,config.emailColumnId)),p=normalizePhone(cv(item,config.phoneColumnId)); if(e){if(!emails.has(e))emails.set(e,[]);emails.get(e).push(item)} if(p.length>=10){if(!phones.has(p))phones.set(p,[]);phones.get(p).push(item)}}
 const joined=new Set((config.joinedStages||[]).map(x=>x.trim().toLowerCase())); const matches=[],possibleMatches=[];
 for(const r of registrations){const e=normalizeEmail(r.email),p=normalizePhone(r.phone); const candidates=new Map(); for(const x of emails.get(e)||[])candidates.set(x.id,{item:x,email:true,phone:false}); for(const x of phones.get(p)||[]){const c=candidates.get(x.id)||{item:x,email:false,phone:false};c.phone=true;candidates.set(x.id,c)}
   const exact=[...candidates.values()]; if(exact.length===1){const m=exact[0],stage=cv(m.item,config.stageColumnId),volume=moneyNumber(cv(m.item,config.volumeColumnId)); matches.push({registration:r,mondayItemId:m.item.id,mondayName:m.item.name,stage,volume,joined:joined.has(stage.trim().toLowerCase()),matchMethod:m.email&&m.phone?'Email + Phone':m.email?'Email':'Phone'});} else if(exact.length>1){possibleMatches.push({registration:r,reason:'Multiple Monday records match this email/phone',count:exact.length});}
 }
 return {configured:true,config,matches,possibleMatches,mondayItems:items.length,board:resolved.board,detected:resolved.detected};
}
