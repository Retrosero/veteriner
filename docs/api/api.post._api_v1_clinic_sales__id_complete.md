# POST /api/v1/clinic/sales/{id}/complete

Taslak klinik satışı tamamlar. `status='draft'` →
`status='completed'`. Tamamlamada Faz 7 tahsilat (GOAL-072)
ile ödeme bağlantısı için `paymentMethod` opsiyonel alınır.

- **Modül:** clinic-sales
- **Yetki:** `clinic:payment:create`
- **Audit:** `audit:clinic_sale.complete` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`ClinicSaleCompleteInput`):**

```json
POST /api/v1/clinic/sales/cs-uuid/complete
{
  "paymentMethod": "cash"
}
```

- `paymentMethod` (enum: `cash|card|bank_transfer|other`)
  opsiyonel — verilirse Faz 7 `Payment` oluşturulur.

**Response 200 (`ClinicSaleDetail`):**

`ClinicSaleDetail`; `status='completed'`, `completedAt`,
`completedBy` set edilir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-SALE-0001` (404) — Satış bulunamadı.
- `VET-SALE-0002` (409) — Yalnızca taslak tamamlanabilir.

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Tahsilat entegrasyonu (GOAL-072):**

- `paymentMethod` set edilirse atomik `Payment` oluşturulur
  (`sourceType='clinic_sale'`, `sourceId=clinic_sale.id`).
- `paymentMethod` set edilmezse ödeme ayrıca
  `POST /api/v1/payments` ile eklenir.

**Audit detayı:** `lineCount` + `totalAmount` +
`paymentId?` payload.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/clinic-sale.ts`
- Detay: `GET /api/v1/clinic/sales/{id}`
- Tahsilat: `flow-payment`
- AI chunk: `flow-clinic-sale`
- Audit event: `audit:clinic_sale.complete`
