import { access } from "node:fs/promises";
const requiredFiles=[
  "public/index.html","public/admin.html","public/admin.js","public/event.html","public/styles.css",
  "netlify/functions/_shared.mjs","netlify/functions/auth.mjs","netlify/functions/events.mjs",
  "netlify/functions/recruiters.mjs","netlify/functions/webhooks.mjs","netlify/functions/referrers.mjs",
  "netlify/functions/registrations.mjs","netlify/functions/webhook-client.mjs","netlify/functions/export.mjs","netlify/functions/qr.mjs"
];
for(const file of requiredFiles) await access(file);
console.log("WCL Event Platform campaign library edition is ready.");
