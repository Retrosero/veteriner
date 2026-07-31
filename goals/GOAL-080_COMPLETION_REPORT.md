# GOAL-080 — Ameliyat Planlama (Completion Report)

## Faz
FAZ-8 (Klinik operasyonlar)

## Özet
Ameliyat planlama akışı. State: planned → in_progress →
completed/cancelled. Onam (GOAL-081), anestezi (GOAL-082),
operasyon notu (GOAL-083) entegre.

## Çıktılar

### Core (GOAL-080 core commit `6596ae0`)
- `apps/api/src/modules/surgery-plans/surgery-plans.controller.ts`
  — 7 endpoint.
- `apps/api/src/modules/surgery-plans/surgery-plans.service.ts`
  — state machine.
- `apps/api/src/modules/surgery-plans/surgery-plans.repository.ts`
  — tenant-scoped CRUD.
- `packages/contracts/src/surgery-plan.ts` — Zod şemaları.

### Endpoint'ler (7)

| # | Method | Path | Yetki |
|---|--------|------|-------|
| 1 | POST | `/api/v1/clinic/surgery-plans` | `clinic:surgery:create` |
| 2 | GET | `/api/v1/clinic/surgery-plans` | `clinic:surgery:read` |
| 3 | GET | `/api/v1/clinic/surgery-plans/{id}` | `clinic:surgery:read` |
| 4 | PATCH | `/api/v1/clinic/surgery-plans/{id}` | `clinic:surgery:create` |
| 5 | POST | `/api/v1/clinic/surgery-plans/{id}/start` | `clinic:surgery:start` |
| 6 | POST | `/api/v1/clinic/surgery-plans/{id}/complete` | `clinic:surgery:complete` |
| 7 | POST | `/api/v1/clinic/surgery-plans/{id}/cancel` | `clinic:surgery:cancel` |

### Döküman (bu commit)
- 7 API doc.
- `docs/ai/AI_CHUNKS.yaml` — yeni `flow-surgery-plan` chunk
  v1.0.0.

## İş Kuralları
- **State machine:** planned → in_progress → completed |
  cancelled.
- **Onam zorunlu:** start'tan önce `consent` (GOAL-081)
  imzalanmış olmalı.
- **Anesthesia type:** local | regional | general |
  sedation.
- **Complete:** outcome + complications + followUpNotes.
- **Cancel:** reason zorunlu; in_progress'ten cancel
  anestezi/operasyon notu acil kapatma tetikler.

## Audit
- `audit:surgery_plan.{create,update,start,complete,
  cancel}` (info/warning).

## Tenant İzolasyonu
- Tüm CRUD tenant-scoped; SUPERADMIN bypass'lı.

## Yapılmayanlar / Bilinçli Atlamalar
- **Randevu ↔ ameliyat bağlama** → ayrı refactor.
- **Pre-op checklist** → Faz 8+ UI.

## Döküman Uyum
- `pnpm docs:check` → pre-existing hatalar. **GOAL-080 özgü
  hata yok.**

## Testler
- `surgery-plans.service.spec.ts` → unit testler (core).

## Sonraki Adımlar
- GOAL-081 (onam formları) docs.
- GOAL-082 (anestezi takibi) docs.

## Commit
- Core: `6596ae0` — `GOAL-080 ameliyat planlama core`
- Docs/i18n: (bu commit) — `docs(surgery-plans): GOAL-080
  ameliyat planlama doküman ve i18n tamamla`
