# GOAL-070 — Fiyat Listeleri ve Hizmet Ücretleri (Completion Report)

## Faz

FAZ-7 (Finans)

## Özet

Fiyat listesi (PriceList + PriceListItem) altyapısı ve ürün
fiyat çözümleme servisi tamamlandı. 3 liste türü (standard/
promotional/contract); aktif liste zincirleme; müşteri-özel
fiyat + miktar kademeli fiyat. Faz 7 klinik satış + tahsilat
entegrasyonu için referans.

## Çıktılar

### Core (GOAL-070 core commit `32ceb6c`)

- `apps/api/src/modules/pricing/pricing.controller.ts` — 10
  endpoint (lists: 6 + items: 4 + products: 1).
- `apps/api/src/modules/pricing/pricing.service.ts` —
  resolvePrice + zincirleme aktif.
- `apps/api/src/modules/pricing/pricing.repository.ts` —
  tenant-scoped CRUD.
- `packages/contracts/src/pricing.ts` — Zod şemaları:
  PriceList + Item + filters + resolved price.

### Endpoint'ler (11)

| #   | Method | Path                                               | Yetki                        |
| --- | ------ | -------------------------------------------------- | ---------------------------- |
| 1   | POST   | `/api/v1/pricing/lists`                            | `pricing:price_list:create`  |
| 2   | GET    | `/api/v1/pricing/lists`                            | `pricing:price_list:read`    |
| 3   | GET    | `/api/v1/pricing/lists/{id}`                       | `pricing:price_list:read`    |
| 4   | PATCH  | `/api/v1/pricing/lists/{id}`                       | `pricing:price_list:update`  |
| 5   | POST   | `/api/v1/pricing/lists/{id}/activate`              | `pricing:price_list:update`  |
| 6   | POST   | `/api/v1/pricing/lists/{id}/archive`               | `pricing:price_list:archive` |
| 7   | POST   | `/api/v1/pricing/lists/{id}/items`                 | `pricing:price_list:update`  |
| 8   | GET    | `/api/v1/pricing/lists/{id}/items`                 | `pricing:price_list:read`    |
| 9   | PATCH  | `/api/v1/pricing/lists/{id}/items/{itemId}`        | `pricing:price_list:update`  |
| 10  | POST   | `/api/v1/pricing/lists/{id}/items/{itemId}/cancel` | `pricing:price_list:update`  |
| 11  | GET    | `/api/v1/pricing/products/{productId}/price`       | `pricing:price_list:read`    |

### Döküman (bu commit)

- 11 API doc (yukarıdaki tam liste).
- `docs/ai/AI_CHUNKS.yaml` — yeni `flow-pricing` chunk
  v1.0.0; çözümleme sırası + ülke adaptörü + Faz 7
  entegrasyonu.

## İş Kuralları

- **Liste türü:** `standard` | `promotional` | `contract`.
- **Aktif zincir:** aynı `type`+`currency` aktif liste
  otomatik deaktive olur.
- **Fiyat çözümleme sırası:**
  1. `ownerId` set + aktif listede müşteri-özel item.
  2. `quantity >= minQuantity` olan aktif item.
  3. `Product.salePrice` (ürün kataloğu default).
- **Miktar kademeli:** `minQuantity` ile alt limit.
- **Müşteri-özel:** `ownerId` ile (kontrat müşteri).
- **Para birimi:** ISO 4217 (TRY/GBP).

## Audit

- `audit:price_list.{create,update,activate,archive}`.
- `audit:price_list_item.{create,update,cancel}`.

## Tenant İzolasyonu

- Tüm CRUD tenant-scoped; SUPERADMIN bypass'lı.
- Cross-tenant listId/productId → 404.

## Yapılmayanlar / Bilinçli Atlamalar

- **KDV/GST ülke adaptörü** → Faz 7 (country adapter).
- **CSV/PDF export** → ayrı goal.
- **Çoklu para birimi otomatik dönüşümü** → Faz 9+.
- **Frontend UI** → Faz 8 React.

## Döküman Uyum

- `pnpm docs:check` → pre-existing hatalar. **GOAL-070 özgü
  hata yok.**

## Testler

- `pricing.service.spec.ts` → unit testler (core).

## Sonraki Adımlar

- GOAL-071 (klinik satış taslağı) docs.
- GOAL-072 (tahsilat) docs.

## Commit

- Core: `32ceb6c` — `GOAL-070: fiyat listeleri ve hizmet
ücretleri core (FAZ-7)`
- Docs/i18n: (bu commit) — `docs(pricing): GOAL-070 fiyat
listeleri doküman ve i18n tamamla`
