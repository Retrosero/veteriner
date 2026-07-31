# GOAL-084 — Yatış ve Kafes Yönetimi (Completion Report)

## Faz
FAZ-8 (Klinik operasyonlar)

## Özet
Yatış (Hospitalization) + Kafes (Cage) + CageAssignment
yönetimi. State: planned → admitted → discharged |
cancelled. 5 kafes türü (standard/isolation/intensive_care/
recovery/quarantine). Taburcu özeti (GOAL-086) entegre.

## Çıktılar

### Core (GOAL-084 core commit `f3ae31f`)
- `apps/api/src/modules/hospitalization/hospitalization.controller.ts`
  — 13 endpoint (cages × 4 + hospitalizations × 9).
- `apps/api/src/modules/hospitalization/hospitalization.service.ts`
  — state machine + kafes atama.
- `apps/api/src/modules/hospitalization/hospitalization.repository.ts`
  — tenant-scoped CRUD.
- `packages/contracts/src/hospitalization.ts` — Zod şemaları.

### Endpoint'ler (13)

| # | Method | Path | Yetki |
|---|--------|------|-------|
| 1 | POST | `/api/v1/clinic/cages` | `clinic:hospitalization:admit` |
| 2 | GET | `/api/v1/clinic/cages` | `clinic:hospitalization:read` |
| 3 | GET | `/api/v1/clinic/cages/{id}` | `clinic:hospitalization:read` |
| 4 | PATCH | `/api/v1/clinic/cages/{id}` | `clinic:hospitalization:admit` |
| 5 | POST | `/api/v1/clinic/hospitalizations` | `clinic:hospitalization:admit` |
| 6 | GET | `/api/v1/clinic/hospitalizations` | `clinic:hospitalization:read` |
| 7 | GET | `/api/v1/clinic/hospitalizations/{id}` | `clinic:hospitalization:read` |
| 8 | PATCH | `/api/v1/clinic/hospitalizations/{id}` | `clinic:hospitalization:admit` |
| 9 | POST | `/api/v1/clinic/hospitalizations/{id}/admit` | `clinic:hospitalization:admit` |
| 10 | POST | `/api/v1/clinic/hospitalizations/{id}/discharge` | `clinic:hospitalization:discharge` |
| 11 | POST | `/api/v1/clinic/hospitalizations/{id}/cancel` | `clinic:hospitalization:admit` |
| 12 | POST | `/api/v1/clinic/hospitalizations/{id}/cage-assignments` | `clinic:hospitalization:admit` |
| 13 | POST | `/api/v1/clinic/hospitalizations/cage-assignments/{assignmentId}/end` | `clinic:hospitalization:admit` |

### Döküman (bu commit)
- 13 API doc.
- `docs/ai/AI_CHUNKS.yaml` — yeni `flow-hospitalization`
  chunk v1.0.0.

## İş Kuralları
- **Cage types:** standard | isolation | intensive_care |
  recovery | quarantine.
- **State machine:** planned → admitted → discharged |
  cancelled.
- **Admit:** kafes atanır; dolu kafes → 409.
- **CageAssignment:** aynı anda 1 aktif.
- **Cancel:** `admitted` için `force=true` zorunlu.
- **Stok entegrasyonu:** yatış order (GOAL-085) ile
  `clinical_usage` `type='hospitalization'`.

## Audit
- `audit:cage.{create,update}` (info).
- `audit:cage_assignment.{create,end}` (info).
- `audit:hospitalization.{create,update,admit,discharge,
  cancel}` (info/warning).

## Tenant İzolasyonu
- Tüm CRUD tenant-scoped; SUPERADMIN bypass'lı.

## Yapılmayanlar / Bilinçli Atlamalar
- **Kafes rezervasyonu (gelecek tarih)** → Faz 9+.
- **QR ile kafes tanıma** → ayrı goal.

## Döküman Uyum
- `pnpm docs:check` → pre-existing hatalar. **GOAL-084 özgü
  hata yok.**

## Testler
- `hospitalization.service.spec.ts` → unit testler (core).

## Sonraki Adımlar
- GOAL-085 (yatış order) docs.
- GOAL-086 (gözlem/taburcu) docs.

## Commit
- Core: `f3ae31f` — `GOAL-084 yatış ve kafes yönetimi core`
- Docs/i18n: (bu commit) — `docs(hospitalization): GOAL-084
  yatış ve kafes doküman ve i18n tamamla`
