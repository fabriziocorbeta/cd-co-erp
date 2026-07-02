# Deploy en Google Compute Engine (VM)

Guía para desplegar FinancePY en la VM `alejandro-vm` (Ubuntu 22.04, us-central1-a).

## Arquitectura

```
Internet → Caddy (443, SSL automático) → web (Rails/Puma :3000)
                                       → worker (Sidekiq)
                                       → db (Postgres 16)
                                       → redis
                                       → backup (diario, 7d/4w/6m)
```

## Prerequisitos

- Docker + Compose en la VM (ya instalado)
- DNS: registro A `finance` → `34.170.196.91` en Cloudflare (proxy OFF)
- Firewall GCP: puertos 80 y 443 abiertos

## Firewall GCP

```bash
gcloud compute firewall-rules create allow-http-https \
  --allow tcp:80,tcp:443 \
  --target-tags=http-server,https-server

gcloud compute instances add-tags alejandro-vm \
  --tags=http-server,https-server --zone=us-central1-a
```

## Deploy

```bash
# 1. Clonar repo en la VM
git clone <URL_REPO> financespy && cd financespy

# 2. Configurar variables
cp .env.production.example .env
# Editar .env:
#   SECRET_KEY_BASE=$(openssl rand -hex 64)
#   POSTGRES_PASSWORD=$(openssl rand -hex 32)
#   ANTHROPIC_API_KEY=sk-ant-...

# 3. Levantar (primer build tarda ~10 min)
docker compose -f compose.prod.yml up -d --build

# 4. Verificar
docker compose -f compose.prod.yml ps
docker compose -f compose.prod.yml logs web --tail 50
```

La migración de DB corre automática en el entrypoint del contenedor.

## Primer acceso

1. Abrir `https://finance.cd-co.com.py`
2. Registrarse — el primer usuario es admin
3. `SELF_HOSTED=true` desactiva billing/suscripciones: uso gratuito ilimitado

## Operación

```bash
# Logs
docker compose -f compose.prod.yml logs -f web

# Actualizar app
git pull && docker compose -f compose.prod.yml up -d --build

# Consola Rails
docker compose -f compose.prod.yml exec web bin/rails console

# Backups (automáticos diarios en ./backups)
ls backups/
```

## Notas

- SSL: Caddy emite y renueva Let's Encrypt automático — cero config
- Responsive: UI adapta a móvil/tablet/desktop (Tailwind breakpoints)
- Parser AI de extractos: requiere `ANTHROPIC_API_KEY` en `.env`
- Cambio de dominio: editar `Caddyfile` + `APP_DOMAIN` en `.env`, `docker compose restart caddy web`
