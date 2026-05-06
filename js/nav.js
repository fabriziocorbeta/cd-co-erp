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
      // C-2: Guard de frescura — no re-fetch si S.txs fue cargado hace < 2 min.
      // Evita un round-trip a Supabase en cada navegación a la pestaña Movimientos.
      const TXS_MAX_AGE = 2 * 60 * 1000; // 2 minutos
      const needsRefresh = !S.txs?.length || (Date.now() - (S._txsLastFetch || 0)) > TXS_MAX_AGE;
      if (needsRefresh && S.user?.id) {
        const {data, error} = await sb.from('txs')
          .select('id,type,amount,cur,cat,date,desc,account_id,transferPairId,user_id')
          .eq('user_id', S.user.id)
          .order('date', {ascending: false})
          .limit(500); // C-2: traer solo las últimas 500 txs
        if (!error && data) {
          S.txs = data;
          S._txsLastFetch = Date.now(); // marcar timestamp para el guard
        }
      }
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
  else if(pg==='notifs'){if(typeof calculateAlerts==='function')calculateAlerts();if(typeof renderNotifs==='function')renderNotifs();}
  else if(pg==='plan'){buildPlanCards();loadEmpresaForm();if(typeof loadAdminUsers==='function')loadAdminUsers();if(typeof initBackupUI==='function')initBackupUI();}
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
  el.innerHTML = cats.map(c=>`<option value="${escHtml(c.name)}">${escHtml(c.icon)} ${escHtml(c.name)}</option>`).join('') + '<option value="ADD_NEW">+ Nueva categoría</option>';
  if(cur && cats.find(c=>c.name===cur)) el.value = cur;
  else if(cats.length) el.value = cats[0].name;
}

function populateSelects(){
  const sups=S.contacts.filter(c=>c.type==='supplier'||c.type==='both');
  const clients=S.contacts.filter(c=>c.type==='client'||c.type==='both');
  ['pr-sup'].forEach(id=>{const el=document.getElementById(id);if(!el)return;el.innerHTML='<option value="">Sin asignar</option>'+sups.map(s=>`<option value="${escHtml(s.id)}">${escHtml(s.name)}</option>`).join('')});
  ['or-sup'].forEach(id=>{const el=document.getElementById(id);if(!el)return;el.innerHTML='<option value="">Seleccionar proveedor</option>'+sups.map(s=>`<option value="${escHtml(s.id)}">${escHtml(s.name)}</option>`).join('')});
  ['sl-client'].forEach(id=>{const el=document.getElementById(id);if(!el)return;el.innerHTML='<option value="">Cliente ocasional</option>'+clients.map(c=>`<option value="${escHtml(c.id)}">${escHtml(c.name)}</option>`).join('')});

  // tx-cat se pobla dinámicamente según el tipo en setTT() — no tocar aquí
  // bgt-cat usa categorías de gastos
  const bgtCat = document.getElementById('bgt-cat');
  if(bgtCat){
    const cur = bgtCat.value;
    const cats = getCats('expense');
    bgtCat.innerHTML = cats.map(c=>`<option value="${escHtml(c.name)}">${escHtml(c.icon)} ${escHtml(c.name)}</option>`).join('') + '<option value="ADD_NEW">+ Nueva categoría</option>';
    if(cur && cats.find(c=>c.name===cur)) bgtCat.value = cur;
  }
  // Refresh account+card selector so cards always appear
  if (typeof populateTxAccountSelect === 'function') populateTxAccountSelect();
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
  // Local-first: always save immediately so offline users are never blocked
  list.push({ id, name, icon });
  lsave();

  // Repoblar el select correspondiente
  const type = catType === 'ingresos' ? 'income' : 'expense';
  if(window._pendingCatSelect) populateTxCat(type, window._pendingCatSelect, name);
  populateSelects();
  cm('new-cat-modal');
  toast('◆ Categoría agregada');

  // Cloud sync — non-blocking, graceful degradation if offline
  if (SB_ON && sb) {
    const modal = document.getElementById('new-cat-modal');
    const btnGuardar = modal ? modal.querySelector('button:last-child') : null;
    if (btnGuardar) {
      const orig = btnGuardar.textContent;
      btnGuardar.textContent = 'Guardando en la nube...';
      sb.from('categorias').upsert({ id, nombre: name, icono: icon, tipo: catType, user_id: S.user?.id })
        .then(({ error }) => { if (error) console.warn('[saveNewCat] SB:', error.message); })
        .finally(() => { btnGuardar.textContent = orig; });
    } else {
      sb.from('categorias').upsert({ id, nombre: name, icono: icon, tipo: catType, user_id: S.user?.id })
        .then(({ error }) => { if (error) console.warn('[saveNewCat] SB:', error.message); });
    }
  }
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

// ══════════════════════════════════════════
// COMMAND PALETTE — Cmd+K / Ctrl+K
// Spotlight global: busca productos, contactos, txs y acciones rápidas.
// El modal se crea lazily la primera vez que se invoca.
// ══════════════════════════════════════════
(function initCmdPalette() {
  let _el = null;   // elemento raíz inyectado en body
  let _open = false;

  // ── Lazy DOM creation ──────────────────────────────────────────────────
  function _build() {
    if (_el) return;
    _el = document.createElement('div');
    _el.id = 'cmd-palette';
    _el.setAttribute('role', 'dialog');
    _el.setAttribute('aria-label', 'Búsqueda global');
    _el.innerHTML = `
      <div id="cmd-backdrop"></div>
      <div id="cmd-modal">
        <div id="cmd-search-wrap">
          <span class="material-symbols-rounded" id="cmd-search-icon">search</span>
          <input id="cmd-input" type="text"
            placeholder="Buscar transacciones, productos, contactos..."
            autocomplete="off" spellcheck="false"/>
          <kbd id="cmd-esc-hint">ESC</kbd>
        </div>
        <div id="cmd-results"></div>
        <div id="cmd-footer">
          <span><kbd>↑↓</kbd> navegar</span>
          <span><kbd>↵</kbd> abrir</span>
          <span><kbd>ESC</kbd> cerrar</span>
        </div>
      </div>`;
    document.body.appendChild(_el);

    _el.querySelector('#cmd-backdrop').addEventListener('click', close);

    const inp = _el.querySelector('#cmd-input');
    inp.addEventListener('input', e => _render(e.target.value));
    inp.addEventListener('keydown', e => {
      if (e.key === 'Escape')    { e.preventDefault(); close(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); _move(1); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); _move(-1); }
      if (e.key === 'Enter')     { e.preventDefault(); _select(); }
    });
  }

  // ── Open / Close ───────────────────────────────────────────────────────
  function open() {
    _build();
    _el.classList.add('open');
    _open = true;
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      const inp = document.getElementById('cmd-input');
      if (inp) { inp.value = ''; inp.focus(); }
      _render('');
    }, 40);
  }

  function close() {
    if (!_el) return;
    _el.classList.remove('open');
    _open = false;
    document.body.style.overflow = '';
  }

  // ── Keyboard navigation ────────────────────────────────────────────────
  function _move(dir) {
    const items = [...document.querySelectorAll('#cmd-results .cmd-item')];
    if (!items.length) return;
    let idx = items.indexOf(document.activeElement);
    items[Math.max(0, Math.min(items.length - 1, idx + dir))]?.focus();
  }

  function _exec(action) {
    close();
    try { (new Function(action))(); } catch(e) { console.warn('[CmdPalette]', e.message); }
  }

  function _select() {
    const el = document.activeElement;
    if (el?.classList.contains('cmd-item') && el.dataset.action) _exec(el.dataset.action);
  }

  // ── Render results ─────────────────────────────────────────────────────
  function _render(q) {
    const el = document.getElementById('cmd-results');
    if (!el) return;
    const ql = (q || '').toLowerCase().trim();

    if (!ql) {
      // Accesos rápidos cuando el campo está vacío
      const shortcuts = [
        { icon: 'add_shopping_cart', label: 'Nueva venta',         type: 'Acción',   action: "goPage('sales');openSaleModal()" },
        { icon: 'add_card',          label: 'Nueva transacción',   type: 'Acción',   action: "goPage('txs');openTxModal()" },
        { icon: 'inventory_2',       label: 'Inventario',          type: 'Página',   action: "goPage('inventory')" },
        { icon: 'contacts',          label: 'Contactos',           type: 'Página',   action: "goPage('contacts')" },
        { icon: 'dashboard',         label: 'Dashboard',           type: 'Página',   action: "goPage('dashboard')" },
        { icon: 'currency_exchange', label: 'Tipo de cambio',      type: 'Página',   action: "goPage('txs');openFxModal()" },
        { icon: 'bar_chart',         label: 'Rentabilidad',        type: 'Página',   action: "goPage('profitability')" },
        { icon: 'account_balance',   label: 'Patrimonio',          type: 'Página',   action: "goPage('patrimonio')" },
      ];
      el.innerHTML = `<div class="cmd-section">ACCESOS RÁPIDOS</div>` +
        shortcuts.map(s => _itemHtml(s)).join('');
    } else {
      const results = [];

      // Productos
      (S.products || [])
        .filter(p => (p.name||'').toLowerCase().includes(ql) || (p.sku||'').toLowerCase().includes(ql))
        .slice(0, 4)
        .forEach(p => results.push({
          icon: 'inventory_2',
          label: escHtml(p.name),
          sub: `SKU: ${escHtml(p.sku||'—')} · Stock: ${p.stock} u.`,
          type: 'Producto',
          action: `goPage('inventory');openProdModal('${p.id}')`
        }));

      // Contactos
      (S.contacts || [])
        .filter(c => (c.name||'').toLowerCase().includes(ql) || (c.phone||'').includes(ql))
        .slice(0, 3)
        .forEach(c => results.push({
          icon: c.type === 'supplier' ? 'local_shipping' : 'person',
          label: escHtml(c.name),
          sub: escHtml(c.phone || c.email || c.type || ''),
          type: 'Contacto',
          action: `goPage('contacts');openConModal('${c.id}')`
        }));

      // Transacciones
      (S.txs || [])
        .filter(t => (t.desc||'').toLowerCase().includes(ql) || (t.cat||'').toLowerCase().includes(ql))
        .slice(0, 4)
        .forEach(t => {
          const sign = t.type === 'income' ? '+' : '-';
          const sym  = t.cur === '₲' ? '₲' : '$';
          results.push({
            icon: t.type === 'income' ? 'trending_up' : 'shopping_bag',
            label: escHtml(t.desc || t.cat || '—'),
            sub: `${sign}${sym}${Math.abs(t.amount||0).toLocaleString('es')} · ${t.date||''}`,
            type: 'Movimiento',
            action: `goPage('txs')`
          });
        });

      if (!results.length) {
        el.innerHTML = `<div class="cmd-empty">Sin resultados para "<strong>${escHtml(q)}</strong>"</div>`;
      } else {
        el.innerHTML = `<div class="cmd-section">RESULTADOS (${results.length})</div>` +
          results.map(r => _itemHtml(r)).join('');
      }
    }

    // Bind clicks
    el.querySelectorAll('.cmd-item').forEach(item => {
      item.addEventListener('click', () => { if (item.dataset.action) _exec(item.dataset.action); });
    });
  }

  function _itemHtml(r) {
    return `<div class="cmd-item" data-action="${escHtml(r.action)}" tabindex="-1">
      <span class="material-symbols-rounded cmd-item-icon">${r.icon}</span>
      <div class="cmd-item-info">
        <span class="cmd-item-label">${r.label}</span>
        ${r.sub ? `<span class="cmd-item-sub">${r.sub}</span>` : ''}
      </div>
      <span class="cmd-item-type">${r.type}</span>
    </div>`;
  }

  // ── Global shortcut: Cmd+K / Ctrl+K ───────────────────────────────────
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      _open ? close() : open();
    }
  });

  // Expose globally
  window.openCmdPalette = open;
  window.closeCmdPalette = close;
})();

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
