# CD & Co — ERP Financiero

App web de gestión financiera y empresarial para CD & Co Paraguay.

## Inicio rápido

```bash
# Opción 1: abrir directo
open index.html

# Opción 2: servidor local (recomendado para PWA)
npx serve .
# o
python3 -m http.server 8080
```

## Configuración

Editar `js/config.js` y reemplazar:
- `TU_SUPABASE_URL_AQUI` → URL de tu proyecto Supabase
- `TU_SUPABASE_ANON_KEY_AQUI` → Anon key de Supabase
- `TU_LINK_PRO` / `TU_LINK_BUSINESS` → Payment Links de Stripe

Ver `CLAUDE.md` para documentación completa del proyecto.

## Deploy

```bash
npx vercel --prod
```
