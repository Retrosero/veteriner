# GOAL-085 — Yatış Order ve Uygulama Kayıtları (Completion Report)

## Faz
FAZ-8 (Klinik operasyonlar)

## Özet
Yatış order + schedule yönetimi. 6 type (medication/
fluid_therapy/feeding/monitoring/procedure/other).
Schedule apply/skip ile uygulama takibi. Faz 8 reaktif
hook ile stok düşümü.

## Çıktılar

### Core (GOAL-085 core commit `a72f2f8`)
- `apps/api/src/modules/hospitalization-orders/hospitalization-orders.controller.ts` — 8
  endpoint.
- `apps/api/src/modules/hospitalization-orders/hospitalization-orders.service.ts`
  — order + schedule state machine.
- `apps/api/src/modules/hospitalization-orders/hospitalization-orders.repository.ts`
  — tenant-scoped CRUD.
- `packages/contracts/src/hospitalization-order.ts` — Zod şemaları.

### Endpoint'ler (8)

| # | Method | Path | Yetki |
|---|--------|------|-------|
| 1 | POST | `/api/v1/clinic/hospitalization-orders` | `clinic:hospitalization:add_note` |
| 2 | GET | `/api/v1/clinic/hospitalization-orders` | `clinic:hospitalization:read` |
| 3 | GET | `/api/v1/clinic/hospitalization-orders/{id}` | `clinic:hospitalization:read` |
| 4 | PATCH | `/api/v1/clinic/hospitalization-orders/{id}` | `clinic:hospitalization:add_note` |
| 5 | POST | `/api/v1/clinic/hospitalization-orders/{id}/cancel` | `clinic:hospitalization:admit` |
| 6 | POST | `/api/v1/clinic/hospitalization-orders/{id}/schedules` | `clinic:hospitalization:add_note` |
| 7 | GET | `/api/v1/clinic/hospitalization-orders/schedules` | `clinic:hospitalization:read` |
| 8 | POST | `/api/v1/clinic/hospitalization-orders/schedules/{scheduleId}/apply` | `clinic:hospitalization:add_note` |
| 9 | POST | `/api/v1/clinic/hospitalization-orders/schedules/{scheduleId}/skip` | `clinic:hospitalization:add_note` |

### Döküman (bu commit)
- 9 API doc (8 unique endpoint + 1 shared schedules list).
- `docs/ai/AI_CHUNKS.yaml` — yeni `flow-hospitalization-order`
  chunk v1.0.0.

## İş Kuralları
- **Order type:** medication | fluid_therapy | feeding |
  monitoring | procedure | other.
- **State machine (order):** active → completed | cancelled.
- **State machine (schedule):** pending → applied | skipped.
- **Apply:** appliedAt + appliedBy + actualDose set.
- **Skip:** skipReason (6 enum) zorunlu.
- **Cancel:** pending schedule'lar skipped flag'lenir.
- **Stok entegrasyonu:** Faz 8 reaktif hook ile medication
  apply → `clinical_usage` `type='hospitalization'`.

## Audit
- `audit:hospitalization_order.{create,update,cancel,
  schedule.add,schedule.apply,schedule.skip}` (info).

## Tenant İzolasyonu
- Tüm CRUD tenant-scoped; SUPERADMIN bypass'lı.

## Yapılmayanlar / Bilinçli Atlamalar
- **MAR (medication administration record) UI** → Faz 8+
  React.
- **Push notification (saat geldiğinde)** → Faz 10 BullMQ.

## Döküman Uyum
- `pnpm docs:check` → pre-existing hatalar. **GOAL-085 özgü
  hata yok.**

## Testler
- `hospitalization-orders.service.spec.ts` → unit testler
  (core).

## Sonraki Adımlar
- GOAL-086 (gözlem/taburcu özeti) docs.
- FAZ-8 kapanışı.

## Commit
- Core: `a72f2f8` — `GOAL-085 yatış order ve uygulama
  kayıtları core (partial)`
- Docs/i18n: (bu commit) — `docs(hospitalization-orders):
  GOAL-085 yatış order doküman ve i18n tamamla`
