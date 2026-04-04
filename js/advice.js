// CD & Co ERP — FINANCIAL ADVICE
// ====================================

function renderAdvice() {
  const container = document.getElementById('advice-container');
  if (!container) return;
  container.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--mu)">Analizando tus finanzas...</div>';
  
  setTimeout(() => {
    const advice = generateFinancialAdvice();
    container.innerHTML = '';
    
    if (!advice.length) {
      container.innerHTML = '<div class="tbl-empty" style="grid-column:1/-1">No hay suficientes datos para generar consejos aún. ¡Seguí registrando!</div>';
      return;
    }
    
    advice.forEach(item => {
      const card = document.createElement('div');
      card.className = 'pcard';
      card.style.borderLeft = `4px solid ${item.color || 'var(--g2)'}`;
      
      card.innerHTML = `
        <div style="font-size:24px;margin-bottom:12px">${item.icon || '💡'}</div>
        <div class="pcard-name" style="color:${item.color || 'var(--g2)'}">${item.title}</div>
        <div style="font-size:.84rem;color:var(--cr);line-height:1.6;margin-top:8px">${item.text}</div>
        ${item.action ? `<button class="btn btn-o" style="margin-top:16px;width:100%;justify-content:center" onclick="${item.actionCallback}">${item.action}</button>` : ''}
      `;
      container.appendChild(card);
    });
  }, 500);
}

function generateFinancialAdvice() {
  const tips = [];
  const fxRate = (typeof FX !== 'undefined' && FX.buy) ? FX.buy : 7200;
  
  // 1. CALCULATE CORE METRICS
  let totalUSD = 0;
  (S.accounts || []).forEach(a => {
    let bal = typeof getAccountBalance === 'function' ? getAccountBalance(a.id) : (parseFloat(a.initialBalance) || 0);
    totalUSD += a.cur === '$' ? bal : bal / fxRate;
  });

  // 30 Days Activity
  const now = new Date();
  const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30)).toISOString().slice(0, 10);
  let inc30d = 0, exp30d = 0;
  const catExpenses = {};

  (S.txs || []).forEach(t => {
    const isAdj = (t.desc && t.desc.toLowerCase().includes('ajuste')) || (t.cat && t.cat.toLowerCase().includes('ajuste'));
    if (t.date >= thirtyDaysAgo && !isAdj) {
      const amtUSD = t.cur === '$' ? t.amount : t.amount / fxRate;
      if (t.type === 'income' || t.type === 'transfer-in') inc30d += amtUSD;
      else if (t.type === 'expense' || t.type === 'transfer-out') {
        exp30d += amtUSD;
        catExpenses[t.cat] = (catExpenses[t.cat] || 0) + amtUSD;
      }
    }
  });

  // Debt
  let debtUSD = 0;
  (S.cards || []).forEach(c => {
    // This is a simplification; should ideally use calculated used balance
    const used = parseFloat(c.used || 0);
    debtUSD += c.cur === '$' ? used : used / fxRate;
  });
  (S.debts || []).forEach(d => {
    const rem = (parseFloat(d.total) || 0) - (parseFloat(d.paid) || 0);
    debtUSD += d.cur === '$' ? rem : rem / fxRate;
  });

  // 2. GENERATE TIPS BASED ON RULES

  // Rule: Expenses > Income
  if (exp30d > inc30d && exp30d > 0) {
    const topCat = Object.entries(catExpenses).sort((a,b) => b[1]-a[1])[0];
    tips.push({
      title: 'Flujo de caja negativo',
      icon: '⚠️',
      color: '#d47a7a',
      text: `En los últimos 30 días gastaste más de lo que ingresaste (${fmt(exp30d, '$')} vs ${fmt(inc30d, '$')}). Tu mayor gasto fue en <strong>${topCat ? topCat[0] : 'varios'}</strong>.`,
      action: 'Ver movimientos',
      actionCallback: "goPage('txs')"
    });
  }

  // Rule: High Liquidity
  if (totalUSD > 1500 && totalUSD > (exp30d * 3)) {
    tips.push({
      title: 'Excedente de liquidez',
      icon: '📈',
      color: 'var(--pos)',
      text: `Tenés más de 3 meses de gastos cubiertos en efectivo. Es un buen momento para considerar inversiones que protejan tu capital de la inflación.`,
      action: 'Planificar inversión',
      actionCallback: "goPage('goals')"
    });
  }

  // Rule: Debt Management
  if (debtUSD > 0 && debtUSD > (totalUSD * 0.5)) {
    tips.push({
      title: 'Alerta de endeudamiento',
      icon: '💳',
      color: '#e8b124',
      text: `Tus deudas representan el ${(debtUSD/totalUSD*100).toFixed(0)}% de tu liquidez. Priorizá cancelar saldos de tarjetas con intereses altos.`,
      action: 'Ver deudas',
      actionCallback: "goPage('debts')"
    });
  }

  // Rule: No Budgets
  if (!S.budgets || S.budgets.length === 0) {
    tips.push({
      title: 'Sin rumbo fijo',
      icon: '🎯',
      color: '#70b8d4',
      text: `No tenés presupuestos establecidos. Definir límites por categoría te ayudará a ahorrar un 15-20% extra cada mes.`,
      action: 'Crear presupuesto',
      actionCallback: "goPage('budgets')"
    });
  }

  // Default tip if few data
  if (tips.length < 2) {
    tips.push({
      title: 'Hábito de registro',
      icon: '✍️',
      color: 'var(--g2)',
      text: `La clave del control financiero es el registro diario. No olvides anotar hasta el gasto más pequeño para tener análisis más precisos.`,
      action: 'Nuevo gasto',
      actionCallback: "openTxModal('expense')"
    });
  }

  return tips.slice(0, 4);
}
