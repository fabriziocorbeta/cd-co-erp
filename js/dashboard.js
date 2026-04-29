// CD & Co ERP — DASHBOARD
// ====================================

// ══════════════════════════════════════════
// FAST DASHBOARD SUMMARY VIA RPC (render inmediato)
// ══════════════════════════════════════════
// SQL TEMPLATE para crear la función RPC (si no existe):
// CREATE OR REPLACE FUNCTION get_dashboard_summary(p_user_id UUID)
// RETURNS TABLE(
//   patrimonio_neto NUMERIC, month_income NUMERIC, month_expense NUMERIC,
//   prev_month_income NUMERIC, prev_month_expense NUMERIC
// ) AS $$
// BEGIN
//   RETURN QUERY
//   SELECT
//     (SELECT COALESCE(SUM(balance), 0) FROM accounts WHERE user_id = p_user_id)
//     + (SELECT COALESCE(SUM(total - paid), 0) FROM receivables WHERE user_id = p_user_id AND completed = false)
//     + (SELECT COALESCE(SUM(buyPrice * stock), 0) FROM products WHERE user_id = p_user_id)
//     - (SELECT COALESCE(SUM(balance), 0) FROM cards WHERE user_id = p_user_id)
//     - (SELECT COALESCE(SUM(totalAmount - paidAmount), 0) FROM debts WHERE user_id = p_user_id)
//   AS patrimonio_neto,
//   ... (income/expense sums for months)
// END;
// $$ LANGUAGE plpgsql;

const DASH_SUM_KEY = 'cdco_dashboard_summary';
const DASH_SUM_TTL = 5 * 60 * 1000; // 5 min
let _dashboardSummaryCache = null;

function _saveDashboardSummary(data) {
  try {
    localStorage.setItem(DASH_SUM_KEY, JSON.stringify({
      ts: Date.now(),
      data: data
    }));
  } catch(e) {}
}

function _loadDashboardSummaryCache() {
  try {
    const d = JSON.parse(localStorage.getItem(DASH_SUM_KEY) || '{}');
    if (d.ts && d.data && Date.now() - d.ts < DASH_SUM_TTL) {
      return d.data; // cache hit
    }
  } catch(e) {}
  return null;
}

async function loadDashboardSummary() {
  if (!SB_ON || !sb) return;

  // Intentar cargar desde caché primero
  const cached = _loadDashboardSummaryCache();
  if (cached) {
    _dashboardSummaryCache = cached;
    renderDashboardSummary();
    console.log('[Dashboard] Resumen desde caché (SWR)');
    // Revalidar en background (SWR)
    _revalidateDashboardSummary();
    return;
  }

  // Sin caché o vencido — fetch via dashboard_stats RPC (C-2: server-side aggregation)
  // Pasamos FX.sell para que el servidor convierta USD→PYG con el tipo actual.
  try {
    const fxRate = (typeof FX !== 'undefined' && FX.sell && FX.sell > 1000) ? FX.sell : 7500;
    const { data, error } = await sb.rpc('dashboard_stats', {
      p_user_id: S.user?.id,
      p_fx_rate: fxRate
    });
    if (error) {
      console.error('[Dashboard RPC] Error:', error.message);
      return;
    }
    if (data) {
      _dashboardSummaryCache = data;
      _saveDashboardSummary(data);
      renderDashboardSummary();
      console.log('[Dashboard] KPIs desde RPC server-side (C-2 ✓)');
    }
  } catch (err) {
    console.error('[Dashboard RPC] Exception:', err.message);
  }
}

async function _revalidateDashboardSummary() {
  if (!SB_ON || !sb) return;
  try {
    const fxRate = (typeof FX !== 'undefined' && FX.sell && FX.sell > 1000) ? FX.sell : 7500;
    const { data, error } = await sb.rpc('dashboard_stats', {
      p_user_id: S.user?.id,
      p_fx_rate: fxRate
    });
    if (error) return;
    if (data && JSON.stringify(data) !== JSON.stringify(_dashboardSummaryCache)) {
      _dashboardSummaryCache = data;
      _saveDashboardSummary(data);
      renderDashboardSummary(); // Actualizar UI solo si los datos cambiaron
      console.log('[Dashboard] KPIs revalidados en background (C-2 ✓)');
    }
  } catch (err) {}
}

function renderDashboardSummary() {
  if (!_dashboardSummaryCache) {
    console.log('[Dashboard] No hay resumen cacheado, usando cálculo en frontend');
    return;
  }
  const d = _dashboardSummaryCache;
  const dCur = '₲';

  // Esperado del RPC get_dashboard_summary:
  // { patrimonio_neto, month_income, month_expense, prev_month_income, prev_month_expense, ... }
  const totalBal = parseFloat(d.patrimonio_neto) || 0;
  const monthInc = parseFloat(d.month_income) || 0;
  const monthExp = parseFloat(d.month_expense) || 0;

  if(g('d-total-balance')) g('d-total-balance').textContent = fmt(totalBal, dCur);
  if(g('d-wk-inc')) g('d-wk-inc').textContent = fmt(monthInc, dCur);
  if(g('d-wk-exp')) g('d-wk-exp').textContent = fmt(monthExp, dCur);

  // Variación vs mes anterior (si viene del RPC)
  const prevInc = parseFloat(d.prev_month_income) || 0;
  const prevExp = parseFloat(d.prev_month_expense) || 0;
  if (prevInc !== undefined && prevExp !== undefined) {
    const getVarHtml = (curr, prev, isExp) => {
      if(prev===0) return curr>0 ? `<span style="color:var(--pos);font-size:.65rem;border-radius:4px;padding:2px 6px;background:var(--pb)">+100% vs mes ant.</span>` : '';
      const pct = ((curr-prev)/prev)*100;
      const isP = pct>0;
      const color = isExp ? (isP?'var(--neg)':'var(--pos)') : (isP?'var(--pos)':'var(--neg)');
      const bg = isExp ? (isP?'var(--nb)':'var(--pb)') : (isP?'var(--pb)':'var(--nb)');
      return `<span style="color:${color};font-size:.65rem;border-radius:4px;padding:2px 6px;background:${bg}">${isP?'+':''}${pct.toFixed(0)}% vs mes ant.</span>`;
    };
    if(g('d-wk-inc-var')) g('d-wk-inc-var').innerHTML = getVarHtml(monthInc, prevInc, false);
    if(g('d-wk-exp-var')) g('d-wk-exp-var').innerHTML = getVarHtml(monthExp, prevExp, true);
  }
}

// ══════════════════════════════════════════
// DASHBOARD RENDER (en dos fases)
// ══════════════════════════════════════════
function renderDashboard() {
  // Fase 0: KPI via RPC server-side (C-2 — elimina forEach masivos sobre S.txs)
  // Dispara en background — cuando llega actualiza KPIs via renderDashboardSummary().
  // No bloquea el render: la Fase 1 muestra datos locales mientras tanto.
  if (SB_ON && sb && S.user?.id) {
    loadDashboardSummary();
  }

  // Fase 1: stats locales como fallback inmediato (SB_OFF, o cache aún ausente)
  if (_dashboardSummaryCache) {
    renderDashboardSummary(); // RPC cache disponible — source of truth
  } else {
    renderEtherealStats();    // Cálculo local sobre S.txs (500 filas paginadas)
  }

  // Fase 2: gráficos y listas — operan sobre S.txs (paginado, últimas 500)
  if (S.txs && S.txs.length) {
    renderEtherealCharts();
    renderEtherealRecentTxs();
  }

  renderEtherealCardsStock();
  renderEtherealSubs();
  renderSalesMetrics(); // KPI ventas del mes + gráfico tendencia 7 días
  if (typeof renderBudgetsSummary === 'function') renderBudgetsSummary();
  if (typeof renderGoalsSummary === 'function') renderGoalsSummary();
}

// ══════════════════════════════════════════
// DATA UNIFICATION
// ══════════════════════════════════════════
function getUnifiedMonthlyData() {
  const fxRate = (typeof FX !== 'undefined' && FX.sell) ? FX.sell : 7500;
  const tm = typeof thisMo === 'function' ? thisMo() : new Date().toISOString().slice(0, 7);
  
  let cU=0, cG=0; S.txs.filter(t=>mkey(t.date) === tm).forEach(t=>t.cur==='₲'?cG++:cU++);
  const dCur = cG>cU ? '₲':'$';

  let marExp = 0, marInc = 0;
  let catSums = {};

  S.txs.forEach(t => {
    const desc = t.desc ? t.desc.toLowerCase() : '';
    const cat = t.cat ? t.cat.toLowerCase() : '';
    const isAdj = t.isBalanceAdj === true || desc.includes('ajuste de saldo');
    
    if (mkey(t.date) === tm && !isAdj) {
      const amt = t.cur === dCur ? Math.abs(t.amount) : (dCur==='₲' ? Math.abs(t.amount)*fxRate : Math.abs(t.amount)/fxRate);
      if (t.type === 'expense') {
         marExp += amt;
         const safeCat = t.cat || 'Sin Categorizar';
         catSums[safeCat] = (catSums[safeCat] || 0) + amt;
      } else if (t.type === 'income' || t.type === 'transfer-in') {
         marInc += amt;
      }
    }
  });

  let prevExp=0, prevInc=0;
  let [y, m] = tm.split('-');
  let prevD = new Date(y, parseInt(m)-2, 1);
  const prevTm = prevD.getFullYear() + '-' + String(prevD.getMonth()+1).padStart(2, '0');

  S.txs.forEach(t => {
    const desc = t.desc ? t.desc.toLowerCase() : '';
    const cat = t.cat ? t.cat.toLowerCase() : '';
    const isAdj = t.isBalanceAdj === true || desc.includes('ajuste de saldo');

    if (mkey(t.date) === prevTm && !isAdj) {
      const amt = t.cur === dCur ? Math.abs(t.amount) : (dCur==='₲' ? Math.abs(t.amount)*fxRate : Math.abs(t.amount)/fxRate);
      if (t.type === 'expense') prevExp += amt;
      else if (t.type === 'income' || t.type === 'transfer-in') prevInc += amt;
    }
  });

  return { dCur, marExp, marInc, catSums, prevExp, prevInc, fxRate };
}

function renderEtherealStats(){
  const txs = S.txs;
  // 💱 USAR FX.sell (cotización de venta) en lugar de FX.buy para análisis de rentabilidad
  const fxRate = (typeof FX !== 'undefined' && FX.sell) ? FX.sell : 7500;

  // 🎯 PATRIMONIO NETO = Activos - Pasivos (copia fiel de la pestaña Patrimonio)
  const dCur = '₲'; // Siempre mostrar en moneda local
  // Usar FX.buy para valorizar activos en USD (misma lógica que patrimonio.js → patToDom)
  const patFxRate = (typeof FX !== 'undefined' && FX.buy && FX.buy > 1000) ? FX.buy : 7200;

  // Calcular Activos — usar siempre a.balance como fuente de verdad
  let acctTotal = 0;
  (S.accounts || []).forEach(a => {
    const bal = parseFloat(a.balance) || 0;
    const conv = a.cur === '₲' || !a.cur ? bal : bal * patFxRate;
    acctTotal += conv;
  });

  // Calcular Pasivos (Tarjetas + Deudas)
  let cardDebt = 0;
  (S.cards || []).forEach(c => {
    const used = typeof getCardUsed === 'function' ? getCardUsed(c.id) : 0;
    const conv = c.cur === '₲' || !c.cur ? used : used * patFxRate;
    cardDebt += conv;
  });

  let otherDebt = 0;
  (S.debts || []).forEach(d => {
    const pending = Math.max(0, parseFloat(d.totalAmount || d.total || 0) - parseFloat(d.paidAmount || d.paid || 0));
    const conv = d.cur === '₲' || !d.cur ? pending : pending * patFxRate;
    otherDebt += conv;
  });

  // Calcular A Cobrar (Receivables)
  let recvTotal = 0;
  (S.receivables || []).filter(r => !r.completed).forEach(r => {
    const pending = Math.max(0, parseFloat(r.total || 0) - parseFloat(r.paid || 0));
    const conv = r.cur === '₲' || !r.cur ? pending : pending * patFxRate;
    recvTotal += conv;
  });

  // Calcular Inventario (Activo)
  let invValue = 0;
  (S.products || []).forEach(p => {
    const val = (parseFloat(p.buyPrice) || 0) * (parseInt(p.stock) || 0);
    const pCur = p.cur || '₲';
    const conv = pCur === '₲' ? val : val * patFxRate;
    invValue += conv;
  });

  // 📊 PATRIMONIO NETO = (Cuentas + A Cobrar + Inventario) − (Deudas Tarjetas + Otras Deudas)
  const ACTIVOS  = acctTotal + recvTotal + invValue;   // Cuentas + Receivables + Stock
  const PASIVOS  = cardDebt  + otherDebt;              // Tarjetas + Préstamos/Deudas
  const patrimonioNeto = ACTIVOS - PASIVOS;

  if(g('d-total-balance')) g('d-total-balance').textContent = fmt(patrimonioNeto, dCur);

  // 📅 MÉTRICAS DE MES UNIFICADAS (Single Source of Truth)
  const unified = getUnifiedMonthlyData();
  const marInc = unified.marInc;
  const marExp = unified.marExp;
  const prevInc = unified.prevInc;
  const prevExp = unified.prevExp;

  // 🔄 RENDERIZAR TARJETAS DE MARZO
  if(g('d-wk-inc')) g('d-wk-inc').textContent = fmt(marInc, dCur);
  if(g('d-wk-exp')) g('d-wk-exp').textContent = fmt(marExp, dCur);

  const getVarHtml = (curr, prev, isExp) => {
    if(prev===0) return curr>0 ? `<span style="color:var(--pos);font-size:.65rem;border-radius:4px;padding:2px 6px;background:var(--pb)">+100% vs mes ant.</span>` : '';
    const pct = ((curr-prev)/prev)*100;
    const isP = pct>0;
    const color = isExp ? (isP?'var(--neg)':'var(--pos)') : (isP?'var(--pos)':'var(--neg)');
    const bg = isExp ? (isP?'var(--nb)':'var(--pb)') : (isP?'var(--pb)':'var(--nb)');
    return `<span style="color:${color};font-size:.65rem;border-radius:4px;padding:2px 6px;background:${bg}">${isP?'+':''}${pct.toFixed(0)}% vs mes ant.</span>`;
  };
  if(g('d-wk-inc-var')) g('d-wk-inc-var').innerHTML = getVarHtml(marInc, prevInc, false);
  if(g('d-wk-exp-var')) g('d-wk-exp-var').innerHTML = getVarHtml(marExp, prevExp, true);
}

let dRevFlowPeriod = 'month';
window.setDashboardFlowPer = function(p) {
  dRevFlowPeriod = p;
  document.querySelectorAll('#d-rf-mo, #d-rf-wk').forEach(b=>b.classList.remove('on'));
  const el = document.getElementById(p==='month'?'d-rf-mo':'d-rf-wk');
  if(el) el.classList.add('on');
  renderEtherealCharts();
};

let dRevChart = null;
let dExpChart = null;

function renderEtherealCharts() {
  // 💱 USAR FX.sell (cotización de venta) en lugar de FX.buy
  const fxRate = (typeof FX !== 'undefined' && FX.sell) ? FX.sell : 7500;
  let cU=0, cG=0; S.txs.forEach(t=>t.cur==='₲'?cG++:cU++); const dCur = cG>cU?'₲':'$';
  
  // Get theme colors
  const style = getComputedStyle(document.body);
  const colorG2 = style.getPropertyValue('--g2').trim() || '#c9960c';
  const colorBG5 = style.getPropertyValue('--bg5').trim() || 'rgba(255,255,255,0.1)';
  const colorMU = style.getPropertyValue('--mu').trim() || '#8a8278';
  const colorCR = style.getPropertyValue('--cr').trim() || '#fff';

  if(g('d-revenue-chart') && window.Chart) {
    const lbs=[], incs=[], exps=[];
    if(dRevFlowPeriod === 'month') {
      for(let i=5; i>=0; i--){
        const d = new Date(); d.setMonth(d.getMonth()-i);
        const k = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
        lbs.push(d.toLocaleString('es',{month:'short'}));
        let tI=0, tE=0;
        S.txs.filter(t=> {
          const isAdj = (t.desc||'').toLowerCase().includes('ajuste') || (t.cat||'').toLowerCase().includes('ajuste') || (t.cat === 'Otros Ingresos' && Math.abs(t.amount) > 500000);
          return mkey(t.date)===k && !isAdj;
        }).forEach(t=>{ const a=t.cur===dCur?Math.abs(t.amount):(dCur==='₲'?Math.abs(t.amount)*fxRate:Math.abs(t.amount)/fxRate); if(t.type==='income')tI+=a; else if(t.type==='expense')tE+=a; });
        incs.push(tI); exps.push(tE);
      }
    } else {
      for(let i=5; i>=0; i--){
        const d = new Date(); d.setDate(d.getDate() - (i*7));
        lbs.push('Sem '+(5-i)); 
        const wS = new Date(d.setDate(d.getDate() - d.getDay() + 1)).toISOString().slice(0,10);
        const wE = new Date(d.setDate(d.getDate() + 6)).toISOString().slice(0,10);
        let tI=0, tE=0;
        S.txs.filter(t=> {
          const isAdj = (t.desc||'').toLowerCase().includes('ajuste') || (t.cat||'').toLowerCase().includes('ajuste') || (t.cat === 'Otros Ingresos' && Math.abs(t.amount) > 500000);
          return t.date>=wS && t.date<=wE && !isAdj;
        }).forEach(t=>{ const a=t.cur===dCur?Math.abs(t.amount):(dCur==='₲'?Math.abs(t.amount)*fxRate:Math.abs(t.amount)/fxRate); if(t.type==='income')tI+=a; else if(t.type==='expense')tE+=a; });
        incs.push(tI); exps.push(tE);
      }
    }
    
    if(dRevChart) dRevChart.destroy();
    const ctxR = document.getElementById('d-revenue-chart');
    const orphanR = Chart.getChart(ctxR); if(orphanR) orphanR.destroy();
    dRevChart = new Chart(ctxR.getContext('2d'), {
      type: 'bar',
      data: { labels: lbs, datasets: [
        { label: 'Ingresos', data: incs, backgroundColor: colorG2, borderRadius: 4 },
        { label: 'Gastos', data: exps, backgroundColor: colorBG5, borderRadius: 4 }
      ]},
      options: { 
        responsive: true, maintainAspectRatio: false, 
        plugins: { legend: { display: false } },
        scales: { 
          x: { grid: { display: false }, ticks: { color: colorMU, font: { size: 10 } } }, 
          y: { display: false } 
        }
      }
    });
  }
  
  if(g('d-expense-donut') && window.Chart) {
    const unified = getUnifiedMonthlyData();
    const catSums = unified.catSums;
    const totalExp = unified.marExp;

    // Show ALL categories — no truncation
    const sorted = Object.entries(catSums).sort((a,b)=>b[1]-a[1]);

    if(g('d-expense-list')) {
      if(!sorted.length) g('d-expense-list').innerHTML = `<div style="color:var(--mu);text-align:center">Sin gastos</div>`;
      else g('d-expense-list').innerHTML = `<div style="max-height:220px;overflow-y:auto;padding-right:4px">${sorted.map(c=> {
        const p = totalExp>0 ? Math.round((c[1]/totalExp)*100) : 0;
        return `<div style="display:flex;justify-content:space-between;color:${colorCR};padding:4px 0">
                  <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70%">${typeof escHtml==='function'?escHtml(c[0]):c[0]}</span>
                  <span style="color:var(--mu);font-weight:600;white-space:nowrap">${p}% · ${fmt(c[1],unified.dCur)}</span>
                </div>`;
      }).join('')}</div>`;
    }

    if(dExpChart) dExpChart.destroy();
    const ctxE = document.getElementById('d-expense-donut');
    const orphanE = Chart.getChart(ctxE); if(orphanE) orphanE.destroy();

    // Dynamic palette that scales with category count
    const baseHues = [colorG2, '#a37a0a', '#7d5d08', '#574005', '#302402', colorBG5, '#8b6914', '#5c4a0e', '#3d3109', '#1f1905'];
    const donutPalette = sorted.map((_, i) => baseHues[i % baseHues.length]);

    dExpChart = new Chart(ctxE.getContext('2d'), {
      type: 'doughnut',
      data: { labels: sorted.map(c=>c[0]), datasets: [{ data: sorted.map(c=>c[1]), backgroundColor: donutPalette, borderWidth:0 }] },
      options: { cutout: '75%', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
  }
}

function renderEtherealRecentTxs() {
  const el = g('d-recent-txs');
  if(!el) return;

  // Dedup pass 1 — by UUID id (catches same-row duplicates from bad cache)
  const seenIds = new Set();
  // Dedup pass 2 — by _saleId (catches 5× saveSale() race: different UUIDs, same sale)
  const seenSaleIds = new Set();
  const deduped = [...S.txs]
    .sort((a,b) => new Date(b.date) - new Date(a.date)) // newest first so we keep the latest tx per sale
    .filter(tx => {
      if (!tx?.id || seenIds.has(tx.id)) return false;
      seenIds.add(tx.id);
      if (tx._saleId) {
        if (seenSaleIds.has(tx._saleId)) return false;
        seenSaleIds.add(tx._saleId);
      }
      return true;
    });

  el.innerHTML = ''; // limpia antes de re-renderizar
  const recent = deduped.slice(0, 5);
  if(!recent.length){ el.innerHTML='<div style="font-size:.7rem;color:var(--mu);padding:10px 0">Sin transacciones recientes</div>'; return; }
  const isLight = document.body.classList.contains('light-mode');
  el.innerHTML = recent.map(tx => {
    const isIncome  = tx.type === 'income';
    const isTransfer = tx.type === 'transfer-in' || tx.type === 'transfer-out';
    const icon = isIncome ? 'trending_up' : isTransfer ? 'swap_horiz' : 'shopping_bag';
    const iconBg = isIncome
      ? (isLight ? 'rgba(5,150,105,0.10)'  : 'rgba(22,163,74,0.12)')
      : isTransfer
        ? (isLight ? 'rgba(67,97,238,0.10)' : 'rgba(99,102,241,0.12)')
        : (isLight ? 'rgba(220,38,38,0.08)' : 'rgba(255,255,255,0.05)');
    const iconColor = isIncome
      ? 'var(--pos)'
      : isTransfer ? (isLight ? '#4361ee' : '#818cf8')
      : 'var(--neg)';
    const amtColor  = isIncome ? 'var(--pos)' : 'var(--neg)';
    const amtPrefix = isIncome ? '+' : '-';
    const cat = tx.cat || tx.category || 'General';
    const pillBg   = isIncome
      ? (isLight ? 'rgba(5,150,105,0.10)'  : 'rgba(22,163,74,0.12)')
      : (isLight ? 'rgba(220,38,38,0.08)'  : 'rgba(255,255,255,0.05)');
    const pillColor = isIncome ? 'var(--pos)' : (isLight ? '#dc2626' : '#f87171');
    const pillLabel = isIncome ? 'Ingreso' : isTransfer ? 'Transfer' : 'Gasto';
    return `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--bg5)">
      <div style="width:38px;height:38px;border-radius:50%;background:${iconBg};display:flex;align-items:center;justify-content:center;color:${iconColor};flex-shrink:0;border:1px solid ${iconBg}">
        <span class="material-symbols-rounded" style="font-size:18px">${icon}</span>
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:.78rem;color:var(--cr);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600">${tx.desc}</div>
        <div style="font-size:.62rem;color:var(--mu);margin-top:2px">${fmtDate(tx.date)}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">
        <div style="font-family:var(--fm);font-size:.82rem;font-weight:700;color:${amtColor}">
          ${amtPrefix}${fmt(Math.abs(tx.amount), tx.cur)}
        </div>
        <div style="font-size:.56rem;font-weight:600;letter-spacing:.05em;padding:2px 7px;border-radius:99px;background:${pillBg};color:${pillColor}">${pillLabel}</div>
      </div>
    </div>`;
  }).join('');
}

function renderEtherealCardsStock() {
  const el = g('d-my-cards-stack');
  if(!el) return;
  if(!S.cards || !S.cards.length) { el.innerHTML='<div style="font-size:.7rem;color:var(--mu);text-align:center;padding:12px">No hay tarjetas registradas</div>'; return; }
  
  let html = '';
  const cards = S.cards.slice(0,3);
  cards.forEach((c, i) => {
    const isTop = i===cards.length-1;
    const ty = i * 20; 
    const sc = 1 - ((cards.length-1 - i)*0.05); 
    const zi = i;
    html += `
      <div class="eth-card-stack-item" style="transform: translateY(${ty}px) scale(${sc}); z-index: ${zi}">
         <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <span style="font-size:.8rem;font-weight:600;letter-spacing:1px">${c.brand||c.name}</span>
            <span style="font-size:.65rem;color:var(--mu)">Límite: ${fmt(c.initialBalance||0, c.cur)}</span>
         </div>
         <div>
            <div style="font-family:var(--fm);letter-spacing:2px;font-size:1rem;margin-bottom:4px">**** **** **** ${c.last4 || '----'}</div>
            <div style="display:flex;justify-content:space-between;font-size:.65rem;color:var(--mu)"><span style="flex:1;white-space:nowrap;overflow:hidden">${c.name}</span><span style="margin-left:8px">EXP ${c.exp || '--/--'}</span></div>
         </div>
      </div>
    `;
  });
  el.innerHTML = html;
}

function renderEtherealSubs() {
  const el = g('d-active-subs');
  if(!el) return;
  const subs = (S.subscriptions||[]).filter(s=>s.active).sort((a,b)=>new Date(a.nextDate||0)-new Date(b.nextDate||0)).slice(0,4);
  if(!subs.length){ el.innerHTML='<div style="font-size:.7rem;color:var(--mu);text-align:center">Sin suscripciones</div>'; return; }
  el.innerHTML = subs.map(s=>`
    <div style="display:flex;align-items:center;gap:12px">
      <div style="width:36px;height:36px;border-radius:10px;background:var(--bg4);display:flex;align-items:center;justify-content:center;font-size:18px">${s.icon||'💎'}</div>
      <div style="flex:1"><div style="font-size:.8rem;color:var(--cr)">${s.name}</div><div style="font-size:.6rem;color:var(--mu)">Próximo: ${fmtDate(s.nextDate)}</div></div>
      <div style="font-size:.8rem;font-weight:600;color:var(--cr)">-${fmt(s.amount, s.cur)}</div>
    </div>
  `).join('');
}

// ══════════════════════════════════════════
// VENTAS DEL MES — KPI + Tendencia 7 días
// Fuente de datos: S.sales (cargado desde Supabase via loadAllUserData)
// ══════════════════════════════════════════
let dSalesTrendChart = null;

function renderSalesMetrics() {
  const tm = typeof thisMo === 'function' ? thisMo() : new Date().toISOString().slice(0,7);
  const fxRate = (typeof FX !== 'undefined' && FX.sell && FX.sell > 1000) ? FX.sell : 7500;

  // Ventas del mes actual
  const monthSales = (S.sales || []).filter(s => s.date && s.date.slice(0,7) === tm);

  // Sumar totales unificando monedas a ₲
  let totalGs = 0;
  monthSales.forEach(s => {
    const amt = parseFloat(s.total) || 0;
    totalGs += (s.cur === '$' || s.cur === 'USD') ? amt * fxRate : amt;
  });

  const count = monthSales.length;

  // Renderizar KPI card
  const elTotal = g('d-sales-month-total');
  const elCount = g('d-sales-month-count');
  if (elTotal) elTotal.textContent = fmt(totalGs, '₲');
  if (elCount) elCount.textContent = count === 1 ? '1 venta' : `${count} ventas`;

  // Gráfico de tendencia 7 días
  renderSalesTrendChart();
}

function renderSalesTrendChart() {
  const ctxEl = document.getElementById('d-sales-trend-chart');
  if (!ctxEl || !window.Chart) return;

  const fxRate = (typeof FX !== 'undefined' && FX.sell && FX.sell > 1000) ? FX.sell : 7500;
  const style = getComputedStyle(document.body);
  const colorG  = style.getPropertyValue('--g2').trim()  || '#c9960c';
  const colorMU = style.getPropertyValue('--mu').trim()  || '#8a8278';

  // Construir array de los últimos 7 días
  const labels = [];
  const data   = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0,10);
    labels.push(d.toLocaleDateString('es', { weekday: 'short', day: 'numeric' }));

    // Sumar ventas de ese día en ₲
    const dayTotal = (S.sales || [])
      .filter(s => s.date === dateStr)
      .reduce((sum, s) => {
        const amt = parseFloat(s.total) || 0;
        return sum + ((s.cur === '$' || s.cur === 'USD') ? amt * fxRate : amt);
      }, 0);
    data.push(dayTotal);
  }

  // Destruir instancia anterior si existe
  if (dSalesTrendChart) { dSalesTrendChart.destroy(); dSalesTrendChart = null; }
  const orphan = Chart.getChart(ctxEl); if (orphan) orphan.destroy();

  dSalesTrendChart = new Chart(ctxEl.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Ventas (₲)',
        data,
        borderColor: colorG,
        backgroundColor: 'rgba(201,150,12,0.12)',
        borderWidth: 2,
        pointRadius: 4,
        pointBackgroundColor: colorG,
        fill: true,
        tension: 0.3,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: colorMU, font: { size: 10 } } },
        y: { display: false }
      }
    }
  });
}

function renderEtherealStockAlerts() {
  const el=g('stock-alerts');
  if(!el) return;
  const alerts=S.products.filter(p=>p.stock<=p.minStock);
  if(!alerts.length){el.innerHTML='<div class="tbl-empty" style="padding:12px;font-size:.74rem">✓ Todo en orden</div>';return}
  el.innerHTML=alerts.map(p=>{
    const isOut=p.stock<=0;
    return `<div style="display:flex;align-items:center;gap:9px;padding:7px 0;border-bottom:1px solid var(--bg5)">
      <div style="font-size:18px">${isOut?'🔴':'🟡'}</div>
      <div style="flex:1;min-width:0"><div style="font-size:.74rem;font-weight:500;color:var(--cr)">${p.name}</div><div style="font-size:.6rem;font-family:var(--fm);color:var(--m3)">${p.sku}</div></div>
      <div style="text-align:right">
        <div style="font-family:var(--fm);font-size:.76rem;color:${isOut?'#d47a7a':'#e8b124'}">${isOut?'Sin stock':p.stock+' u.'}</div>
        <button class="btn btn-s" style="font-size:.58rem;padding:3px 7px;margin-top:3px" onclick="openStockModal('${p.id}')">Ajustar</button>
      </div>
    </div>`;
  }).join('');
}
