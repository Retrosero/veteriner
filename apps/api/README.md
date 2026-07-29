# VetNiva API

NestJS 10 + Prisma + OpenAPI. Çok kiracılı veteriner klinik + petshop
SaaS'in backend katmanı.

## Hızlı başlangıç

```bash
# Root'tan bir kez
pnpm install
cp .env.example .env
pnpm docker:up

# Bu paket
pnpm --filter @vetniva/api db:generate
pnpm --filter @vetniva/api dev
```

## Komutlar

- `pnpm dev` — NestJS watch modunda
- `pnpm build` — `dist/` üretir
- `pnpm test` — unit + integration (vitest)
- `pnpm e2e:smoke` — e2e smoke testi
- `pnpm lint` / `pnpm type-check`
- `pnpm db:generate` / `pnpm db:migrate`

## Endpoint'ler (GOAL-000)

- `GET /api/v1/health` — liveness
- `GET /api/v1/health/ready` — readiness (DB bağlantısı)
- `GET /api/docs` — Swagger UI
- `GET /api/docs-json` — OpenAPI JSON

## Mimari

- `src/main.ts` — bootstrap, helmet, CORS, swagger, global filter
- `src/app.module.ts` — kök modül
- `src/env.ts` — zod ile env doğrulama
- `src/common/` — filter, interceptor, pipe, error sınıfları
- `src/modules/health/` — sağlık kontrolü
- `src/prisma/` — PrismaService (global)
- `test/` — e2e smoke

## Tenant izolasyonu

GOAL-001 ile birlikte:

- `tenant_id` her tablo
- PostgreSQL Row Level Security
- Tenant context middleware
- Cross-tenant IDOR testleri

## Tenant bağlamı henüz YOK

Bu aşamada tek bir global API çalışır; tenant ayrımı yapılmaz.
Faz 1 ile birlikte devreye girer.
