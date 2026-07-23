import { access } from "node:fs/promises";
const requiredFiles=["public/index.html","public/admin.html","public/admin.js","public/event.html","public/styles.css","netlify/functions/_shared.mjs","netlify/functions/events.mjs","netlify/functions/registrations.mjs","netlify/functions/analytics.mjs","netlify/functions/webhook-client.mjs"];
for(const file of requiredFiles) await access(file);
console.log("WCL Event Platform edit and analytics edition is ready.");