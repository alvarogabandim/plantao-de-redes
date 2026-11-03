/* Plantão de Redes · service worker: funciona sem internet (ônibus, metrô).
   Online: busca a versão nova primeiro (rede com tempo limite) e guarda cópia.
   Offline: usa a cópia guardada. */
const CACHE='plantao-v4';
const BASE=['./','index.html','motor.js','cli.js','aulas.js','captura.js','manifest.webmanifest','icones/icone-192.png','icones/icone-512.png','icones/apple-touch-icon.png','icones/favicon-32.png','v1/'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(BASE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
function comLimite(p,ms){return new Promise((ok,erro)=>{const t=setTimeout(()=>erro(new Error('tempo')),ms);p.then(r=>{clearTimeout(t);ok(r)},x=>{clearTimeout(t);erro(x)})})}
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;const url=new URL(req.url);
  if(url.hostname.endsWith('fonts.googleapis.com')||url.hostname.endsWith('fonts.gstatic.com')){
    e.respondWith(caches.open(CACHE).then(c=>c.match(req).then(r=>r||fetch(req).then(res=>{c.put(req,res.clone());return res}))));return}
  if(url.origin!==self.location.origin)return;
  e.respondWith(comLimite(fetch(req),3500).then(res=>{if(res.ok){const cp=res.clone();caches.open(CACHE).then(c=>c.put(req,cp))}return res})
    .catch(()=>caches.match(req,{ignoreSearch:true}).then(r=>r||caches.match('index.html'))));
});
