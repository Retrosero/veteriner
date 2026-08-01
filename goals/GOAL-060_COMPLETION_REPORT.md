# GOAL-060 — Ürün ve Hizmet Kataloğu (Completion Report)

## Faz

FAZ-6 (Klinik + petshop ortak stok/petshop)

## Özet

Klinik ve petshop için ortak ürün/hizmet kataloğu altyapısı
tamamlandı. 5 `ProductKind` (stock_product, medicine, vaccine,
service, consumable), kanal kısıtı (clinicUsage/petshopUsage),
verg profili (taxProfile) ve para birimi (currency) alanları
ile. SKU ve barkod tenant içinde benzersiz; arşivleme soft
delete.

## Çıktılar

### Core (GOAL-060 core commit `4edbf3c`)

- `apps/api/src/modules/products/products.controller.ts` —
  5 endpoint (POST, GET list, GET :id, PATCH, POST archive).
- `apps/api/src/modules/products/products.service.ts` — iş
  kuralları (unique SKU/barkod, archive guard, soft delete).
- `apps/api/src/modules/products/products.repository.ts` —
  tenant-scoped CRUD + arşiv filtresi.
- `apps/api/src/modules/products/products.service.spec.ts` —
  unit testler.
- `packages/contracts/src/product.ts` — Zod şemaları:
  `Product`, `ProductCreateInput`, `ProductUpdateInput`,
  `ProductArchiveInput`, `ProductFilters`, `ProductListResponse`,
  `ProductKind`, `ProductUnit`, `TaxProfile`.

### Endpoint'ler (5)

| #   | Method | Path                                    | Yetki                     |
| --- | ------ | --------------------------------------- | ------------------------- |
| 1   | POST   | `/api/v1/catalog/products`              | `catalog:product:create`  |
| 2   | GET    | `/api/v1/catalog/products`              | `catalog:product:read`    |
| 3   | GET    | `/api/v1/catalog/products/{id}`         | `catalog:product:read`    |
| 4   | PATCH  | `/api/v1/catalog/products/{id}`         | `catalog:product:update`  |
| 5   | POST   | `/api/v1/catalog/products/{id}/archive` | `catalog:product:archive` |

### Döküman (bu commit)

- 5 API doc (POST create, GET list, GET :id, PATCH update,
  POST archive).
- `docs/ai/AI_CHUNKS.yaml` — yeni `flow-product-catalog` chunk
  v1.0.0; katalog türleri, kanal kısıtı, vergi/para birimi
  izolasyonu, archive/audit davranışı özetlenir.

## İş Kuralları

- **`ProductKind`:** `stock_product` | `medicine` | `vaccine` |
  `service` | `consumable`.
- **SKU otomatik üretim:** verilmediyse `PRD-<tenant8>-NNNNNN`.
- **Unique kontrolü:** tenant içinde SKU ve barkod
  benzersiz (arşivlenmemiş kayıt). Duplicate → 409
  `VET-PRODUCT-0002`.
- **Vaccine referansı:** `kind='vaccine'` ise Faz 5
  `vaccineProtocolId` ile bağ (decoupled). Faz 5 kendi
  kataloğunu yönetir.
- **Vergi:** `taxProfile` (none/standard/reduced/zero/exempt);
  ülke adaptörü Faz 7'de bağlanacak.
- **Para birimi:** `currency` (TRY/GBP) ISO 4217.
- **Kanal kısıtı:** `clinicUsage` + `petshopUsage` (her ikisi
  de true olabilir; kanal kısıtı değil kullanım kanalı).
- **Arşivleme:** soft delete; `archivedAt` set. Kayıt korunur
  (fiziksel silme YOK). Geçmiş satış/alış FK kırılmaz
  (audit trail + geçmiş raporları için kritik).
- **Re-archive (un-archive) YOK:** arşiv çözümü için yeni
  ürün oluşturulur.

## Audit

- `audit:product.create` (info).
- `audit:product.update` (info); SKU/barkod değişiminde
  before/after payload.
- `audit:product.archive` (warning); `reason` zorunlu.

## Tenant İzolasyonu

- SKU/barkod unique kontrolü tenant-scoped.
- Tüm CRUD tenant-scoped; SUPERADMIN bypass'lı.
- Cross-tenant id → 404 `VET-PRODUCT-0001` (bilgi sızdırmaz).

## Yapılmayanlar / Bilinçli Atlamalar

- **Ülke adaptörü (TR/GB taxProfile eşleme)** → Faz 7'de.
- **Stok bakiyesi (minStockLevel ile karşılaştırma)** →
  Faz 6 ilerleyen GOAL-063 stok hareketleri ile.
- **Toplu import/export** → ayrı goal (Faz 9+).
- **Variant (renk/beden)** → ayrı goal.
- **Barkod görsel oluşturma** → frontend feature.

## Döküman Uyum

- `pnpm docs:check` → mevcut pre-existing hatalar (FAZ-6
  supplier/sale/return; VET-SUPPLIER/SALE/RETURN/PRODUCT
  eksikleri). **GOAL-060 özgü endpoint/AI chunk hatası yok.**

## Testler

- `products.service.spec.ts` → unit testler (core commit'te).

## Sonraki Adımlar

- GOAL-061 (depo/raf/lot/SKT) docs/i18n.
- GOAL-062 (tedarikçi + satın alma) docs/i18n.
- GOAL-063+ (stok hareketleri, petshop sale, iade).

## Commit

- Core: `4edbf3c` — `GOAL-060 (FAZ-6) ürün ve hizmet kataloğu core`
- Docs/i18n: (bu commit) — `docs(products): GOAL-060 ürün ve
hizmet kataloğu doküman ve i18n tamamla`
