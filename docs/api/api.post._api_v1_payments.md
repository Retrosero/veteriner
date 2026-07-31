# POST /api/v1/payments

Yeni tahsilat kaydı oluşturur. `sourceType`:
`clinic_sale` (GOAL-071) | `petshop_sale` (GOAL-064). `method`:
`cash` | `card` | `bank_transfer` | `other`. Aynı sale'a birden
fazla payment bağlanabilir (kısmi tahsilat, toplam kontrolü
Faz 7 kısmi tahsilat).

- **Modül:** payments
- **Yetki:** `clinic:payment:create`
- **Audit:** `audit:payment.create` (info)

**Request body (`PaymentCreateInput`):**

```json
POST /api/v1/payments
{
  "sourceType": "clinic_sale",
  "sourceId": "cs-uuid",
  "method": "cash",
  "amount": "200.00",
  "currency": "TRY",
  "paidAt": "2026-07-30T13:00:00.000Z",
  "reference": "Makbuz No: 1234",
  "notes": "Nakit ödeme"
}
```

- `sourceType` (enum) zorunlu.
- `sourceId` (string) zorunlu.
- `method` (enum) zorunlu.
- `amount` (Decimal, >0) zorunlu.
- `currency` (ISO 4217) zorunlu.
- `paidAt` (ISO datetime) opsiyonel, default `now`.
- `reference` (string, ≤200) opsiyonel.
- `notes` (string) opsiyonel.

**Response 201 (`Payment`):**

```json
{
  "id": "pay-uuid",
  "tenantId": "tnt-uuid",
  "sourceType": "clinic_sale",
  "sourceId": "cs-uuid",
  "method": "cash",
  "amount": "200.00",
  "currency": "TRY",
  "paidAt": "2026-07-30T13:00:00.000Z",
  "status": "active",
  "reversedById": null,
  "reference": "Makbuz No: 1234",
  "notes": "Nakit ödeme",
  "createdAt": "2026-07-30T13:00:00.000Z",
  "createdBy": "usr-uuid"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-VALIDATION-0010` (422) — Decimal hatası.
- `VET-PAYMENT-0001` (404) — Sale bulunamadı.
- `VET-PAYMENT-0002` (409) — Toplam tahsilat > sale tutarı
  (Faz 7 kısmi tahsilat).

**Tenant izolasyonu:** Tüm CRUD tenant-scoped; SUPERADMIN
bypass'lı.

**Kısmi tahsilat:** birden fazla payment bağlanabilir; toplam
kontrolü Faz 7+ policy. Şu an uyarı (422).

**Audit detayı:** `saleTotalAmount` + `currentPaidAmount` +
`newPaymentAmount` payload.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/payment.ts`
- Liste: `GET /api/v1/payments`
- Detay: `GET /api/v1/payments/{id}`
- Ters kayıt: `POST /api/v1/payments/{id}/reverse`
- AI chunk: `flow-payment`
- Audit event: `audit:payment.create`
