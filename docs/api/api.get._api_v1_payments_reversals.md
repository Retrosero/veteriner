# GET /api/v1/payments/reversals

Tenant-scoped tahsilat ters kayıt arama. `reasonCode`/
`sourceType`/`sourceId`/`dateFrom`/`dateTo` filtreleri.

- **Modül:** payments
- **Yetki:** `clinic:payment:read`
- **Audit:** yok (salt okunur)

**Query parametreleri (`PaymentReversalFilters`):**

- `reasonCode` (enum: `refund|customer_request|error|duplicate|
other`) opsiyonel.
- `sourceType` (enum: `clinic_sale|petshop_sale`) opsiyonel.
- `sourceId` (string) opsiyonel.
- `cashRegisterEffect` (enum: `in|out`) opsiyonel.
- `dateFrom`, `dateTo` (ISO datetime) opsiyonel.
- `limit` (integer, 1-200, default 50).
- `offset` (integer, 0-10000, default 0).

**Response 200 (`PaymentReversalListResponse`):**

```json
GET /api/v1/payments/reversals?reasonCode=refund&limit=20
{
  "items": [
    {
      "id": "prev-uuid",
      "paymentId": "pay-uuid",
      "sourceType": "clinic_sale",
      "sourceId": "cs-uuid",
      "amount": "200.00",
      "method": "cash",
      "currency": "TRY",
      "reasonCode": "refund",
      "reason": "Müşteri iade",
      "cashRegisterEffect": "out",
      "reversedAt": "2026-07-30T14:00:00.000Z",
      "reversedBy": "usr-uuid"
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
- Ters kayıt: `POST /api/v1/payments/{id}/reverse`
- Detay: `GET /api/v1/payments/reversals/{reversalId}`
- Özet: `GET /api/v1/payments/{id}/reversals/summary`
- AI chunk: `flow-payment-reversal`
