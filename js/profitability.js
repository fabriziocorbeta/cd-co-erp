// ══════════════════════════════════════════
// PROFITABILITY ANALYSIS
// ══════════════════════════════════════════

// Moneda actual para visualización
let profitabilityCurrency = '₲';

function renderProfitability() {
  // VALIDACIÓN: Solo renderizar si la página está visible
  const profPage = document.getElementById('page-profitability');
  if (!profPage) {
    console.warn('[Profitability] Página no encontrada');
    return;
  }

  // Verificar que la página tenga la clase 'on' (está visible)
  if (!profPage.classList.contains('on')) {
    console.warn('[Profitability] Página no está visible. Renderizado cancelado.');
    return;
  }

  // Asegurar que existan los contenedores necesarios
  if (!document.getElementById('prof-kpi-cards')) {
    console.warn('[Profitability] Contenedor prof-kpi-cards no encontrado');
    return;
  }

  const q = (g('prof-search')?.value || '').toLowerCase();
  const cat = g('prof-cat-flt')?.value || '';
  let prods = [...(S.products || [])];

  if (q) prods = prods.filter(p =>
    (p.name || '').toLowerCase().includes(q) ||
    (p.sku  || '').toLowerCase().includes(q)
  );
  if (cat) prods = prods.filter(p => p.cat === cat);

  // Usar FX.sell para convertir de PYG a USD (precio de venta/cotización)
  const fxRate = (FX && FX.sell) ? FX.sell : 7500;

  // Renderizar KPI Cards
  renderProfKpiCards(prods, fxRate);

  // Renderizar tabla de productos
  renderProfProductsTable(prods, fxRate);

  // Renderizar resumen por categoría
  renderProfCategoryAnalysis(fxRate);

  console.log('[Profitability] ✓ Renderizado completo. Productos:', prods.length);
}

// ── KPI CARDS ──
function renderProfKpiCards(prods, fxRate) {
  const cur = profitabilityCurrency;

  // 1. Valor total de inventario (costo)
  // ✅ CORRECCIÓN: Convertir SIEMPRE si la moneda del producto es diferente a la visualizada
  const totalInvestment = prods.reduce((acc, p) => {
    const costPerUnit = p.buyPrice;
    const cost = p.stock * costPerUnit;
    const productCur = p.cur || '₲';
    // Convertir si es necesario
    return acc + (productCur === cur ? cost : convertAmount(cost, productCur, cur, fxRate));
  }, 0);

  // 2. Valor potencial (a precio de venta)
  // ✅ CORRECCIÓN: Convertir SIEMPRE si la moneda del producto es diferente a la visualizada
  const totalPotentialValue = prods.reduce((acc, p) => {
    const sellValue = p.stock * p.sellPrice;
    const productCur = p.cur || '₲';
    // Convertir si es necesario
    return acc + (productCur === cur ? sellValue : convertAmount(sellValue, productCur, cur, fxRate));
  }, 0);

  // 3. Ganancia potencial
  const potentialProfit = totalPotentialValue - totalInvestment;

  // 4. Margen promedio
  const avgMargin = prods.length > 0
    ? Math.round(prods.reduce((acc, p) => {
        const m = p.buyPrice > 0 ? ((p.sellPrice - p.buyPrice) / p.buyPrice) * 100 : 0;
        return acc + m;
      }, 0) / prods.length)
    : 0;

  // 5. Productos en stock bajo
  const lowStockCount = prods.filter(p => p.stock > 0 && p.stock <= p.minStock).length;

  // 6. Productos sin stock
  const outOfStockCount = prods.filter(p => p.stock <= 0).length;

  const cards = [
    {
      title: 'Inversión Total',
      value: fmt(totalInvestment, cur),
      icon: '💰',
      color: '--bg3'
    },
    {
      title: 'Valor Potencial',
      value: fmt(totalPotentialValue, cur),
      icon: '📈',
      color: '--pos'
    },
    {
      title: 'Ganancia Potencial',
      value: fmt(potentialProfit, cur),
      color: potentialProfit >= 0 ? '--pos' : '--neg',
      icon: potentialProfit >= 0 ? '✓' : '✗'
    },
    {
      title: 'Margen Promedio',
      value: `${avgMargin}%`,
      icon: '📊',
      color: '--g'
    },
    {
      title: 'Stock Bajo',
      value: lowStockCount.toString(),
      icon: '⚠',
      color: '--neg'
    },
    {
      title: 'Sin Stock',
      value: outOfStockCount.toString(),
      icon: '❌',
      color: '--neg'
    }
  ];

  const kpiContainer = g('prof-kpi-cards');
  if (kpiContainer) {
    kpiContainer.innerHTML = cards.map(card => `
      <div class="prof-kpi">
        <div>
          <div class="prof-kpi-title">${card.title}</div>
          <div class="prof-kpi-icon">${card.icon}</div>
        </div>
        <div class="prof-kpi-value">${card.value}</div>
      </div>
    `).join('');
    console.log('[KPI Cards] Renderizados', cards.length, 'cards');
  }
}

// ── TABLA DE PRODUCTOS ──
function renderProfProductsTable(prods, fxRate) {
  const cur = profitabilityCurrency;

  const tbody = g('prof-tbody');
  if (!tbody) {
    console.warn('Contenedor prof-tbody no encontrado');
    return;
  }

  tbody.innerHTML = prods.map(p => {
    const buyPrice = convertAmount(p.buyPrice, p.cur || '₲', cur, fxRate);
    const sellPrice = convertAmount(p.sellPrice, p.cur || '₲', cur, fxRate);
    const margin = p.buyPrice > 0
      ? Math.round(((p.sellPrice - p.buyPrice) / p.buyPrice) * 100)
      : 0;
    const roi = margin;  // ROI = margen en este contexto
    const investment = p.stock * buyPrice;
    const potentialValue = p.stock * sellPrice;
    const potentialProfit = potentialValue - investment;

    // Status badge
    let statusColor = '--pos';
    let statusText = '✓ Bueno';
    if (p.stock <= 0) {
      statusColor = '--neg';
      statusText = '❌ Sin stock';
    } else if (p.stock <= p.minStock) {
      statusColor = '--neg';
      statusText = '⚠ Bajo';
    }

    return `
      <tr>
        <td style="font-family:var(--fm);font-size:.7rem;color:var(--mu)">${p.sku}</td>
        <td style="text-align:left">${p.name}</td>
        <td style="text-align:left;font-size:.74rem;color:var(--mu)">${p.cat}</td>
        <td style="text-align:right;font-family:var(--fm)">${fmt(buyPrice, cur)}</td>
        <td style="text-align:right;font-family:var(--fm);color:var(--g2)">${fmt(sellPrice, cur)}</td>
        <td style="text-align:right;font-family:var(--fm);color:var(--pos);font-weight:600">${margin}%</td>
        <td style="text-align:right;font-family:var(--fm);color:var(--pos);font-weight:600">${roi}%</td>
        <td style="text-align:right;font-family:var(--fm)">${p.stock} u.</td>
        <td style="text-align:right;font-family:var(--fm)">${fmt(investment, cur)}</td>
        <td style="text-align:right;font-family:var(--fm);color:${potentialProfit >= 0 ? 'var(--pos)' : 'var(--neg)'}">${fmt(potentialProfit, cur)}</td>
        <td style="text-align:center">
          <span style="padding:4px 8px;background:var(${statusColor});border-radius:var(--rs);font-size:.6rem;color:var(--cr)">${statusText}</span>
        </td>
      </tr>
    `;
  }).join('');
}

// ── ANÁLISIS POR CATEGORÍA ──
function renderProfCategoryAnalysis(fxRate) {
  const cur = profitabilityCurrency;
  const cats = ['Relojes', 'Accesorios', 'Perfumes', 'Otros'];

  const catSummary = g('prof-cat-summary');
  if (!catSummary) {
    console.warn('Contenedor prof-cat-summary no encontrado');
    return;
  }

  const catData = cats.map(cat => {
    const catProds = S.products.filter(p => p.cat === cat);
    const totalInvestment = catProds.reduce((acc, p) => {
      const cost = p.stock * p.buyPrice;
      const productCur = p.cur || '₲';
      // ✅ CORRECCIÓN: Convertir SIEMPRE si es necesario
      return acc + (productCur === cur ? cost : convertAmount(cost, productCur, cur, fxRate));
    }, 0);
    const totalValue = catProds.reduce((acc, p) => {
      const val = p.stock * p.sellPrice;
      const productCur = p.cur || '₲';
      // ✅ CORRECCIÓN: Convertir SIEMPRE si es necesario
      return acc + (productCur === cur ? val : convertAmount(val, productCur, cur, fxRate));
    }, 0);
    const profit = totalValue - totalInvestment;
    const avgMargin = catProds.length > 0
      ? Math.round(catProds.reduce((acc, p) => {
          const m = p.buyPrice > 0 ? ((p.sellPrice - p.buyPrice) / p.buyPrice) * 100 : 0;
          return acc + m;
        }, 0) / catProds.length)
      : 0;

    return { cat, count: catProds.length, totalInvestment, profit, avgMargin };
  });

  catSummary.innerHTML = catData.map(d => d.count > 0 ? `
    <div class="prof-cat-card">
      <div>${d.cat}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="prof-cat-card-row">
          <span class="prof-cat-card-label">Productos:</span>
          <span class="prof-cat-card-value">${d.count}</span>
        </div>
        <div class="prof-cat-card-row">
          <span class="prof-cat-card-label">Margen:</span>
          <span class="prof-cat-card-value pos">${d.avgMargin}%</span>
        </div>
        <div class="prof-cat-card-row">
          <span class="prof-cat-card-label">Inversión:</span>
          <span class="prof-cat-card-value" style="font-family:var(--fm)">${fmt(d.totalInvestment, cur)}</span>
        </div>
        <div class="prof-cat-card-row">
          <span class="prof-cat-card-label">Ganancia Pot:</span>
          <span class="prof-cat-card-value ${d.profit >= 0 ? 'pos' : 'neg'}" style="font-family:var(--fm)">${fmt(d.profit, cur)}</span>
        </div>
      </div>
    </div>
  ` : '').join('');
}

// ── TOGGLE DIVISAS ──
function toggleProfitabilityCurrency(cur) {
  // Validar que la página esté visible
  const profPage = document.getElementById('page-profitability');
  if (!profPage || !profPage.classList.contains('on')) {
    console.warn('[Profitability] No se puede cambiar moneda: página no visible');
    return;
  }

  profitabilityCurrency = cur;
  S.profitabilityCurrency = cur;

  // Actualizar estado de botones
  document.querySelectorAll('[id^="cur-toggle-"]').forEach(btn => btn.classList.remove('on'));
  if (cur === '$') g('cur-toggle-usd').classList.add('on');
  else g('cur-toggle-pyg').classList.add('on');

  // Re-renderizar solo si estamos en profitability
  renderProfitability();
}

// ── CONVERSIÓN DE MONEDA ──
function convertAmount(amount, fromCur, toCur, fxRate) {
  if (fromCur === toCur) return amount;
  if (fromCur === '$' && toCur === '₲') return amount * fxRate;
  if (fromCur === '₲' && toCur === '$') return amount / fxRate;
  return amount;
}

// ── INICIALIZACIÓN ──
function initProfitability() {
  // Validar que los contenedores existan
  const requiredElements = [
    'page-profitability',
    'prof-kpi-cards',
    'prof-search',
    'prof-cat-flt',
    'prof-tbody',
    'prof-cat-summary',
    'cur-toggle-usd',
    'cur-toggle-pyg'
  ];

  const missing = requiredElements.filter(id => !document.getElementById(id));

  if (missing.length > 0) {
    console.warn('[Profitability] ⚠ Elementos faltantes:', missing);
    return;
  }

  console.log('[Profitability] ✓ Contenedor inicializado correctamente.');

  // Asegurar que el botón PYG tenga la clase 'on' por defecto
  const pygBtn = document.getElementById('cur-toggle-pyg');
  if (pygBtn && !pygBtn.classList.contains('on')) {
    pygBtn.classList.add('on');
  }

  // NO renderizar automáticamente al cargar
  // Solo renderizar cuando el usuario navegue a profitability
}

// Ejecutar inicialización cuando DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initProfitability);
} else {
  initProfitability();
}
