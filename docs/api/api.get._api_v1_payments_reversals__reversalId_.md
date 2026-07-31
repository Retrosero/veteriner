# GET /api/v1/payments/reversals/{reversalId}

ID'ye göre tek ters kayıt detayı. Cross-tenant → 404.

- **Modül:** payments
- **Yetki:** `clinic:payment:read`
- **Audit:** yok (salt okunur)

**Path parametreleri:**

- `reversalId` (UUID) zorunlu.

**Response 200 (`PaymentReversal`):**

```json
{
  "id": "prev-uuid",
  "tenantId": "tnt-uuid",
  "paymentId": "pay-uuid",
  "sourceType": "clinic_sale",
  "sourceId": "cs-uuid",
  "amount": "200.00",
  "method": "cash",
  "currency": "TRY",
  "reason": "Müşteri iade",
  "note": "Detay notu",
  "cashRegisterEffect": "out",
  "reversedAt": "2026-07-30T14:00:00.000Z",
  "reversedBy": "usr-uuid",
  "createdAt": "2026-07-30T14:00:00.000Z"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — UUID parse hatası.
- `VET-PAYMENT-0001` (404) — Ters kayıt bulunamadı
  (cross-tenant dahil).

**Tenant izolasyonu:** `actor.tenantId` zorunlu; SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/payment.ts`
- Liste: `GET /api/v1/payments/reversals`
- Oluştur: `POST /api/v1/payments/{id}/reverse`
- AI chunk: `flow-payment-reversal`
