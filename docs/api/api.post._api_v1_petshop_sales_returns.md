# POST /api/v1/petshop/sales/returns

Yeni petshop satış iadesi taslağı oluşturur. Orijinal
`petshop_sale` kaydına bağlı; her line için iade miktarı
(Decimal) belirtilir. `status='draft'`. Tamamlama ile Faz 6
`StockMovement` (`type='return'`, `direction='in'`)
üretilir.

- **Modül:** petshop-sale-returns
- **Yetki:** `petshop:sale:refund` (yüksek yetki)
- **Audit:** `audit:petshop_sale_return.create` (info)

**Request body (`PetshopSaleReturnCreateInput`):**

```json
POST /api/v1/petshop/sales/returns
{
  "originalSaleId": "ps-uuid",
  "reason": "Müşteri ürünü iade etti",
  "notes": "Ambalaj hasarlı",
  "lines": [
    {
      "originalLineId": "psl-uuid",
      "productId": "prd-uuid",
      "quantity": "1",
      "unitPrice": "150.00"
    }
  ]
}
```

- `originalSaleId` (UUID) zorunlu — iade edilecek orijinal
  satış.
- `reason` (string, 1-2000) zorunlu.
- `notes` (string) opsiyonel.
- `lines` (array, min 1) zorunlu; her satırda
  `originalLineId` + `productId` + `quantity` (Decimal,
  ≤ orijinal satılan miktar) + `unitPrice` (Decimal).

**Response 201 (`PetshopSaleReturnDetail`):**

```json
{
  "id": "psr-uuid",
  "tenantId": "tnt-uuid",
  "originalSaleId": "ps-uuid",
  "status": "draft",
  "reason": "Müşteri ürünü iade etti",
  "lines": [
    {
      "id": "psrl-uuid",
      "originalLineId": "psl-uuid",
      "productId": "prd-uuid",
      "quantity": "1",
      "unitPrice": "150.00",
      "lineTotal": "150.00"
    }
  ],
  "totalRefund": "150.00",
  "createdAt": "2026-07-30T14:00:00.000Z",
  "createdBy": "usr-uuid"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-VALIDATION-0010` (422) — Decimal hesap hatası.
- `VET-SALE-0001` (404) — Orijinal satış bulunamadı.
- `VET-RETURN-0001` (404) — Orijinal line bulunamadı.
- `VET-RETURN-0008` (409) — İade miktarı orijinal satılan
  miktarı aşıyor.
- `VET-RETURN-0009` (422) — Orijinal satış iade edilemez
  (iptal edilmiş vb.).

**Tenant izolasyonu:** Tüm sorgular tenant-scoped; SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/petshop-sale-return.ts`
- Liste: `GET /api/v1/petshop/sales/returns`
- Detay: `GET /api/v1/petshop/sales/returns/{id}`
- Tamamla: `POST /api/v1/petshop/sales/returns/{id}/complete`
- İptal: `POST /api/v1/petshop/sales/returns/{id}/cancel`
- AI chunk: `flow-petshop-sale-return`
- Audit event: `audit:petshop_sale_return.create`
