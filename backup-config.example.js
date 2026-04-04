// CD & Co — BACKUP CONFIGURATION
// ====================================
// Configuración de integraciones (Google Drive + Email)
//
// INSTRUCCIONES:
// 1. Copia este archivo a: backup-config.js
// 2. Llena tus credenciales
// 3. NO cometas este archivo a git (está en .gitignore)

module.exports = {
  // ══════════════════════════════════════════
  // GOOGLE DRIVE CONFIGURATION
  // ══════════════════════════════════════════
  googleDrive: {
    enabled: false, // Cambiar a true para habilitar

    // Obtener estas credenciales de Google Cloud Console:
    // https://console.cloud.google.com/
    // 1. Crear nuevo proyecto
    // 2. Habilitar: Google Drive API
    // 3. Crear credenciales: Service Account (JSON)
    // 4. Copiar el contenido del JSON aquí

    serviceAccountEmail: 'tu-service-account@project.iam.gserviceaccount.com',
    privateKey: 'tu-private-key-aqui', // Comenzará con -----BEGIN PRIVATE KEY-----
    projectId: 'tu-project-id',

    // ID de la carpeta en Drive donde guardar los backups
    // Para obtenerlo: Abre Drive, crea una carpeta "CD & Co Backups",
    // y copia la ID de la URL: https://drive.google.com/drive/folders/ESTA-ES-LA-ID
    folderId: '1234567890abcdefgh_tu_folder_id_aqui',

    // Subir backup cada X días (1 = diario, 7 = semanal, etc.)
    uploadFrequencyDays: 7
  },

  // ══════════════════════════════════════════
  // EMAIL CONFIGURATION (nodemailer)
  // ══════════════════════════════════════════
  email: {
    enabled: false, // Cambiar a true para habilitar

    // PROVEEDOR: Gmail con App Password
    // Instrucciones:
    // 1. Habilitar 2FA en tu cuenta Google
    // 2. Ir a: myaccount.google.com/apppasswords
    // 3. Seleccionar: Mail + Windows Computer
    // 4. Google generará una contraseña de 16 caracteres
    // 5. Copiar esa contraseña en 'pass' abajo

    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: 'tu-email@gmail.com',
      pass: 'tu-app-password-16-caracteres' // NO tu contraseña normal
    },

    // Configuración de envío
    from: 'tu-email@gmail.com',
    to: 'tu-email@gmail.com', // Donde recibir los backups
    subject: 'CD & Co - Backup automático',

    // Enviar backup cada X días (1 = diario, 7 = semanal)
    emailFrequencyDays: 7
  },

  // ══════════════════════════════════════════
  // OPCIONES GLOBALES
  // ══════════════════════════════════════════
  retention: {
    // Cuántos días mantener backups locales
    localDays: 30,

    // Mantener siempre los últimos X backups
    minBackups: 5
  }
};

/*
═══════════════════════════════════════════════════════════════
GUÍA PASO A PASO
═══════════════════════════════════════════════════════════════

🟦 GOOGLE DRIVE SETUP
─────────────────────

1. Ir a: https://console.cloud.google.com/
2. Crear nuevo proyecto:
   - Click en selector de proyecto (arriba)
   - "Nuevo proyecto"
   - Nombre: "CD Co Backups"
   - Crear

3. Habilitar Google Drive API:
   - Buscar "Google Drive API"
   - Click en resultado
   - Click "Habilitar"

4. Crear Service Account:
   - Ir a "Credenciales"
   - "Crear credenciales" → "Cuenta de servicio"
   - Nombre: "cd-co-backup-service"
   - Crear

5. Generar clave JSON:
   - En "Cuentas de servicio", click en la creada
   - Tab "Claves"
   - "Agregar clave" → "Nueva clave"
   - Tipo: JSON
   - "Crear" (descarga automáticamente)

6. Abrir JSON descargado y copiar:
   - "client_email" → serviceAccountEmail
   - "private_key" → privateKey (línea completa con -----BEGIN)
   - "project_id" → projectId

7. Crear carpeta en Drive:
   - drive.google.com
   - "Nuevo" → "Carpeta"
   - Nombre: "CD & Co Backups"
   - Clic derecho → "Compartir"
   - Agregar: (copiar email del service account)
   - Dar permisos: Editor
   - URL de carpeta: https://drive.google.com/drive/folders/[ID]
   - Copiar [ID] a folderId

🟦 EMAIL SETUP (Gmail)
──────────────────────

1. Activar 2FA:
   - myaccount.google.com
   - "Seguridad"
   - "Verificación de dos pasos"
   - Seguir instrucciones

2. Generar App Password:
   - myaccount.google.com
   - "Seguridad"
   - "Contraseñas de aplicación"
   - Dispositivo: Windows Computer
   - Aplicación: Mail
   - "Generar"
   - Copiar contraseña (16 caracteres sin espacios)
   - Pegar en 'pass'

3. Verificar en backup-config.js:
   - user: tu-email@gmail.com
   - pass: xxxxx xxxx xxxx xxxx (16 caracteres)

═══════════════════════════════════════════════════════════════
*/
