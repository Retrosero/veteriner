# POST /api/v1/clinic/sales/{id}/cancel

Klinik satışı iptal eder. `status='draft'` veya
`'completed'` → `'cancelled'`. `completed` ise varsa Faz 7
tahsilat reversal (GOAL-073) tetiklenir.

- **Modül:** clinic-sales
- **Yetki:** `clinic:payment:reverse` (yüksek yetki)
- **Audit:** `audit:clinic_sale.cancel` (warning)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`ClinicSaleCancelInput`):**

```json
POST /api/v1/clinic/sales/cs-uuid/cancel
{
  "reason": "Müşteri vazgeçti"
}
```

- `reason` (string, 1-2000) zorunlu.

**Response 200 (`ClinicSaleDetail`):**

`ClinicSaleDetail`; `status='cancelled'`, `cancelledAt`,
`cancelledBy`, `cancelReason` set edilir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-SALE-0001` (404) — Satış bulunamadı.
- `VET-SALE-0005` (409) — Zaten iptal edilmiş.

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Tahsilat iptal entegrasyonu (GOAL-073):**

- `completed` satış için varsa `Payment` reversal üretilir
  (`PaymentReversal.sourceType='clinic_sale'`).
- Ters kayıt Faz 6 StockMovement değil (klinik satışta stok
  hareketi sadece `clinical_use` Faz 8'de).

**Audit detayı:** `reason` + `previousStatus` + `paymentReversalIds[]`
payload.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/clinic-sale.ts`
- Detay: `GET /api/v1/clinic/sales/{id}`
- Tahsilat iptal: `flow-payment-reversal` (GOAL-073)
- AI chunk: `flow-clinic-sale`
- Audit event: `audit:clinic_sale.cancel`
