// CD & Co ERP — SETTINGS
// ====================================

// ══════════════════════════════════════════
// PLAN PAGE
// ══════════════════════════════════════════
function handleLogoUpload(e) {
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = function(evt) {
    const b64 = evt.target.result;
    window._tempLogo = b64;
    const pv = g('emp-logo-preview');
    if(pv) pv.innerHTML = `<img src="${b64}" style="max-width:100%;max-height:100%;object-fit:contain"/>`;
    const rm = g('emp-logo-rm');
    if(rm) rm.style.display = 'inline-flex';
  };
  reader.readAsDataURL(file);
}

function removeLogo() {
  window._tempLogo = null;
  EMPRESA.logo = null;
  const pv = g('emp-logo-preview');
  if(pv) pv.innerHTML = '<span style="font-size:1.5rem;color:var(--mu)">📸</span>';
  const rm = g('emp-logo-rm');
  if(rm) rm.style.display = 'none';
  const fi = g('emp-logo-file');
  if(fi) fi.value = '';
}

function saveEmpresa(){
  EMPRESA.razonSocial=g('emp-rs').value.trim()||EMPRESA.razonSocial;
  EMPRESA.ruc=g('emp-ruc').value.trim()||EMPRESA.ruc;
  EMPRESA.direccion=g('emp-dir').value.trim()||EMPRESA.direccion;
  EMPRESA.telefono=g('emp-tel').value.trim()||EMPRESA.telefono;
  EMPRESA.email=g('emp-email').value.trim()||EMPRESA.email;
  EMPRESA.web=g('emp-web').value.trim()||EMPRESA.web;
  EMPRESA.timbrado=g('emp-tim').value.trim()||EMPRESA.timbrado;
  EMPRESA.nroFacturaInicio=parseInt(g('emp-nro').value)||EMPRESA.nroFacturaInicio;
  EMPRESA.vigenciaDesde=g('emp-vd').value||EMPRESA.vigenciaDesde;
  EMPRESA.vigenciaHasta=g('emp-vh').value||EMPRESA.vigenciaHasta;
  if(window._tempLogo !== undefined) EMPRESA.logo = window._tempLogo;
  try{localStorage.setItem('cdco_empresa',JSON.stringify(EMPRESA))}catch(e){}
  toast('◆ Datos fiscales guardados');
}
function loadEmpresaForm(){
  if(g('emp-rs'))g('emp-rs').value=EMPRESA.razonSocial;
  if(g('emp-ruc'))g('emp-ruc').value=EMPRESA.ruc;
  if(g('emp-dir'))g('emp-dir').value=EMPRESA.direccion;
  if(g('emp-tel'))g('emp-tel').value=EMPRESA.telefono;
  if(g('emp-email'))g('emp-email').value=EMPRESA.email;
  if(g('emp-web'))g('emp-web').value=EMPRESA.web;
  if(g('emp-tim'))g('emp-tim').value=EMPRESA.timbrado;
  if(g('emp-nro'))g('emp-nro').value=EMPRESA.nroFacturaInicio;
  if(g('emp-vd'))g('emp-vd').value=EMPRESA.vigenciaDesde;
  if(g('emp-vh'))g('emp-vh').value=EMPRESA.vigenciaHasta;
  if(EMPRESA.logo) {
    window._tempLogo = EMPRESA.logo;
    const pv = g('emp-logo-preview');
    if(pv) pv.innerHTML = `<img src="${EMPRESA.logo}" style="max-width:100%;max-height:100%;object-fit:contain"/>`;
    const rm = g('emp-logo-rm');
    if(rm) rm.style.display = 'inline-flex';
  } else {
    if(typeof removeLogo === 'function') removeLogo();
  }
}

function buildPlanCards(){
  const plans=[{k:'free',n:'Free',p:'$0',s:'/mes',pc:'var(--pos)'},{k:'pro',n:'Pro ◆',p:'$4.99',s:'/mes',pc:'var(--g2)'},{k:'business',n:'Business',p:'$14.99',s:'/mes',pc:'var(--g2)'}];
  const el=g('plan-cards');if(!el)return;
  el.innerHTML=plans.map(pl=>`<div class="pchip${S.plan===pl.k?' on':''}" onclick="selPl(this,'${pl.k}')"><div class="pchip-n">${pl.n}</div><div class="pchip-p" style="color:${pl.pc}">${pl.p}</div><div class="pchip-s">${pl.s}</div></div>`).join('');
}
function selPl(el,k){document.querySelectorAll('#plan-cards .pchip').forEach(c=>c.classList.remove('on'));el.classList.add('on');selPK=k}
function goStripe(){if(selPK==='free'){toast('Ya estás en plan gratuito');return}const u=STRIPE[selPK];if(u.includes('TU_')){toast('⚙ Configurá tu link de Stripe');return}window.open(u,'_blank')}

// ══════════════════════════════════════════
// EXPORT CSV
// ══════════════════════════════════════════
function exportCSV(){
  const rows=['Fecha,Tipo,Descripción,Monto,Moneda,Categoría',...S.txs.map(t=>`${t.date},${t.type==='income'?'Ingreso':'Gasto'},"${t.desc}",${t.amount},${t.cur||'$'},${t.cat||''}`)];
  const blob=new Blob([rows.join('\n')],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='cdco-movimientos.csv';a.click();toast('◆ CSV exportado');
}

// ══════════════════════════════════════════
// LIGHT MODE
// ══════════════════════════════════════════
function toggleMode(){
  lm=!lm;
  document.body.classList.toggle('light-mode', lm);
  document.documentElement.classList.toggle('dark', !lm);
  if(lm){
    toast('☀ Modo claro');
  } else {
    toast('◑ Modo oscuro');
  }
  if(typeof renderChart === 'function') renderChart();
}

// ══════════════════════════════════════════
// APP MODE (SIMPLE / FULL)
// ══════════════════════════════════════════
function setAppMode(mode, init=false) {
  S.appMode = mode;
  if(!init) {
    lsave();
    toast(mode === 'simple' ? '🍃 Modo Simple activado' : '⚙️ Modo Completo activado');
  }
  
  if (mode === 'simple') {
    document.body.classList.add('modo-simple');
    if(g('btn-mode-simple')) {
      g('btn-mode-simple').style.borderColor = 'var(--pos)';
      g('btn-mode-simple').style.color = 'var(--pos)';
      g('btn-mode-simple').style.background = 'var(--pb)';
      
      g('btn-mode-full').style.borderColor = 'var(--bg5)';
      g('btn-mode-full').style.color = 'var(--mu)';
      g('btn-mode-full').style.background = 'none';
    }
  } else {
    document.body.classList.remove('modo-simple');
    if(g('btn-mode-full')) {
      g('btn-mode-full').style.borderColor = 'var(--g2)';
      g('btn-mode-full').style.color = 'var(--g2)';
      g('btn-mode-full').style.background = 'var(--gd)';
      
      g('btn-mode-simple').style.borderColor = 'var(--bg5)';
      g('btn-mode-simple').style.color = 'var(--mu)';
      g('btn-mode-simple').style.background = 'none';
    }
  }
  
  if (!init && S.curPage === 'dashboard' && typeof renderChart === 'function') {
    renderChart();
  }
}

// ══════════════════════════════════════════
// THEME SELECTOR
// ══════════════════════════════════════════
function setAppTheme(themeId, btn) {
  // Update Body
  if (themeId === 'gold') {
    delete document.body.dataset.theme;
  } else {
    document.body.dataset.theme = themeId;
  }
  
  // Persist
  localStorage.setItem('cdco_theme', themeId);
  
  // UI: Active class on swatches
  document.querySelectorAll('.theme-swatch').forEach(s => s.classList.remove('active'));
  if (btn) {
    btn.classList.add('active');
  } else {
    // If called without btn (on load), find by title or click logic
    const swatches = document.querySelectorAll('.theme-swatch');
    swatches.forEach(s => {
      const bg = s.style.background;
      // Simple mapping for initial active state if needed, 
      // but better to just find the one that matches themeId based on a custom property
    });
  }

  // Refresh charts if needed (they use CSS variables, but Chart.js might need re-render for some colors)
  if (typeof renderAll === 'function') renderAll();
  
  if (themeId !== 'gold') toast(`🎨 Tema ${themeId.charAt(0).toUpperCase() + themeId.slice(1)} activado`);
}

function applySavedTheme() {
  const saved = localStorage.getItem('cdco_theme');
  if (saved) {
    setAppTheme(saved);
    // Mark as active in UI if we are in settings page
    const themes = {
      gold: '#e8b124',
      ocean: '#3b82f6',
      emerald: '#10b981',
      amethyst: '#8b5cf6',
      ruby: '#ef4444'
    };
    const savedColor = themes[saved];
    document.querySelectorAll('.theme-swatch').forEach(s => {
       if (s.style.backgroundColor === savedColor || s.title.toLowerCase().includes(saved)) {
         s.classList.add('active');
       }
    });
  }
}

