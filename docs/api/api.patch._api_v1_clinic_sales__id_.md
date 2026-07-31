# PATCH /api/v1/clinic/sales/{id}

Taslak klinik satış kısmi güncelleme. Yalnız `status='draft'`
güncellenebilir (409).

- **Modül:** clinic-sales
- **Yetki:** `clinic:payment:create`
- **Audit:** `audit:clinic_sale.update` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`ClinicSaleUpdateInput`):**

```json
PATCH /api/v1/clinic/sales/cs-uuid
{
  "discount": "10.00",
  "lines": [
    {
      "productId": "prd-uuid",
      "quantity": "1",
      "unitPrice": "180.00"
    }
  ]
}
```

- `customerOwnerId`, `patientId`, `currency`, `discount`,
  `notes`, `lines` opsiyonel; en az bir alan.
- `lines` set edilirse replace.

**Response 200 (`ClinicSaleDetail`):**

`ClinicSaleDetail` şeması için bkz.
`POST /api/v1/clinic/sales`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-SALE-0001` (404) — Satış bulunamadı.
- `VET-SALE-0003` (409) — Yalnızca taslak güncellenebilir.

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Audit detayı:** `before`+`after` snapshot.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/clinic-sale.ts`
- Detay: `GET /api/v1/clinic/sales/{id}`
- AI chunk: `flow-clinic-sale`
- Audit event: `audit:clinic_sale.update`
