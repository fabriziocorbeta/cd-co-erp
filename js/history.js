// CD & Co ERP — Histórico Patrimonial logic

let historyChartInstance = null;

function renderHistoryPage() {
   if(!S.txs || !g('page-history').classList.contains('on')) return;

   // ── DEBUG ──────────────────────────────────────────────────────────────
   console.log('[Histórico] S.txs total:', S.txs.length);
   if(S.txs.length > 0) {
     const sample = S.txs[0];
     console.log('[Histórico] Muestra tx[0]:', {
       id: sample.id, type: sample.type, amount: sample.amount,
       date: sample.date, dateType: typeof sample.date,
       account_id: sample.account_id, cat: sample.cat, desc: sample.desc
     });
   }
   // ── FIN DEBUG ──────────────────────────────────────────────────────────

   // Track running balance from all income/expense operations
   const txs = [...S.txs].filter(t => t.amount !== 0 && (t.type === 'income' || t.type === 'expense')).sort((a,b) => new Date(a.date) - new Date(b.date));
   console.log('[Histórico] txs filtradas (income/expense, amount≠0):', txs.length, '| Primeras 3:', txs.slice(0,3).map(t=>({type:t.type,amount:t.amount,date:t.date})));
   
   let runningBalance = 0;
   let minBal = 0;
   let maxBal = 0;
   
   let monthlyData = {}; // 'YYYY-MM': { balance, income, expense, label }
   let yearlyData = {};  // 'YYYY': { income, expense, delta }
   
   txs.forEach(t => {
      if(!t.date) return; // skip txs with no date — prevents 1970-01 phantom group
      const isAdj = (t.desc||'').toLowerCase().includes('ajuste') || (t.cat||'').toLowerCase().includes('ajuste');
      const d = new Date(t.date);
      const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const yr = `${d.getFullYear()}`;
      
      let amt = parseFloat(t.amount) || 0;
      let isInc = t.type === 'income';
      let isExp = t.type === 'expense';
      
      // Amounts are signed: income = positive, expense = negative → just add
      runningBalance += amt;

      if (isAdj) return; 
      
      if(runningBalance > maxBal) maxBal = runningBalance;
      if(runningBalance < minBal) minBal = runningBalance;
      
      if(!monthlyData[ym]) monthlyData[ym] = { balance: runningBalance, income:0, expense:0, label: ym };
      else monthlyData[ym].balance = runningBalance;
      
      if(isInc) monthlyData[ym].income += amt;
      if(isExp) monthlyData[ym].expense += Math.abs(amt); // amt is negative, display positive
      
      if(!yearlyData[yr]) yearlyData[yr] = { income:0, expense:0, delta:0 };
      if(isInc) { yearlyData[yr].income += amt; yearlyData[yr].delta += amt; }
      if(isExp) { yearlyData[yr].expense += Math.abs(amt); yearlyData[yr].delta += amt; } // amt already negative
   });
   
   const months = Object.keys(monthlyData).sort();
   const years = Object.keys(yearlyData).sort((a,b)=>b-a);
   console.log('[Histórico] meses generados:', months, '| runningBalance final:', runningBalance);
   
   let capIni = 0;
   if(months.length > 0) capIni = monthlyData[months[0]].balance;
   let capAct = runningBalance;
   
   let growthAbs = capAct - capIni;
   let growthPct = capIni !== 0 ? (growthAbs / Math.abs(capIni)) * 100 : 0;
   const acc0 = (S.accounts && S.accounts[0]) ? S.accounts[0] : null;
   const defCur = acc0 ? (acc0.cur || acc0.currency || '$') : '$';
   
   if(g('hist-cap-ini')) g('hist-cap-ini').textContent = fmt(capIni, defCur);
   if(g('hist-cap-act')) g('hist-cap-act').textContent = fmt(capAct, defCur);
   if(g('hist-cap-pct')) {
      g('hist-cap-pct').textContent = (growthPct >= 0 ? '+' : '') + growthPct.toFixed(1) + '%';
      g('hist-cap-pct').style.color = growthPct >= 0 ? 'var(--pos)' : '#d47a7a';
   }
   if(g('hist-cap-abs')) g('hist-cap-abs').textContent = (growthAbs >= 0 ? '+' : '') + fmt(growthAbs, defCur);
   if(g('hist-st-reg')) g('hist-st-reg').textContent = txs.length;
   if(g('hist-st-max')) g('hist-st-max').textContent = fmt(maxBal, defCur);
   if(g('hist-st-min')) g('hist-st-min').textContent = fmt(minBal, defCur);
   
   if(g('hist-st-prom')) {
      let promMensual = months.length > 0 ? (growthAbs / months.length) : 0;
      g('hist-st-prom').textContent = (promMensual >= 0 ? '+' : '') + fmt(Math.abs(promMensual), defCur);
   }
   
   // Chart
   if(historyChartInstance) historyChartInstance.destroy();
   const ctx = g('history-chart');
   if(ctx && window.Chart) {
      const labels = months.map(m => m);
      const dataPoints = months.map(m => monthlyData[m].balance);
      
      let gradient = ctx.getContext('2d').createLinearGradient(0,0,0,320);
      gradient.addColorStop(0, 'rgba(74,155,111,0.25)');
      gradient.addColorStop(1, 'rgba(74,155,111,0.0)');

      historyChartInstance = new Chart(ctx.getContext('2d'), {
         type: 'line',
         data: {
            labels: labels,
            datasets: [{
               label: 'Evolución Patrimonial',
               data: dataPoints,
               borderColor: '#4a9b6f',
               backgroundColor: gradient,
               borderWidth: 2,
               pointRadius: 3,
               pointBackgroundColor: '#4a9b6f',
               fill: true,
               tension: 0.3
            }]
         },
         options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: {display: false} },
            scales: {
               x: { grid: {color: 'rgba(255,255,255,0.04)'}, ticks: {color:'#8a8278'} },
               y: { grid: {color: 'rgba(255,255,255,0.04)'}, ticks: {color:'#8a8278'} }
            }
         }
      });
   }
   
   // Yearly
   const ylist = g('hist-annual-list');
   if(ylist) {
      ylist.innerHTML = '';
      if(years.length === 0) ylist.innerHTML = '<div style="color:var(--mu);font-size:0.8rem">Sin registros.</div>';
      years.forEach(yr => {
         const d = yearlyData[yr];
         const col = d.delta >= 0 ? 'var(--pos)' : '#d47a7a';
         const sign = d.delta >= 0 ? '+' : '';
         ylist.innerHTML += `
            <div style="background:var(--bg3);border:1px solid var(--bg5);border-radius:var(--rs);padding:14px 18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px">
               <div style="font-family:var(--fd);font-size:1.4rem;color:var(--cr)">${yr}</div>
               <div style="display:flex;gap:24px;text-align:right">
                  <div><div style="font-size:0.56rem;color:var(--mu);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px">Ingresos</div><div style="font-size:0.9rem;font-family:var(--fm);color:var(--cr)">${fmt(d.income, defCur)}</div></div>
                  <div><div style="font-size:0.56rem;color:var(--mu);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px">Egresos</div><div style="font-size:0.9rem;font-family:var(--fm);color:var(--cr)">${fmt(d.expense, defCur)}</div></div>
                  <div><div style="font-size:0.56rem;color:var(--mu);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px">Balance</div><div style="font-size:0.9rem;font-family:var(--fm);color:${col}">${sign}${fmt(d.delta, defCur)}</div></div>
               </div>
            </div>
         `;
      });
   }
   
   // Full history
   const flist = g('hist-full-list');
   if(flist) {
      let fhtml = '';
      let rBalance = 0;
      let txsReversed = [...txs]; 
      let mappedTxs = [];
      txsReversed.forEach(t => {
         let amt = parseFloat(t.amount)||0;
         rBalance += amt; // amounts are signed: income positive, expense negative
         mappedTxs.push({...t, amtC: amt, rbal: rBalance});
      });
      mappedTxs.reverse();
      
      mappedTxs.forEach(t => {
         const col = t.type === 'income' ? 'var(--pos)' : '#d47a7a';
         const isInc = t.type === 'income';
         const sign = isInc ? '+' : '-';
         const cTag = t.cur || t.currency || defCur;
         fhtml += `<tr>
            <td class="mono" style="color:var(--mu);font-size:0.65rem">${t.date}</td>
            <td style="font-size:0.8rem">${t.desc}</td>
            <td><span class="rtag">${t.cat}</span></td>
            <td class="mono" style="text-align:right;color:${col}">${sign}${fmt(Math.abs(t.amtC), cTag)}</td>
            <td class="mono" style="text-align:right;color:var(--cr)">${fmt(t.rbal, defCur)}</td>
         </tr>`;
      });
      if(mappedTxs.length === 0) fhtml = '<tr><td colspan="5" style="text-align:center;color:var(--mu);padding:20px">Sin movimientos</td></tr>';
      flist.innerHTML = fhtml;
   }
   
   // Projections refactored to use 6-month average growth
   const pgrid = g('hist-proj-grid');
   if(pgrid) {
      try {
         const stats = typeof patGet6MonthStats === 'function' ? patGet6MonthStats() : { avgNet: 0 };
         const realisticMonthlyGrowth = stats.avgNet;
         
         if(capAct <= 0 || realisticMonthlyGrowth <= 0) {
            pgrid.innerHTML = '<div style="grid-column:1/-1;color:var(--mu);font-size:0.8rem;padding:20px 0;text-align:center;background:var(--bg3);border-radius:var(--rs);border:1px dashed var(--bg5)">No hay datos suficientes de crecimiento positivo en los últimos 6 meses para proyectar. Registrá más ingresos.</div>';
         } else {
            const periods = [
               { l: '1 mes', m: 1}, { l: '3 meses', m: 3}, { l: '6 meses', m: 6},
               { l: '1 año', m: 12}, { l: '5 años', m: 60}, { l: '10 años', m: 120}
            ];
            let phtml = '';
            periods.forEach(p => {
               const pVal = capAct + (realisticMonthlyGrowth * p.m);
               const pGrw = pVal - capAct;
               const pGrwPct = (pGrw / capAct) * 100;
               phtml += `
               <div class="stat" style="background:var(--bg3);display:flex;flex-direction:column">
                  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
                     <div style="font-family:var(--fd);font-size:1.15rem;color:var(--cr)">${p.l}</div>
                     <div class="rtag" style="color:var(--pos);border-color:rgba(74,155,111,0.2);background:rgba(74,155,111,0.06);font-size:0.6rem">+${pGrwPct.toFixed(1)}%</div>
                  </div>
                  <div style="font-size:0.55rem;color:var(--mu);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px">Proyectado</div>
                  <div style="font-family:var(--fm);font-size:1.25rem;color:var(--g2);margin-bottom:12px">${fmt(pVal, defCur)}</div>
                  <div style="margin-top:auto;font-size:0.6rem;color:var(--mu);display:flex;justify-content:space-between;border-top:1px dashed var(--bg5);padding-top:8px">
                     <span>Crecimiento</span>
                     <span style="color:var(--pos);font-family:var(--fm);font-size:0.65rem">+${fmt(pGrw, defCur)}</span>
                  </div>
               </div>
               `;
            });
            pgrid.innerHTML = phtml;
         }
      } catch (err) {
         console.error("Error drawing History projections:", err);
         pgrid.innerHTML = '<div style="grid-column:1/-1;color:var(--neg);padding:20px;text-align:center">Error al calcular proyecciones.</div>';
      }
   }
}
