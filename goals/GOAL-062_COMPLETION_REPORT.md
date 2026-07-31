# GOAL-062 — Tedarikçi ve Satın Alma (Completion Report)

## Faz
FAZ-6 (Klinik + petshop ortak stok/petshop)

## Özet
Tedarikçi kataloğu (3 tür: clinic/petshop/general) ve satın
alma siparişi (5 durum: draft/approved/partial/received/
cancelled) tamamlandı. PO kabul edildiğinde Faz 6
StockMovement (GOAL-063) ile bakiye atomik artırılır ve lot/
SKT bilgisi bağlanır.

## Çıktılar

### Core (GOAL-062 core commit `770dec0`)
- `apps/api/src/modules/suppliers/suppliers.controller.ts` —
  5 endpoint (POST/GET list/GET :id/PATCH/POST archive).
- `apps/api/src/modules/suppliers/suppliers.service.ts` —
  iş kuralları (code unique, soft delete).
- `apps/api/src/modules/suppliers/suppliers.repository.ts`
  — tenant-scoped CRUD.
- `apps/api/src/common/suppliers/supplier.types.ts` — ortak
  tipler.
- `packages/contracts/src/supplier.ts` — Zod şemaları:
  Supplier + Create/Update/Archive input + filters +
  list response.
- `apps/api/src/modules/purchase-orders/purchase-orders.controller.ts`
  — 7 endpoint (POST/GET list/GET :id/PATCH/POST
  approve/receive/cancel).
- `apps/api/src/modules/purchase-orders/purchase-orders.service.ts`
  — state machine (draft → approved → partial | received |
  cancelled) + stock movement entegrasyonu.
- `apps/api/src/modules/purchase-orders/purchase-orders.repository.ts`
  — tenant-scoped CRUD + line replace.
- `apps/api/src/common/purchase-orders/purchase-order.types.ts`
  — ortak tipler.
- `packages/contracts/src/purchase-order.ts` — Zod şemaları:
  PurchaseOrder + Line + Create/Update/Receive/Cancel input +
  filters + list response.

### Endpoint'ler (12)

| # | Method | Path | Yetki |
|---|--------|------|-------|
| 1 | POST | `/api/v1/catalog/suppliers` | `catalog:supplier:create` |
| 2 | GET | `/api/v1/catalog/suppliers` | `catalog:supplier:read` |
| 3 | GET | `/api/v1/catalog/suppliers/{id}` | `catalog:supplier:read` |
| 4 | PATCH | `/api/v1/catalog/suppliers/{id}` | `catalog:supplier:update` |
| 5 | POST | `/api/v1/catalog/suppliers/{id}/archive` | `catalog:supplier:archive` |
| 6 | POST | `/api/v1/inventory/purchase-orders` | `inventory:purchase_order:create` |
| 7 | GET | `/api/v1/inventory/purchase-orders` | `inventory:purchase_order:read` |
| 8 | GET | `/api/v1/inventory/purchase-orders/{id}` | `inventory:purchase_order:read` |
| 9 | PATCH | `/api/v1/inventory/purchase-orders/{id}` | `inventory:purchase_order:update` |
| 10 | POST | `/api/v1/inventory/purchase-orders/{id}/approve` | `inventory:purchase_order:approve` |
| 11 | POST | `/api/v1/inventory/purchase-orders/{id}/receive` | `inventory:purchase_order:receive` |
| 12 | POST | `/api/v1/inventory/purchase-orders/{id}/cancel` | `inventory:purchase_order:cancel` |

### Döküman (bu commit)
- 7 API doc (PO controller: create/list/get/update/approve/
  receive/cancel).
- 5 supplier doc başka bir pencerede daha önce yazılmıştı;
  bu commit'te yeniden yazıldı (içerik tutarlı, üzerine
  yazma).
- `docs/ai/AI_CHUNKS.yaml` — 2 yeni chunk: `flow-supplier` +
  `flow-purchase-order`.

## İş Kuralları
- **Supplier type:** `clinic` | `petshop` | `general`. `code`
  tenant-içi benzersiz.
- **PO state machine:**
  - `draft` (oluştur) → `approved` (onayla) → `partial`
    (kısmi kabul) veya `received` (tam kabul).
  - `draft`/`approved`/`partial` → `cancelled` (iptal).
  - `received` veya zaten `cancelled` → iptal edilemez
    (409 VET-PURCHASE_ORDER-0008).
- **Decimal:** tüm tutarlar string (regex
  `^\d+(\.\d{1,4})?$`).
- **Toplam hesabı:** otomatik `Σ(quantity × unitPrice)`.
  Geçersiz → 422 VET-PURCHASE_ORDER-0007.
- **Kabul:** `receivedQuantity` ≤ sipariş miktarı
  (422 VET-PURCHASE_ORDER-0007).
- **Stok entegrasyonu:** `receive` ile Faz 6 StockMovement
  (GOAL-063) `type='purchase'` hareketi üretilir; lot
  referansı set edilirse SKT/raf takibi bağlanır.
- **İptal sonrası:** ters kayıt otomatik üretilmez; manuel
  StockMovement `type='reversal'` ile düzeltilir.

## Audit
- `audit:supplier.{create,update,archive}`.
- `audit:purchase_order.{create,update,approve,receive,
  cancel}`.
- Update/receive'de before+after; receive'de
  `newMovementIds[]` payload'a eklenir.

## Tenant İzolasyonu
- Tüm CRUD tenant-scoped; `code` unique tenant-içi.
- Cross-tenant id → 404. SUPERADMIN bypass'lı.

## Yapılmayanlar / Bilinçli Atlamalar
- **Stok bakiyesi hesaplama** → GOAL-063 (StockMovement
  atomik bakiye).
- **PO iptal otomatik ters kayıt** → sonraki refactor; şu an
  manuel StockMovement.
- **E-Fatura/e-İrsaliye entegrasyonu** → Faz 13+
  (e-SMM adapter zaten Faz 7'de var).
- **PO export (PDF/CSV)** → sonraki refactor.
- **Çoklu tedarikçi PO birleştirme** → ayrı goal (Faz 9+).

## Döküman Uyum
- `pnpm docs:check` → pre-existing hatalar (FAZ-7/8 partial
  docs). **GOAL-062 özgü hata yok.**

## Testler
- `suppliers.service.spec.ts` → 19 test (core).
- `purchase-orders.service.spec.ts` → 20 test (core).
- Toplam: 39 yeni test + 722/722 api testi geçti.

## Sonraki Adımlar
- GOAL-063 (stok hareketleri + atomik bakiye) docs.
- GOAL-064+ (petshop POS, iade, otomatik düşüm, uyarılar).

## Commit
- Core: `770dec0` — `GOAL-062 tedarikçi ve satın alma core`
- Docs/i18n: (bu commit) — `docs(suppliers,purchase-orders):
  GOAL-062 tedarikçi + satın alma doküman ve i18n tamamla`
