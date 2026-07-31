# GOAL-065 — Petshop Satış İadesi (Completion Report)

## Faz
FAZ-6 (Klinik + petshop ortak stok/petshop)

## Özet
Petshop satış iadesi akışı: orijinal `petshop_sale` kaydına
bağlı iade taslağı → tamamlandı/iptal. Tamamlamada Faz 6
`StockMovement` (`type='return'`, `direction='in'`) atomik
üretilir; bakiye geri alınır. İade yöntemi (`refundMethod`):
nakit, karta, müşteri bakiyesi (Faz 7 entegrasyonu).

## Çıktılar

### Core (GOAL-065 core commit `503aa14`)
- `apps/api/src/modules/petshop-sale-returns/petshop-sale-returns.controller.ts`
  — 5 endpoint (POST, GET list, GET :id, POST complete, POST
  cancel).
- `apps/api/src/modules/petshop-sale-returns/petshop-sale-returns.service.ts`
  — state machine + line item + stok entegrasyonu.
- `apps/api/src/modules/petshop-sale-returns/petshop-sale-returns.repository.ts`
  — tenant-scoped CRUD.
- `apps/api/src/common/petshop-sale-returns/` — ortak tipler.
- `packages/contracts/src/petshop-sale-return.ts` — Zod
  şemaları.

### Endpoint'ler (5)

| # | Method | Path | Yetki |
|---|--------|------|-------|
| 1 | POST | `/api/v1/petshop/sales/returns` | `petshop:sale:refund` |
| 2 | GET | `/api/v1/petshop/sales/returns` | `petshop:sale:read` |
| 3 | GET | `/api/v1/petshop/sales/returns/{id}` | `petshop:sale:read` |
| 4 | POST | `/api/v1/petshop/sales/returns/{id}/complete` | `petshop:sale:refund` |
| 5 | POST | `/api/v1/petshop/sales/returns/{id}/cancel` | `petshop:sale:refund` |

### Döküman (bu commit)
- 5 API doc (create/list/get/complete/cancel).
- `docs/ai/AI_CHUNKS.yaml` — yeni `flow-petshop-sale-return`
  chunk v1.0.0.

## İş Kuralları
- **State machine:** `draft` → `completed` | `cancelled`.
- **Bağ:** `originalSaleId` zorunlu; iade yalnız `completed`
  petshop satışları için geçerli (iptal edilmiş satışlar
  iade edilemez).
- **Miktar:** her line `quantity` orijinal satılan miktarı
  aşamaz (VET-RETURN-0008).
- **Tamamlama:** her line için `StockMovement`
  (`type='return'`, `direction='in'`) atomik üretilir.
- **İptal:** `completed` ise her line için `reversal`
  hareketi (iade geri al).
- **Refund method:** `cash` (nakit) | `card` (karta) |
  `credit` (müşteri bakiyesi — GOAL-075). Faz 7
  PaymentReversal (GOAL-073) ile entegre.

## Audit
- `audit:petshop_sale_return.create` (info).
- `audit:petshop_sale_return.complete` (info);
  `totalRefund` + `newMovementIds[]` + `refundMethod` payload.
- `audit:petshop_sale_return.cancel` (warning);
  `reason` + `previousStatus` + reversal `newMovementIds[]`.

## Tenant İzolasyonu
- Tüm CRUD tenant-scoped; SUPERADMIN bypass'lı.
- Cross-tenant `originalSaleId` → 404.

## Yapılmayanlar / Bilinçli Atlamalar
- **Ödeme iadesi (PaymentReversal)** → Faz 7 GOAL-073.
- **Müşteri bakiyesi (`credit` refund)** → Faz 7
  GOAL-075 customer-balances.
- **Kısmi iade (toplam iade tutarı < satış tutarı)** →
  şu an satır bazlı; toplam kontrolü Faz 7+ policy.
- **İade nedeni kategorileri (preset list)** → sonraki
  refactor.
- **İade fişi/PDF** → Faz 8 React UI.

## Döküman Uyum
- `pnpm docs:check` → pre-existing hatalar. **GOAL-065 özgü
  hata yok.**

## Testler
- `petshop-sale-returns.service.spec.ts` → unit testler
  (core).

## Sonraki Adımlar
- GOAL-066 (klinik tüketimden otomatik stok düşümü) docs.
- GOAL-067 (stock-alerts) docs.
- FAZ-6 kapanış.

## Commit
- Core: `503aa14` — `GOAL-065 petshop satış iadesi core
  (partial)`
- Docs/i18n: (bu commit) — `docs(petshop-sale-returns):
  GOAL-065 petshop satış iadesi doküman ve i18n tamamla`
