// CD & Co ERP — INVOICES
// ====================================

// ══════════════════════════════════════════
// INVOICES
// ══════════════════════════════════════════
let invFlt2='all';
function setInvFlt2(f,btn){invFlt2=f;document.querySelectorAll('#page-invoices .flt').forEach(b=>b.classList.remove('on'));btn.classList.add('on');renderInvoices()}
function renderInvoices(){
  const q=(g('inv-s')?.value||'').toLowerCase();
  let sales=[...S.sales].sort((a,b)=>new Date(b.date)-new Date(a.date));
  if(invFlt2==='paid')sales=sales.filter(s=>s.status==='paid');
  else if(invFlt2==='pending')sales=sales.filter(s=>s.status==='pending');
  if(q)sales=sales.filter(s=>{const c=S.contacts.find(x=>x.id===s.clientId);return(c?.name||'').toLowerCase().includes(q)||String(s.num).includes(q)});
  const tb=g('inv-tbody');
  if(!sales.length){tb.innerHTML=`<tr><td colspan="7" class="tbl-empty">Sin facturas aún.</td></tr>`;return}
  tb.innerHTML=sales.map(s=>{
    const client=S.contacts.find(c=>c.id===s.clientId);
    const usd=s.cur==='$'?s.total:0;const pyg=s.cur==='₲'?s.total:0;
    return `<tr>
      <td class="mono">${fmtDate(s.date)}</td>
      <td class="mono" style="color:var(--g2)">#${String(s.num).padStart(4,'0')}</td>
      <td>${client?client.name:'Cliente ocasional'}</td>
      <td class="mono" style="color:${usd>0?'var(--pos)':'var(--m3)'}">${usd>0?fmt(usd):'—'}</td>
      <td class="mono" style="color:${pyg>0?'#70b8d4':'var(--m3)'}">${pyg>0?fmt(pyg,'₲'):'—'}</td>
      <td><span class="pill ${s.status==='paid'?'pill-pos':'pill-warn'}">${s.status==='paid'?'Pagada':'Pendiente'}</span></td>
      <td><div class="actions">
        <button class="btn btn-pur" style="padding:4px 8px;font-size:.62rem" onclick="viewInvoice('${s.id}')">🧾 Ver</button>
      </div></td>
    </tr>`;
  }).join('');
}

function viewInvoice(saleId){
  const s=S.sales.find(x=>x.id===saleId);if(!s)return;
  const client=S.contacts.find(c=>c.id===s.clientId);
  const E=EMPRESA;
  const iva=calcIva(s.items,s.cur);
  const cur=s.cur;
  const nroFac=s.nroFactura||('001-001-'+String(s.num).padStart(7,'0'));
  const condicion=s.condicion||'contado';

  // IVA rows
  const ivaRows=[
    {lbl:'Gravadas 10%', base:iva.base10, iva:iva.iva10, total:iva.sub10},
    {lbl:'Gravadas 5%',  base:iva.base5,  iva:iva.iva5,  total:iva.sub5},
    {lbl:'Exentas',      base:iva.base0,  iva:0,          total:iva.sub0},
  ].filter(r=>r.total>0);

  g('inv-view-content').innerHTML=`
    <!-- AVISO DEMO -->
    <div class="demo-watermark">
      <div class="dw-ico">⚠</div>
      <div class="dw-txt">
        <div class="dw-ttl">Comprobante de demostración — No válido ante la SET</div>
        Este documento es generado por <strong>CD &amp; Co Finanzas</strong> únicamente a modo de referencia interna.
        No constituye un comprobante legal autorizado por la Subsecretaría de Estado de Tributación (SET) de Paraguay.
        Para emitir facturas con validez fiscal, utilizá tu talonario autorizado o un proveedor de facturación electrónica (e&#8209;Kuatia).
      </div>
    </div>

    <!-- TIMBRADO -->
    <div class="inv-timbrado">
      TIMBRADO Nº ${E.timbrado} — Vigencia: ${fmtDate(E.vigenciaDesde)} al ${fmtDate(E.vigenciaHasta)}
    </div>

    <!-- CABECERA: el emisor es el usuario de la app -->
    <div class="inv-hdr">
      <div style="display:flex;align-items:center;gap:16px">
        ${E.logo ? '<img src="' + E.logo + '" style="max-height:120px;max-width:250px;object-fit:contain;border-radius:4px" alt="Logo"/>' : ''}
        <div>
          <div class="inv-brand" style="font-size:1.5rem;letter-spacing:.02em">${E.razonSocial||'Mi Empresa'}</div>
          <div style="font-size:.7rem;color:var(--mu);font-family:var(--fm);line-height:1.8;margin-top:4px">
            RUC: <strong style="color:var(--cr)">${E.ruc||'—'}</strong><br/>
            ${E.direccion||''}<br/>
            ${[E.telefono,E.web].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>
      <div class="inv-num">
        <span style="font-family:var(--fm);font-size:.58rem;letter-spacing:.12em;text-transform:uppercase;color:var(--mu)">Factura</span>
        <strong>${nroFac}</strong>
        <div style="font-family:var(--fm);font-size:.66rem;color:var(--mu);margin-top:6px">Fecha: ${fmtDate(s.date)}</div>
        <div class="pill ${s.status==='paid'?'pill-pos':'pill-warn'}" style="margin-top:6px;font-size:.58rem">${s.status==='paid'?'PAGADA':'PENDIENTE'}</div>
      </div>
    </div>

    <!-- CLIENTE (receptor) -->
    <div class="inv-parties">
      <div>
        <div class="inv-party-l">Señor(es)</div>
        <div class="inv-party-n">${client?.name||'Cliente ocasional'}</div>
        ${client?.ruc?`<div class="inv-party-d">RUC / CI: <strong>${client.ruc}</strong></div>`:'<div class="inv-party-d" style="color:var(--m2)">RUC / CI: —</div>'}
        ${client?.notes?`<div class="inv-party-d">${client.notes}</div>`:''}
      </div>
      <div>
        <div class="inv-party-l">Condición de venta</div>
        <div class="inv-condicion">
          <label><input type="radio" ${condicion==='contado'?'checked':''} disabled/> Contado</label>
          <label><input type="radio" ${condicion==='credito'?'checked':''} disabled/> Crédito</label>
        </div>
        ${condicion==='credito'?`<div class="inv-party-d">Plazo: según convenio</div>`:''}
      </div>
    </div>

    <!-- ITEMS -->
    <table class="inv-items">
      <thead><tr>
        <th style="width:40%">Descripción</th>
        <th>SKU</th>
        <th style="text-align:center">Cant.</th>
        <th style="text-align:right">P. Unit.</th>
        <th style="text-align:center">IVA</th>
        <th style="text-align:right">Exento</th>
        <th style="text-align:right">Grav. 5%</th>
        <th style="text-align:right">Grav. 10%</th>
        <th style="text-align:right">Total</th>
      </tr></thead>
      <tbody>
        ${s.items.map(i=>{
          const p=S.products.find(x=>x.id===i.prodId);
          const iv=i.iva===undefined?10:i.iva;
          const sub=i.qty*i.price;
          const ex=iv===0?sub:0;
          const g5=iv===5?sub:0;
          const g10=iv===10?sub:0;
          return `<tr>
            <td>${p?.name||'Producto'}</td>
            <td class="mono" style="font-size:.68rem;color:var(--mu)">${p?.sku||'—'}</td>
            <td class="mono" style="text-align:center">${i.qty}</td>
            <td class="mono" style="text-align:right">${fmt(i.price,cur)}</td>
            <td class="mono" style="text-align:center">${iv===0?'Ex':iv+'%'}</td>
            <td class="mono" style="text-align:right;color:var(--mu)">${ex>0?fmt(ex,cur):'—'}</td>
            <td class="mono" style="text-align:right;color:var(--mu)">${g5>0?fmt(g5,cur):'—'}</td>
            <td class="mono" style="text-align:right;color:var(--mu)">${g10>0?fmt(g10,cur):'—'}</td>
            <td class="mono" style="text-align:right">${fmt(sub,cur)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>

    <!-- TOTALES IVA -->
    <div style="display:flex;gap:14px;justify-content:flex-end;margin-top:10px;flex-wrap:wrap">
      <table class="iva-breakdown" style="max-width:360px">
        <thead><tr>
          <th style="text-align:left">Liquidación IVA</th>
          <th>Base imponible</th>
          <th>IVA</th>
          <th>Total</th>
        </tr></thead>
        <tbody>
          ${ivaRows.map(r=>`<tr>
            <td>${r.lbl}</td>
            <td>${fmt(r.base,cur)}</td>
            <td>${fmt(r.iva,cur)}</td>
            <td>${fmt(r.total,cur)}</td>
          </tr>`).join('')}
          <tr class="total-row">
            <td><strong>TOTAL</strong></td>
            <td>${fmt(iva.total-iva.totalIva,cur)}</td>
            <td>${fmt(iva.totalIva,cur)}</td>
            <td>${fmt(iva.total,cur)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- PIE -->
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:16px;padding-top:12px;border-top:1px solid var(--bg5)">
      <div style="font-size:.68rem;color:var(--m3);font-family:var(--fm);line-height:1.8">
        <div>Total en letras: <em style="color:var(--cr)">${numToLetras(iva.total,cur)}</em></div>
        ${s.notes?`<div>Observación: ${s.notes}</div>`:''}
      </div>
      <div style="text-align:center">
        <div style="width:120px;height:1px;background:var(--bg5);margin-bottom:4px"></div>
        <div style="font-size:.62rem;color:var(--m3);font-family:var(--fm)">Firma y sello</div>
      </div>
    </div>`;
  g('inv-view-modal').style.display='flex';
}
function printInvoice(){
  const content=g('inv-view-content').innerHTML;
  const w=window.open('','_blank');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Factura CD & Co</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Georgia',serif;padding:28px 32px;color:#111;max-width:780px;margin:0 auto;font-size:13px}
    .demo-watermark{background:repeating-linear-gradient(-45deg,rgba(200,50,50,.04),rgba(200,50,50,.04) 10px,transparent 10px,transparent 20px);border:2px dashed rgba(200,50,50,.35);border-radius:6px;padding:9px 14px;margin-bottom:14px;display:flex;gap:9px;align-items:flex-start}
    .dw-ico{font-size:16px;flex-shrink:0;line-height:1.4}
    .dw-txt{font-size:10px;line-height:1.7;color:#9b3a3a}
    .dw-ttl{font-family:monospace;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#b04040;margin-bottom:2px}
    .inv-timbrado{font-family:monospace;font-size:10px;letter-spacing:1px;color:#555;text-align:center;padding:5px 0;border:1px dashed #bbb;border-radius:3px;margin-bottom:14px}
    .inv-hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;padding-bottom:14px;border-bottom:2px solid #c9960c}
    .inv-emisor{font-size:1.5rem;font-weight:700;color:#111;margin-bottom:3px}
    .inv-brand{font-size:2rem;font-weight:300}
    .inv-brand em{font-style:italic;color:#c9960c}
    .inv-num strong{font-size:1.2rem;color:#c9960c;display:block}
    .inv-num{text-align:right;font-family:monospace}
    .inv-parties{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:14px}
    .inv-party-l{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#777;margin-bottom:4px;font-family:monospace}
    .inv-party-n{font-size:14px;font-weight:700}
    .inv-party-d{font-size:11px;color:#555;margin-top:2px}
    .inv-condicion{display:flex;gap:16px;font-size:11px;color:#555;font-family:monospace}
    .inv-condicion label{display:flex;align-items:center;gap:4px}
    .inv-items{width:100%;border-collapse:collapse;margin-bottom:10px}
    .inv-items th{font-family:monospace;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#777;padding:6px 8px;border-bottom:2px solid #c9960c;border-top:1px solid #ddd;text-align:right}
    .inv-items th:first-child,.inv-items th:nth-child(2){text-align:left}
    .inv-items td{padding:7px 8px;border-bottom:1px solid #eee;font-size:12px;text-align:right;font-family:monospace}
    .inv-items td:first-child,.inv-items td:nth-child(2){text-align:left;font-family:Georgia,serif}
    .inv-items td:nth-child(3){text-align:center}
    .iva-breakdown{width:100%;max-width:380px;margin-left:auto;border-collapse:collapse;margin-top:10px}
    .iva-breakdown th{font-family:monospace;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#777;padding:5px 7px;border-bottom:1px solid #ddd;text-align:right}
    .iva-breakdown th:first-child{text-align:left}
    .iva-breakdown td{padding:5px 7px;border-bottom:1px solid #eee;font-size:11px;font-family:monospace;text-align:right}
    .iva-breakdown td:first-child{text-align:left;font-family:Georgia,serif;color:#555}
    .iva-breakdown tr.total-row td{font-weight:700;color:#c9960c;border-top:2px solid #c9960c;border-bottom:none}
    .pill{display:inline-block;padding:2px 8px;border-radius:99px;font-family:monospace;font-size:10px;font-weight:700}
    .pill-pos{background:#e8f5ee;color:#2a7a4f}
    .pill-warn{background:#fff8e6;color:#a06000}
    @media print{body{padding:16px}@page{margin:15mm}}
  </style></head><body>${content}</body></html>`);
  w.document.close();setTimeout(()=>w.print(),500);
}
