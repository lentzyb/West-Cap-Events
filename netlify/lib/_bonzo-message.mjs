const aliases=new Map([['outgoing','outgoing'],['outbound','outgoing'],['out','outgoing'],['outcoming','outgoing'],['incoming','incoming'],['inbound','incoming'],['in','incoming']]);
function namedDirection(value){
 if(typeof value==='string')return aliases.get(value.trim().toLowerCase())||null;
 if(value&&typeof value==='object'&&!Array.isArray(value)){
  const values=['value','name','label'].filter(key=>Object.hasOwn(value,key)).map(key=>namedDirection(value[key])).filter(Boolean);
  return values.length&&new Set(values).size===1?values[0]:null;
 }
 return null;
}
const flag=value=>value===true||value===1||value==='true'||value==='1'?true:value===false||value===0||value==='false'||value==='0'?false:null;
const digits=v=>{const d=String(v??'').replace(/\D/g,'');return d.length===11&&d[0]==='1'?d.slice(1):d};
const lower=v=>String(v??'').trim().toLowerCase();
// When Bonzo omits direction, a sender/recipient that exactly equals the prospect's own
// phone or email is positive evidence. Anything short of an exact, one-sided match stays unknown.
function contactDirection(message,prospect){
 if(!prospect)return null;
 const phone=digits(prospect.phone),email=lower(prospect.email);
 const same=value=>{if(value&&typeof value==='object')value=value.phone??value.number??value.email??value.address;if(typeof value!=='string'&&typeof value!=='number')return false;const d=digits(value);return Boolean((phone.length>=10&&d===phone)||(email&&lower(value)===email));};
 const any=keys=>keys.some(key=>same(message[key]));
 const to=any(['to','to_number','to_phone','to_email','recipient']),from=any(['from','from_number','from_phone','from_email','sender']);
 return to&&!from?'outgoing':from&&!to?'incoming':null;
}
export function messageDirection(message,prospect){
 const signals=[namedDirection(message.direction),namedDirection(message.message_direction)].filter(Boolean);
 for(const key of ['is_outgoing','outgoing','is_incoming','incoming']){
  const value=flag(message[key]);if(value===null)continue;
  const outgoing=key.includes('outgoing')?value:!value;signals.push(outgoing?'outgoing':'incoming');
 }
 if(signals.length)return new Set(signals).size===1?signals[0]:'unknown';
 // Bonzo can omit direction in API responses. Its explicit 'sent' state is
 // positive send evidence for written/voicemail messages. 'Delivered' is
 // deliberately excluded: Bonzo also uses it for incoming messages.
 const missingDirection=message.direction==null&&message.message_direction==null&&['is_outgoing','outgoing','is_incoming','incoming'].every(key=>message[key]==null);
 if(missingDirection&&message.status==='sent'&&!message.error_message&&['sms','email','voicemail'].includes(message.type))return 'outgoing';
 if(missingDirection)return contactDirection(message,prospect)||'unknown';
 return 'unknown';
}
// Only directional metadata, never message text, addresses, tokens or the full API payload.
export function directionDescription(message){
 const describe=value=>{
  if(value===undefined)return 'missing';if(value===null)return 'null';
  if(typeof value==='boolean')return 'boolean:'+value;
  if(typeof value==='number')return 'number:'+value;
  if(typeof value==='string')return /^[a-zA-Z0-9_ -]{0,40}$/.test(value)?'string:'+value:'unrecognized string';
  if(typeof value==='object')return 'object';return typeof value;
 };
 return ['direction','message_direction','is_outgoing','outgoing','is_incoming','incoming'].filter(key=>Object.hasOwn(message,key)).map(key=>key+'='+describe(message[key])).join(', ')||'direction field missing';
}

// Field names only (never values), so the real Bonzo message shape can be read from the admin diagnostic.
export const fieldNames=message=>Object.keys(message||{}).filter(key=>/^[a-zA-Z0-9_]{1,40}$/.test(key)).sort().slice(0,60);
export const directionBasis=(message,prospect)=>message.direction==null&&message.message_direction==null&&message.status!=='sent'&&messageDirection(message)==='unknown'&&messageDirection(message,prospect)==='outgoing'?'contact-match':message.direction==null&&message.message_direction==null&&messageDirection(message)==='outgoing'&&['is_outgoing','outgoing','is_incoming','incoming'].every(key=>message[key]==null)?'sent-status':'explicit-direction';
