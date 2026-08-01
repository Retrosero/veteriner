# POST /api/v1/payments/{id}/reverse

Tahsilatı iptal eder (ters kayıt). `PaymentReversal` oluşturulur;
orijinal `status='reversed'` olur. Yalnız `status='active'`
olan payment ters çevrilebilir.

- **Modül:** payments
- **Yetki:** `clinic:payment:reverse` (yüksek yetki)
- **Audit:** `audit:payment.reverse` (warning)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`PaymentReverseInput`):**

```json
POST /api/v1/payments/pay-uuid/reverse
{
  "reason": "İade/fatura düzeltme",
  "reasonCode": "refund"
}
```

- `reason` (string, 1-2000) zorunlu.
- `reasonCode` (enum: `refund|customer_request|error|duplicate|
other`) zorunlu.

**Response 201 (`PaymentReversal`):**

```json
{
  "id": "prev-uuid",
  "tenantId": "tnt-uuid",
  "paymentId": "pay-uuid",
  "reason": "İade/fatura düzeltme",
  "reasonCode": "refund",
  "reversedAt": "2026-07-30T14:00:00.000Z",
  "reversedBy": "usr-uuid",
  "cashRegisterEffect": "out"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-PAYMENT-0001` (404) — Tahsilat bulunamadı.
- `VET-PAYMENT-0003` (409) — Zaten ters çevrilmiş.

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Kasa etkisi (GOAL-074):**

- `cashRegisterEffect='out'` — kasa bakiyesinden düşer.
- Kasa session yoksa (henüz açılmamış) uyarı logu yazılır;
  gün sonu reconciliation'da düzeltme önerilir.

**Audit detayı:** `reversalId` + `reason` + `reasonCode` +
`cashRegisterEffect` payload.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/payment.ts`
- Detay: `GET /api/v1/payments/{id}`
- Reversal listesi: `GET /api/v1/payments/reversals`
- Kasa: `flow-cash-register` (GOAL-074)
- AI chunk: `flow-payment`
- Audit event: `audit:payment.reverse`
