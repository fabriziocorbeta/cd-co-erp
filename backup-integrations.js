// CD & Co — BACKUP INTEGRATIONS
// ====================================
// Google Drive + Email notifications

const fs = require('fs');
const path = require('path');

// Intentar cargar configuración
let CONFIG = null;
try {
  const configPath = path.join(__dirname, 'backup-config.js');
  if (fs.existsSync(configPath)) {
    CONFIG = require(configPath);
    console.log('✅ [Integrations] Configuración cargada');
  } else {
    console.warn('⚠️  [Integrations] backup-config.js no encontrado - integraciones deshabilitadas');
  }
} catch (err) {
  console.warn('⚠️  [Integrations] Error cargando config:', err.message);
}

// ══════════════════════════════════════════
// GOOGLE DRIVE UPLOAD
// ══════════════════════════════════════════
async function uploadToGoogleDrive(backupFilePath) {
  if (!CONFIG?.googleDrive?.enabled) {
    console.warn('⏭️  [GDrive] Google Drive deshabilitado');
    return { success: false, message: 'Google Drive no configurado' };
  }

  try {
    const { google } = require('@google-cloud/storage');

    const auth = new google.auth.JWT({
      email: CONFIG.googleDrive.serviceAccountEmail,
      key: CONFIG.googleDrive.privateKey,
      scopes: ['https://www.googleapis.com/auth/drive']
    });

    const drive = google.drive({ version: 'v3', auth });

    // Leer archivo de backup
    const fileName = path.basename(backupFilePath);
    const fileContent = fs.readFileSync(backupFilePath);

    console.log('🔄 [GDrive] Subiendo a Google Drive...');

    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: 'application/json',
        parents: [CONFIG.googleDrive.folderId]
      },
      media: {
        mimeType: 'application/json',
        body: fileContent
      }
    });

    console.log(`✅ [GDrive] Backup subido: ${response.data.id}`);
    return { success: true, fileId: response.data.id, fileName };
  } catch (err) {
    console.error('❌ [GDrive] Error subiendo a Drive:', err.message);
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════
// SEND EMAIL NOTIFICATION
// ══════════════════════════════════════════
async function sendBackupEmail(backupFilePath, metadata) {
  if (!CONFIG?.email?.enabled) {
    console.warn('⏭️  [Email] Email deshabilitado');
    return { success: false, message: 'Email no configurado' };
  }

  try {
    const nodemailer = require('nodemailer');

    // Crear transporter
    const transporter = nodemailer.createTransport(CONFIG.email);

    // Verificar conexión
    await transporter.verify();
    console.log('✅ [Email] Conexión SMTP verificada');

    // Preparar email
    const fileStats = fs.statSync(backupFilePath);
    const fileName = path.basename(backupFilePath);

    const mailOptions = {
      from: CONFIG.email.from,
      to: CONFIG.email.to,
      subject: `${CONFIG.email.subject} - ${new Date().toLocaleDateString('es-PY')}`,
      html: `
        <h2>Backup Automático - CD & Co</h2>
        <p><strong>Fecha:</strong> ${new Date().toLocaleString('es-PY')}</p>
        <p><strong>Archivo:</strong> ${fileName}</p>
        <p><strong>Tamaño:</strong> ${Math.round(fileStats.size / 1024)} KB</p>
        <p><strong>Tablas:</strong> ${metadata.tableCount}</p>
        <p><strong>Registros:</strong> ${metadata.totalRecords}</p>
        <hr>
        <p><em>Este backup incluye una copia completa de tu base de datos.</em></p>
      `,
      attachments: [
        {
          filename: fileName,
          path: backupFilePath
        }
      ]
    };

    // Enviar email
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ [Email] Email enviado: ${info.messageId}`);

    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error('❌ [Email] Error enviando email:', err.message);
    return { success: false, error: err.message };
  }
}

// ══════════════════════════════════════════
// POST-BACKUP INTEGRATIONS
// ══════════════════════════════════════════
async function executeIntegrations(backupFilePath, metadata) {
  console.log('\n🔗 [Integrations] Ejecutando integraciones...');

  if (!CONFIG) {
    console.warn('⚠️  [Integrations] Configuración no disponible');
    return;
  }

  // Google Drive
  if (CONFIG.googleDrive?.enabled) {
    const gdResult = await uploadToGoogleDrive(backupFilePath);
    if (!gdResult.success) {
      console.warn('⚠️  [Integrations] Google Drive falló:', gdResult.error);
    }
  }

  // Email
  if (CONFIG.email?.enabled) {
    const emailResult = await sendBackupEmail(backupFilePath, metadata);
    if (!emailResult.success) {
      console.warn('⚠️  [Integrations] Email falló:', emailResult.error);
    }
  }

  console.log('✅ [Integrations] Completado\n');
}

// ══════════════════════════════════════════
// EXPORTAR
// ══════════════════════════════════════════
module.exports = {
  executeIntegrations,
  uploadToGoogleDrive,
  sendBackupEmail,
  isConfigured: () => CONFIG !== null
};
