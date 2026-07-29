# Sürüm Notu (Changelog)

Tüm önemli değişiklikler bu dosyada belgelenir. Format
[Keep a Changelog](https://keepachangelog.com/) standardına uygundur.

## [Unreleased] — GOAL-000

### Eklenen

- pnpm + Turborepo monorepo iskeleti
- `apps/api` (NestJS 10) iskeleti: sağlık endpoint'leri, OpenAPI, Prisma
- `apps/web` (Next.js 14) iskeleti: i18n routing, sağlık sayfası
- `apps/worker` (BullMQ) iskeleti: örnek health job
- `packages/contracts` (Zod şemaları): health, error, locale
- `packages/i18n` (i18next): tr-TR + en-GB kaynakları
- `packages/ui` (Tailwind + shadcn benzeri primitives): Button, Card, Input
- `packages/config`: ortak tsconfig / eslint / prettier / tailwind presetleri
- `tools/docs-check`: doküman-kod uyum denetleyicisi (route, error code, permission)
- `tools/i18n-check`: i18n anahtar parity denetleyicisi
- Docker Compose: postgres 15, redis 7, mailhog
- GitHub Actions CI: install, lint, type-check, test, build, docs-check, e2e smoke
- Türkçe dosya açıklama standardı
- Hata kataloğu, yetki matrisi, alan sözlüğü, AI bilgi havuzu iskeleti

### Kapsam dışı (Faz 1+)

- Tenant ve şube yönetimi (GOAL-001)
- Oturum ve yetkilendirme (GOAL-001)
- Tenant izolasyonu RLS (GOAL-001)
- Gerçek audit log (GOAL-001)
- Hasta sahibi ve hayvan (GOAL-002)
- Aşı kaydı ve stok düşümü (GOAL-003)
- Sentry/Otel (Faz 10)
- e-SMM, ödeme, SMS (Faz 13+)
