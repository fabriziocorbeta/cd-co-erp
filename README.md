# FinancePY

ERP financiero para PyMEs paraguayas — fork privado de [Sure](https://github.com/we-promise/sure) (Rails), adaptado y comercializado bajo el nombre **FinancePY**. No es un fork de código abierto: uso interno / producto propio de CD & Co.

## Stack

- Ruby 3.4.7, Rails 7.2.2
- PostgreSQL (Supabase, schema `financespy`, session pooler)
- Redis 5.4+ (Sidekiq)
- Docker Compose en producción (Caddy + web + worker + Redis), VM propia
- CI: GitHub Actions (lint, tests, brakeman, pipelock)

## Desarrollo local

```sh
git clone <repo-url>
cd cd-co-erp
cp .env.local.example .env.local   # editar valores
bin/setup
bin/dev
```

Visitar http://localhost:3000. Requiere PostgreSQL >9.3 y Redis >5.4 corriendo localmente, o apuntar `.env.local` a instancias remotas (p. ej. una rama de dev en Supabase).

Datos demo opcionales: `rake demo_data:default`.

## Tests

```sh
bin/rails test
bin/rubocop
bin/brakeman
```

`config/environments/test.rb` fuerza `default_locale = :en` — la suite heredada de Sure fue escrita en inglés; producción sigue en `:es` (`config/application.rb`).

## Producción

Deploy vía Docker Compose en una VM (actualmente GCP, evaluando migración — ver `docs/hosting/`). DB en Supabase (datos críticos viven ahí, la VM es descartable).

```sh
cp .env.production.example .env   # editar valores
docker compose -f compose.prod.yml up -d --build
```

Variables clave: `SECRET_KEY_BASE`, `DATABASE_URL` (Supabase session pooler), `SELF_HOSTED=true`, `APP_DOMAIN`, `CORS_ALLOWED_ORIGINS`, `CSP_REPORT_ONLY` (flip a `false` una vez validados los reportes de violación), `ONBOARDING_STATE` (setear a `invite_only` o `closed` — sin esta variable el registro queda abierto por defecto).

Guías específicas en `docs/hosting/`: `docker.md`, `gcp-vm.md`, `hetzner.md`, `plaid.md`, `oidc.md`.

## Notas de seguridad

- CORS restringido a allowlist (`CORS_ALLOWED_ORIGINS`), no wildcard.
- Rate limiting vía `rack-attack` en login, OAuth token, admin, API.
- CSP en report-only por defecto — activar enforce solo tras revisar violaciones.
- RLS activo en Supabase (`financespy` schema, 110 tablas) — Rails conecta como owner y lo bypassea; la RLS mitiga acceso directo no autorizado a la DB, no reemplaza la autorización de la app.

## Naming

Nunca referirse a este producto como "Sure" en documentación, commits o comunicación externa — es un producto propio a comercializar, no el fork open-source.
