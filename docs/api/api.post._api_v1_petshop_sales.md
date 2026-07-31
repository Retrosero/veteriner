# POST /api/v1/petshop/sales

Yeni petshop satış taslağı oluşturur (`status='draft'`).
Line item'lar (ürün × miktar × birim fiyat) ile birlikte;
toplam otomatik hesaplanır. Müşteri (varsa `ownerId` ile)
opsiyonel. Ürün arşivsiz olmalı.

- **Modül:** petshop-sales
- **Yetki:** `petshop:sale:create`
- **Audit:** `audit:petshop_sale.create` (info)

**Request body (`PetshopSaleCreateInput`):**

```json
POST /api/v1/petshop/sales
{
  "customerOwnerId": "own-uuid",
  "currency": "TRY",
  "discount": "0",
  "notes": "Pet shop satışı",
  "lines": [
    {
      "productId": "prd-uuid",
      "quantity": "2",
      "unitPrice": "150.00",
      "discount": "0"
    }
  ]
}
```

- `customerOwnerId` (string|null) opsiyonel — hayvan sahibi.
- `currency` (ISO 4217) zorunlu.
- `discount` (Decimal string) opsiyonel, default `0`.
- `notes` (string) opsiyonel.
- `lines` (array, min 1) zorunlu.

**Response 201 (`PetshopSaleDetail`):**

```json
{
  "id": "ps-uuid",
  "tenantId": "tnt-uuid",
  "customerOwnerId": "own-uuid",
  "status": "draft",
  "currency": "TRY",
  "subtotal": "300.00",
  "discount": "0",
  "totalAmount": "300.00",
  "lines": [
    {
      "id": "psl-uuid",
      "productId": "prd-uuid",
      "quantity": "2",
      "unitPrice": "150.00",
      "lineTotal": "300.00",
      "discount": "0"
    }
  ],
  "createdAt": "2026-07-30T12:00:00.000Z",
  "createdBy": "usr-uuid"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-VALIDATION-0010` (422) — Decimal hesap hatası.
- `VET-SALE-0006` (422) — Ürün bulunamadı.
- `VET-PRODUCT-0001` (404) — Ürün yok.

**Tenant izolasyonu:** Tüm sorgular tenant-scoped; SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/petshop-sale.ts`
- Liste: `GET /api/v1/petshop/sales`
- Detay: `GET /api/v1/petshop/sales/{id}`
- Güncelle: `PATCH /api/v1/petshop/sales/{id}`
- Tamamla: `POST /api/v1/petshop/sales/{id}/complete`
- İptal: `POST /api/v1/petshop/sales/{id}/cancel`
- AI chunk: `flow-petshop-sale`
- Audit event: `audit:petshop_sale.create`
