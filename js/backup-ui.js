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

// 🎬 INICIALIZAR BACKUP UI (solo llamar manualmente cuando se abre la sección de Settings)
function initBackupUI() {
  const btn = document.getElementById('btn-backup-now');
  if (btn && !btn._backupBound) {
    btn.addEventListener('click', triggerBackupNow);
    btn._backupBound = true;
  }
  updateBackupStatusDisplay();
}
