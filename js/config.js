// CD & Co ERP — CONFIG
// ====================================

// ══════════════════════════════════════════
// ⚙️  CONFIG
// ══════════════════════════════════════════

// 🔐 Variables de entorno (leer de window.__ENV__ para Vercel, o usar defaults)
// Para desarrollo local: crea un archivo .env.local con:
//   SUPABASE_URL=https://...
//   SUPABASE_ANON_KEY=sb_...
const SB_URL = window.__ENV__?.SUPABASE_URL || 'https://beumpltrjgnehqbhtrxo.supabase.co';
const SB_KEY = window.__ENV__?.SUPABASE_ANON_KEY || 'sb_publishable__dabJ1ghmLg-pyLbJAPbYg_1_yyk7As';

const STRIPE = window.__ENV__?.STRIPE_PRO || 'TU_LINK_PRO';
const ANTHROPIC_KEY = window.__ENV__?.ANTHROPIC_KEY || 'TU_ANTHROPIC_KEY_AQUI';

// ✓ Supabase está configurado si URL y KEY no tienen placeholders
const SB_ON = !SB_URL.includes('TU_') && !SB_KEY.includes('TU_');
let sb = null;

if (SB_ON) {
  sb = window.supabase?.createClient(SB_URL, SB_KEY);
}

// ══════════════════════════════════════════
// STUBS DE SEGURIDAD — evitan ReferenceError si un módulo no cargó a tiempo
// Cubre TODAS las funciones que nav.js o auth.js llaman directamente (sin typeof guard)
// ══════════════════════════════════════════
const _stub = name => function(){ console.warn('[stub] ' + name + ' no disponible aún'); };
window.renderGoals          = window.renderGoals          || _stub('renderGoals');
window.renderFleet          = window.renderFleet          || _stub('renderFleet');
window.renderDashboard      = window.renderDashboard      || _stub('renderDashboard');
window.renderSales          = window.renderSales          || _stub('renderSales');
window.renderOrders         = window.renderOrders         || _stub('renderOrders');
window.renderInventory      = window.renderInventory      || _stub('renderInventory');
window.renderAccounts       = window.renderAccounts       || _stub('renderAccounts');
window.renderDebtsPage      = window.renderDebtsPage      || _stub('renderDebtsPage');
window.renderReceivables    = window.renderReceivables    || _stub('renderReceivables');
window.renderTxs            = window.renderTxs            || _stub('renderTxs');
window.renderContacts       = window.renderContacts       || _stub('renderContacts');
window.renderBudgets        = window.renderBudgets        || _stub('renderBudgets');
window.renderSubscriptions  = window.renderSubscriptions  || _stub('renderSubscriptions');
window.renderHistoryPage    = window.renderHistoryPage    || _stub('renderHistoryPage');
window.renderInvoices       = window.renderInvoices       || _stub('renderInvoices');
window.renderAdvice         = window.renderAdvice         || _stub('renderAdvice');
window.renderPatrimonio     = window.renderPatrimonio     || _stub('renderPatrimonio');
window.renderProfitability  = window.renderProfitability  || _stub('renderProfitability');
window.renderAll            = window.renderAll            || _stub('renderAll');
window.buildPlanCards       = window.buildPlanCards       || _stub('buildPlanCards');
window.populateSelects      = window.populateSelects      || _stub('populateSelects');
// ══════════════════════════════════════════
// STATE
// ══════════════════════════════════════════
// ── DATOS FISCALES DE LA EMPRESA (editables en configuración) ──
let EMPRESA = {
  nombre: 'CD & Co',
  razonSocial: 'CD & Co S.R.L.',
  ruc: '80123456-7',
  direccion: 'Asunción, Paraguay',
  telefono: '+595 21 000000',
  email: 'info@cd-co.com.py',
  web: 'cd-co.com.py',
  timbrado: '12345678',
  vigenciaDesde: '2024-01-01',
  vigenciaHasta: '2026-12-31',
  nroFacturaInicio: 1,
};
try { const e=localStorage.getItem('cdco_empresa'); if(e) EMPRESA={...EMPRESA,...JSON.parse(e)}; } catch(ex){}

const CATEGORIAS_GASTOS = [
  {id:'c1', name:'Alimentación', icon:'🛒'}, {id:'c2', name:'Transporte', icon:'🚌'},
  {id:'c3', name:'Vivienda', icon:'🏠'}, {id:'c4', name:'Salud', icon:'💊'},
  {id:'c5', name:'Educación', icon:'📚'}, {id:'c6', name:'Entretenimiento', icon:'🍿'},
  {id:'c7', name:'Servicios', icon:'⚡'}, {id:'c8', name:'Ropa', icon:'👕'},
  {id:'c9', name:'Tecnología', icon:'💻'}, {id:'c10', name:'Viajes', icon:'✈️'},
  {id:'c11', name:'Restaurantes', icon:'🍽️'}, {id:'c12', name:'Compras', icon:'🛍️'},
  {id:'c20', name:'Otros Gastos', icon:'🔹'}
];
const CATEGORIAS_INGRESOS = [
  {id:'i1', name:'Salario', icon:'💰'}, {id:'i2', name:'Freelance', icon:'💻'},
  {id:'i3', name:'Inversiones', icon:'📈'}, {id:'i4', name:'Negocio', icon:'🏢'},
  {id:'i5', name:'Alquiler', icon:'🔑'}, {id:'i6', name:'Regalo', icon:'🎁'},
  {id:'i7', name:'Venta', icon:'🛒'}, {id:'i8', name:'Reembolso', icon:'🔙'},
  {id:'i9', name:'Otros Ingresos', icon:'💵'}
];

let S={
  txs:[], products:[], sales:[], orders:[], contacts:[], cards:[], debts:[], accounts:[], budgets:[], subscriptions:[], goals:[], historical:[], receivables:[],
  vehicles: [], // cargado desde Supabase tabla vehicles
  fuelLogs: [], // cargado desde Supabase tabla fuel_logs
  customCategories: {gastos:[], ingresos:[]},
  fltTx:'all', fltInv:'all', fltSale:'all', fltOrd:'all', fltCon:'all', fltInv2:'all',
  user:null, plan:'pro',
  curPage:'dashboard',
  appMode:'full'
};
let editIds={tx:null,prod:null,sale:null,order:null,con:null};
let txType='income';
let saleLines=[], orderLines=[], stockProdId=null;
let recvOrderId=null;
let lm=false, lc2=null, dnc=null;
let FX={
  buy:0, sell:0, ts:null, dir:'usd2pyg', manual:false, // USD legacy (Cambios Chaco)
  cur:'USD', // moneda activa en el conversor
  currencies:{
    USD:{ buy:0, sell:0, symbol:'$',   flag:'🇺🇸', name:'Dólar'    },
    EUR:{ buy:0, sell:0, symbol:'€',   flag:'🇪🇺', name:'Euro'     },
    ARS:{ buy:0, sell:0, symbol:'$AR', flag:'🇦🇷', name:'Peso Arg.' },
    BRL:{ buy:0, sell:0, symbol:'R$',  flag:'🇧🇷', name:'Real'     }
  }
};
let selPK='pro';

// Helpers
function g(id){return document.getElementById(id)}
function escHtml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

// ══════════════════════════════════════════
// SUPABASE CRUD FUNCTIONS
// ══════════════════════════════════════════

// 📝 INSERT or UPDATE product in Supabase
async function sbSaveProduct(prod, isNew = true) {
  if (!SB_ON) { return null; }

  try {
    // Preparar datos para Supabase
    const data = {
      sku: prod.sku,
      name: prod.name,
      category: prod.cat,
      buy_price: prod.buyPrice,
      sell_price: prod.sellPrice,
      stock: prod.stock,
      min_stock: prod.minStock,
      variant: prod.variant || null,
      serial_number: prod.serialNumber || null,
      desc: prod.desc || null,
      cur: prod.cur || '₲',
      exchange_rate: prod.exchangeRate || null
    };

    let result;
    if (isNew) {
      // INSERT nuevo producto
      const response = await fetch(`${SB_URL}/rest/v1/products`, {
        method: 'POST',
        headers: {
          'apikey': SB_KEY,
          'Authorization': `Bearer ${SB_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const err = await response.json();
        console.error('❌ Error al insertar en Supabase:', err);
        toast('❌ Error al guardar en BD: ' + (err.message || 'Error desconocido'));
        return null;
      }

      result = await response.json();
      return result[0];
    } else {
      // UPDATE producto existente
      const response = await fetch(`${SB_URL}/rest/v1/products?id=eq.${prod.id}`, {
        method: 'PATCH',
        headers: {
          'apikey': SB_KEY,
          'Authorization': `Bearer ${SB_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const err = await response.json();
        console.error('❌ Error al actualizar en Supabase:', err);
        toast('❌ Error al actualizar: ' + (err.message || 'Error desconocido'));
        return null;
      }

      result = await response.json();
      return result[0];
    }
  } catch (err) {
    console.error('❌ Exception:', err.message);
    toast('❌ Error de conexión: ' + err.message);
    return null;
  }
}

// 🗑️ DELETE product from Supabase
async function sbDeleteProduct(prodId) {
  if (!SB_ON) { return true; }

  try {
    const response = await fetch(`${SB_URL}/rest/v1/products?id=eq.${prodId}`, {
      method: 'DELETE',
      headers: {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`
      }
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('❌ Error al eliminar:', err);
      toast('❌ Error al eliminar');
      return false;
    }

    return true;
  } catch (err) {
    console.error('❌ Exception:', err.message);
    return false;
  }
}

// ── GENERIC WRITE-THROUGH HELPERS ──────────────────────────────
// Use these for all tables. user_id is injected from S.user.id
// (which equals auth.uid() — validated by RLS on the server side).

async function sbUpsert(table, row) {
  if (!SB_ON || !sb) return row; // offline: return row as-is
  const userId = S.user?.id;
  if (!userId) { toast('Sesión expirada'); return null; }
  const payload = { ...row, user_id: userId };
  console.log(`[sbUpsert] ENVIANDO DATA a '${table}':`, JSON.stringify(payload));
  const { data, error } = await sb.from(table).upsert(payload, { onConflict: 'id' }).select().single();
  if (error) { console.error(`❌ sbUpsert(${table}):`, error.message); toast('Error al guardar'); return null; }
  return data;
}

async function sbDelete(table, id) {
  if (!SB_ON || !sb) return true; // offline: pretend success
  const userId = S.user?.id;
  let query = sb.from(table).delete().eq('id', id);
  if (userId) query = query.eq('user_id', userId);
  const { error } = await query;
  if (error) { console.error(`❌ sbDelete(${table}):`, error.message); toast('Error al eliminar'); return false; }
  return true;
}

// Guarda/actualiza una transacción en la tabla 'txs'
// Las columnas reales son: desc, cur, cat, account_id (coinciden con el modelo local)
async function sbSaveTransaction(tx) {
  if (!SB_ON || !sb) return tx; // offline: retornar tal cual
  const userId = S.user?.id;
  if (!userId) { toast('Sesión expirada'); return null; }
  const payload = {
    id:         tx.id,
    user_id:    userId,
    type:       tx.type,
    desc:       tx.desc,
    amount:     tx.amount,
    cur:        tx.cur || '$',
    cat:        tx.cat || '',
    date:       tx.date,
    icon:       tx.icon || null,
    account_id: tx.account_id || null
  };
  console.log('[sbSaveTransaction] ENVIANDO DATA:', JSON.stringify(payload));
  const { data, error } = await sb
    .from('txs')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single();
  if (error) {
    console.error('❌ sbSaveTransaction:', error.message, '| code:', error.code, '| details:', error.details);
    toast('Error al guardar');
    return null;
  }
  return data;
}
// ────────────────────────────────────────────────────────────────

// 📥 LOAD all products from Supabase
async function sbLoadProducts() {
  if (!SB_ON || !S.user) { return []; }

  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { console.warn('⚠ sbLoadProducts: sin sesión activa'); return []; }
    const response = await fetch(`${SB_URL}/rest/v1/products?select=*&user_id=eq.${S.user.id}`, {
      method: 'GET',
      headers: {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${session.access_token}`
      }
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('❌ Error al cargar productos:', err);
      return [];
    }

    const products = await response.json();
    // Mapear columnas de Supabase a formato local
    return products.map(p => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      cat: p.category,
      buyPrice: p.buy_price,
      sellPrice: p.sell_price,
      stock: p.stock,
      minStock: p.min_stock,
      variant: p.variant,
      serialNumber: p.serial_number,
      desc: p.desc,
      cur: p.cur || '₲',
      exchangeRate: p.exchange_rate || null
    }));
  } catch (err) {
    console.error('❌ Exception:', err.message);
    return [];
  }
}

// 🔄 SYNC all data from Supabase on app init (LEGACY — auth.js usa loadAllUserData con SWR)
// Mantenido como fallback. Carga en paralelo con Promise.all().
async function initSupabase() {
  if (!SB_ON) { return; }

  const [sbProducts, sbTransactions, sbSales] = await Promise.all([
    sbLoadProducts(),
    sbLoadTransactions(),
    sbLoadSales()
  ]);

  if (sbProducts.length > 0)     S.products = sbProducts;
  if (sbTransactions.length > 0) S.txs      = sbTransactions;
  if (sbSales.length > 0)        S.sales    = sbSales;
}

// ══════════════════════════════════════════
// EXPORT FUNCTIONS
// ══════════════════════════════════════════

// 📊 Generic CSV export function
function exportToCSV(filename, headers, rows) {
  // Crear contenido CSV
  const headerRow = headers.map(h => `"${h}"`).join(',');
  const csvContent = [
    headerRow,
    ...rows.map(row =>
      row.map(cell => {
        // Escapar comillas y saltos de línea
        const val = String(cell || '').replace(/"/g, '""').replace(/\n/g, ' ');
        return `"${val}"`;
      }).join(',')
    )
  ].join('\n');

  // Agregar BOM para que Excel reconozca UTF-8
  const BOM = '\uFEFF';
  const csvBlob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });

  // Crear link y descargar
  const link = document.createElement('a');
  const url = URL.createObjectURL(csvBlob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// 📦 Export inventory products to CSV
function exportInventoryCSV() {
  if (!S.products || !S.products.length) {
    toast('❌ No hay productos para exportar');
    return;
  }

  const headers = ['SKU', 'Producto', 'Categoría', 'Variante', 'Nº Serial', 'Precio Compra', 'Precio Venta', 'Margen %', 'Stock', 'Stock Mínimo', 'Descripción', 'Moneda'];

  const rows = S.products.map(p => {
    const margin = p.buyPrice > 0 ? Math.round((p.sellPrice - p.buyPrice) / p.buyPrice * 100) : 0;
    return [
      p.sku || '',
      p.name || '',
      p.cat || '',
      p.variant || '',
      p.serialNumber || '',
      p.buyPrice || 0,
      p.sellPrice || 0,
      margin,
      p.stock || 0,
      p.minStock || 0,
      p.desc || '',
      p.cur || '₲'
    ];
  });

  const fecha = new Date().toLocaleDateString('es').replace(/\//g, '-');
  exportToCSV(`Inventario_${fecha}`, headers, rows);
  toast('✅ Inventario exportado a CSV');
}

// 📈 Export profitability data to CSV
function exportProfitabilityCSV() {
  if (!S.products || !S.products.length) {
    toast('❌ No hay productos para exportar');
    return;
  }

  const headers = ['SKU', 'Producto', 'Categoría', 'Precio Compra', 'Precio Venta', 'Margen %', 'Stock', 'Valor Compra Total', 'Valor Venta Total', 'Ganancia Potencial'];

  const rows = S.products.map(p => {
    const margin = p.buyPrice > 0 ? Math.round((p.sellPrice - p.buyPrice) / p.buyPrice * 100) : 0;
    const valueBuy = p.stock * p.buyPrice;
    const valueSell = p.stock * p.sellPrice;
    const profit = valueSell - valueBuy;

    return [
      p.sku || '',
      p.name || '',
      p.cat || '',
      p.buyPrice || 0,
      p.sellPrice || 0,
      margin,
      p.stock || 0,
      valueBuy,
      valueSell,
      profit
    ];
  });

  const fecha = new Date().toLocaleDateString('es').replace(/\//g, '-');
  exportToCSV(`Rentabilidad_${fecha}`, headers, rows);
  toast('✅ Análisis de rentabilidad exportado a CSV');
}

// 💱 CONVERTIR USANDO TASA HISTÓRICA DEL PRODUCTO
// Si el producto tiene exchangeRate guardado, lo usa; sino, usa FX.sell actual
function convertProductAmount(amount, product, fromCur, toCur) {
  if (fromCur === toCur) return amount;

  // Usar tasa histórica del producto o caer a FX.sell actual
  const rate = product.exchangeRate || (FX && FX.sell) || 7200;

  if (fromCur === '$' && toCur === '₲') return amount * rate;
  if (fromCur === '₲' && toCur === '$') return amount / rate;
  return amount;
}

// ══════════════════════════════════════════
// LOAD TRANSACTIONS FROM SUPABASE
// ══════════════════════════════════════════
async function sbLoadTransactions() {
  if (!SB_ON || !S.user) { return []; }

  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { console.warn('⚠ sbLoadTransactions: sin sesión activa'); return []; }
    const response = await fetch(`${SB_URL}/rest/v1/transactions?select=*&user_id=eq.${S.user.id}&order=date.desc`, {
      method: 'GET',
      headers: {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${session.access_token}`
      }
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('❌ Error al cargar transacciones:', err);
      return [];
    }

    const transactions = await response.json();
    // Mapear columnas de Supabase a formato local
    return transactions.map(t => ({
      id: t.id,
      type: t.type,
      desc: t.description,
      amount: t.amount,
      cur: t.currency || '$',
      cat: t.category,
      date: t.date,
      icon: t.icon
    }));
  } catch (err) {
    console.error('❌ Exception:', err.message);
    return [];
  }
}

// ══════════════════════════════════════════
// LOAD SALES FROM SUPABASE
// ══════════════════════════════════════════
async function sbLoadSales() {
  if (!SB_ON || !S.user) { return []; }

  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { console.warn('⚠ sbLoadSales: sin sesión activa'); return []; }
    const response = await fetch(`${SB_URL}/rest/v1/sales?select=*&user_id=eq.${S.user.id}&order=date.desc`, {
      method: 'GET',
      headers: {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${session.access_token}`
      }
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('❌ Error al cargar ventas:', err);
      return [];
    }

    const sales = await response.json();
    // Mapear columnas de Supabase a formato local
    return sales.map(s => ({
      id: s.id,
      num: s.num,
      items: s.items || [],
      total: s.total,
      cur: s.cur || s.currency || '$',
      currency: s.cur || s.currency || '$', // alias para compatibilidad local
      date: s.date,
      client_id: s.client_id,
      status: s.status,
      condicion: s.condicion,
      nro_factura: s.nro_factura,
      notes: s.notes
    }));
  } catch (err) {
    console.error('❌ Exception:', err.message);
    return [];
  }
}

// ══════════════════════════════════════════
// FUEL MANAGEMENT API HELPERS
// ══════════════════════════════════════════

// 📝 CREATE NEW FUEL LOG
async function sbCreateFuelLog(fuelData) {
  if (!SB_ON) {
    toast('❌ Supabase no configurado');
    return null;
  }

  try {
    const response = await fetch('/api/fuel/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fuelData)
    });

    const data = await response.json();

    if (data.success) {
      toast('✅ Registro de combustible guardado');
      return data.log;
    } else {
      toast('❌ Error: ' + (data.error || 'Error desconocido'));
      return null;
    }
  } catch (err) {
    console.error('❌ Exception:', err.message);
    toast('❌ Error de conexión');
    return null;
  }
}

// 📊 GET ALL FUEL LOGS
async function sbGetFuelLogs() {
  if (!SB_ON) { return []; }

  try {
    const response = await fetch('/api/fuel/logs');
    const data = await response.json();
    if (data.success) return data.data;
    return [];
  } catch (err) {
    console.error('❌ Exception:', err.message);
    return [];
  }
}

// ⛽ GET FUEL EFFICIENCY (KM/L)
async function sbGetFuelEfficiency() {
  if (!SB_ON) { return null; }

  try {
    const response = await fetch('/api/fuel/efficiency');
    const data = await response.json();
    if (data.success) return data;
    return null;
  } catch (err) {
    console.error('❌ Exception:', err.message);
    return null;
  }
}

// 📈 GET 6-MONTH FUEL STATISTICS
async function sbGet6MonthFuelStats() {
  if (!SB_ON) { return null; }

  try {
    const response = await fetch('/api/fuel/stats/6months');
    const data = await response.json();
    if (data.success) return data.stats;
    return null;
  } catch (err) {
    console.error('❌ Exception:', err.message);
    return null;
  }
}

// 🔮 GET FUEL COST FORECAST (Next Month)
async function sbGetFuelForecast() {
  if (!SB_ON) { return null; }

  try {
    const response = await fetch('/api/fuel/forecast');
    const data = await response.json();
    if (data.success) return data;
    return null;
  } catch (err) {
    console.error('❌ Exception:', err.message);
    return null;
  }
}

// 💰 SETTLE FUEL CHARGE (Create transaction)
async function sbSettleFuelCharge(fuelLogId) {
  if (!SB_ON) {
    toast('❌ Supabase no configurado');
    return null;
  }

  try {
    const response = await fetch(`/api/fuel/settle/${fuelLogId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await response.json();

    if (data.success) {
      toast('✅ Carga devengada - Transacción creada');
      return data;
    } else {
      toast('❌ Error: ' + (data.error || 'Error al devengar'));
      return null;
    }
  } catch (err) {
    console.error('❌ Exception:', err.message);
    toast('❌ Error de conexión');
    return null;
  }
}

// 📋 GET UNSETTLED FUEL LOGS
async function sbGetUnsettledFuelLogs() {
  if (!SB_ON) { return []; }

  try {
    const response = await fetch('/api/fuel/unsettled');
    const data = await response.json();
    if (data.success) return data.data;
    return [];
  } catch (err) {
    console.error('❌ Exception:', err.message);
    return [];
  }
}

// 🗑️ DELETE FUEL LOG
async function sbDeleteFuelLog(fuelLogId) {
  if (!SB_ON) { return false; }

  try {
    const response = await fetch(`/api/fuel/log/${fuelLogId}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (data.success) {
      toast('✅ Registro eliminado');
      return true;
    } else {
      toast('❌ Error al eliminar');
      return false;
    }
  } catch (err) {
    console.error('❌ Exception:', err.message);
    toast('❌ Error de conexión');
    return false;
  }
}


// v1.0.99-FINAL-FIX — account_id correcto, tabla txs confirmada — 2026-04-05

// ══════════════════════════════════════════
// EMOJI PICKER — Global utility (Emoji-Mart)
// ══════════════════════════════════════════
// Active picker DOM elements indexed by btnId
const _emojiPickerEls = {};

/**
 * openEmojiPicker(event, btnId, gridId)
 * Opens/closes an Emoji-Mart picker popup anchored below the button.
 * gridId kept for HTML compatibility (fallback uses it).
 */
function openEmojiPicker(event, btnId, gridId) {
  event.stopPropagation();
  const btn = document.getElementById(btnId);
  if (!btn) return;

  // Close any other open pickers
  Object.entries(_emojiPickerEls).forEach(([id, el]) => {
    if (id !== btnId && el.parentNode) el.style.display = 'none';
  });

  // Emoji-Mart available?
  if (typeof EmojiMart === 'undefined' || typeof EmojiMart.Picker === 'undefined') {
    _openFallbackPicker(event, btnId, gridId);
    return;
  }

  // Create picker element once per button
  if (!_emojiPickerEls[btnId]) {
    const pickerEl = new EmojiMart.Picker({
      theme: 'dark',
      locale: 'es',
      previewPosition: 'none',
      skinTonePosition: 'none',
      onEmojiSelect: (emoji) => {
        btn.textContent = emoji.native;
        pickerEl.style.display = 'none';
      }
    });

    // Style the container
    pickerEl.style.cssText = `
      position:absolute; top:54px; left:0; z-index:1000;
      border-radius:12px; overflow:hidden;
      box-shadow:0 8px 40px rgba(0,0,0,.6);
    `;
    pickerEl.style.display = 'none';

    // Mount inside the button's wrapper (position:relative parent)
    btn.parentElement.appendChild(pickerEl);
    _emojiPickerEls[btnId] = pickerEl;
  }

  const el = _emojiPickerEls[btnId];
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function selectEmoji(event, btnId, gridId, emoji) {
  // Used by fallback grid only
  if (event) event.stopPropagation();
  const btn = document.getElementById(btnId);
  if (btn) btn.textContent = emoji;
  const grid = document.getElementById(gridId);
  if (grid) grid.parentElement.style.display = 'none';
}

// Fallback grid when Emoji-Mart CDN fails to load
const _FALLBACK_EMOJIS = [
  '🏦','💳','💵','💰','💼','🏠','🚗','✈️','📈','🛍️',
  '📱','💎','🏧','💱','🪙','💹','🧾','🎯','🔒','🏪',
  '⚡','🌐','📦','🎁','🏋️','🎓','🏥','🍽️','🌱','⭐',
  '🔹','🔸','🟣','🟡','🟢','🔴','🎨','🎵','📚','🧩'
];

function _openFallbackPicker(event, btnId, gridId) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  if (!grid.childElementCount) {
    grid.innerHTML = _FALLBACK_EMOJIS.map(e =>
      `<button type="button" onclick="selectEmoji(event,'${btnId}','${gridId}','${e}')"
        style="background:none;border:none;font-size:1.25rem;cursor:pointer;padding:4px;border-radius:6px;transition:background .15s;line-height:1"
        onmouseover="this.style.background='var(--bg4)'" onmouseout="this.style.background='none'">${e}</button>`
    ).join('');
  }
  const picker = grid.parentElement;
  picker.style.display = picker.style.display === 'none' ? 'block' : 'none';
}

// Close all pickers on outside click
document.addEventListener('click', () => {
  Object.values(_emojiPickerEls).forEach(el => { el.style.display = 'none'; });
  document.querySelectorAll('.emoji-picker-dropdown').forEach(el => { el.style.display = 'none'; });
});
