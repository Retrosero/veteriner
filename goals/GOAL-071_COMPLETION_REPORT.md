# GOAL-071 — Klinik Satış Taslağı (Completion Report)

## Faz
FAZ-7 (Finans)

## Özet
Klinik satış taslağı (ClinicSale): muayene/reçete/tahlil/
görüntüleme/ameliyat/order için. State machine draft →
completed/cancelled. Faz 7 tahsilat (GOAL-072) entegrasyonu
(`paymentMethod` opsiyonel). Faz 7 iptal reversal
(GOAL-073) entegrasyonu.

## Çıktılar

### Core (GOAL-071 core commit `1e6bf50`)
- `apps/api/src/modules/clinic-sales/clinic-sales.controller.ts`
  — 6 endpoint.
- `apps/api/src/modules/clinic-sales/clinic-sales.service.ts`
  — state machine + line + Faz 7 entegrasyonu.
- `apps/api/src/modules/clinic-sales/clinic-sales.repository.ts`
  — tenant-scoped CRUD.
- `packages/contracts/src/clinic-sale.ts` — Zod şemaları.

### Endpoint'ler (6)

| # | Method | Path | Yetki |
|---|--------|------|-------|
| 1 | POST | `/api/v1/clinic/sales` | `clinic:payment:create` |
| 2 | GET | `/api/v1/clinic/sales` | `clinic:payment:read` |
| 3 | GET | `/api/v1/clinic/sales/{id}` | `clinic:payment:read` |
| 4 | PATCH | `/api/v1/clinic/sales/{id}` | `clinic:payment:create` |
| 5 | POST | `/api/v1/clinic/sales/{id}/complete` | `clinic:payment:create` |
| 6 | POST | `/api/v1/clinic/sales/{id}/cancel` | `clinic:payment:reverse` |

### Döküman (bu commit)
- 6 API doc.
- `docs/ai/AI_CHUNKS.yaml` — yeni `flow-clinic-sale` chunk
  v1.0.0; sourceType + Faz 7 entegrasyonu.

## İş Kuralları
- **State machine:** `draft` → `completed` | `cancelled`.
- **sourceType:** `examination` | `prescription` |
  `lab_test` | `imaging` | `surgery` | `order`. `sourceId`
  zorunlu.
- **Line item:** `productId` × `quantity` × `unitPrice` +
  opsiyonel `priceListItemId`.
- **Complete:** `paymentMethod` set edilirse atomik
  `Payment` oluşturulur.
- **Cancel:** `completed` ise `PaymentReversal`
  tetiklenir.
- **Stok etkisi:** otomatik düşüm YOK (ayrı akış
  GOAL-066); Faz 8 reaktif hook planı.

## Audit
- `audit:clinic_sale.{create,update,complete,cancel}`.
- Complete: `paymentId?` payload.
- Cancel: `paymentReversalIds[]` payload.

## Tenant İzolasyonu
- Tüm CRUD tenant-scoped; SUPERADMIN bypass'lı.

## Yapılmayanlar / Bilinçli Atlamalar
- **Tam iade (clinic-sale-returns)** → Faz 7+ genişletme.
- **Stok düşümü entegrasyonu (reaktif hook)** → Faz 8.
- **KDV/vergi** → Faz 7 country adapter.
- **Fatura/PDF çıktı** → Faz 8 React UI.

## Döküman Uyum
- `pnpm docs:check` → pre-existing hatalar. **GOAL-071 özgü
  hata yok.**

## Testler
- `clinic-sales.service.spec.ts` → unit testler (core).

## Sonraki Adımlar
- GOAL-072 (tahsilat) docs.
- GOAL-073 (tahsilat iptal) docs.

## Commit
- Core: `1e6bf50` — `GOAL-071 klinik satış taslağı core`
- Docs/i18n: (bu commit) — `docs(clinic-sales): GOAL-071
  klinik satış taslağı doküman ve i18n tamamla`
