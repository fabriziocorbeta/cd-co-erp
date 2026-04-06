// CD & Co ERP — PWA
// ====================================

// ══════════════════════════════════════════
// PWA
// ══════════════════════════════════════════
(function(){
  const M={name:'CD & Co — ERP',short_name:'CD & Co',description:'Finanzas y gestión de negocio',start_url:'./',display:'standalone',orientation:'any',background_color:'#0c0b09',theme_color:'#0c0b09',
    shortcuts:[{name:'Nueva venta',short_name:'Venta',url:'./?action=sale'},{name:'Nuevo ingreso',short_name:'Ingreso',url:'./?action=income'},{name:'Nuevo pedido',short_name:'Pedido',url:'./?action=order'}],
    icons:[{src:"data:image/svg+xml,"+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" fill="#0c0b09"/><circle cx="96" cy="96" r="82" fill="none" stroke="#c9960c" stroke-width="1.5"/><circle cx="96" cy="14.5" r="5" fill="#e8b124"/><text x="96" y="88" text-anchor="middle" font-family="serif" font-size="34" fill="#e8b124" font-weight="300" letter-spacing="4">CD</text><text x="96" y="114" text-anchor="middle" font-family="serif" font-size="16" fill="#8a8278" font-weight="300" letter-spacing="8">&amp; Co</text></svg>`),sizes:'192x192',type:'image/svg+xml',purpose:'any maskable'}]};
  const blob=new Blob([JSON.stringify(M)],{type:'application/manifest+json'});
  document.getElementById('pwa-manifest').href=URL.createObjectURL(blob);
})();
if('serviceWorker' in navigator){
  const SW=`const V='cdco-erp-v2-stitch';self.addEventListener('install',e=>{e.waitUntil(self.skipWaiting())});self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;if(e.request.url.includes('supabase.co')){e.respondWith(fetch(e.request).catch(()=>new Response('{}',{headers:{'Content-Type':'application/json'}})));return;}e.respondWith(caches.match(e.request).then(c=>{const f=fetch(e.request).then(r=>{if(r.ok){const cl=r.clone();caches.open(V).then(ca=>ca.put(e.request,cl))}return r}).catch(()=>c);return c||f;}));});`;
  navigator.serviceWorker.register(URL.createObjectURL(new Blob([SW],{type:'application/javascript'})),{scope:'./'}).catch(e=>console.warn('SW:',e));
}
window.addEventListener('offline',()=>{g('off-bar').classList.add('show');toast('⚡ Sin conexión')});
window.addEventListener('online',()=>{g('off-bar').classList.remove('show');toast('◆ Conexión restaurada')});
let dPr=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();dPr=e;setTimeout(()=>{if(dPr)g('inst-bar').classList.add('show')},4000)});
g('ib-install')?.addEventListener('click',async()=>{if(!dPr)return;g('inst-bar').classList.remove('show');dPr.prompt();const{outcome}=await dPr.userChoice;if(outcome==='accepted')toast('◆ CD & Co instalada');dPr=null});
g('ib-close')?.addEventListener('click',()=>{g('inst-bar').classList.remove('show');dPr=null});
function setVH(){document.documentElement.style.setProperty('--vh',window.innerHeight*.01+'px')}setVH();window.addEventListener('resize',setVH);

// ══════════════════════════════════════════
// URL SHORTCUTS
// ══════════════════════════════════════════
const UP=new URLSearchParams(location.search);
if(UP.get('action')==='sale')setTimeout(()=>openSaleModal(),500);
if(UP.get('action')==='income')setTimeout(()=>openTxModal('income'),500);
if(UP.get('action')==='order')setTimeout(()=>openOrderModal(),500);

// Session check
async function chkSess(){if(!SB_ON)return;const{data:{session}}=await sb.auth.getSession();if(session){S.user=session.user;const name=session.user.user_metadata?.full_name||session.user.email.split('@')[0];enterApp(name,'pro');}}
chkSess();
