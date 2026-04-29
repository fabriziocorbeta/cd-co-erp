// CD & Co ERP — SHIPPING LABEL
// =============================================
// viewShippingLabel(saleId) — abre modal con etiqueta de envío
// printShippingLabel()      — window.print() (oculta UI via @media print)
// closeShippingLabel()      — cierra modal

function viewShippingLabel(saleId) {
  const sale = S.sales.find(s => s.id === saleId);
  if (!sale) { toast('Venta no encontrada', 'error'); return; }

  const contact = S.contacts.find(c => c.id === (sale.client_id || sale.clientId));

  // Destinatario
  const destNombre = contact?.name  || 'Cliente ocasional';
  const destTel    = contact?.phone || '—';
  const destDir    = contact?.notes || '—'; // notes = referencia de entrega
  const destEmail  = contact?.email || '';

  // Detalle de venta
  const saleNum  = String(sale.num || 0).padStart(4, '0');
  const saleFecha = sale.date || '';
  const saleCur   = sale.cur || '$';
  const saleTotal = Number(sale.total || 0)
    .toLocaleString('es-PY', { minimumFractionDigits: 2 });
  const itemsText = (sale.items || []).map(i => {
    const p = S.products.find(x => x.id === i.prodId);
    return `${p?.name || 'Producto'} × ${i.qty}`;
  }).join('\n');

  // Remitente — desde EMPRESA
  const remNombre = EMPRESA.nombre     || 'CD & Co';
  const remDir    = EMPRESA.direccion  || 'Luque, Paraguay';
  const remTel    = EMPRESA.telefono   || '';

  // Inyectar en el modal
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

  g('shipping-label-modal').style.display = 'flex';
}

function _slSet(id, val) {
  const el = g(id);
  if (el) el.textContent = val || '—';
}

function printShippingLabel() {
  window.print();
}

function closeShippingLabel() {
  g('shipping-label-modal').style.display = 'none';
}
