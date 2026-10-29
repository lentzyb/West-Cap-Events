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
export const DEFAULT_BOARD_ID='18424671786';
export async function getMondayConfig(){const saved=(await store().get(CONFIG_KEY,{type:'json'}))||{};const migrated=saved.boardId? saved : {...saved,emailColumnId:'',phoneColumnId:'',stageColumnId:'',sourceColumnId:'',volumeColumnId:'',joinedStages:['Orientation','Hires','Hired','Active Roster']};return {boardId:parseBoardId(process.env.MONDAY_BOARD_ID)||DEFAULT_BOARD_ID,emailColumnId:'',phoneColumnId:'',stageColumnId:'',sourceColumnId:'',volumeColumnId:'',orientationGroupId:'',hiresGroupId:'',activeRosterGroupId:'',mode:'auto',joinedStages:['Orientation','Hires','Hired','Active Roster'],hireStages:['Hires','Hired'],...migrated};}
export function parseBoardId(value){const raw=String(value||'').trim();if(/^\d+$/.test(raw))return raw;try{const u=new URL(raw);if(u.protocol!=='https:'||!/(^|\.)monday\.com$/i.test(u.hostname))return '';return u.pathname.match(/\/boards\/(\d+)/)?.[1]||''}catch{return ''}}
export async function saveMondayConfig(input){const current=await getMondayConfig(),boardId=parseBoardId(input.boardId??current.boardId);if(!boardId)throw Error('Enter a valid Monday board ID or link.');const changed=boardId!==current.boardId;const cfg={...current,boardId};for(const key of ['emailColumnId','phoneColumnId','stageColumnId','sourceColumnId','volumeColumnId','orientationGroupId','hiresGroupId','activeRosterGroupId'])cfg[key]=String(input[key]??(changed?'':current[key]??'')).slice(0,100);cfg.mode=['auto','groups','status'].includes(input.mode)?input.mode:current.mode;
 for(const key of ['joinedStages','hireStages'])if(Array.isArray(input[key]))cfg[key]=[...new Set(input[key].map(x=>String(x).trim()).filter(Boolean))].slice(0,30);
 const board=await getBoardMeta(boardId);for(const key of ['emailColumnId','phoneColumnId','stageColumnId','sourceColumnId','volumeColumnId'])if(cfg[key]&&!board.columns.some(c=>c.id===cfg[key]))throw Error('A selected column does not belong to this board. Load the board again.');for(const key of ['orientationGroupId','hiresGroupId','activeRosterGroupId'])if(cfg[key]&&!board.groups.some(g=>g.id===cfg[key]&&!g.deleted&&!g.archived))throw Error('A selected group does not belong to this board.');
 if(cfg.mode==='status'&&(!cfg.stageColumnId||!cfg.joinedStages.length||!cfg.hireStages.length))throw Error('Select a status column and enter completion and hire labels.');
 await store().setJSON(CONFIG_KEY,cfg);return cfg;}
export async function getBoardMeta(selectedBoardId){const boardId=selectedBoardId?parseBoardId(selectedBoardId):(await getMondayConfig()).boardId;if(!boardId)throw Error('Choose a Monday board.');const q=`query($ids:[ID!]!){boards(ids:$ids){id name columns{id title type} groups{id title archived deleted}}}`;const d=await mondayRequest(q,{ids:[String(boardId)]});const b=d.boards?.[0];if(!b)throw Error('Monday board not found or the API token cannot access it.');return b;}
export function pickGroup(groups,id,label){if(id)return groups.find(g=>g.id===id)||null;const exact=groups.filter(g=>normTitle(g.title)===normTitle(label));if(exact.length===1)return exact[0];const similar=groups.filter(g=>(' '+normTitle(g.title)+' ').includes(' '+normTitle(label)+' '));return similar.length===1?similar[0]:null;}
export function itemRole(item,cfg,{orientation,hires,activeRoster}){const group=item.group?.id;const status=normTitle(cv(item,cfg.stageColumnId));const useGroups=cfg.mode!=='status',useStatus=cfg.mode==='status'||(cfg.mode==='auto'&&!hires);return {isHire:Boolean((useGroups&&hires&&group===hires.id)||(useStatus&&cfg.hireStages.some(s=>normTitle(s)===status))),completed:Boolean((useGroups&&[orientation,hires,activeRoster].filter(Boolean).some(g=>group===g.id))||(useStatus&&[...cfg.joinedStages,...cfg.hireStages].some(s=>normTitle(s)===status))),stage:useStatus&&status?cv(item,cfg.stageColumnId):item.group?.title||'Joined WCL'};}
export async function getRecruitingItems(board,columnIds=[],startDateColumnId='',cfg=null){cfg=cfg||await getMondayConfig();const groups=(board.groups||[]).filter(g=>!g.archived&&!g.deleted);const orientation=pickGroup(groups,cfg.orientationGroupId,'Orientation'),hires=pickGroup(groups,cfg.hiresGroupId,'Hires')||(!cfg.hiresGroupId?pickGroup(groups,'','Hired'):null),activeRoster=pickGroup(groups,cfg.activeRosterGroupId,'Active Roster');const targetGroups=[orientation,hires,activeRoster].filter(Boolean);const useStatus=cfg.mode==='status'||(cfg.mode==='auto'&&!hires&&cfg.stageColumnId);if(!targetGroups.length&&!useStatus)throw Error('Select the Hires group or a status column and Hires label in Monday settings.');
 const all=[];const next=`query($cursor:String!,$limit:Int!){next_items_page(cursor:$cursor,limit:$limit){cursor items{id name group{id title} column_values{id text value}}}}`;
 async function fetchFiltered(rules){const first=`query($ids:[ID!]!,$limit:Int!){boards(ids:$ids){items_page(limit:$limit,query_params:{rules:[${rules.join(',')}],operator:and}){cursor items{id name group{id title} column_values{id text value}}}}}`;let d=await mondayRequest(first,{ids:[String(board.id)],limit:100});let page=d.boards?.[0]?.items_page;if(!page)throw Error('Monday did not return a complete item page.');all.push(...(page.items||[]));let cursor=page.cursor;while(cursor){d=await mondayRequest(next,{cursor,limit:100});page=d.next_items_page;if(!page)throw Error('Monday pagination could not be completed.');all.push(...(page.items||[]));cursor=page.cursor;}}
 if(cfg.mode!=='status')for(const group of targetGroups){const rules=[`{column_id:"group",compare_value:[${JSON.stringify(String(group.id))}],operator:any_of}`];if(group===activeRoster&&startDateColumnId)rules.push(`{column_id:${JSON.stringify(startDateColumnId)},compare_value:["EXACT","2026-01-01"],operator:greater_than_or_equals}`);await fetchFiltered(rules)}
 if(useStatus){if(!cfg.stageColumnId)throw Error('Choose the stage/status column.');const labels=[...new Set([...cfg.joinedStages,...cfg.hireStages])];await fetchFiltered([`{column_id:${JSON.stringify(cfg.stageColumnId)},compare_value:${JSON.stringify(labels)},operator:contains_terms}`])}
 const byId=new Map();for(const item of all)if(itemRole(item,cfg,{orientation,hires,activeRoster}).completed)byId.set(String(item.id),item);return {items:[...byId.values()],orientation,hires,activeRoster,groups:targetGroups,completionRule:Boolean(orientation||hires||useStatus)};
}

const cv=(item,id)=>item.column_values?.find(c=>c.id===id)?.text||'';
const normalizeName=v=>String(v||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const normTitle=v=>String(v||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ');
const firstColumn=(columns,names)=>{const wanted=names.map(normTitle);return columns.find(c=>wanted.includes(normTitle(c.title)))||null};
const fuzzyColumn=(columns,terms)=>columns.find(c=>terms.some(t=>normTitle(c.title).includes(t)))||null;
export async function resolveMondayConfig(){
 const saved=await getMondayConfig();
 const board=await getBoardMeta(saved.boardId);
 const columns=board.columns||[];
 const email=columns.find(c=>c.id===saved.emailColumnId)||firstColumn(columns,['Personal Email','Email','Email Address']);
 const phone=columns.find(c=>c.id===saved.phoneColumnId)||firstColumn(columns,['Cell Phone','Phone','Phone Number','Mobile Phone']);
 const stage=columns.find(c=>c.id===saved.stageColumnId)||firstColumn(columns,['Stage','Status','Recruiting Stage']);
 const source=columns.find(c=>c.id===saved.sourceColumnId)||firstColumn(columns,['Candidate Source'])||firstColumn(columns,['Source','Recruiting Source','Lead Source','Referral Source']);
 const startDate=firstColumn(columns,['Start Date','Employee Start Date','Hire Date']);
 const volume=columns.find(c=>c.id===saved.volumeColumnId)||firstColumn(columns,['Production Volume','Annual Volume','Previous Volume','12 Month Volume','12-Month Volume','TTM Volume','Volume'])||fuzzyColumn(columns,['production volume','annual volume','previous volume','12 month volume','ttm volume']);
 const config={...saved,emailColumnId:email?.id||'',phoneColumnId:phone?.id||'',stageColumnId:stage?.id||'',sourceColumnId:source?.id||'',volumeColumnId:volume?.id||''};
 return {board,columns,config,detected:{source:source?{id:source.id,title:source.title,type:source.type}:null,email:email?{id:email.id,title:email.title}:null,phone:phone?{id:phone.id,title:phone.title}:null,stage:stage?{id:stage.id,title:stage.title}:null,startDate:startDate?{id:startDate.id,title:startDate.title}:null,volume:volume?{id:volume.id,title:volume.title}:null}};
}
export async function getConversionData(registrations){
 const resolved=await resolveMondayConfig(); const config=resolved.config; const required=config.emailColumnId||config.phoneColumnId;
 const {items,orientation,hires,activeRoster,groups,completionRule}=await getRecruitingItems(resolved.board,[config.emailColumnId,config.phoneColumnId,config.volumeColumnId].filter(Boolean),resolved.detected.startDate?.id||'',config); const emails=new Map(),phones=new Map();
 for(const item of items){const e=normalizeEmail(cv(item,config.emailColumnId)),p=normalizePhone(cv(item,config.phoneColumnId)); if(e){if(!emails.has(e))emails.set(e,[]);emails.get(e).push(item)} if(p.length>=10){if(!phones.has(p))phones.set(p,[]);phones.get(p).push(item)}}
 const roles=item=>itemRole(item,config,{orientation,hires,activeRoster});
 const sourceReport=buildSourceReport(items,config,roles,resolved.detected.source);await store().setJSON('monday-source-report:'+config.boardId,sourceReport);
 const matches=[],possibleMatches=[],diagnostics=[];
 const mondayByName=new Map();
 for(const item of items){const n=normalizeName(item.name);if(n){if(!mondayByName.has(n))mondayByName.set(n,[]);mondayByName.get(n).push(item)}}
 for(const r of registrations){const e=normalizeEmail(r.email),p=normalizePhone(r.phone); const candidates=new Map(); for(const x of emails.get(e)||[])candidates.set(x.id,{item:x,email:true,phone:false}); for(const x of phones.get(p)||[]){const c=candidates.get(x.id)||{item:x,email:false,phone:false};c.phone=true;candidates.set(x.id,c)}
   const exact=[...candidates.values()]; if(exact.length===1){const m=exact[0],stage=roles(m.item).stage,volume=moneyNumber(cv(m.item,config.volumeColumnId)); matches.push({registration:r,mondayItemId:m.item.id,mondayName:m.item.name,stage,volume,mondayBoardId:config.boardId,mondaySource:cv(m.item,config.sourceColumnId),isHire:roles(m.item).isHire,joined:true,matchMethod:m.email&&m.phone?'Email + Phone':m.email?'Email':'Phone'});} else if(exact.length>1){possibleMatches.push({registration:r,reason:'Multiple Monday records match this email/phone',count:exact.length});}
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
       matches.push({registration:r,mondayItemId:item.id,mondayName:item.name,stage:roles(item).stage,volume,mondayBoardId:config.boardId,mondaySource:cv(item,config.sourceColumnId),isHire:roles(item).isHire,joined:true,matchMethod:'Unique Exact Name'});
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
 return {configured:Boolean(required),sourceReport,completionRule,hiresGroup:hires?{id:hires.id,title:hires.title}:null,config,matches,possibleMatches,diagnostics,nameSourceDiagnostics,mondayItems:items.length,board:resolved.board,detected:resolved.detected,orientationGroup:orientation?{id:orientation.id,title:orientation.title}:null,activeRosterGroup:activeRoster?{id:activeRoster.id,title:activeRoster.title}:null,recruitingGroups:groups.map(g=>({id:g.id,title:g.title}))};
}

export function buildSourceReport(items,config,role,sourceColumn){const counts=new Map(),hires=[];for(const item of items){if(!role(item).isHire)continue;const raw=String(cv(item,config.sourceColumnId)||'').trim();const source=!raw||['select source','select a source'].includes(raw.toLowerCase())?'Not specified':raw;const key=source.toLowerCase();const old=counts.get(key)||{source,count:0};old.count++;counts.set(key,old);hires.push({id:String(item.id),name:item.name,source,stage:role(item).stage,volume:moneyNumber(cv(item,config.volumeColumnId))})}return {boardId:config.boardId,updatedAt:new Date().toISOString(),sourceColumnId:config.sourceColumnId,sourceColumnTitle:sourceColumn?.title||'',configured:Boolean(sourceColumn),totalHires:hires.length,bySource:[...counts.values()].sort((a,b)=>b.count-a.count||a.source.localeCompare(b.source)),hires};}
