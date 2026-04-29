// CD & Co ERP — CONTACTS
// ====================================

// ══════════════════════════════════════════
// CONTACTS
// ══════════════════════════════════════════
let conFlt='all';
function setConFlt(f,btn){conFlt=f;document.querySelectorAll('#page-contacts .flt').forEach(b=>b.classList.remove('on'));btn.classList.add('on');renderContacts()}
function renderContacts(){
  const q=(g('con-search')?.value||'').toLowerCase();
  let cons=[...S.contacts];
  if(conFlt==='client')cons=cons.filter(c=>c.type==='client'||c.type==='both');
  else if(conFlt==='supplier')cons=cons.filter(c=>c.type==='supplier'||c.type==='both');
  if(q)cons=cons.filter(c=>c.name.toLowerCase().includes(q)||(c.phone||'').toLowerCase().includes(q));
  const grid=g('contacts-grid');
  if(!cons.length){grid.innerHTML='<div class="tbl-empty" style="grid-column:1/-1">Sin contactos. Agregá clientes o proveedores.</div>';return}
  grid.innerHTML=cons.map(c=>{
    const salesCount=S.sales.filter(s=>s.clientId===c.id).length;
    const ordersCount=S.orders.filter(o=>o.supId===c.id).length;
    const typeLabel={client:'Cliente',supplier:'Proveedor',both:'Cliente / Proveedor'}[c.type]||c.type;
    const typePill={client:'pill-blue',supplier:'pill-gold',both:'pill-pur'}[c.type]||'pill-neu';
    return `<div class="pcard">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <span class="pill ${typePill}">${typeLabel}</span>
        <div style="display:flex;gap:5px">
          <button class="btn btn-s" style="padding:4px 8px;font-size:.58rem" onclick="openContactModal('${c.id}')">✏</button>
          <button class="btn btn-danger" style="padding:4px 8px;font-size:.58rem" onclick="delContact('${c.id}')">✕</button>
        </div>
      </div>
      <div class="pcard-name" style="font-size:1rem">${c.name}</div>
      ${c.ruc?`<div style="font-size:.62rem;color:var(--m3);font-family:var(--fm)">RUC: ${c.ruc}</div>`:''}
      <div style="margin-top:10px;display:flex;flex-direction:column;gap:5px">
        ${c.phone?`<div style="font-size:.74rem;color:var(--mu)">📱 <a href="https://wa.me/${c.phone.replace(/\D/g,'')}" target="_blank" style="color:var(--pos);text-decoration:none">${c.phone}</a></div>`:''}
        ${c.email?`<div style="font-size:.74rem;color:var(--mu)">✉ ${c.email}</div>`:''}
        ${c.notes?`<div style="font-size:.68rem;color:var(--m3)">${c.notes}</div>`:''}
      </div>
      <div style="display:flex;gap:9px;margin-top:12px;padding-top:10px;border-top:1px solid var(--bg5)">
        ${(c.type==='client'||c.type==='both')?`<div style="text-align:center;flex:1"><div class="mono" style="font-size:.88rem;color:var(--pos)">${salesCount}</div><div style="font-size:.58rem;color:var(--m3);text-transform:uppercase;letter-spacing:.1em">Ventas</div></div>`:''}
        ${(c.type==='supplier'||c.type==='both')?`<div style="text-align:center;flex:1"><div class="mono" style="font-size:.88rem;color:var(--g2)">${ordersCount}</div><div style="font-size:.58rem;color:var(--m3);text-transform:uppercase;letter-spacing:.1em">Pedidos</div></div>`:''}
      </div>
    </div>`;
  }).join('');
}

function openContactModal(id){
  editIds.con=id||null;
  const c=id?S.contacts.find(x=>x.id===id):null;
  g('con-mttl').textContent=id?'Editar contacto':'Nuevo contacto';
  g('co-name').value=c?.name||'';g('co-type').value=c?.type||'client';
  g('co-phone').value=c?.phone||'';g('co-email').value=c?.email||'';
  g('co-ruc').value=c?.ruc||'';g('co-notes').value=c?.notes||'';
  g('con-acts').innerHTML=id
    ?`<button class="mb mb-d" onclick="delContact('${id}');cm('contact-modal')">Eliminar</button><button class="mb mb-gh" onclick="cm('contact-modal')">Cancelar</button><button class="mb mb-g" onclick="saveContact()">Guardar</button>`
    :`<button class="mb mb-gh" onclick="cm('contact-modal')">Cancelar</button><button class="mb mb-g" onclick="saveContact()">Guardar</button>`;
  g('contact-modal').style.display='flex';
}
async function saveContact(){
  const name=g('co-name').value.trim();
  if(!name){toast('Ingresá un nombre');return;}

  const fields={
    name,
    type:  g('co-type').value,
    phone: g('co-phone').value.trim(),
    email: g('co-email').value.trim(),
    ruc:   g('co-ruc').value.trim(),
    notes: g('co-notes').value.trim(),
  };

  if(editIds.con){
    // ── EDIT ────────────────────────────────────────────────────────────────
    const idx=S.contacts.findIndex(c=>c.id===editIds.con);
    if(idx<0){toast('Contacto no encontrado','error');return;}
    const updated={...S.contacts[idx],...fields};

    // Supabase UPDATE — await para detectar errores
    if(SB_ON&&sb&&S.user?.id){
      const {error}=await sb.from('contacts')
        .update({name:fields.name,type:fields.type,phone:fields.phone||null,email:fields.email||null,ruc:fields.ruc||null,notes:fields.notes||null})
        .eq('id',editIds.con)
        .eq('user_id',S.user.id);
      if(error){
        console.error('[Contacts] UPDATE error:',error.message,error.details);
        toast('⚠️ Error al guardar en Supabase: '+error.message);
        return; // no actualizar UI si DB falló
      }
    }

    S.contacts[idx]=updated;

  } else {
    // ── NEW ─────────────────────────────────────────────────────────────────
    const newId=uid();
    const newContact={...fields,id:newId};

    // Supabase INSERT — await para detectar errores
    if(SB_ON&&sb&&S.user?.id){
      const {error}=await sb.from('contacts').insert({
        id:      newId,
        user_id: S.user.id,
        name:    fields.name,
        type:    fields.type,
        phone:   fields.phone||null,
        email:   fields.email||null,
        ruc:     fields.ruc||null,
        notes:   fields.notes||null,
        created_at: new Date().toISOString(),
      });
      if(error){
        console.error('[Contacts] INSERT error:',error.message,error.details);
        toast('⚠️ Error al guardar en Supabase: '+error.message);
        return; // no agregar a UI si DB falló
      }
    }

    S.contacts.push(newContact);
  }

  lsave();
  swrSave(); // actualizar cache SWR con el nuevo estado
  renderAll();
  cm('contact-modal');
  toast('◆ Contacto guardado');
  populateSelects();
}

async function delContact(id){
  if(!confirm('¿Eliminar contacto?'))return;

  if(SB_ON&&sb&&S.user?.id){
    const {error}=await sb.from('contacts')
      .delete()
      .eq('id',id)
      .eq('user_id',S.user.id);
    if(error){
      console.error('[Contacts] DELETE error:',error.message);
      toast('⚠️ Error al eliminar: '+error.message);
      return;
    }
  }

  S.contacts=S.contacts.filter(c=>c.id!==id);
  lsave();
  swrSave();
  renderAll();
  toast('Eliminado');
  populateSelects();
}

// ══════════════════════════════════════════
// NUM TO LETRAS (simplified PY)
// ══════════════════════════════════════════
function numToLetras(n,cur){
  const u=['','UN','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE','DIEZ','ONCE','DOCE','TRECE','CATORCE','QUINCE','DIECISEIS','DIECISIETE','DIECIOCHO','DIECINUEVE'];
  const d=['','','VEINTE','TREINTA','CUARENTA','CINCUENTA','SESENTA','SETENTA','OCHENTA','NOVENTA'];
  const c=['','CIEN','DOSCIENTOS','TRESCIENTOS','CUATROCIENTOS','QUINIENTOS','SEISCIENTOS','SETECIENTOS','OCHOCIENTOS','NOVECIENTOS'];
  function g2(n){if(n<20)return u[n];const t=Math.floor(n/10);const o=n%10;return d[t]+(o>0?' Y '+u[o]:'');}
  function g3(n){const h=Math.floor(n/100);const r=n%100;const hs=h===1&&r===0?'CIEN':h>0?c[h]:'';const ts=r>0?g2(r):'';return[hs,ts].filter(Boolean).join(' ');}
  function big(n){if(n===0)return'CERO';const mill=Math.floor(n/1000000);const mil=Math.floor((n%1000000)/1000);const res=n%1000;let s='';if(mill>0)s+=(mill===1?'UN MILLÓN':g3(mill)+' MILLONES')+' ';if(mil>0)s+=(mil===1?'MIL':g3(mil)+' MIL')+' ';if(res>0)s+=g3(res);return s.trim();}
  const ent=Math.floor(n);const dec=Math.round((n-ent)*100);
  const moneda=cur==='₲'?'GUARANÍES':'DÓLARES';
  const cent=cur==='₲'?'':` CON ${String(dec).padStart(2,'0')}/100 CENTAVOS`;
  return big(ent)+' '+moneda+cent;
}
