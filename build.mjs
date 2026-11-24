import { access } from "node:fs/promises";
const requiredFiles=["public/offline.js","public/offline-worker.js","public/check-in-client.js","public/check-in.html","netlify/functions/sponsorships.mjs","public/sponsorships-admin.js","netlify/lib/_report.mjs","netlify/functions/bonzo-events.mjs","netlify/lib/_bonzo.mjs","netlify/lib/_email.mjs","public/video-editor.js","netlify/functions/media.mjs","public/gallery-editor.js","public/monday-sources.js","public/notifications-admin.js","public/follow-up.html","public/follow-up.js","netlify/lib/_notifications.mjs","netlify/functions/notifications.mjs","netlify/functions/follow-up.mjs","netlify/functions/notification-worker-background.mjs","netlify/functions/notification-schedule.mjs","public/index.html","public/admin.html","public/admin.js","public/event.html","public/styles.css","public/event-page.css","public/event-page.js","public/page-editor.js","netlify/lib/_event-page.mjs","netlify/lib/_shared.mjs","netlify/functions/events.mjs","netlify/functions/registrations.mjs","netlify/functions/analytics.mjs","netlify/functions/attendees.mjs","netlify/lib/webhook-client.mjs"];
for(const file of requiredFiles) await access(file);
console.log("WCL Event Platform edit and analytics edition is ready.");
// Every file in this directory is deployed as an endpoint; libraries belong in netlify/lib.
const { readdir } = await import('node:fs/promises');
const { pathToFileURL } = await import('node:url');
const { resolve } = await import('node:path');
const { execFileSync } = await import('node:child_process');
const entries=(await readdir('netlify/functions')).filter(name=>name.endsWith('.mjs'));
for(const name of entries){
 const path=resolve('netlify/functions',name);
 execFileSync(process.execPath,['--check',path],{stdio:'pipe'});
 const endpoint=await import(pathToFileURL(path).href);
 if(typeof endpoint.default!=='function'&&typeof endpoint.handler!=='function')throw Error(`${name} is a library, not a deployable function. Move it to netlify/lib.`);
}
console.log(`Validated ${entries.length} deployable function handlers.`);
