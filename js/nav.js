// CD & Co ERP — NAV
// ====================================

// ══════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════
function goPage(pg){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('on'));
  document.querySelectorAll('.ni').forEach(n=>n.classList.remove('on'));
  document.getElementById('page-'+pg).classList.add('on');
  const nav=document.getElementById('nav-'+pg);if(nav)nav.classList.add('on');
  S.curPage=pg;
  renderPageData(pg);
}
async function renderPageData(pg){
  if(pg==='dashboard')renderDashboard();
  else if(pg==='txs'){
    // Always pull fresh txs from Supabase before rendering
    if(SB_ON && sb){
      const {data, error} = await sb.from('txs').select('*').order('date', {ascending: false});
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
  // fleet: desactivado temporalmente
  else if(pg==='plan'){buildPlanCards();loadEmpresaForm();}
}
function renderAll(){renderDashboard();renderTxs();renderInventory();renderSales();renderOrders();renderInvoices();renderContacts();renderAccounts();renderBudgets();renderSubscriptions();renderGoals();renderAdvice();renderDebtsPage();if(typeof renderHistoryPage==='function')renderHistoryPage();if(typeof renderReceivables==='function')renderReceivables();if(typeof renderPatrimonio==='function'&&S.curPage==='patrimonio')renderPatrimonio();if(typeof renderProfitability==='function')renderProfitability();/* renderFleet desactivado */updateBadges();if(typeof populateTxAccountSelect==='function')populateTxAccountSelect();}

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
      document.getElementById('nc-icon').value = '🔹';
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

function saveNewCat() {
  const name = document.getElementById('nc-name').value.trim();
  const icon = document.getElementById('nc-icon').value.trim() || '🔹';
  const catType = document.getElementById('nc-type')?.value || 'gastos';
  if(!name) { toast('Ingresá un nombre'); return; }

  if(!S.customCategories) S.customCategories = {gastos:[], ingresos:[]};
  const list = catType === 'ingresos' ? S.customCategories.ingresos : S.customCategories.gastos;

  if(list.find(c => c.name.toLowerCase() === name.toLowerCase())) {
     toast('Esa categoría ya existe'); return;
  }

  const id = 'cu_' + Date.now();
  list.push({ id, name, icon });
  lsave();

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
});
