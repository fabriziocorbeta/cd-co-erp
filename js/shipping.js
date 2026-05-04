// CD & Co ERP — SHIPPING LABEL
// =============================================
// viewShippingLabel(saleId) — abre modal con etiqueta de envío
// printShippingLabel()      — window.print() (oculta UI via @media print)
// closeShippingLabel()      — cierra modal

async function viewShippingLabel(saleId) {
  // 1. Buscar la venta
  const sale = S.sales.find(s => s.id === saleId);
  if (!sale) { toast('Venta no encontrada', 'error'); return; }

  // 2. Garantizar que S.contacts esté cargado antes de buscar el contacto
  //    _ensureContacts() está definida en sales.js (mismo scope global)
  if (typeof _ensureContacts === 'function') await _ensureContacts();

  // 3. Buscar contacto — la venta puede usar client_id (Supabase) o clientId (legacy localStorage)
  const clientKey = sale.client_id || sale.clientId || null;
  const contact = clientKey ? S.contacts.find(c => c.id === clientKey) : null;

  console.log('[Shipping] sale.client_id:', sale.client_id, '| sale.clientId:', sale.clientId,
              '| contacto encontrado:', contact?.name || '—', '| S.contacts.length:', S.contacts.length);

  // 4. Destinatario
  const destNombre = contact?.name  || 'Cliente ocasional';
  const destTel    = contact?.phone || '—';
  const destDir    = contact?.notes || '—'; // notes = referencia de entrega
  const destEmail  = contact?.email || '';

  // 5. Detalle de venta
  const saleNum   = String(sale.num || 0).padStart(4, '0');
  const saleFecha = sale.date || '';
  const saleCur   = sale.cur  || '$';
  const saleTotal = Number(sale.total || 0)
    .toLocaleString('es-PY', { minimumFractionDigits: 2 });
  const itemsText = (typeof safeItems === 'function' ? safeItems(sale.items) : (sale.items || []))
    .map(i => {
      const p = S.products.find(x => x.id === i.prodId);
      return `${p?.name || 'Producto'} × ${i.qty}`;
    }).join('\n');

  // 6. Remitente — desde EMPRESA global
  const remNombre = (typeof EMPRESA !== 'undefined' && EMPRESA.razonSocial) || 'CD & Co';
  const remDir    = (typeof EMPRESA !== 'undefined' && EMPRESA.direccion) || 'Luque, Paraguay';
  const remTel    = (typeof EMPRESA !== 'undefined' && EMPRESA.telefono)  || '';

  // 7. Limpiar + rellenar campos (reset completo en cada apertura)
  _slSet('sl-rem-nombre',  remNombre);
  _slSet('sl-rem-dir',     remDir);
  _slSet('sl-rem-tel',     remTel);
  _slSet('sl-dest-nombre', destNombre);
  _slSet('sl-dest-tel',    destTel);
  _slSet('sl-dest-dir',    destDir);
  _slSet('sl-dest-email',  destEmail);
  _slSet('sl-sale-num',    '#' + saleNum);
  _slSet('sl-sale-fecha',  saleFecha);
  _slSet('sl-sale-items',  itemsText);
  _slSet('sl-sale-total',  saleCur + ' ' + saleTotal);

  // 8. Ocultar fila email si está vacío
  const emailRow = document.getElementById('sl-email-row');
  if (emailRow) emailRow.style.display = destEmail ? 'flex' : 'none';

  g('shipping-label-modal').style.display = 'flex';
}

// Limpia un campo editable y pone el nuevo valor
// Usar textContent (no innerHTML) para evitar XSS y no romper contenteditable
function _slSet(id, val) {
  const el = g(id);
  if (!el) return;
  el.textContent = (val !== null && val !== undefined && val !== '') ? val : '—';
}

function printShippingLabel() {
  window.print();
}

function closeShippingLabel() {
  g('shipping-label-modal').style.display = 'none';
}
