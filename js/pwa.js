// CD & Co ERP — PWA
// ====================================

// ══════════════════════════════════════════
// PWA
// ══════════════════════════════════════════
(function(){
  const M={name:'CD & Co — ERP',short_name:'CD & Co',description:'Finanzas y gestión de negocio',start_url:'./',display:'standalone',orientation:'any',background_color:'#0c0b09',theme_color:'#0c0b09',
    shortcuts:[{name:'Nueva venta',short_name:'Venta',url:'./?action=sale'},{name:'Nuevo ingreso',short_name:'Ingreso',url:'./?action=income'},{name:'Nuevo pedido',short_name:'Pedido',url:'./?action=order'}],
    icons:[
      {src:'/assets/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},
      {src:'/assets/icon-192.png',sizes:'192x192',type:'image/png',purpose:'maskable'},
      {src:'/assets/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},
      {src:'/assets/icon-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}
    ]};
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
// COMMAND BAR (Ctrl+K)
// ══════════════════════════════════════════
const CMD_ACTIONS = [
  { label: '⇄ Transferir entre cuentas',    keys: ['transferir','transfer','mover'],       action: () => openTransferModal() },
  { label: '＋ Nueva Venta',                 keys: ['venta','sale','cobrar','factura'],     action: () => openSaleModal() },
  { label: '⛽ Carga de Combustible',        keys: ['combustible','nafta','gasolina','km'], action: () => openFuelModal() },
  { label: '＋ Nuevo Movimiento',            keys: ['movimiento','ingreso','egreso','gasto'],action: () => openTxModal?.() },
  { label: '📦 Nuevo Pedido',               keys: ['pedido','compra','proveedor','order'], action: () => openOrderModal() },
  { label: '🚗 Ver Flota',                  keys: ['flota','vehiculo','auto','fleet'],     action: () => goPage('fleet') },
  { label: '📊 Dashboard',                  keys: ['dashboard','inicio','home'],           action: () => goPage('dashboard') },
  { label: '💼 Inventario',                 keys: ['inventario','producto','stock'],       action: () => goPage('inventory') },
  { label: '🏦 Mis Cuentas',               keys: ['cuentas','cuenta','bancaria','banco'], action: () => goPage('accounts') },
  { label: '🏦 Conciliación Bancaria',      keys: ['conciliar','extracto','bancario'],     action: () => { goPage('accounts'); setTimeout(()=>openReconcileModal(),200); } },
  { label: '🎯 Metas de Ahorro',            keys: ['metas','ahorro','objetivo'],           action: () => goPage('goals') },
  { label: '💳 Presupuestos',              keys: ['presupuesto','budget','limite'],        action: () => goPage('budgets') },
  { label: '🔄 Suscripciones',             keys: ['suscripcion','subscription','recurrente'], action: () => goPage('subscriptions') },
  { label: '⚙️ Configuración',              keys: ['configuracion','settings','empresa'],  action: () => goPage('settings') },
  { label: '🌙 Alternar Modo Claro/Oscuro', keys: ['modo','dark','light','tema'],          action: () => toggleMode() },
];

let _cmdIdx = 0;

function openCmdBar() {
  const el = g('cmd-bar');
  if (!el) return;
  g('cmd-input').value = '';
  _cmdIdx = 0;
  renderCmdList('');
  el.style.display = 'flex';
  setTimeout(() => g('cmd-input')?.focus(), 50);
}

function renderCmdList(q) {
  const el = g('cmd-list');
  if (!el) return;
  const filtered = q
    ? CMD_ACTIONS.filter(a => a.label.toLowerCase().includes(q.toLowerCase()) || a.keys.some(k => k.includes(q.toLowerCase())))
    : CMD_ACTIONS;

  el.innerHTML = filtered.length
    ? filtered.map((a, i) => `
        <div class="cmd-item ${i === _cmdIdx ? 'cmd-item-active' : ''}" id="cmd-item-${i}" onclick="execCmd(${i})" onmouseenter="_cmdIdx=${i};renderCmdList(document.getElementById('cmd-input').value)">
          ${a.label}
        </div>
      `).join('')
    : '<div style="color:var(--mu);font-size:.8rem;text-align:center;padding:20px">Sin resultados</div>';

  window._cmdFiltered = filtered;
}

function filterCmdBar() {
  _cmdIdx = 0;
  renderCmdList(g('cmd-input')?.value || '');
}

function handleCmdKey(e) {
  const filtered = window._cmdFiltered || CMD_ACTIONS;
  if (e.key === 'ArrowDown') { e.preventDefault(); _cmdIdx = Math.min(_cmdIdx + 1, filtered.length - 1); renderCmdList(g('cmd-input').value); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); _cmdIdx = Math.max(_cmdIdx - 1, 0); renderCmdList(g('cmd-input').value); }
  else if (e.key === 'Enter') { e.preventDefault(); execCmd(_cmdIdx); }
  else if (e.key === 'Escape') { cm('cmd-bar'); }
}

function execCmd(idx) {
  const filtered = window._cmdFiltered || CMD_ACTIONS;
  const action = filtered[idx];
  if (!action) return;
  cm('cmd-bar');
  setTimeout(() => action.action(), 80);
}

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    const el = g('cmd-bar');
    if (el && el.style.display !== 'none') cm('cmd-bar');
    else openCmdBar();
  }
});

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
