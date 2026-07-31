# GET /api/v1/payments

Tenant-scoped tahsilat arama. `sourceType`/`sourceId`/
`method`/`dateFrom`/`dateTo` filtreleri.

- **Modül:** payments
- **Yetki:** `clinic:payment:read`
- **Audit:** yok (salt okunur)

**Query parametreleri (`PaymentFilters`):**

- `sourceType` (enum: `clinic_sale|petshop_sale`) opsiyonel.
- `sourceId` (string) opsiyonel.
- `method` (enum: `cash|card|bank_transfer|other`) opsiyonel.
- `dateFrom`, `dateTo` (ISO datetime) opsiyonel.
- `status` (enum: `active|reversed`) opsiyonel, default
  `active`.
- `limit` (integer, 1-200, default 50).
- `offset` (integer, 0-10000, default 0).

**Response 200 (`PaymentListResponse`):**

```json
GET /api/v1/payments?sourceType=clinic_sale&limit=20
{
  "items": [
    {
      "id": "pay-uuid",
      "sourceType": "clinic_sale",
      "sourceId": "cs-uuid",
      "method": "cash",
      "amount": "200.00",
      "currency": "TRY",
      "paidAt": "2026-07-30T13:00:00.000Z",
      "status": "active"
    }
  ],
  "total": 1
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Query parse hatası.

**Tenant izolasyonu:** Tüm sorgular tenant-scoped; SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/payment.ts`
- Oluştur: `POST /api/v1/payments`
- Detay: `GET /api/v1/payments/{id}`
- AI chunk: `flow-payment`
