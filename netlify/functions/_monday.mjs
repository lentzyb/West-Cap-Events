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
 const q=`query($ids:[ID!]!){boards(ids:$ids){id name columns{id title type} groups{id title archived deleted}}}`; const d=await mondayRequest(q,{ids:[String(boardId)]}); const b=d.boards?.[0]; if(!b)throw new Error('Monday board not found or token cannot access it.'); return b;
}
export async function getRecruitingItems(board, columnIds=[], startDateColumnId=''){
 const boardId=process.env.MONDAY_BOARD_ID; if(!boardId) throw new Error('MONDAY_BOARD_ID is not configured in Netlify.');
 const groups=(board?.groups||[]).filter(g=>!g.archived&&!g.deleted);
 const findGroup=(label)=>groups.find(g=>normTitle(g.title)===normTitle(label))||groups.find(g=>normTitle(g.title).includes(normTitle(label)));
 const orientation=findGroup('Orientation');
 const activeRoster=findGroup('Active Roster');
 if(!orientation&&!activeRoster) throw new Error('Could not find an active Monday group named Orientation or Active Roster.');
 const targetGroups=[orientation,activeRoster].filter(Boolean);
 const all=[];
 const next=`query($cursor:String!,$limit:Int!){next_items_page(cursor:$cursor,limit:$limit){cursor items{id name group{id title} column_values{id text value}}}}`;
 async function fetchFiltered(rules){
   const rulesText=rules.join(',');
   const first=`query($ids:[ID!]!,$limit:Int!){boards(ids:$ids){items_page(limit:$limit,query_params:{rules:[${rulesText}],operator:and}){cursor items{id name group{id title} column_values{id text value}}}}}`;
   let d=await mondayRequest(first,{ids:[String(boardId)],limit:50}); let page=d.boards?.[0]?.items_page;
   if(!page) return;
   all.push(...(page.items||[])); let cursor=page.cursor;
   while(cursor){d=await mondayRequest(next,{cursor,limit:50});page=d.next_items_page;all.push(...(page?.items||[]));cursor=page?.cursor;}
 }
 if(orientation){
   const gid=String(orientation.id).replace(/\\/g,'\\\\').replace(/"/g,'\\"');
   await fetchFiltered([`{column_id:"group",compare_value:["${gid}"],operator:any_of}`]);
 }
 if(activeRoster){
   if(!startDateColumnId) throw new Error('Active Roster was found, but the Monday Start Date column could not be detected.');
   const gid=String(activeRoster.id).replace(/\\/g,'\\\\').replace(/"/g,'\\"');
   const did=String(startDateColumnId).replace(/\\/g,'\\\\').replace(/"/g,'\\"');
   await fetchFiltered([`{column_id:"group",compare_value:["${gid}"],operator:any_of}`,`{column_id:"${did}",compare_value:["EXACT","2026-01-01"],operator:greater_than_or_equals}`]);
 }
 // Same Monday item can briefly surface during a group move. Keep one copy by item ID.
 const byId=new Map(); for(const item of all) byId.set(String(item.id),item);
 return {items:[...byId.values()],orientation,activeRoster,groups:targetGroups};
}

const cv=(item,id)=>item.column_values?.find(c=>c.id===id)?.text||'';
const normalizeName=v=>String(v||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
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
 const startDate=firstColumn(columns,['Start Date','Employee Start Date','Hire Date']);
 const volume=columns.find(c=>c.id===saved.volumeColumnId)||firstColumn(columns,['Production Volume','Annual Volume','Previous Volume','12 Month Volume','12-Month Volume','TTM Volume','Volume'])||fuzzyColumn(columns,['production volume','annual volume','previous volume','12 month volume','ttm volume']);
 const config={...saved,emailColumnId:email?.id||'',phoneColumnId:phone?.id||'',stageColumnId:stage?.id||'',volumeColumnId:volume?.id||''};
 return {board,columns,config,detected:{email:email?{id:email.id,title:email.title}:null,phone:phone?{id:phone.id,title:phone.title}:null,stage:stage?{id:stage.id,title:stage.title}:null,startDate:startDate?{id:startDate.id,title:startDate.title}:null,volume:volume?{id:volume.id,title:volume.title}:null}};
}
export async function getConversionData(registrations){
 const resolved=await resolveMondayConfig(); const config=resolved.config; const required=config.emailColumnId||config.phoneColumnId;
 if(!required) return {configured:false,config,matches:[],possibleMatches:[],mondayItems:0,board:resolved.board,detected:resolved.detected};
 const {items,orientation,activeRoster,groups}=await getRecruitingItems(resolved.board,[config.emailColumnId,config.phoneColumnId,config.volumeColumnId].filter(Boolean),resolved.detected.startDate?.id||''); const emails=new Map(),phones=new Map();
 for(const item of items){const e=normalizeEmail(cv(item,config.emailColumnId)),p=normalizePhone(cv(item,config.phoneColumnId)); if(e){if(!emails.has(e))emails.set(e,[]);emails.get(e).push(item)} if(p.length>=10){if(!phones.has(p))phones.set(p,[]);phones.get(p).push(item)}}
 const matches=[],possibleMatches=[],diagnostics=[];
 const mondayByName=new Map();
 for(const item of items){const n=normalizeName(item.name);if(n){if(!mondayByName.has(n))mondayByName.set(n,[]);mondayByName.get(n).push(item)}}
 for(const r of registrations){const e=normalizeEmail(r.email),p=normalizePhone(r.phone); const candidates=new Map(); for(const x of emails.get(e)||[])candidates.set(x.id,{item:x,email:true,phone:false}); for(const x of phones.get(p)||[]){const c=candidates.get(x.id)||{item:x,email:false,phone:false};c.phone=true;candidates.set(x.id,c)}
   const exact=[...candidates.values()]; if(exact.length===1){const m=exact[0],stage=m.item.group?.title||'Joined WCL',volume=moneyNumber(cv(m.item,config.volumeColumnId)); matches.push({registration:r,mondayItemId:m.item.id,mondayName:m.item.name,stage,volume,joined:true,matchMethod:m.email&&m.phone?'Email + Phone':m.email?'Email':'Phone'});} else if(exact.length>1){possibleMatches.push({registration:r,reason:'Multiple Monday records match this email/phone',count:exact.length});}
   else {
     const regName=normalizeName(`${r.firstName||''} ${r.lastName||''}`);
     const sameName=mondayByName.get(regName)||[];
     // Safe fallback: if contact details changed between the event and onboarding, allow an
     // exact full-name match ONLY when that name is unique on both sides. This catches
     // candidates such as Kim Nguyen without risking attribution when two registrants share a name.
     const sameNameRegs=registrations.filter(x=>normalizeName(`${x.firstName||''} ${x.lastName||''}`)===regName);
     if(regName&&sameName.length===1&&sameNameRegs.length===1){
       const item=sameName[0],me=normalizeEmail(cv(item,config.emailColumnId)),mp=normalizePhone(cv(item,config.phoneColumnId));
       const volume=moneyNumber(cv(item,config.volumeColumnId));
       matches.push({registration:r,mondayItemId:item.id,mondayName:item.name,stage:item.group?.title||'Joined WCL',volume,joined:true,matchMethod:'Unique Exact Name'});
       diagnostics.push({candidateName:`${r.firstName||''} ${r.lastName||''}`.trim(),eventName:r.eventName||r.eventSlug||'Unknown event',registrationFound:true,mondayJoinedGroupFound:true,emailMatches:Boolean(e&&me&&e===me),phoneMatches:Boolean(p&&mp&&p===mp),registrationHasEmail:Boolean(e),mondayHasEmail:Boolean(me),registrationHasPhone:Boolean(p),mondayHasPhone:Boolean(mp),note:'Matched by unique exact full name because email/phone differed.'});
     } else if(sameName.length){
       diagnostics.push({candidateName:`${r.firstName||''} ${r.lastName||''}`.trim(),eventName:r.eventName||r.eventSlug||'Unknown event',registrationFound:true,mondayJoinedGroupFound:true,emailMatches:false,phoneMatches:false,registrationHasEmail:Boolean(e),mondayHasEmail:true,registrationHasPhone:Boolean(p),mondayHasPhone:true,note:'Name exists in Orientation/Active Roster but is not unique enough for automatic attribution.'});
     }
   }
 }
 const registrationNames=registrations.map(r=>({name:`${r.firstName||''} ${r.lastName||''}`.trim(),normalized:normalizeName(`${r.firstName||''} ${r.lastName||''}`),eventName:r.eventName||r.eventSlug||'Unknown event'})).filter(x=>x.normalized);
 const nameSourceDiagnostics=items.map(item=>{
   const mondayName=String(item.name||'').trim(), normalized=normalizeName(mondayName);
   const exactRegs=registrationNames.filter(x=>x.normalized===normalized);
   return {mondayName,normalizedName:normalized,registrationNameFound:exactRegs.length>0,registrationCount:exactRegs.length,events:[...new Set(exactRegs.map(x=>x.eventName))]};
 });
 return {configured:true,config,matches,possibleMatches,diagnostics,nameSourceDiagnostics,mondayItems:items.length,board:resolved.board,detected:resolved.detected,orientationGroup:orientation?{id:orientation.id,title:orientation.title}:null,activeRosterGroup:activeRoster?{id:activeRoster.id,title:activeRoster.title}:null,recruitingGroups:groups.map(g=>({id:g.id,title:g.title}))};
}
