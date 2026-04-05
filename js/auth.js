// CD & Co ERP — AUTH
// ====================================

// ══════════════════════════════════════════
// PERSISTENCE
// ══════════════════════════════════════════
const LS='cdco_erp_v1';
function lsave(){
  try{localStorage.setItem(LS,JSON.stringify({txs:S.txs,products:S.products,sales:S.sales,orders:S.orders,contacts:S.contacts,plan:S.plan,cards:S.cards,debts:S.debts,accounts:S.accounts,budgets:S.budgets,subscriptions:S.subscriptions,appMode:S.appMode,goals:S.goals,historical:S.historical,receivables:S.receivables,vehicles:S.vehicles,fx:FX,user:S.user}))}catch(e){}
  try{localStorage.setItem('cdco_custom_cats',JSON.stringify(S.customCategories||{gastos:[],ingresos:[]}))}catch(e){}
  // Supabase writes are handled by write-through CRUD helpers (sbUpsert/sbDelete)
}
function lload(){
  try{
    const d=JSON.parse(localStorage.getItem(LS)||'{}');
    if(d.txs)S.txs=d.txs; if(d.products)S.products=d.products;
    if(d.sales)S.sales=d.sales; if(d.orders)S.orders=d.orders;
    if(d.contacts)S.contacts=d.contacts; if(d.plan)S.plan=d.plan;
    if(d.cards)S.cards=d.cards; if(d.debts)S.debts=d.debts;
    if(d.accounts)S.accounts=d.accounts;
    if(d.budgets)S.budgets=d.budgets;
    if(d.subscriptions)S.subscriptions=d.subscriptions;
    if(d.appMode)S.appMode=d.appMode;
    if(d.goals)S.goals=d.goals;
    if(d.historical)S.historical=d.historical;
    if(d.receivables)S.receivables=d.receivables;
    if(d.vehicles&&d.vehicles.length)S.vehicles=d.vehicles;
    // Purga automática de transacciones de seed de flota (prefijo _fuel_)
    // Éstas son datos de prueba que no deben afectar la contabilidad real
    S.txs = (S.txs||[]).filter(t => !(t.id && t.id.startsWith('_fuel_')));
    if(d.fx){
      FX.buy=d.fx.buy||0; FX.sell=d.fx.sell||0;
      FX.ts=d.fx.ts?new Date(d.fx.ts):null;
      FX.manual=!!d.fx.manual;
    }
    // Migración currency -> cur
    (S.accounts||[]).forEach(a=>{if(!a.cur && a.currency) a.cur=a.currency});
    (S.cards||[]).forEach(c=>{if(!c.cur && c.currency) c.cur=c.currency});
    (S.debts||[]).forEach(d=>{if(!d.cur && d.currency) d.cur=d.currency});
    (S.receivables||[]).forEach(r=>{if(!r.cur && r.currency) r.cur=r.currency});
    (S.budgets||[]).forEach(b=>{if(!b.cur && b.currency) b.cur=b.currency});
    (S.subscriptions||[]).forEach(s=>{if(!s.cur && s.currency) s.cur=s.currency});
    
    // Migración para transacciones (usar moneda de la cuenta vinculada o ₲ por defecto)
    (S.txs||[]).forEach(tx=>{
      if(!tx.cur && tx.currency) tx.cur=tx.currency;
      if(!tx.cur) {
        const acc = (S.accounts||[]).find(a=>a.id===(tx.account_id||tx.accountId));
        tx.cur = acc ? (acc.cur || acc.currency || '₲') : '₲';
      }
    });
  }catch(e){}
  try{
    const cats=JSON.parse(localStorage.getItem('cdco_custom_cats')||'{"gastos":[],"ingresos":[]}');
    S.customCategories = {gastos:cats.gastos||[], ingresos:cats.ingresos||[]};
  }catch(e){
    S.customCategories = {gastos:[], ingresos:[]};
  }
}
// ══════════════════════════════════════════
// SWR CACHE — stale-while-revalidate (5 min TTL)
// ══════════════════════════════════════════
const SWR_KEY = 'cdco_swr_v2';
const SWR_TTL = 5 * 60 * 1000; // 5 minutes

function swrSave() {
  try {
    localStorage.setItem(SWR_KEY, JSON.stringify({
      ts: Date.now(),
      txs: S.txs, accounts: S.accounts, products: S.products,
      sales: S.sales, orders: S.orders, contacts: S.contacts,
      cards: S.cards, debts: S.debts, budgets: S.budgets,
      subscriptions: S.subscriptions, receivables: S.receivables, goals: S.goals,
    }));
  } catch(e) {}
}

function swrLoad() {
  try {
    const d = JSON.parse(localStorage.getItem(SWR_KEY) || '{}');
    if (!d.ts || !d.accounts || !d.txs) return false;
    if (Date.now() - d.ts > SWR_TTL) return false; // caché vencido
    ['txs','accounts','products','sales','orders','contacts',
     'cards','debts','budgets','subscriptions','receivables','goals']
      .forEach(k => { if (d[k] !== undefined) S[k] = d[k]; });
    return true; // cache hit
  } catch(e) { return false; }
}

function defaults(){
  if(!S.accounts||!S.accounts.length) S.accounts=[
    {id:'acc1',name:'Efectivo Caja',type:'cash',bank:'',cur:'₲',initialBalance:1000000,notes:'Caja chica del negocio (₲)'},
    {id:'acc2',name:'Banco Itau Corriente',type:'bank',bank:'Itaú',cur:'₲',initialBalance:5000000,notes:'Cuenta operativa (₲)'},
    {id:'acc3',name:'Reserva Dólares',type:'bank',bank:'Itaú',cur:'$',initialBalance:1000,notes:'Ahorros en USD'},
  ];
  const cm=new Date().toISOString().slice(0,7);
  if(!S.budgets||!S.budgets.length) S.budgets=[
    {id:'bgt1',category:'Relojes',amount:500,cur:'$',month:cm},
    {id:'bgt2',category:'Stock / Compras',amount:1000,cur:'$',month:cm},
    {id:'bgt3',category:'Marketing',amount:200,cur:'$',month:cm},
    {id:'bgt4',category:'Servicios',amount:150,cur:'$',month:cm},
  ];
  if(!S.subscriptions||!S.subscriptions.length) S.subscriptions=[
    {id:'sub1',name:'Netflix',description:'Plan estándar',icon:'🎬',amount:12.99,cur:'$',frequency:'monthly',nextDate:'2026-03-25',active:true},
    {id:'sub2',name:'Spotify',description:'Plan individual',icon:'🎵',amount:6.99,cur:'$',frequency:'monthly',nextDate:'2026-03-22',active:true},
    {id:'sub3',name:'Adobe CC',description:'Creative Cloud',icon:'🎨',amount:599.88,cur:'$',frequency:'annual',nextDate:'2026-11-01',active:true},
    {id:'sub4',name:'Dominio web',description:'cd-co.com.py',icon:'🌐',amount:18,cur:'$',frequency:'annual',nextDate:'2026-06-15',active:true},
  ];
  if(!S.contacts.length) S.contacts=[
    {id:'con1',name:'Importadora Tokio PY',type:'supplier',phone:'+595 21 000111',email:'ventas@tokiopy.com',ruc:'80000001-0',notes:'Proveedor principal relojes'},
    {id:'con2',name:'María González',type:'client',phone:'+595 981 123456',email:'',ruc:'',notes:'Cliente frecuente'},
    {id:'con3',name:'Carlos Díaz',type:'client',phone:'+595 972 654321',email:'',ruc:'',notes:''},
  ];
  if(!S.products||!S.products.length) S.products=[
    {id:'p1',name:'Casio EF-316D',sku:'REL-001',cat:'Relojes',sup:'con1',buyPrice:35,sellPrice:60,stock:8,minStock:3,desc:'Acero inoxidable, resistente al agua'},
    {id:'p2',name:'Casio LTP-1302',sku:'REL-002',cat:'Relojes',sup:'con1',buyPrice:28,sellPrice:50,stock:2,minStock:3,desc:'Dama, correa metálica'},
    {id:'p3',name:'Correa silicona 22mm',sku:'ACC-001',cat:'Accesorios',sup:'',buyPrice:4,sellPrice:10,stock:15,minStock:5,desc:'Compatible múltiples modelos'},
    {id:'p4',name:'Seiko SNK809',sku:'REL-003',cat:'Relojes',sup:'con1',buyPrice:80,sellPrice:140,stock:0,minStock:2,desc:'Automático, 5 Sports'},
  ];
  if(!S.customCategories||(!S.customCategories.gastos.length&&!S.customCategories.ingresos.length)){
    S.customCategories={
      gastos:[
        {id:'cu_g1',name:'Schatzi',icon:'💕'},{id:'cu_g2',name:'Pautas publicitarias',icon:'📣'},
        {id:'cu_g3',name:'Comisiones pagadas',icon:'💸'},{id:'cu_g4',name:'Estacionamiento',icon:'🅿️'},
        {id:'cu_g5',name:'IVA',icon:'🧾'},{id:'cu_g6',name:'CostoOperativo',icon:'⚙️'}
      ],
      ingresos:[
        {id:'cu_i1',name:'Relojes',icon:'⌚'},{id:'cu_i2',name:'Accesorios',icon:'🎀'}
      ]
    };
  }
}
async function loadAllUserData() {
  const qTimeout = ms => new Promise(res => setTimeout(() => res({data:[], error:{message:'timeout'}}), ms));

  // Helper: fetch one table with timeout
  const fetchTable = (t, ms) => Promise.race([
    sb.from(t).select('*').order('created_at', { ascending: false }),
    qTimeout(ms)
  ]);

  // Helper: apply fetch results to S and run goals column mapping
  const applyResults = (tables, results) => {
    tables.forEach((t, i) => {
      const r = results[i];
      if (r.status === 'fulfilled' && r.value?.data && !r.value?.error) S[t] = r.value.data;
    });
    if (S.goals && S.goals.length) {
      S.goals = S.goals.map(g => ({
        ...g,
        target:  parseFloat(g.target_amount  || g.target  || 0),
        current: parseFloat(g.current_amount || g.current || 0),
        date:    g.deadline || g.date || null,
      }));
    }
  };

  // ── SWR: cache hit → render inmediato, revalidar en background ──────────
  if (swrLoad()) {
    recomputeBalances();
    if (typeof renderAll === 'function') renderAll();

    // Revalidar todas las tablas en paralelo (sin bloquear UI)
    const ALL = ['accounts','txs','products','sales','orders','contacts',
                 'cards','debts','budgets','subscriptions','receivables','goals'];
    Promise.allSettled(ALL.map(t => fetchTable(t, 12000))).then(results => {
      applyResults(ALL, results);
      recomputeBalances();
      swrSave();
      if (typeof renderAll === 'function') renderAll();
      if (typeof populateTxAccountSelect === 'function') populateTxAccountSelect();
    });
    return; // UI ya renderizada con datos del caché
  }

  // ── Cold start: no hay caché o expiró ───────────────────────────────────
  // FASE 1 — tablas críticas (bloqueante, necesarias para el dashboard)
  const critical = ['accounts', 'txs'];
  const critResults = await Promise.allSettled(critical.map(t => fetchTable(t, 8000)));
  applyResults(critical, critResults);
  recomputeBalances();

  // FASE 2 — resto en background (no bloquea la UI)
  const rest = ['products','sales','orders','contacts','cards','debts',
                'budgets','subscriptions','receivables','goals'];
  Promise.allSettled(rest.map(t => fetchTable(t, 12000))).then(results => {
    applyResults(rest, results);
    recomputeBalances();
    swrSave(); // guardar caché completo para próximas visitas
    if (typeof renderAll === 'function') renderAll();
    if (typeof populateTxAccountSelect === 'function') populateTxAccountSelect();
  });
}
// ── AUDIT-FIRST: balance = SUM(amount) — gastos son negativos en DB ─────────
function recomputeBalances() {
  if (!S.accounts || !S.txs) return;
  S.accounts = S.accounts.map(acc => ({
    ...acc,
    balance: S.txs
      .filter(t => t.account_id === acc.id)
      .reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0)
  }));
}
// ────────────────────────────────────────────────────────────────────────────

function uid(){
  if(typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{
    const r=Math.random()*16|0;return(c==='x'?r:(r&0x3|0x8)).toString(16);
  });
}
function today(){return new Date().toISOString().slice(0,10)}
function mkey(d){const dt=new Date(d+'T00:00:00');return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')}
function thisMo(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
function fmt(n,c){c=c||'$';if(c==='₲')return '₲'+Math.round(n).toLocaleString('es');return '$'+parseFloat(n||0).toLocaleString('es',{minimumFractionDigits:2,maximumFractionDigits:2})}
function fmtDate(d){if(!d)return '—';return new Date(d+'T00:00:00').toLocaleDateString('es',{day:'2-digit',month:'short',year:'numeric'})}
function toast(m,dur=2600){const t=document.createElement('div');t.className='toast';t.textContent=m;document.body.appendChild(t);setTimeout(()=>t.remove(),dur)}
function cm(id){document.getElementById(id).style.display='none'}
function oco(e,id){if(e.target===document.getElementById(id))cm(id)}
function hlp(el){document.querySelectorAll('.pchip').forEach(c=>c.classList.remove('on'));el.classList.add('on')}

// ══════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════
function swTab(t){
  document.getElementById('t-l').classList.toggle('on',t==='l');
  document.getElementById('t-r').classList.toggle('on',t==='r');
  document.getElementById('f-l').style.display=t==='l'?'block':'none';
  document.getElementById('f-r').style.display=t==='r'?'block':'none';
  document.getElementById('auth-err').style.display='none';
}
function showErr(m){const e=document.getElementById('auth-err');e.textContent=m;e.style.display='block'}
async function doLogin(){
  const em=document.getElementById('l-em').value.trim();
  const pw=document.getElementById('l-pw').value;
  if(!em||!pw){showErr('Completá todos los campos');return}
  const btn=document.getElementById('btn-l');btn.innerHTML='<span class="sp"></span>';btn.disabled=true;
  if(SB_ON){const{data,error}=await sb.auth.signInWithPassword({email:em,password:pw});if(error){showErr(error.message);btn.innerHTML='Ingresar';btn.disabled=false;return}S.user=data.user;if(!_appEntering){_appEntering=true;await enterApp(data.user.user_metadata?.full_name||em.split('@')[0],'pro');_appEntering=false;}}
  else{setTimeout(()=>enterApp(em.split('@')[0],'pro'),600)}
}
async function doReg(){
  const nm=document.getElementById('r-nm').value.trim();
  const em=document.getElementById('r-em').value.trim();
  const pw=document.getElementById('r-pw').value;
  if(!nm||!em||!pw){showErr('Completá todos los campos');return}
  if(pw.length<6){showErr('Contraseña mínimo 6 caracteres');return}
  const btn=document.getElementById('btn-r');btn.innerHTML='<span class="sp"></span>';btn.disabled=true;
  if(SB_ON){const{data,error}=await sb.auth.signUp({email:em,password:pw,options:{data:{full_name:nm}}});if(error){showErr(error.message);btn.innerHTML='Crear cuenta gratis';btn.disabled=false;return}S.user=data.user;enterApp(nm,'free');}
  else{setTimeout(()=>enterApp(nm,'free'),600)}
}
async function doGoogle(){if(SB_ON)await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.href}});else demoLogin()}
function demoLogin(){lload();defaults();enterApp('Fabri','pro')}
async function doLogout(){if(SB_ON&&sb)await sb.auth.signOut();lsave();S={txs:[],products:[],sales:[],orders:[],contacts:[],cards:[],debts:[],accounts:[],budgets:[],subscriptions:[],goals:[],historical:[],receivables:[],fltTx:'all',fltInv:'all',fltSale:'all',fltOrd:'all',fltCon:'all',fltInv2:'all',user:null,plan:'free',curPage:'dashboard'};document.getElementById('app').style.display='none';document.getElementById('auth').style.display='flex'}

// ══════════════════════════════════════════
// AUTO SESSION RESTORE (on page reload)
// ══════════════════════════════════════════
let _appEntering = false; // guard: evita doble llamado a enterApp
if (SB_ON && sb) {
  sb.auth.onAuthStateChange(async (event, session) => {
    if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
      const appEl = document.getElementById('app');
      const appHidden = !appEl || appEl.style.display === 'none' || appEl.style.display === '';
      if (appHidden && !_appEntering) {
        _appEntering = true;
        S.user = session.user;
        const name = session.user.user_metadata?.full_name ||
                     session.user.email?.split('@')[0] || 'Usuario';
        await enterApp(name, 'pro');
        _appEntering = false;
      }
    }
  });
}

async function enterApp(name,plan){
  S.plan=plan;
  document.getElementById('auth').style.display='none';
  document.getElementById('app').style.display='block';

  // ── Limpiar claves de caché obsoletas (migración schema anterior) ────────
  try { localStorage.removeItem('cdco_sb_cache'); localStorage.removeItem('cdco_erp_v1'); } catch(e) {}

  // ── SKELETON: mostrar mientras carga (swrLoad lo reemplaza en <1ms si hay caché) ──
  const dbBal = document.getElementById('d-total-balance');
  if (dbBal && !dbBal.textContent.includes('₲')) {
    dbBal.innerHTML = '<span class="skel" style="display:inline-block;width:160px;height:32px;border-radius:6px;background:linear-gradient(90deg,var(--bg3) 25%,var(--bg4) 50%,var(--bg3) 75%);background-size:200% 100%;animation:shimmer 1.2s infinite"></span>';
  }

  // ── RÁPIDO: cargar resumen del dashboard vía RPC (números al instante) ────
  if(SB_ON && typeof loadDashboardSummary === 'function') {
    loadDashboardSummary(); // async, no bloquea UI
  }

  if(SB_ON){ await loadAllUserData(); } else { lload(); defaults(); }
  const ini=name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
  document.getElementById('s-av').textContent=ini;
  document.getElementById('s-nm').textContent=name;
  document.getElementById('s-pl').textContent=plan.toUpperCase();
  document.getElementById('gr-nm').textContent=name.split(' ')[0];

  const nd=new Date();const DNS=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];const MNS=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  document.getElementById('top-date').textContent=DNS[nd.getDay()]+' '+nd.getDate()+' '+MNS[nd.getMonth()]+' '+nd.getFullYear();
  let cU=0, cG=0; S.txs.forEach(t=>t.cur==='₲'?cG++:cU++); const dom = cG>cU?'₲':'$';
  document.getElementById('am1').textContent=fmt(S.txs.filter(t=>t.cur===dom).reduce((a,t)=>a+(t.type==='income'?t.amount:-t.amount),0), dom);
  document.getElementById('am2').textContent=S.products.length;
  document.getElementById('am3').textContent=S.sales.length;
  buildPlanCards();
  populateSelects();
  if(typeof setAppMode==='function') setAppMode(S.appMode||'full', true);
  if(typeof calculateAlerts==='function') calculateAlerts();
  renderAll();
  if(typeof populateTxAccountSelect==='function') populateTxAccountSelect();
  initFx();
  if(typeof applySavedTheme === 'function') applySavedTheme();

}
