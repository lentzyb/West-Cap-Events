import {kickWorker} from './_notifications.mjs';
export const config={schedule:'0 * * * *'};
export default async ()=>{const result=await kickWorker(true);if(!result.queued&&result.reason)console.error('Notification schedule not dispatched:',result.reason);return new Response(null,{status:204})};
