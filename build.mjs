import { access } from "node:fs/promises";
const required = [
  "public/index.html","public/admin.html","public/admin.js","public/event.html","public/styles.css",
  "netlify/functions/_shared.mjs","netlify/functions/events.mjs","netlify/functions/recruiters.mjs",
  "netlify/functions/referrers.mjs","netlify/functions/registrations.mjs","netlify/functions/bonzo-client.mjs"
];
for (const file of required) await access(file);
console.log("WCL Event Platform v2 is ready.");
