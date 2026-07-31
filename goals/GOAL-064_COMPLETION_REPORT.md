# GOAL-064 — Petshop POS (Completion Report)

## Faz
FAZ-6 (Klinik + petshop ortak stok/petshop)

## Özet
Petshop POS akışı: taslak → tamamlandı/iptal. Line item (ürün ×
miktar × fiyat) ile atomik stok düşümü; complete ile Faz 6
`StockMovement` (`type='sale'`) tetiklenir. İptal edilen
`completed` satışlar için ters kayıt (stok iade) otomatik
üretilir.

## Çıktılar

### Core (GOAL-064 core commit `9c754e7`)
- `apps/api/src/modules/petshop-sales/petshop-sales.controller.ts`
  — 6 endpoint (POST, GET list, GET :id, PATCH, POST
  complete, POST cancel).
- `apps/api/src/modules/petshop-sales/petshop-sales.service.ts`
  — state machine + line item yönetimi + stok entegrasyonu.
- `apps/api/src/modules/petshop-sales/petshop-sales.repository.ts`
  — tenant-scoped CRUD + line replace.
- `apps/api/src/common/petshop-sales/petshop-sale.types.ts`
  — ortak tipler.
- `packages/contracts/src/petshop-sale.ts` — Zod şemaları:
  PetshopSale + Line + Create/Update/Cancel input + filters
  + list response.

### Endpoint'ler (6)

| # | Method | Path | Yetki |
|---|--------|------|-------|
| 1 | POST | `/api/v1/petshop/sales` | `petshop:sale:create` |
| 2 | GET | `/api/v1/petshop/sales` | `petshop:sale:read` |
| 3 | GET | `/api/v1/petshop/sales/{id}` | `petshop:sale:read` |
| 4 | PATCH | `/api/v1/petshop/sales/{id}` | `petshop:sale:create` |
| 5 | POST | `/api/v1/petshop/sales/{id}/complete` | `petshop:sale:create` |
| 6 | POST | `/api/v1/petshop/sales/{id}/cancel` | `petshop:sale:refund` |

### Döküman (bu commit)
- 6 API doc (create/list/get/update/complete/cancel).
- `docs/ai/AI_CHUNKS.yaml` — yeni `flow-petshop-sale` chunk
  v1.0.0.

## İş Kuralları
- **State machine:** `draft` → `completed` | `cancelled`.
- **Line item:** `productId` + `quantity` (Decimal) +
  `unitPrice` (Decimal) + opsiyonel `discount`. Toplam
  otomatik.
- **Tamamlama:** her line için `StockMovement`
  (`type='sale'`, `direction='out'`) atomik üretilir;
  yetersiz stok → 422 VET-SALE-0007.
- **İptal:** `draft` ise stok hareketi yok; `completed` ise
  her line için `reversal` hareketi (`type='reversal'`,
  `direction='in'`) atomik üretilir (stok iade).
- **Müşteri:** `ownerId` opsiyonel; owner yoksa "anonim
  müşteri" olarak işlenir.
- **Ödeme:** Faz 7'de tahsilat (GOAL-072) ile bağlanır;
  `paymentMethod` alanı opsiyonel (şu an sadece bilgi).

## Audit
- `audit:petshop_sale.create` (info).
- `audit:petshop_sale.update` (info).
- `audit:petshop_sale.complete` (info); `lineCount` +
  `totalAmount` + `newMovementIds[]` payload.
- `audit:petshop_sale.cancel` (warning); `reason` +
  `previousStatus` + reversal `newMovementIds[]` payload.

## Tenant İzolasyonu
- Tüm CRUD tenant-scoped; SUPERADMIN bypass'lı.
- Cross-tenant id → 404 (bilgi sızdırmaz).

## Entegrasyonlar
- **GOAL-063 (StockMovement):** complete + cancel/reversal
  atomik.
- **GOAL-072 (Payments):** Faz 7'de ödeme bağlantısı.
- **GOAL-065 (Petshop Sale Returns):** tam iade (müşteri
  ödeme iadesi) bu modülde değil; ayrı akış.

## Yapılmayanlar / Bilinçli Atlamalar
- **Tam iade (müşteri ödeme iadesi)** → GOAL-065
  petshop-sale-returns.
- **Çoklu ödeme (taksit)** → Faz 7 GOAL-072.
- **KDV/vergi detayı** → Faz 7 country adapter.
- **Termal/PDF fiş yazdırma** → Faz 8 React UI.
- **Sadakat/puan** → Faz 9+ (kapsam dışı pilot).
- **Toplu satış import** → ayrı goal (Faz 9+).

## Döküman Uyum
- `pnpm docs:check` → pre-existing hatalar (FAZ-7/8 partial
  docs). **GOAL-064 özgü hata yok.**

## Testler
- `petshop-sales.service.spec.ts` → unit testler (core).
- Tam API: pre-existing petshop-sales fail'leri (kapsam
  dışı, ayrı agent işi).

## Sonraki Adımlar
- GOAL-065 (petshop-sale-returns) docs.
- GOAL-066 (klinik tüketimden otomatik stok düşümü) docs.
- GOAL-067 (stock-alerts) docs.
- FAZ-6 kapanış + FAZ-7 (Finans) docs sırası.

## Commit
- Core: `9c754e7` — `GOAL-064 petshop POS core (partial)`
- Docs/i18n: (bu commit) — `docs(petshop-sales): GOAL-064
  petshop POS doküman ve i18n tamamla`
