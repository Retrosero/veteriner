# GET /api/v1/payments/{id}/reversals/summary

Bir payment için ters kayıt özeti: toplam payment tutarı,
toplam ters kayıt tutarı, kalan, ters kayıt sayısı.

- **Modül:** payments
- **Yetki:** `clinic:payment:read`
- **Audit:** yok (salt okunur)

**Path parametreleri:**

- `id` (UUID) zorunlu — payment id.

**Response 200 (`PaymentReversalSummary`):**

```json
GET /api/v1/payments/pay-uuid/reversals/summary
{
  "paymentId": "pay-uuid",
  "paymentAmount": "200.00",
  "totalReversed": "100.00",
  "remainingAmount": "100.00",
  "reversalCount": 1,
  "currency": "TRY"
}
```

- `paymentAmount` — orijinal payment tutarı.
- `totalReversed` — ters kayıtların toplam tutarı.
- `remainingAmount` — `paymentAmount - totalReversed` (≥0).
- `reversalCount` — ters kayıt adedi.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — UUID parse hatası.
- `VET-PAYMENT-0001` (404) — Payment bulunamadı.

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Çoklu ters kayıt:** Bir payment birden fazla kez ters
kayıt alabilir (kısmi ters kayıt + düzeltme). Toplam
kontrolü `totalReversed <= paymentAmount`.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/payment.ts`
- Ters kayıt: `POST /api/v1/payments/{id}/reverse`
- Liste: `GET /api/v1/payments/reversals`
- AI chunk: `flow-payment-reversal`
