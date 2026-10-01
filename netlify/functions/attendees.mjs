import { json, requireAdmin, parseJSON, listAll, store, clean, slugify, readEvent } from "./_shared.mjs";
import * as XLSX from "xlsx";
import crypto from "node:crypto";

const normHeader=v=>String(v||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ');
const normEmail=v=>String(v||'').trim().toLowerCase();
const normPhone=v=>{let d=String(v||'').replace(/\D/g,'');if(d.length===11&&d.startsWith('1'))d=d.slice(1);return d;};
const normName=v=>String(v||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const firstValue=(row,aliases)=>{const entries=Object.entries(row||{});for(const alias of aliases){const hit=entries.find(([k])=>normHeader(k)===alias);if(hit&&String(hit[1]??'').trim())return String(hit[1]).trim();}return ''};
const aliases={
 first:['first name','firstname','first','given name'],last:['last name','lastname','last','surname','family name'],
 name:['name','full name','candidate name','attendee name'],email:['email','email address','personal email','e mail'],
 phone:['phone','phone number','cell phone','mobile','mobile phone','telephone'],nmls:['nmls','nmls id','nmls number','nmls #']
};
const splitName=(full)=>{const parts=String(full||'').trim().split(/\s+/).filter(Boolean);return {firstName:parts[0]||'',lastName:parts.slice(1).join(' ')}};
const attendeeKey=(slug,id)=>`attendee:${slug}:${id}`;

export default async req=>{try{
 const auth=requireAdmin(req);if(!auth.ok)return auth.response;
 const url=new URL(req.url);const slug=slugify(url.searchParams.get('slug')||'');if(!slug)return json({error:'Event is required.'},400);
 const event=await readEvent(slug);if(!event)return json({error:'Event not found.'},404);
 if(req.method==='GET'){const attendees=await listAll(`attendee:${slug}:`);return json({attendees:attendees.sort((a,b)=>String(a.lastName).localeCompare(String(b.lastName))),count:attendees.length});}
 if(req.method==='DELETE'){const attendees=await listAll(`attendee:${slug}:`);for(const a of attendees)await store().delete(attendeeKey(slug,a.id));return json({ok:true,deleted:attendees.length});}
 if(req.method!=='POST')return json({error:'Method not allowed.'},405);
 const body=await parseJSON(req)||{};if(!body.dataBase64)return json({error:'Choose a CSV or Excel file first.'},400);
 let buf;try{buf=Buffer.from(String(body.dataBase64),'base64')}catch{return json({error:'Unable to read uploaded file.'},400)}
 if(buf.length>3*1024*1024)return json({error:'Attendee file is too large. Please keep it under 3 MB.'},413);
 let wb;try{wb=XLSX.read(buf,{type:'buffer',cellDates:false})}catch(e){return json({error:'Unable to read this spreadsheet. Use .xlsx, .xls, or .csv.'},400)}
 const sheet=wb.Sheets[wb.SheetNames[0]];if(!sheet)return json({error:'The uploaded file has no worksheet.'},400);
 const rows=XLSX.utils.sheet_to_json(sheet,{defval:'',raw:false});if(!rows.length)return json({error:'The uploaded attendee list is empty.'},400);
 const detectedHeaders=Object.keys(rows[0]||{});
 const parsed=[];for(const row of rows){let firstName=firstValue(row,aliases.first),lastName=firstValue(row,aliases.last);if(!firstName&&!lastName){const s=splitName(firstValue(row,aliases.name));firstName=s.firstName;lastName=s.lastName}const email=firstValue(row,aliases.email),phone=firstValue(row,aliases.phone),nmls=firstValue(row,aliases.nmls);if(!firstName&&!lastName&&!email&&!phone&&!nmls)continue;parsed.push({firstName:clean(firstName,100),lastName:clean(lastName,100),email:clean(email,200),phone:clean(phone,80),nmls:clean(nmls,80)})}
 if(!parsed.length)return json({error:`No attendee rows could be recognized. Headers found: ${detectedHeaders.join(', ')}`},400);
 // Event-local dedupe. Prefer email, then phone, then NMLS, then exact full name.
 const unique=new Map();for(const a of parsed){const e=normEmail(a.email),p=normPhone(a.phone),n=String(a.nmls||'').replace(/\D/g,''),name=normName(`${a.firstName} ${a.lastName}`);const key=e?`e:${e}`:p.length>=10?`p:${p}`:n?`n:${n}`:name?`name:${name}`:`row:${unique.size}`;if(!unique.has(key))unique.set(key,a)}
 const existing=await listAll(`attendee:${slug}:`);for(const a of existing)await store().delete(attendeeKey(slug,a.id));
 const now=new Date().toISOString();let saved=0;for(const a of unique.values()){const id=crypto.randomUUID();await store().setJSON(attendeeKey(slug,id),{id,eventSlug:slug,eventName:event.name||slug,sourceType:'imported',firstName:a.firstName,lastName:a.lastName,email:a.email,phone:a.phone,nmls:a.nmls,importedAt:now,createdAt:now});saved++}
 return json({ok:true,event:{slug,name:event.name},imported:saved,rowsRead:rows.length,duplicatesRemoved:Math.max(0,parsed.length-saved),headers:detectedHeaders});
 }catch(error){console.error('attendees function error',error);return json({error:'Unable to import attendees.',details:error.message},500)}};
