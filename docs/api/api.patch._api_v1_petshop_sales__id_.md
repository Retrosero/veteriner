# PATCH /api/v1/petshop/sales/{id}

Taslak satış kısmi güncelleme. Yalnız `status='draft'`
güncellenebilir (409 `VET-SALE-0003`). `lines` set edilirse
replace; toplam yeniden hesaplanır.

- **Modül:** petshop-sales
- **Yetki:** `petshop:sale:create`
- **Audit:** `audit:petshop_sale.update` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`PetshopSaleUpdateInput`):**

```json
PATCH /api/v1/petshop/sales/ps-uuid
{
  "discount": "10.00",
  "lines": [
    {
      "productId": "prd-uuid",
      "quantity": "3",
      "unitPrice": "150.00"
    }
  ]
}
```

- `customerOwnerId`, `currency`, `discount`, `notes`, `lines`
  opsiyonel; en az bir alan.
- `lines` set edilirse mevcut satırlar komple değişir.

**Response 200 (`PetshopSaleDetail`):**

`PetshopSaleDetail` şeması için bkz.
`POST /api/v1/petshop/sales`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-SALE-0001` (404) — Satış bulunamadı.
- `VET-SALE-0003` (409) — Yalnızca taslak güncellenebilir.
- `VET-VALIDATION-0010` (422) — Decimal hesap hatası.
- `VET-SALE-0006` (422) — Ürün bulunamadı.

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Audit detayı:** `before`+`after` snapshot; `lines` değişiminde
önceki/sonraki satır listesi.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/petshop-sale.ts`
- Detay: `GET /api/v1/petshop/sales/{id}`
- AI chunk: `flow-petshop-sale`
- Audit event: `audit:petshop_sale.update`
