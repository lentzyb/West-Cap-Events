const CACHE='wcl-offline-shell-v1';
const SHELL=['/event.html','/check-in.html','/event-page.js','/event-page.css','/styles.css','/offline.js','/check-in-client.js'];
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{if(event.data?.type!=='prepare')return;event.waitUntil((async()=>{try{const cache=await caches.open(CACHE);await cache.addAll(SHELL);event.ports[0]?.postMessage({ok:true});}catch{event.ports[0]?.postMessage({ok:false});}})());});
self.addEventListener('fetch',event=>{
 const u=new URL(event.request.url);if(event.request.method!=='GET'||u.origin!==self.location.origin)return;
 // API data, private links and admin pages are never stored in Cache Storage.
 let fallback;if(event.request.mode==='navigate'){if(u.pathname.startsWith('/event/')||u.pathname==='/event.html')fallback='/event.html';else if(u.pathname==='/check-in.html')fallback='/check-in.html';else return;}
 else if(SHELL.includes(u.pathname))fallback=u.pathname;else return;
 event.respondWith(fetch(event.request).then(response=>{if(response.status>=500)throw Error('Page unavailable');return response;}).catch(async()=>{const cached=await(await caches.open(CACHE)).match(fallback,{ignoreSearch:true});return cached||new Response('Connect to the internet and prepare this device for offline use first.',{status:503,headers:{'content-type':'text/plain'}});}));
});
