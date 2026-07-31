# İş Akışı — Petshop Satışı (Petshop Sale)

**Kısa ad:** `petshop-sale`
**Modül:** petshop-sale
**İlgili API:** `POST /api/v1/petshop/sales`
**Sayfa:** `/[locale]/petshop/sales/new`

## Amaç
Petshop kasasından ürün satışı yapmak. Müşteri (var veya
yeni), satılan ürünler (lot ile), ödeme yöntemi ve varsa
hayvan bağlantısı girilir.

## Aktör
- STAFF (petshop kasiyer)
- VETERINARIAN (kendi kliniğinde petshop varsa)

## Tetikleyici
- Müşteri kasaya gelir.
- Online sipariş (FAZ-12+) iptali.

## Akış adımları

1. **POS ekranı açılır.**
   - `route = /[locale]/petshop/sales/new`
   - Yetki: `petshop:sale:create`.

2. **Müşteri seçilir.**
   - Varsa: `ownerId` (mevcut sahip).
   - Yoksa: yeni sahip oluştur (GOAL-020) veya
     `walkIn=true` (anonim satış).

3. **Ürünler barkod veya arama ile eklenir.**
   - `lines[].productId` + `lines[].lotId` (opsiyonel).
   - `lines[].quantity` > 0.

4. **Fiyatlar otomatik hesaplanır.**
   - `unitPrice` (price list'ten veya manuel override).
   - `lineTotal = unitPrice * quantity`.
   - `subtotal`, `vat`, `total`.

5. **İndirim / kampanya (opsiyonel).**
   - `discountReason` (string, max 200).

6. **Ödeme yöntemi seçilir.**
   - `paymentMethod`: cash | card | bank_transfer | other.
   - `paidAmount` (>= total).

7. **Stok düşümü.**
   - Her `lotId` için `stock_movement: out` otomatik.
   - Yetersizse: `VET-INVENTORY-0001` (409).

8. **`POST /api/v1/petshop/sales` çağrılır.**

9. **Sunucu tarafı kontrolleri:**
   - Tüm ürünler aktif mi?
   - Lot aktif ve SKT geçmemiş mi?

10. **Satış oluşturulur.**
    - `id` (uuid), `status = "completed"`.
    - `receiptNumber` atanır.
    - `paidAmount` - `total` → `change` (nakit ise).
    - Audit: `audit:petshop_sale.create` (info).
    - Stok hareketleri: `audit:stock_movement.create` (info).

11. **Response 201 + `PetshopSale` döner.**

12. **Fiş/print.**
    - PDF render + printer integration.
    - Fiş: `GET /api/v1/petshop/sales/{id}/pdf`.

13. **Opsiyonel: hayvan bağlantısı.**
    - `patientId` ile satılan ürünler (örn. mama) o
      hayvana ilişkilendirilir.

## Tenant izolasyonu
- Tüm ürün + lot aynı tenant'ta olmalı.

## Audit
- `audit:petshop_sale.create` (info).
- `audit:petshop_sale.cancel` (warning; iptal).
- `audit:stock_movement.create` (info).

## Hata senaryoları

| Senaryo | HTTP | Hata kodu |
|---------|------|-----------|
| Pasif ürün | 409 | `VET-PRODUCT-0001` |
| Stok yetersiz | 409 | `VET-INVENTORY-0001` |
| Lot SKT geçmiş | 422 | `VET-INVENTORY-0002` |
| Eksik ödeme | 422 | `VET-VALIDATION-0010` |
| Cross-tenant | 404 | `VET-CLINIC-0001` |
| Yetkisiz | 403 | `VET-AUTHZ-0001` |

## İlgili dokümanlar
- `docs/api/api.post._api_v1_petshop_sales.md`
- `goals/GOAL-064_COMPLETION_REPORT.md`
- `docs/permissions/PERMISSION_CATALOG.yaml#petshop:sale:create`
