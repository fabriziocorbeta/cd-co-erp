// CD & Co — BACKUP SYSTEM v2
// ====================================
// Sistema de backup con: Local + Google Drive + Email

const fs = require('fs').promises;
const fsSynth = require('fs');
const path = require('path');
const http = require('http');

// Integraciones (Google Drive + Email)
let integrations = null;
try {
  integrations = require('./backup-integrations');
} catch (err) {
  console.warn('⚠️  [Backup] Integraciones no disponibles:', err.message);
}

const BACKUP_DIR = path.join(__dirname, 'backups');
const METADATA_FILE = path.join(BACKUP_DIR, 'backup-metadata.json');

// 📊 TABLAS A HACER BACKUP
const TABLES = [
  'products', 'sales', 'transactions', 'orders', 'contacts',
  'cards', 'debts', 'accounts', 'receivables', 'budgets',
  'subscriptions', 'goals'
];

// ══════════════════════════════════════════
// CREAR DIRECTORIO DE BACKUPS
// ══════════════════════════════════════════
async function ensureBackupDir() {
  try {
    if (!fsSynth.existsSync(BACKUP_DIR)) {
      await fs.mkdir(BACKUP_DIR, { recursive: true });
      console.log('✅ [Backup] Carpeta /backups creada');
    } else {
      console.log('✅ [Backup] Carpeta /backups verificada');
    }
  } catch (err) {
    console.error('❌ [Backup] Error creando directorio:', err.message);
    throw err;
  }
}

// ══════════════════════════════════════════
// FETCH DATA FROM SUPABASE (CON RETRY)
// ══════════════════════════════════════════
async function fetchTableData(table, sbUrl, sbKey, retries = 3) {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const url = new URL(`${sbUrl}/rest/v1/${table}?select=*`);

      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'GET',
        headers: {
          'apikey': sbKey,
          'Authorization': `Bearer ${sbKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      };

      const req = http.request(options, (res) => {
        let data = '';

        res.on('data', chunk => data += chunk);

        res.on('end', () => {
          try {
            if (res.statusCode === 200 || res.statusCode === 206) {
              const parsed = JSON.parse(data);
              resolve(parsed);
            } else if (retries > 0) {
              console.warn(`⚠️  [Backup] ${table}: Status ${res.statusCode}, reintentando...`);
              setTimeout(attempt, 1000);
            } else {
              console.warn(`❌ [Backup] ${table}: Status ${res.statusCode} después de reintentos`);
              resolve([]);
            }
          } catch (err) {
            console.warn(`❌ [Backup] Error parsing ${table}:`, err.message);
            resolve([]);
          }
        });
      });

      req.on('error', (err) => {
        if (retries > 0) {
          console.warn(`⚠️  [Backup] Error en ${table}, reintentando...`);
          setTimeout(() => attempt(), 1000);
        } else {
          console.warn(`❌ [Backup] Error final en ${table}:`, err.message);
          resolve([]);
        }
      });

      req.on('timeout', () => {
        req.destroy();
        if (retries > 0) {
          console.warn(`⚠️  [Backup] Timeout en ${table}, reintentando...`);
          setTimeout(attempt, 1000);
        } else {
          resolve([]);
        }
      });

      req.end();
    };

    attempt();
  });
}

// ══════════════════════════════════════════
// GENERAR BACKUP LOCAL
// ══════════════════════════════════════════
async function generateBackup(sbUrl, sbKey) {
  try {
    if (!sbUrl || sbUrl.includes('TU_')) {
      return { success: false, error: 'Supabase no configurado' };
    }

    await ensureBackupDir();

    console.log('🔄 [Backup] Iniciando exportación de tablas...');
    const timestamp = new Date();
    const dateStr = `${timestamp.getDate().toString().padStart(2, '0')}-${(timestamp.getMonth() + 1).toString().padStart(2, '0')}-${timestamp.getFullYear()}`;
    const timeStr = timestamp.toLocaleTimeString('en-US', { hour12: false });
    const backupFilename = `backup-${dateStr}-${timeStr.replace(/:/g, '-')}.json`;
    const backupPath = path.join(BACKUP_DIR, backupFilename);

    const backup = {
      timestamp: timestamp.toISOString(),
      version: '2.0',
      server: 'localhost',
      tables: {}
    };

    // Descargar todas las tablas CON REINTENTOS
    for (const table of TABLES) {
      console.log(`  📥 Descargando ${table}...`);
      const data = await fetchTableData(table, sbUrl, sbKey);
      backup.tables[table] = {
        count: data.length,
        data: data
      };
    }

    // Guardar archivo
    await fs.writeFile(backupPath, JSON.stringify(backup, null, 2), 'utf-8');
    console.log(`✅ [Backup] Guardado: ${backupFilename}`);

    // Actualizar metadata
    const metadata = {
      lastBackup: timestamp.toISOString(),
      lastBackupFile: backupFilename,
      lastBackupPath: backupPath,
      status: 'success',
      tableCount: TABLES.length,
      totalRecords: Object.values(backup.tables).reduce((sum, t) => sum + t.count, 0),
      fileSize: JSON.stringify(backup).length
    };

    await fs.writeFile(METADATA_FILE, JSON.stringify(metadata, null, 2), 'utf-8');
    console.log(`✅ [Backup] Metadata actualizado`);

    // Ejecutar integraciones (Google Drive + Email)
    if (integrations) {
      integrations.executeIntegrations(backupPath, metadata).catch(err => {
        console.warn('⚠️  [Backup] Error en integraciones:', err.message);
      });
    }

    return { success: true, file: backupFilename, metadata };
  } catch (err) {
    console.error('❌ [Backup] Error:', err.message);
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════
// OBTENER ESTADO DEL BACKUP
// ══════════════════════════════════════════
async function getBackupStatus() {
  try {
    await ensureBackupDir();

    // Intentar leer metadata
    if (fsSynth.existsSync(METADATA_FILE)) {
      const data = await fs.readFile(METADATA_FILE, 'utf-8');
      return JSON.parse(data);
    }

    // Si no existe metadata, buscar el último archivo en la carpeta
    const files = await fs.readdir(BACKUP_DIR);
    const backupFiles = files.filter(f => f.startsWith('backup-') && f.endsWith('.json') && f !== 'backup-metadata.json');

    if (backupFiles.length === 0) {
      return {
        lastBackup: null,
        lastBackupFile: null,
        status: 'never',
        tableCount: 0,
        totalRecords: 0,
        message: '⏳ Sin backups aún. Se ejecutará el primero a medianoche.'
      };
    }

    // Obtener el último archivo por nombre (está ordenado cronológicamente)
    const lastFile = backupFiles.sort().reverse()[0];
    const lastPath = path.join(BACKUP_DIR, lastFile);
    const stats = await fs.stat(lastPath);

    return {
      lastBackup: stats.mtime.toISOString(),
      lastBackupFile: lastFile,
      status: 'success',
      tableCount: TABLES.length,
      totalRecords: 'N/A',
      fileSize: Math.round(stats.size / 1024) + ' KB'
    };
  } catch (err) {
    console.error('❌ [Backup] Error en getBackupStatus:', err.message);
    return {
      lastBackup: null,
      lastBackupFile: null,
      status: 'error',
      error: err.message,
      tableCount: 0,
      totalRecords: 0
    };
  }
}

// ══════════════════════════════════════════
// LIMPIAR BACKUPS ANTIGUOS (>30 DÍAS)
// ══════════════════════════════════════════
async function cleanOldBackups() {
  try {
    const files = await fs.readdir(BACKUP_DIR);
    const now = Date.now();
    const thirtyDaysAgo = 30 * 24 * 60 * 60 * 1000;

    for (const file of files) {
      if (file.startsWith('backup-') && file.endsWith('.json') && file !== 'backup-metadata.json') {
        const filePath = path.join(BACKUP_DIR, file);
        const stats = await fs.stat(filePath);

        if (now - stats.mtimeMs > thirtyDaysAgo) {
          await fs.unlink(filePath);
          console.log(`🗑️  [Backup] Eliminado: ${file}`);
        }
      }
    }
  } catch (err) {
    console.warn('⚠️  [Backup] Error limpiando archivos:', err.message);
  }
}

// ══════════════════════════════════════════
// INICIALIZAR BACKUP SCHEDULER
// ══════════════════════════════════════════
function initBackupScheduler(sbUrl, sbKey) {
  if (!sbUrl || sbUrl.includes('TU_')) {
    console.warn('⚠️  [Backup] Supabase no configurado - backups deshabilitados');
    return;
  }

  try {
    const cron = require('node-cron');

    // Backup cada 24h a las 00:00
    cron.schedule('0 0 * * *', async () => {
      console.log('\n🔄 [Backup] Ejecutando backup automático (24h)...');
      await generateBackup(sbUrl, sbKey);
      await cleanOldBackups();
      console.log('✅ [Backup] Completado\n');
    });

    console.log('✅ [Backup] Scheduler iniciado - backup diario a las 00:00');

    // Backup inicial al iniciar
    console.log('🔄 [Backup] Haciendo backup inicial...');
    generateBackup(sbUrl, sbKey).then(() => {
      cleanOldBackups();
    });
  } catch (err) {
    console.warn('⚠️  [Backup] node-cron no instalado');
    console.warn('   Instala con: npm install node-cron');
  }
}

// ══════════════════════════════════════════
// EXPORTAR FUNCIONES PÚBLICAS
// ══════════════════════════════════════════
module.exports = {
  initBackupScheduler,
  generateBackup,
  getBackupStatus,
  ensureBackupDir
};
