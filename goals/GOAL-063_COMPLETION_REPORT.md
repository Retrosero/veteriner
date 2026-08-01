# GOAL-063 — Stok Hareketleri ve Sayım (Completion Report)

## Faz

FAZ-6 (Klinik + petshop ortak stok/petshop)

## Özet

Append-only stok hareketi ledger'ı ve atomik bakiye hesabı
tamamlandı. 9 hareket türü (purchase/sale/clinical_use/
vaccination/return/transfer/count_adjustment/waste/reversal).
Bakiye her sorguda ledger'dan hesaplanır; saklanmaz. Düzeltme
için `reversal` hareketi üretilir (fiziksel silme YOK).

## Çıktılar

### Core (GOAL-063 core commit `8d78c74`)

- `apps/api/src/modules/stock-movements/stock-movements.controller.ts`
  — 5 endpoint (POST, GET list, GET balances, GET :id, POST
  :id/reverse).
- `apps/api/src/modules/stock-movements/stock-movements.service.ts`
  — 9 tür + atomik bakiye + reversal idempotency.
- `apps/api/src/modules/stock-movements/stock-movements.repository.ts`
  — tenant-scoped ledger.
- `packages/contracts/src/stock-movement.ts` — Zod şemaları:
  StockMovement + Create/Reverse input + filters + balance
  list response.

### Endpoint'ler (5)

| #   | Method | Path                                             | Yetki                              |
| --- | ------ | ------------------------------------------------ | ---------------------------------- |
| 1   | POST   | `/api/v1/inventory/stock-movements`              | `inventory:stock_movement:create`  |
| 2   | GET    | `/api/v1/inventory/stock-movements`              | `inventory:stock_movement:read`    |
| 3   | GET    | `/api/v1/inventory/stock-movements/balances`     | `inventory:stock_movement:read`    |
| 4   | GET    | `/api/v1/inventory/stock-movements/{id}`         | `inventory:stock_movement:read`    |
| 5   | POST   | `/api/v1/inventory/stock-movements/{id}/reverse` | `inventory:stock_movement:reverse` |

### Döküman (bu commit)

- 5 API doc (create/list/balances/get/reverse).
- `docs/ai/AI_CHUNKS.yaml` — yeni `flow-stock-movement` chunk
  v1.0.0; 9 tür, atomik bakiye, reversal idempotency, lot/
  ürün tutarlılığı kontrolü özetlenir.

## İş Kuralları

- **9 hareket türü:** `purchase` | `sale` | `clinical_use`
  | `vaccination` | `return` | `transfer` |
  `count_adjustment` | `waste` | `reversal`.
- **Append-only:** hareket fiziksel silinmez; düzeltme için
  `reversal` hareketi üretilir.
- **Atomik bakiye:** her sorguda ledger'dan `Σ in - Σ out`.
  Saklanmaz.
- **`direction`:** `in` (giriş) | `out` (çıkış). `quantity`
  (Decimal, >0) zorunlu.
- **`reason` zorunlu:** `transfer` ve `count_adjustment`
  (VET-STOCK-0007).
- **`sourceType`/`sourceId` zorunlu:** `type='system'`
  (VET-STOCK-0012).
- **Service ürün:** `kind='service'` ürünler için stok
  hareketi oluşturulamaz (VET-STOCK-0008).
- **Arşivlenmiş:** ürün/lot arşivliyse hareket oluşturulamaz
  (VET-STOCK-0006/0009).
- **Lot-ürün eşleşme:** `lotId` set edilmişse lot'un
  `productId`'si ile eşleşmeli (VET-STOCK-0011).
- **Reversal idempotency:** zaten ters kaydı olan hareket →
  409 VET-STOCK-0010.
- **Negatif bakiye:** default kontrol YOK; Faz 7+'da
  policy.

## Audit

- `audit:stock_movement.create` (info).
- `audit:stock_movement.reverse` (warning) —
  `reversedMovementId` + `newMovementId` + `reason` payload.

## Tenant İzolasyonu

- Tüm CRUD tenant-scoped; bakiye sorgusu tenant-scoped.
- Cross-tenant id → 404. SUPERADMIN bypass'lı.

## Entegrasyonlar

- **GOAL-062 (PO):** `receive` ile `type='purchase'`
  hareketi otomatik üretilir.
- **GOAL-064 (Petshop POS):** satış ile `type='sale'`.
- **GOAL-065 (İade):** `type='return'`.
- **GOAL-066 (Klinik tüketim):** `type='clinical_use'`
  veya `type='vaccination'`.
- **GOAL-067 (Uyarılar):** düşük stok / SKT yaklaşan
  için bu ledger'ı sorgular.

## Yapılmayanlar / Bilinçli Atlamalar

- **Negatif bakiye engeli** → Faz 7+ policy.
- **Çoklu depo/raf bazlı bakiye** → Faz 7+'da
  (şu an `productId × lotId` düzeyinde).
- **Stok değerleme (FIFO/LIFO/Average)** → Faz 9+
  finansal raporlar.
- **DB migration (Prisma)** → sonraya.
- **Otomatik alert üretimi (düşük stok, SKT)** →
  GOAL-067.

## Döküman Uyum

- `pnpm docs:check` → pre-existing hatalar. **GOAL-063 özgü
  hata yok.**

## Testler

- `stock-movements.service.spec.ts` → unit testler (core).

## Sonraki Adımlar

- GOAL-064 (petshop POS) docs.
- GOAL-065 (iade) docs.
- GOAL-066 (otomatik klinik tüketim düşümü) docs.
- GOAL-067 (düşük stok + SKT uyarıları) docs.

## Commit

- Core: `8d78c74` — `GOAL-063 stok hareketleri ve sayım core`
- Docs/i18n: (bu commit) — `docs(stock-movements): GOAL-063
stok hareketleri ve sayım doküman ve i18n tamamla`
