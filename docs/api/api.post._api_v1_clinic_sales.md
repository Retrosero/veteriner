# POST /api/v1/clinic/sales

Yeni klinik satış taslağı oluşturur (`status='draft'`).
Muayene/recete/tahlil vb. için hasta sahibi (`ownerId`) +
opsiyonel hasta (`patientId`) ile. Line item (ürün/hizmet ×
miktar × fiyat) ile toplam otomatik.

- **Modül:** clinic-sales
- **Yetki:** `clinic:payment:create`
- **Audit:** `audit:clinic_sale.create` (info)

**Request body (`ClinicSaleCreateInput`):**

```json
POST /api/v1/clinic/sales
{
  "customerOwnerId": "own-uuid",
  "patientId": "pat-uuid",
  "sourceType": "examination",
  "sourceId": "exam-uuid",
  "currency": "TRY",
  "discount": "0",
  "notes": "Muayene + aşı",
  "lines": [
    {
      "productId": "prd-uuid",
      "quantity": "1",
      "unitPrice": "200.00",
      "priceListItemId": "pli-uuid"
    }
  ]
}
```

- `customerOwnerId` (string) zorunlu.
- `patientId` (string|null) opsiyonel.
- `sourceType` (enum: `examination|prescription|lab_test|
  imaging|surgery|order`) zorunlu.
- `sourceId` (string) zorunlu.
- `currency` (ISO 4217) zorunlu.
- `discount` (Decimal) opsiyonel.
- `lines[]` (min 1) zorunlu; her line `productId` ×
  `quantity` × `unitPrice` + opsiyonel `priceListItemId`.

**Response 201 (`ClinicSaleDetail`):**

```json
{
  "id": "cs-uuid",
  "tenantId": "tnt-uuid",
  "customerOwnerId": "own-uuid",
  "patientId": "pat-uuid",
  "sourceType": "examination",
  "sourceId": "exam-uuid",
  "status": "draft",
  "currency": "TRY",
  "subtotal": "200.00",
  "discount": "0",
  "totalAmount": "200.00",
  "lines": [
    {
      "id": "csl-uuid",
      "productId": "prd-uuid",
      "quantity": "1",
      "unitPrice": "200.00",
      "lineTotal": "200.00",
      "priceListItemId": "pli-uuid"
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
- `VET-CLINIC-0001` (404) — Owner/patient bulunamadı.

**Tenant izolasyonu:** Tüm sorgular tenant-scoped; SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/clinic-sale.ts`
- Liste: `GET /api/v1/clinic/sales`
- Detay: `GET /api/v1/clinic/sales/{id}`
- Güncelle: `PATCH /api/v1/clinic/sales/{id}`
- Tamamla: `POST /api/v1/clinic/sales/{id}/complete`
- İptal: `POST /api/v1/clinic/sales/{id}/cancel`
- AI chunk: `flow-clinic-sale`
- Audit event: `audit:clinic_sale.create`
