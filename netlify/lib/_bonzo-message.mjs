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
export function messageDirection(message){
 const signals=[namedDirection(message.direction),namedDirection(message.message_direction)].filter(Boolean);
 for(const key of ['is_outgoing','outgoing','is_incoming','incoming']){
  const value=flag(message[key]);if(value===null)continue;
  const outgoing=key.includes('outgoing')?value:!value;signals.push(outgoing?'outgoing':'incoming');
 }
 return signals.length&&new Set(signals).size===1?signals[0]:'unknown';
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
