# ⚡ Despliegue Vercel — Inicio Rápido

> 5 minutos para poner tu ERP en vivo con dominio seguro

---

## **1️⃣ Instalar Vercel CLI**

```bash
npm install -g vercel
vercel login  # ← Se abrirá el navegador
```

---

## **2️⃣ Desplegar (primera vez)**

```bash
cd "/Users/Fabrizio/Library/CloudStorage/GoogleDrive-fabriziocorbeta@gmail.com/Mi unidad/03 Emprendimientos/02  Sistema/01 - cdco"
vercel --prod

# Responde las preguntas del CLI (todo por defecto está OK)
```

✅ **Vercel te dará una URL:** `https://cd-co-erp-xxxxx.vercel.app`

---

## **3️⃣ Configurar variables de entorno**

1. Abre: **https://vercel.com/dashboard**
2. Selecciona tu proyecto `cd-co-erp`
3. **Settings → Environment Variables**
4. Agrega estas variables (scope: **Production**):

```
SUPABASE_URL = https://beumpltrjgnehqbhtrxo.supabase.co
SUPABASE_ANON_KEY = sb_publishable__dabJ1ghmLg-pyLbJAPbYg_1_yyk7As
ANTHROPIC_KEY = (si lo tienes)
STRIPE_PRO = (si lo tienes)
```

---

## **4️⃣ Redeployar con variables activas**

```bash
vercel --prod
```

✅ **Listo.** Tu ERP está en vivo con variables seguras.

---

## **5️⃣ Dominio personalizado (opcional)**

**Vercel Dashboard → Settings → Domains → Add Domain**

Escribe: `erp.cd-co.com.py` (o tu dominio)

Vercel te mostrará qué cambiar en tu registrador de DNS.

---

## **📱 Acceso desde celular**

1. Abre tu URL en el celular
2. Toca "Instalar" (PWA)
3. ¡Icono en pantalla de inicio!
4. Funciona offline

---

## **🔄 Redeploys futuros**

```bash
cd "/Users/Fabrizio/Library/CloudStorage/GoogleDrive-fabriziocorbeta@gmail.com/Mi unidad/03 Emprendimientos/02  Sistema/01 - cdco"
vercel --prod
```

O desde Vercel Dashboard: **Deployments → Redeploy**

---

## **📖 Guía completa**

Ver: `VERCEL_DEPLOYMENT.md` en este mismo directorio

---

**¡Listo! Tu ERP está en la web. 🚀**
