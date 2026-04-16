// CD & Co ERP — AUTH
// ====================================

// ══════════════════════════════════════════
// PERSISTENCE
// ══════════════════════════════════════════
const LS='cdco_erp_v1';
function lsave(){
  // ── C-3 Guard: tamaño + QuotaExceededError ───────────────────────────────
  // Límite conservador: 4 MB (localStorage real ≈ 5-10 MB según browser/OS).
  // Si el payload completo supera el límite, guarda una versión "slim" con
  // solo los datos críticos y avisa al usuario con un toast visible.
  const LIMIT_BYTES = 4 * 1024 * 1024; // 4 MB

  const FULL_PAYLOAD = {
    txs:S.txs, products:S.products, sales:S.sales, orders:S.orders,
    contacts:S.contacts, plan:S.plan, cards:S.cards, debts:S.debts,
    accounts:S.accounts, budgets:S.budgets, subscriptions:S.subscriptions,
    appMode:S.appMode, goals:S.goals, historical:S.historical,
    receivables:S.receivables, vehicles:S.vehicles, fx:FX, user:S.user
  };

  // Versión slim: solo lo imprescindible para que la app arranque sin datos de Supabase
  const SLIM_PAYLOAD = {
    plan:S.plan, user:S.user, fx:FX,
    accounts:S.accounts, products:S.products
  };

  let serialized;
  try { serialized = JSON.stringify(FULL_PAYLOAD); }
  catch(e) { serialized = JSON.stringify(SLIM_PAYLOAD); } // JSON.stringify puede fallar en refs circulares

  // Medir tamaño real en bytes (más preciso que .length para caracteres UTF-8)
  const byteSize = new Blob([serialized]).size;

  if (byteSize > LIMIT_BYTES) {
    // Payload demasiado grande — guardar solo slim y avisar
    try { localStorage.setItem(LS, JSON.stringify(SLIM_PAYLOAD)); } catch(e) {}
    toast('⚠️ Memoria local casi llena — Solo datos críticos guardados localmente. Los datos completos están seguros en la nube.', 5000);
  } else {
    try {
      localStorage.setItem(LS, serialized);
    } catch(e) {
      // QuotaExceededError: el browser rechazó la escritura
      if (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014) {
        // Último recurso: limpiar datos pesados y guardar slim
        try {
          localStorage.removeItem(LS);
          localStorage.setItem(LS, JSON.stringify(SLIM_PAYLOAD));
        } catch(_) {}
        toast('⚠️ Límite de almacenamiento local alcanzado — Guardando solo datos esenciales. Los datos completos están en la nube.', 5000);
      }
    }
  }

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
const SWR_KEY = 'cdco_swr_v3';
const SWR_TTL = 15 * 60 * 1000; // 15 minutes — longer TTL = instant loads on return visits

function swrSave() {
  try {
    localStorage.setItem(SWR_KEY, JSON.stringify({
      ts: Date.now(),
      txs: S.txs, accounts: S.accounts, products: S.products,
      sales: S.sales, orders: S.orders, contacts: S.contacts,
      cards: S.cards, debts: S.debts, budgets: S.budgets,
      subscriptions: S.subscriptions, receivables: S.receivables, goals: S.goals,
      vehicles: S.vehicles, fuelLogs: S.fuelLogs,
    }));
  } catch(e) {}
}

// swrLoad returns: 'fresh' | 'stale' | 'miss'
// 'fresh' = data loaded, within TTL  (skip background refresh)
// 'stale' = data loaded, expired TTL (trigger background refresh)
// 'miss'  = no usable cache           (cold start with skeletons)
function swrLoad() {
  try {
    const d = JSON.parse(localStorage.getItem(SWR_KEY) || '{}');
    if (!d.ts || !d.accounts || !d.txs) return 'miss';
    // Always hydrate S from cache — even if stale, show data immediately
    ['txs','accounts','products','sales','orders','contacts',
     'debts','budgets','subscriptions','receivables','goals',
     'vehicles','fuelLogs']
      .forEach(k => { if (d[k] !== undefined) S[k] = d[k]; });
    return (Date.now() - d.ts <= SWR_TTL) ? 'fresh' : 'stale';
  } catch(e) { return 'miss'; }
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
// ── Minimal column maps — only what each module actually renders ─────────────
const TABLE_COLS = {
  txs:           'id,type,amount,cur,cat,date,desc,account_id,transferPairId,user_id',
  accounts:      'id,name,type,bank,cur,balance,initialBalance,notes,user_id',
  products:      'id,name,sku,cat,buyPrice,sellPrice,stock,minStock,cur,created_at,variant',
  sales:         'id,date,total,cur,items,client_id,status,num,nro_factura,condicion',
  orders:        'id,date,status,supplier_id,items,num,eta,notes',
  contacts:      'id,name,type,phone,email,ruc,notes',
  // cards: columnas reales de la DB (sin dueDate — no existe)
  cards:         'id,name,bank,cur,limit,used,color,last4,exp,cutDay,payDay',
  debts:         'id,creditor,description,total,paid,totalAmount,paidAmount,cur,dueDate,installments,paidInstallments',
  budgets:       'id,category,amount,cur,month',
  subscriptions: 'id,name,amount,cur,frequency,nextDate,active,icon,description',
  receivables:   'id,customer,name,total,paid,cur,completed,date',
  goals:         'id,name,target_amount,current_amount,deadline,cur,icon',
};

async function loadAllUserData() {
  const qTimeout = ms => new Promise(res => setTimeout(() => res({data:[], error:{message:'timeout'}}), ms));

  // Helper: fetch one table with specific columns + timeout
  // C-2: txs limitadas a 500 filas más recientes para evitar OOM en sesiones largas.
  // El historial completo se carga bajo demanda via fetchMoreTxs(offset).
  const fetchTable = (t, ms) => {
    let q = sb.from(t).select(TABLE_COLS[t] || '*').order('created_at', { ascending: false });
    if (t === 'txs') q = q.order('date', { ascending: false }).limit(500);
    return Promise.race([q, qTimeout(ms)]);
  };

  // Helper: apply fetch results to S and run goals column mapping
  const applyResults = (tables, results) => {
    tables.forEach((t, i) => {
      const r = results[i];
      if (r.status === 'rejected') {
        console.error(`[Supabase Error en tabla '${t}'] Promise rejected:`, r.reason);
      } else if (r.value?.error) {
        console.error(`[Supabase Error en tabla '${t}'] ${r.value.error.message}`, '| code:', r.value.error.code, '| details:', r.value.error.details, '| hint:', r.value.error.hint);
      } else if (r.status === 'fulfilled' && r.value?.data) {
        S[t] = r.value.data;
      }
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

  // Helper para fetch de fuel_logs y vehicles con columnas mínimas
  const fetchFuelLogs = (ms) => Promise.race([
    sb.from('fuel_logs').select('id,vehicle_id,date,liters,cost,odometer_reading').order('date', { ascending: false }),
    qTimeout(ms)
  ]);
  const fetchVehicles = (ms) => Promise.race([
    sb.from('vehicles').select('id,nickname,brand,model,year,engine_type,plate,user_id').order('created_at', { ascending: false }),
    qTimeout(ms)
  ]);
  const applyFleet = async () => {
    const [vRes, fRes] = await Promise.allSettled([fetchVehicles(10000), fetchFuelLogs(10000)]);
    if (vRes.status === 'fulfilled' && vRes.value?.data && !vRes.value?.error)
      S.vehicles = vRes.value.data;
    if (fRes.status === 'fulfilled' && fRes.value?.data && !fRes.value?.error)
      S.fuelLogs = fRes.value.data;
  };

  const ALL  = ['accounts','txs','products','sales','orders','contacts',
                'cards','debts','budgets','subscriptions','receivables','goals'];

  const _bgRefresh = () => {
    // Main tables: refresh + render immediately when done (don't wait for fleet)
    Promise.allSettled(ALL.map(t => fetchTable(t, 12000))).then(async results => {
      applyResults(ALL, results);
      await syncCategorias();
      recomputeBalances();
      swrSave();
      if (typeof renderAll === 'function') renderAll();
      if (typeof populateTxAccountSelect === 'function') populateTxAccountSelect();
      if (typeof populateSelects === 'function') populateSelects();
    });
    // Fleet runs in background — no gate on it
    applyFleet().then(() => swrSave());
  };

  // ── SWR tri-state ────────────────────────────────────────────────────────
  const swrState = swrLoad(); // 'fresh' | 'stale' | 'miss'

  if (swrState !== 'miss') {
    // Cache hit (fresh or stale) → render immediately from localStorage
    recomputeBalances();
    if (typeof renderAll === 'function') renderAll();
    if (swrState === 'stale') _bgRefresh(); // stale: silently revalidate
    // fresh: skip network entirely until next TTL expiry
    return;
  }

  // ── Cold start: no cache ─────────────────────────────────────────────────
  // FASE 1 — accounts + txs (critical for dashboard, await these only)
  const critResults = await Promise.allSettled(
    ['accounts', 'txs'].map(t => fetchTable(t, 8000))
  );
  applyResults(['accounts', 'txs'], critResults);
  recomputeBalances();

  // FASE 2 — everything else in background (no await)
  const rest = ['products','sales','orders','contacts','cards','debts',
                'budgets','subscriptions','receivables','goals'];
  Promise.allSettled(rest.map(t => fetchTable(t, 12000))).then(async results => {
    applyResults(rest, results);
    await syncCategorias();
    recomputeBalances();
    swrSave();
    if (typeof renderAll === 'function') renderAll();
    if (typeof populateTxAccountSelect === 'function') populateTxAccountSelect();
    if (typeof populateSelects === 'function') populateSelects();
  });
  // Fleet runs independently — no gate
  applyFleet().then(() => swrSave());
}

// ── Sync custom categories from Supabase 'categorias' table ─────────────────
// Called after data load so user categories appear in all dropdowns.
// Maps DB columns (nombre, icono, tipo) → local format (name, icon, list key).
async function syncCategorias() {
  if (!SB_ON || !sb || !S.user?.id) return;
  try {
    const { data, error } = await sb
      .from('categorias')
      .select('id,nombre,icono,tipo')
      .eq('user_id', S.user.id);
    if (error) { console.warn('[syncCategorias] SB error:', error.message); return; }
    if (!data?.length) return;
    if (!S.customCategories) S.customCategories = { gastos: [], ingresos: [] };
    data.forEach(cat => {
      const listKey = cat.tipo === 'ingresos' ? 'ingresos' : 'gastos';
      const list = S.customCategories[listKey];
      if (!list.find(c => c.id === cat.id)) {
        list.push({ id: cat.id, name: cat.nombre, icon: cat.icono || '🔹' });
      }
    });
    lsave(); // persist merged state to localStorage for next SWR hit
  } catch (e) {
    console.warn('[syncCategorias] exception:', e.message);
  }
}
// ── AUDIT-FIRST: balance = SUM(amount) — gastos son negativos en DB ─────────
function recomputeBalances() {
  if (!S.accounts || !S.txs) return;
  // Fórmula: cada tx guarda amount con signo (expenses = negative).
  // Transfers y otros tipos usan el amount tal como está almacenado.
  S.accounts = S.accounts.map(acc => ({
    ...acc,
    balance: S.txs
      .filter(t => (t.account_id || t.accountId) === acc.id)
      .reduce((sum, t) => {
        const raw = parseFloat(t.amount) || 0;
        // Expenses are stored as negative. If positive expense found (legacy), negate it.
        if (t.type === 'expense') return sum - Math.abs(raw);
        if (t.type === 'transfer-out') return sum - Math.abs(raw);
        if (t.type === 'transfer-in') return sum + Math.abs(raw);
        // income, balance adj, other — always add positive
        return sum + Math.abs(raw);
      }, 0)
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

// ── SKELETON INJECTION ──────────────────────────────────────────────────────
function _injectSkeletons() {
  const SK = (w, h) =>
    `<span class="skel" style="width:${w};height:${h}px;border-radius:6px;display:block"></span>`;

  const set = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

  // Patrimonio hero
  set('d-total-balance', SK('180px', 40));
  // Monthly income / expense
  set('d-wk-inc', SK('130px', 28));
  set('d-wk-exp', SK('130px', 28));
  // Sidebar mini stats
  set('am1', SK('80px', 18));
  set('am2', SK('30px', 18));
  set('am3', SK('30px', 18));
  // Chart placeholders
  const charts = ['d-revenue-chart', 'd-expense-donut'];
  charts.forEach(id => {
    const el = document.getElementById(id);
    if (el && el.parentElement) {
      el.style.display = 'none';
      if (!el.parentElement.querySelector('.skel-chart')) {
        const s = document.createElement('span');
        s.className = 'skel skel-chart';
        s.style.cssText = 'display:block;width:100%;height:100%;border-radius:10px;min-height:130px';
        el.parentElement.appendChild(s);
      }
    }
  });
  // Recent txs list
  set('d-recent-txs',
    [1,2,3,4].map(() =>
      `<div style="display:flex;gap:10px;align-items:center;padding:6px 0">
        <span class="skel" style="width:32px;height:32px;border-radius:50%;flex-shrink:0"></span>
        <div style="flex:1;display:flex;flex-direction:column;gap:4px">
          ${SK('60%', 12)}${SK('40%', 10)}
        </div>
        ${SK('70px', 14)}
      </div>`
    ).join('')
  );
}

function _clearSkeletons() {
  // Re-show canvases hidden during skeleton phase
  ['d-revenue-chart', 'd-expense-donut'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = '';
    if (el?.parentElement) {
      el.parentElement.querySelectorAll('.skel-chart').forEach(s => s.remove());
    }
  });
}

async function enterApp(name, plan) {
  S.plan = plan;
  document.getElementById('auth').style.display = 'none';
  document.getElementById('app').style.display = 'block';

  // ── Limpiar claves de caché obsoletas ───────────────────────────────────
  try { localStorage.removeItem('cdco_sb_cache'); localStorage.removeItem('cdco_erp_v1'); } catch(e) {}

  // ── Sidebar info (no depende de datos) ──────────────────────────────────
  const ini = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  document.getElementById('s-av').textContent = ini;
  document.getElementById('s-nm').textContent = name;
  document.getElementById('s-pl').textContent = plan.toUpperCase();
  document.getElementById('gr-nm').textContent = name.split(' ')[0];
  const nd = new Date();
  const DNS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const MNS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  document.getElementById('top-date').textContent =
    `${DNS[nd.getDay()]} ${nd.getDate()} ${MNS[nd.getMonth()]} ${nd.getFullYear()}`;

  if (SB_ON) {
    // Pre-check cache before loadAllUserData so we can decide path
    const swrState = swrLoad(); // 'fresh' | 'stale' | 'miss'

    if (swrState !== 'miss') {
      // ── FAST PATH: data already in S from swrLoad() ───────────────────
      recomputeBalances();
      _fillSidebarStats();
      if (typeof buildPlanCards === 'function') buildPlanCards();
      populateSelects();
      if (typeof setAppMode === 'function') setAppMode(S.appMode || 'full', true);
      if (typeof calculateAlerts === 'function') calculateAlerts();
      renderAll();
      if (typeof populateTxAccountSelect === 'function') populateTxAccountSelect();
      if (typeof initFx === 'function') initFx();
      if (typeof applySavedTheme === 'function') applySavedTheme();
      // loadAllUserData will skip network if 'fresh', or silently refresh if 'stale'
      loadAllUserData().catch(() => {});
    } else {
      // ── COLD START: skeletons → accounts+txs → render ─────────────────
      _injectSkeletons();
      if (typeof buildPlanCards === 'function') buildPlanCards();
      if (typeof applySavedTheme === 'function') applySavedTheme();
      await loadAllUserData(); // fetches accounts+txs first, rest in background
      _clearSkeletons();
      recomputeBalances();
      _fillSidebarStats();
      populateSelects();
      if (typeof setAppMode === 'function') setAppMode(S.appMode || 'full', true);
      if (typeof calculateAlerts === 'function') calculateAlerts();
      renderAll();
      if (typeof populateTxAccountSelect === 'function') populateTxAccountSelect();
      if (typeof initFx === 'function') initFx();
    }
  } else {
    lload();
    defaults();
    _fillSidebarStats();
    buildPlanCards();
    populateSelects();
    if (typeof setAppMode === 'function') setAppMode(S.appMode || 'full', true);
    if (typeof calculateAlerts === 'function') calculateAlerts();
    renderAll();
    if (typeof populateTxAccountSelect === 'function') populateTxAccountSelect();
    initFx();
    if (typeof applySavedTheme === 'function') applySavedTheme();
  }
}

// ── C-2: Paginación de transacciones ─────────────────────────────────────────
// Carga el siguiente bloque de 500 txs desde Supabase y lo fusiona con S.txs.
// Llamar con offset = S.txs.length para obtener las siguientes 500.
// El módulo de Movimientos muestra un botón "Cargar más" que invoca esto.
async function fetchMoreTxs(offset) {
  if (!SB_ON || !sb || !S.user?.id) return [];
  const off = parseInt(offset) || 0;
  try {
    const { data, error } = await sb
      .from('txs')
      .select(TABLE_COLS.txs)
      .eq('user_id', S.user.id)
      .order('date', { ascending: false })
      .range(off, off + 499); // 500 registros por página
    if (error) { console.warn('[fetchMoreTxs]', error.message); return []; }
    if (!data || !data.length) return []; // no hay más páginas
    // Merge: evitar duplicados por id (el usuario puede haber agregado txs nuevas)
    const existingIds = new Set(S.txs.map(t => t.id));
    const newTxs = data.filter(t => !existingIds.has(t.id));
    if (newTxs.length) {
      S.txs = [...S.txs, ...newTxs];
      S._txsLastFetch = Date.now();
      lsave();
      if (typeof renderTxs === 'function') renderTxs();
      if (typeof recomputeBalances === 'function') recomputeBalances();
    }
    return data; // devuelve los datos crudos para que el caller sepa si hay más
  } catch (e) {
    console.warn('[fetchMoreTxs] exception:', e.message);
    return [];
  }
}

function _fillSidebarStats() {
  let cU = 0, cG = 0;
  S.txs.forEach(t => t.cur === '₲' ? cG++ : cU++);
  const dom = cG > cU ? '₲' : '$';
  const am1 = document.getElementById('am1');
  const am2 = document.getElementById('am2');
  const am3 = document.getElementById('am3');
  if (am1) am1.textContent = fmt(S.txs.filter(t => t.cur === dom).reduce((a, t) => a + (t.type === 'income' ? t.amount : -t.amount), 0), dom);
  if (am2) am2.textContent = S.products.length;
  if (am3) am3.textContent = S.sales.length;
}
