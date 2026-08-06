# VetNiva Production Operations

Pilot: `https://vetniva.appsgo.cloud/` (Coolify + Hostinger KVM 4)
Production: Hetzner Cloud CCX13 (planlanan, FAZ-12+)

## Hızlı Başlangıç

1. **Pilot Smoke Test** — `docs/operations/PILOT_SMOKE_TEST_PLAN.md`
2. **Production Release** — `docs/operations/PRODUCTION_RELEASE.md`
3. **Coolify Deploy** — `docs/operations/COOLIFY_DEPLOY_RUNBOOK.md`
4. **Backup/Restore** — `docs/operations/BACKUP_RESTORE.md`

## CI Gates (şu an 4/4 yeşil)

- `pnpm lint` — 0 hata
- `pnpm type-check` — 0 hata
- `pnpm i18n:check` — tr-TR/en-GB parity
- `pnpm docs:check` — 0 hata (route/permission/error code)
- `pnpm test` — 295+ test (DB olmadan)
