// CD & Co ERP — NAV
// ====================================

// ══════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════
function goPage(pg){
  if(pg==='fleet') console.log('[NAV] ✅ Cargando ítem Flota — page-fleet activada');
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('on'));
  document.querySelectorAll('.ni').forEach(n=>n.classList.remove('on'));
  const pageEl = document.getElementById('page-'+pg);
  if(!pageEl){ console.error('[NAV] ❌ No se encontró la página: page-'+pg); return; }
  pageEl.classList.add('on');
  const nav=document.getElementById('nav-'+pg);if(nav)nav.classList.add('on');
  S.curPage=pg;
  renderPageData(pg);
}

// ── Boot check: verificar que el botón Flota existe en el DOM ──
document.addEventListener('DOMContentLoaded', function() {
  const fleetBtn = document.getElementById('nav-fleet');
  if(fleetBtn){
    fleetBtn.style.setProperty('display', 'flex', 'important');
    fleetBtn.style.setProperty('visibility', 'visible', 'important');
  }
});
async function renderPageData(pg){
  if(pg==='dashboard')renderDashboard();
  else if(pg==='txs'){
    if(SB_ON && sb){
      const {data, error} = await sb.from('txs')
        .select('id,type,amount,cur,cat,date,desc,account_id,transferPairId')
        .order('date', {ascending: false});
      if(!error && data) S.txs = data;
    }
    renderTxs();
  }
  else if(pg==='inventory')renderInventory();
  else if(pg==='sales')renderSales();
  else if(pg==='orders')renderOrders();
  else if(pg==='invoices')renderInvoices();
  else if(pg==='contacts')renderContacts();
  else if(pg==='accounts')renderAccounts();
  else if(pg==='budgets')renderBudgets();
  else if(pg==='subscriptions')renderSubscriptions();
  else if(pg==='debts')renderDebtsPage();
  else if(pg==='history')renderHistoryPage();
  else if(pg==='goals')renderGoals();
  else if(pg==='advice')renderAdvice();
  else if(pg==='receivables')renderReceivables();
  else if(pg==='patrimonio')renderPatrimonio();
  else if(pg==='profitability')renderProfitability();
  else if(pg==='fleet'){if(typeof renderFleet==='function')renderFleet();}
  else if(pg==='plan'){buildPlanCards();loadEmpresaForm();if(typeof loadAdminUsers==='function')loadAdminUsers();}
}
// ── Dirty-flag render guard ──────────────────────────────────────────────────
// Compute a lightweight fingerprint of the data that drives each module.
// If the fingerprint hasn't changed since last render, skip that module.
let _renderHash = {};
function _hash(arr) {
  if (!arr || !arr.length) return '0';
  // Use length + first/last id + last record's key field as cheap fingerprint
  const first = arr[0]; const last = arr[arr.length - 1];
  return `${arr.length}|${first?.id||''}|${last?.id||''}`;
}
function _changed(key, arr) {
  const h = _hash(arr);
  if (_renderHash[key] === h) return false;
  _renderHash[key] = h;
  return true;
}

function renderAll() {
  const txChanged  = _changed('txs', S.txs);
  const accChanged = _changed('acc', S.accounts);
  const prdChanged = _changed('prd', S.products);
  const salChanged = _changed('sal', S.sales);
  const ordChanged = _changed('ord', S.orders);
  const conChanged = _changed('con', S.contacts);
  const debChanged = _changed('deb', S.debts);
  const subChanged = _changed('sub', S.subscriptions);
  const recChanged = _changed('rec', S.receivables);
  const golChanged = _changed('gol', S.goals);

  // Dashboard depends on txs + accounts
  if (txChanged || accChanged) renderDashboard();
  // Transactions page
  if (txChanged) renderTxs();
  // Inventory
  if (prdChanged) renderInventory();
  // Sales
  if (salChanged || prdChanged) renderSales();
  // Orders
  if (ordChanged) renderOrders();
  // Contacts
  if (conChanged) renderContacts();
  // Accounts (depends on txs for balance + cashflow)
  if (accChanged || txChanged) renderAccounts();
  // Budgets
  if (txChanged || _changed('bgt', S.budgets)) renderBudgets();
  // Subscriptions
  if (subChanged) renderSubscriptions();
  // Goals
  if (golChanged) renderGoals();
  // Debts
  if (debChanged) renderDebtsPage();
  // Receivables
  if (recChanged && typeof renderReceivables === 'function') renderReceivables();
  // Advice (depends on everything, run if any changed)
  if (txChanged || accChanged || prdChanged) renderAdvice();
  // History — only if on that page
  if (txChanged && typeof renderHistoryPage === 'function') renderHistoryPage();
  // Heavy pages — only render if currently visible
  if (S.curPage === 'patrimonio' && (txChanged || accChanged) && typeof renderPatrimonio === 'function') renderPatrimonio();
  if (S.curPage === 'profitability' && (prdChanged || txChanged) && typeof renderProfitability === 'function') renderProfitability();
  if (S.curPage === 'fleet' && typeof renderFleet === 'function') renderFleet();
  // Invoices (rarely changes)
  if (salChanged) renderInvoices();

  updateBadges();
  if (typeof populateTxAccountSelect === 'function') populateTxAccountSelect();
}

function mnA(el){document.querySelectorAll('.mn').forEach(b=>b.classList.remove('on'));el.classList.add('on')}
function openQuickAdd(){document.getElementById('qa-modal').style.display='flex'}

// ══════════════════════════════════════════
// SELECTS POPULATION
// ══════════════════════════════════════════

// Devuelve lista combinada de categorías base + personalizadas para un tipo
function getCats(type) {
  const base = type === 'income' ? CATEGORIAS_INGRESOS : CATEGORIAS_GASTOS;
  const custom = S.customCategories || {gastos:[], ingresos:[]};
  const customList = type === 'income' ? (custom.ingresos||[]) : (custom.gastos||[]);
  return [...base, ...customList];
}

// Rellena un <select> de categorías para el tipo dado
function populateTxCat(type, selectId, keepVal) {
  const el = document.getElementById(selectId || 'tx-cat');
  if(!el) return;
  const cats = getCats(type || 'expense');
  const cur = keepVal !== undefined ? keepVal : el.value;
  el.innerHTML = cats.map(c=>`<option value="${c.name}">${c.icon} ${c.name}</option>`).join('') + '<option value="ADD_NEW">+ Nueva categoría</option>';
  if(cur && cats.find(c=>c.name===cur)) el.value = cur;
  else if(cats.length) el.value = cats[0].name;
}

function populateSelects(){
  const sups=S.contacts.filter(c=>c.type==='supplier'||c.type==='both');
  const clients=S.contacts.filter(c=>c.type==='client'||c.type==='both');
  ['pr-sup'].forEach(id=>{const el=document.getElementById(id);if(!el)return;el.innerHTML='<option value="">Sin asignar</option>'+sups.map(s=>`<option value="${s.id}">${s.name}</option>`).join('')});
  ['or-sup'].forEach(id=>{const el=document.getElementById(id);if(!el)return;el.innerHTML='<option value="">Seleccionar proveedor</option>'+sups.map(s=>`<option value="${s.id}">${s.name}</option>`).join('')});
  ['sl-client'].forEach(id=>{const el=document.getElementById(id);if(!el)return;el.innerHTML='<option value="">Cliente ocasional</option>'+clients.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')});

  // tx-cat se pobla dinámicamente según el tipo en setTT() — no tocar aquí
  // bgt-cat usa categorías de gastos
  const bgtCat = document.getElementById('bgt-cat');
  if(bgtCat){
    const cur = bgtCat.value;
    const cats = getCats('expense');
    bgtCat.innerHTML = cats.map(c=>`<option value="${c.name}">${c.icon} ${c.name}</option>`).join('') + '<option value="ADD_NEW">+ Nueva categoría</option>';
    if(cur && cats.find(c=>c.name===cur)) bgtCat.value = cur;
  }
}

function updateBadges(){
  const pend=S.orders.filter(o=>o.status==='pending').length;
  const b=document.getElementById('badge-orders');
  if(b){b.textContent=pend;b.style.display=pend>0?'inline-flex':'none';}
  const bBadge=document.getElementById('badge-budgets');const bOver=typeof getOverBudgetCount==='function'?getOverBudgetCount():0;if(bBadge){bBadge.textContent=bOver;bBadge.style.display=bOver>0?'inline-flex':'none';}
  const sBadge=document.getElementById('badge-subs');const sOver=typeof getSubsBadgeCount==='function'?getSubsBadgeCount():0;if(sBadge){sBadge.textContent=sOver;sBadge.style.display=sOver>0?'inline-flex':'none';}
  const dn=typeof getDebtBadgeCount==='function'?getDebtBadgeCount():0;
  const bd=document.getElementById('badge-debts');
  if(bd){bd.textContent=dn;bd.style.display=dn>0?'inline-flex':'none';}
  const active=(S.receivables||[]).filter(r=>!r.completed).length;
  const br=document.getElementById('badge-receivables');
  if(br){br.textContent=active;br.style.display=active>0?'inline-flex':'none';}
}

// ══════════════════════════════════════════
// CUSTOM CATEGORIES
// ══════════════════════════════════════════
document.addEventListener('change', function(e) {
  if (e.target.tagName === 'SELECT' && e.target.value === 'ADD_NEW') {
    window._pendingCatSelect = e.target.id;
    const m = document.getElementById('new-cat-modal');
    if(m) {
      m.style.display = 'flex';
      document.getElementById('nc-name').value = '';
      const catBtn = document.getElementById('cat-emoji-btn');
      if (catBtn) catBtn.textContent = '🔹';
      // Auto-detectar tipo según el selector origen
      const ncType = document.getElementById('nc-type');
      if(ncType) {
        if(e.target.id === 'tx-cat') {
          ncType.value = (typeof txType !== 'undefined' && txType === 'income') ? 'ingresos' : 'gastos';
        } else {
          ncType.value = 'gastos';
        }
      }
    }
  }
});

async function saveNewCat() {
  const name = document.getElementById('nc-name').value.trim();
  const icon = document.getElementById('cat-emoji-btn')?.textContent?.trim() || '🔹';
  const catType = document.getElementById('nc-type')?.value || 'gastos';
  
  if(!name) { toast('Ingresá un nombre'); return; }

  // 1. Verificación en memoria local
  if(!S.customCategories) S.customCategories = {gastos:[], ingresos:[]};
  const list = catType === 'ingresos' ? S.customCategories.ingresos : S.customCategories.gastos;

  if(list.find(c => c.name.toLowerCase() === name.toLowerCase())) {
     toast('Esa categoría ya existe'); 
     return;
  }

  const id = 'cu_' + Date.now();
  const newCatObj = { id, name, icon };

  // 2. LA MAGIA DE SUPABASE (Persistencia Real)
  try {
    // Cambiamos el texto del botón para que el usuario sepa que está cargando
    const modal = document.getElementById('new-cat-modal');
    const btnGuardar = modal ? modal.querySelector('button:last-child') : null;
    const textoOriginal = btnGuardar ? btnGuardar.textContent : 'GUARDAR';
    if(btnGuardar) btnGuardar.textContent = 'Guardando en la nube...';

    // ⚠️ ATENCIÓN: Ajustá 'categorias' por el nombre real de tu tabla en Supabase
    const { error } = await supabase
      .from('categorias') 
      .insert([
        {
          id: id,
          nombre: name,
          icono: icon,
          tipo: catType
          // Nota: Si usas RLS, puede que necesites enviar el user_id aquí
        }
      ]);

    if (error) throw error;

    // 3. Si se guardó en la nube, actualizamos la memoria local y cerramos
    list.push(newCatObj);
    lsave(); // Mantenemos tu caché intacto
    toast('Categoría registrada con éxito');

    if(modal) {
        modal.style.display = 'none';
        // Limpiar el input para la próxima vez
        document.getElementById('nc-name').value = ''; 
    }
    if(btnGuardar) btnGuardar.textContent = textoOriginal;

  } catch (err) {
    console.error("Error crítico guardando la categoría:", err);
    toast('Error de conexión con la base de datos');
    
    // Restaurar el botón si falla
    const btnGuardar = document.getElementById('new-cat-modal').querySelector('button:last-child');
    if(btnGuardar) btnGuardar.textContent = 'GUARDAR CATEGORÍA';
  }
}

  // Repoblar el select correspondiente
  const type = catType === 'ingresos' ? 'income' : 'expense';
  if(window._pendingCatSelect) {
    populateTxCat(type, window._pendingCatSelect, name);
  }
  populateSelects();

  cm('new-cat-modal');
  toast('◆ Categoría agregada');
}

// ══════════════════════════════════════════
// RESPONSIVE SIDEBAR (Mobile Off-Canvas)
// ══════════════════════════════════════════

// iOS scroll position tracking
let _sbScrollY = 0;

function toggleSidebar() {
  const app = document.getElementById('app');
  if (!app) return;
  const isOpen = app.classList.contains('sb-open');
  if (isOpen) {
    _closeSidebarInternal(app);
  } else {
    _openSidebarInternal(app);
  }
}

function closeSidebar() {
  const app = document.getElementById('app');
  if (app && app.classList.contains('sb-open')) {
    _closeSidebarInternal(app);
  }
}

function _openSidebarInternal(app) {
  // iOS scroll lock: save position, fix body
  if (window.innerWidth < 768) {
    _sbScrollY = window.scrollY;
    document.body.style.top = `-${_sbScrollY}px`;
  }
  app.classList.add('sb-open');
  document.body.classList.add('sb-open');
}

function _closeSidebarInternal(app) {
  app.classList.remove('sb-open');
  document.body.classList.remove('sb-open');
  // iOS scroll lock: restore position
  if (window.innerWidth < 768) {
    document.body.style.top = '';
    window.scrollTo(0, _sbScrollY);
  }
}

// Auto-close sidebar on mobile when navigation item is clicked
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.ni').forEach(btn => {
    btn.addEventListener('click', function() {
      if (window.innerWidth < 768) {
        closeSidebar();
      }
    });
  });

  // Close sidebar when overlay is clicked
  const overlay = document.getElementById('sb-overlay');
  if (overlay) {
    overlay.addEventListener('click', closeSidebar);
  }

  // Close sidebar on Escape key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeSidebar();
  });

  // ── HOVER PREFETCH ──────────────────────────────────────────────────────
  // Prefetch heavy tables when user hovers sidebar nav items (desktop only)
  const PREFETCH_MAP = {
    'nav-fleet':       () => _prefetchTables(['vehicles'], ['fuel_logs']),
    'nav-inventory':   () => _prefetchTables(['products']),
    'nav-reports':     () => _prefetchTables(['txs','accounts']),
    'nav-profitability': () => _prefetchTables(['products','txs']),
  };
  Object.keys(PREFETCH_MAP).forEach(navId => {
    const el = document.getElementById(navId);
    if (!el) return;
    let _fired = false;
    el.addEventListener('mouseenter', () => {
      if (_fired || !SB_ON) return;
      _fired = true;
      PREFETCH_MAP[navId]();
    });
  });
});

// Prefetch helper: fetches tables in background and merges into S only if still empty
const _prefetchInflight = new Set();
function _prefetchTables(tables, extraTables) {
  if (!SB_ON || !sb) return;
  tables.forEach(t => {
    if (_prefetchInflight.has(t)) return;
    _prefetchInflight.add(t);
    const cols = typeof TABLE_COLS !== 'undefined' && TABLE_COLS[t] ? TABLE_COLS[t] : '*';
    sb.from(t).select(cols).order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data && (!S[t] || !S[t].length)) S[t] = data;
      }).finally(() => _prefetchInflight.delete(t));
  });
  (extraTables || []).forEach(t => {
    if (_prefetchInflight.has(t)) return;
    _prefetchInflight.add(t);
    const cols = t === 'fuel_logs' ? 'id,vehicle_id,date,liters,cost,odometer_reading' : '*';
    sb.from(t).select(cols).order('date', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data && t === 'fuel_logs' && (!S.fuelLogs || !S.fuelLogs.length))
          S.fuelLogs = data;
      }).finally(() => _prefetchInflight.delete(t));
  });
}

// ── CONNECTION WARM-UP PING ─────────────────────────────────────────────────
// Fires a single lightweight query (1 row) on first user interaction or
// on tab becoming visible — "wakes up" the Supabase connection pool so the
// first real query doesn't pay cold-connection latency.
let _pingDone = false;
function _sbPing() {
  if (_pingDone || !SB_ON || !sb || !S.user) return;
  _pingDone = true;
  sb.from('accounts').select('id').limit(1).then(() => {}).catch(() => {});
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') _sbPing();
}, { once: true });
['mousedown','keydown','touchstart'].forEach(evt =>
  document.addEventListener(evt, _sbPing, { once: true, passive: true })
);
