// CD & Co — BACKUP UI v2
// ====================================
// Interfaz de usuario para backups con mejor manejo de errores

// 🔄 OBTENER ESTADO DEL BACKUP
async function getBackupStatus() {
  try {
    const response = await fetch('/api/backup/status');

    if (!response.ok) {
      console.error('❌ Respuesta de servidor:', response.status);
      return null;
    }

    const data = await response.json();
    return data;
  } catch (err) {
    console.error('❌ Error obteniendo estado de backup:', err);
    return null;
  }
}

// 💾 FORZAR BACKUP INMEDIATO
async function triggerBackupNow() {
  const btn = document.getElementById('btn-backup-now');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Generando backup...';
  }

  try {
    const response = await fetch('/api/backup/now', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.success) {
      toast('✅ Backup completado exitosamente', 4000);
      setTimeout(() => updateBackupStatusDisplay(), 500);
    } else {
      toast('❌ Error: ' + (data.error || 'Unknown error'), 4000);
      console.error('Error en backup:', data.error);
    }
  } catch (err) {
    console.error('❌ Error triggering backup:', err);
    toast('❌ Error al generar backup: ' + err.message, 4000);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '💾 Generar Backup Ahora';
    }
  }
}

// 📊 RENDERIZAR ESTADO DEL BACKUP EN EL DASHBOARD
async function updateBackupStatusDisplay() {
  const statusEl = document.getElementById('backup-status-display');
  if (!statusEl) return;

  const status = await getBackupStatus();

  if (!status) {
    statusEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;color:#d47a7a;font-size:.75rem">
        <span style="font-size:1rem">⚠️</span>
        <span><strong>Error:</strong> No se pudo conectar al servidor</span>
      </div>
    `;
    return;
  }

  let html = '';

  if (status.error) {
    html = `
      <div style="display:flex;align-items:center;gap:8px;color:#d47a7a;font-size:.75rem">
        <span style="font-size:1rem">❌</span>
        <span><strong>Error:</strong> ${status.error}</span>
      </div>
    `;
  } else if (status.status === 'never') {
    html = `
      <div style="display:flex;align-items:center;gap:8px;color:var(--mu);font-size:.75rem">
        <span style="font-size:1rem">⏳</span>
        <span><strong>Sin backups:</strong> Se ejecutará a medianoche</span>
      </div>
    `;
  } else if (status.lastBackup) {
    const lastDate = new Date(status.lastBackup).toLocaleString('es-PY', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    html = `
      <div style="display:flex;align-items:center;gap:8px;color:var(--pos);font-size:.75rem">
        <span style="font-size:1rem">✅</span>
        <span><strong>Último backup:</strong> ${lastDate}</span>
      </div>
      <div style="display:flex;gap:8px;margin-top:6px;font-size:.7rem;color:var(--mu);flex-wrap:wrap">
        <span>📦 ${status.totalRecords || 'N/A'} registros</span>
        <span>•</span>
        <span>📋 ${status.tableCount} tablas</span>
        ${status.fileSize ? `<span>•</span><span>💾 ${status.fileSize}</span>` : ''}
      </div>
      <div style="margin-top:8px;padding:6px;background:var(--bg4);border-radius:4px;font-size:.65rem;color:var(--mu);font-family:var(--fm)">
        📁 ${status.lastBackupFile || 'backup file'}
      </div>
    `;
  } else {
    html = '<div style="color:var(--mu);font-size:.75rem">⏳ Cargando estado...</div>';
  }

  statusEl.innerHTML = html;
}

// 📥 DESCARGAR BACKUP COMPLETO DESDE SUPABASE
// Llama a GET /api/export-data?user_id=... (funciona en dev y en Vercel)
// y fuerza la descarga del JSON en el navegador.
async function downloadFullExport() {
  const btn = document.getElementById('btn-export-full');

  const userId = S.user?.id;
  if (!userId) {
    toast('⚠ Iniciá sesión para exportar tus datos', 3000);
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = '⏳ Preparando exportación...'; }

  try {
    const resp = await fetch(`/api/export-data?user_id=${encodeURIComponent(userId)}`);

    if (!resp.ok) {
      let errMsg = `HTTP ${resp.status}`;
      try { const j = await resp.json(); errMsg = j.error || errMsg; } catch (_) {}
      throw new Error(errMsg);
    }

    const blob = await resp.blob();

    // Nombre de archivo desde header Content-Disposition, o fallback
    const cd = resp.headers.get('Content-Disposition') || '';
    const match = cd.match(/filename="([^"]+)"/);
    const filename = match ? match[1]
      : `cdco_export_${new Date().toISOString().slice(0,10).replace(/-/g,'')}_${userId.slice(0,8)}.json`;

    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl; a.download = filename; a.click();
    URL.revokeObjectURL(objUrl);

    const rows = resp.headers.get('X-Export-Rows') || '?';
    const errs = parseInt(resp.headers.get('X-Export-Errors') || '0', 10);
    toast(`✅ Exportación descargada — ${rows} registros${errs > 0 ? ` (${errs} tablas con error)` : ''}`, 4500);

  } catch (err) {
    console.error('[downloadFullExport]', err);
    toast('❌ Error al exportar: ' + err.message, 4000);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📥 Descargar Backup Completo (JSON)'; }
  }
}

// ⬇️ EXPORTAR CSV PARA SURE
// Llama a GET /api/export-sure-csv?user_id=... y fuerza descarga del .csv
async function downloadSureCsv() {
  console.log('[downloadSureCsv] Iniciando exportación CSV para Sure...');
  toast('⏳ Preparando CSV para Sure...', 2500);

  const btn = document.getElementById('btn-export-sure-csv');

  const userId = S.user?.id;
  console.log('[downloadSureCsv] userId:', userId);
  if (!userId) {
    toast('⚠ Iniciá sesión para exportar tus datos', 3000);
    console.warn('[downloadSureCsv] Sin userId — abortando');
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = '⏳ Generando CSV...'; }

  // Get current session JWT so the server can satisfy Supabase RLS.
  // Without it, auth.uid() = null on the server → 0 rows returned.
  let jwt = '';
  try {
    if (typeof sb !== 'undefined' && sb?.auth?.getSession) {
      const { data } = await sb.auth.getSession();
      jwt = data?.session?.access_token || '';
      console.log('[downloadSureCsv] JWT:', jwt ? `${jwt.slice(0,20)}...` : 'NOT FOUND');
    }
  } catch (_) {}

  try {
    const resp = await fetch(`/api/export-sure-csv?user_id=${encodeURIComponent(userId)}`, {
      headers: jwt ? { 'Authorization': `Bearer ${jwt}` } : {},
    });

    if (!resp.ok) {
      let errMsg = `HTTP ${resp.status}`;
      try { const j = await resp.json(); errMsg = j.error || errMsg; } catch (_) {}
      throw new Error(errMsg);
    }

    const blob = await resp.blob();

    // Filename from Content-Disposition or fallback
    const cd = resp.headers.get('Content-Disposition') || '';
    const match = cd.match(/filename="([^"]+)"/);
    const filename = match ? match[1]
      : `sure_import_${new Date().toISOString().slice(0,10).replace(/-/g,'')}.csv`;

    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl; a.download = filename; a.click();
    URL.revokeObjectURL(objUrl);

    const rows  = resp.headers.get('X-Export-Rows')  || '?';
    const txs   = resp.headers.get('X-Export-Txs')   || '?';
    const sales = resp.headers.get('X-Export-Sales') || '?';
    toast(`✅ CSV descargado — ${rows} filas (${sales} ventas + ${txs} movimientos)`, 5000);

  } catch (err) {
    console.error('[downloadSureCsv]', err);
    toast('❌ Error al exportar CSV: ' + err.message, 4000);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⬇️ Exportar CSV para Sure'; }
  }
}

// ── Event delegation — wired once at script load, works regardless of when
// buttons appear in the DOM (dynamic SPA rendering, modal injection, etc.)
document.addEventListener('click', function(e) {
  const t = e.target.closest('button') || e.target;
  const id = t.id || t.closest('[id]')?.id;
  if (id === 'btn-backup-now')      { triggerBackupNow();   return; }
  if (id === 'btn-export-full')     { downloadFullExport(); return; }
  if (id === 'btn-export-sure-csv') { downloadSureCsv();    return; }
});

// 🎬 INICIALIZAR BACKUP UI (llamado desde renderPageData('plan') en nav.js)
// Solo actualiza el display de estado — los listeners ya están en la delegación.
function initBackupUI() {
  console.log('[initBackupUI] Actualizando estado de backup...');
  updateBackupStatusDisplay();
}
