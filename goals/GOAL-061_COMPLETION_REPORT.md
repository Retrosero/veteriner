# GOAL-061 — Depo, Raf, Lot ve SKT (Completion Report)

## Faz

FAZ-6 (Klinik + petshop ortak stok/petshop)

## Özet

Tenant-scoped lokasyon hiyerarşisi (Warehouse → Shelf → Lot)
ile birlikte stok partilerinin ve son kullanma tarihi (SKT)
yönetimi tamamlandı. Stok miktarı bu tablolarda TUTULMAZ;
hareketler GOAL-063 (StockMovement) ile hesaplanır. Bu goal
yalnızca lokasyon + partilerin tanımını ve soft-delete yaşam
döngüsünü kurar.

## Çıktılar

### Core (GOAL-061 core commit `a10baf7`)

- `apps/api/src/modules/inventory/inventory.controller.ts` —
  15 endpoint (5 warehouse + 5 shelf + 5 lot).
- `apps/api/src/modules/inventory/inventory.service.ts` —
  iş kuralları (unique code, arşiv guard, soft delete, FK
  kırılmaz).
- `apps/api/src/modules/inventory/inventory.repository.ts`
  — tenant-scoped CRUD.
- `apps/api/src/modules/inventory/inventory.types.ts` —
  yardımcı tipler.
- `apps/api/src/common/inventory/` — ortak tipler.
- `packages/contracts/src/inventory.ts` — Zod şemaları:
  Warehouse/Shelf/StockLot + Create/Update/Archive input +
  filters + list response.

### Endpoint'ler (15)

| #   | Method | Path                                        | Yetki                         |
| --- | ------ | ------------------------------------------- | ----------------------------- |
| 1   | POST   | `/api/v1/inventory/warehouses`              | `inventory:warehouse:create`  |
| 2   | GET    | `/api/v1/inventory/warehouses`              | `inventory:warehouse:read`    |
| 3   | GET    | `/api/v1/inventory/warehouses/{id}`         | `inventory:warehouse:read`    |
| 4   | PATCH  | `/api/v1/inventory/warehouses/{id}`         | `inventory:warehouse:update`  |
| 5   | POST   | `/api/v1/inventory/warehouses/{id}/archive` | `inventory:warehouse:archive` |
| 6   | POST   | `/api/v1/inventory/shelves`                 | `inventory:shelf:create`      |
| 7   | GET    | `/api/v1/inventory/shelves`                 | `inventory:shelf:read`        |
| 8   | GET    | `/api/v1/inventory/shelves/{id}`            | `inventory:shelf:read`        |
| 9   | PATCH  | `/api/v1/inventory/shelves/{id}`            | `inventory:shelf:update`      |
| 10  | POST   | `/api/v1/inventory/shelves/{id}/archive`    | `inventory:shelf:archive`     |
| 11  | POST   | `/api/v1/inventory/lots`                    | `inventory:lot:create`        |
| 12  | GET    | `/api/v1/inventory/lots`                    | `inventory:lot:read`          |
| 13  | GET    | `/api/v1/inventory/lots/{id}`               | `inventory:lot:read`          |
| 14  | PATCH  | `/api/v1/inventory/lots/{id}`               | `inventory:lot:update`        |
| 15  | POST   | `/api/v1/inventory/lots/{id}/archive`       | `inventory:lot:archive`       |

### Döküman (bu commit)

- 15 API doc (warehouse × 5, shelf × 5, lot × 5).
- `docs/ai/AI_CHUNKS.yaml` — 3 yeni chunk: `flow-inventory-warehouse`,
  `flow-inventory-shelf`, `flow-inventory-lot`.

## İş Kuralları

- **Hiyerarşi:** Warehouse (1) → Shelf (N) → Lot (N). Lokasyon
  ağacı bu sırayla kurulur.
- **Warehouse type:** `clinic` (ilaç/aşı) | `petshop` (genel
  stok) | `general` (default).
- **Shelf temperatureZone:** `room` (default) | `cold` (soğuk
  oda) | `freezer` (dondurucu). Aşı/ilaç saklama için
  policy Faz 7+ planı.
- **Lot unique:** `lotNumber` × `productId` × tenant bazında
  benzersiz (arşivlenmemiş kayıt).
- **SKT kuralı:** `expiryDate` geçmiş olamaz (422
  VET-INV-0003). `manufacturedAt` ≤ `expiryDate` olmalı.
- **Arşivleme sırası:** alt seviye arşivlenmeden üst arşivlenemez
  (warehouse → shelf → lot). FK kırılmaz; lot aktifse raf
  arşivlenemez.
- **Stok miktarı TUTULMAZ:** yalnızca `quantity` (başlangıç)
  referans; gerçek bakiye GOAL-063 StockMovement'tan
  hesaplanır.
- **Re-archive YOK:** arşiv çözümü için yeni lot oluşturulur.

## Audit

- `audit:inventory.warehouse.{create,update,archive}` (info/
  warning).
- `audit:inventory.shelf.{create,update,archive}` (info/
  warning).
- `audit:inventory.lot.{create,update,archive}` (info/
  warning).
- Update'lerde `before`+`after` snapshot; `code`/`lotNumber`
  değişiminde before/after.
- Archive'lerde `reason` zorunlu; `activeShelvesCount` /
  `activeLotsCount` payload'a eklenir.

## Tenant İzolasyonu

- Tüm CRUD tenant-scoped; `code` / `lotNumber` unique
  kontrolü tenant içinde.
- Cross-tenant id → 404 (bilgi sızdırmaz).
- SUPERADMIN bypass'lı.

## Yapılmayanlar / Bilinçli Atlamalar

- **Stok bakiyesi (miktar)** → GOAL-063 StockMovement.
- **Stok uyarıları (düşük stok, SKT yaklaşan)** → GOAL-067.
- **Tedarikçi entegrasyonu (supplierName linki)** →
  GOAL-062 tedarikçi ile.
- **Tree endpoint (lokasyon ağacı tek seferde)** → sonraki
  refactor; gerekirse GOAL-068+ kapsamında.
- **DB migration (Prisma)** → ileride; in-memory devam.
- **Barcode/RFID ile lot tanıma** → ayrı goal (Faz 9+).

## Döküman Uyum

- `pnpm docs:check` → pre-existing hatalar (FAZ-7/8 partial
  docs, bazı error code'lar). **GOAL-061 özgü hata yok.**

## Testler

- `inventory.service.spec.ts` → unit testler (core commit'te).

## Sonraki Adımlar

- GOAL-062 (tedarikçi + satın alma) docs.
- GOAL-063 (stok hareketleri + atomik bakiye) docs.
- GOAL-064+ (petshop POS, iade, otomatik düşüm, uyarılar).

## Commit

- Core: `a10baf7` — `GOAL-061: depo, raf, lot ve SKT core`
- Docs/i18n: (bu commit) — `docs(inventory): GOAL-061 depo,
raf, lot ve SKT doküman ve i18n tamamla`
