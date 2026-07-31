# POST /api/v1/clinic/imaging-orders/{id}/amend-report

Approved raporu amendment ile düzeltir. Eski rapor
korunur (append-only); yeni rapor oluşturulur.

- **Modül:** imaging-orders
- **Yetki:** `clinic:imaging:report` (yüksek yetki)
- **Audit:** `audit:imaging_order.amend_report` (warning)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`ImagingOrderAmendReportInput`):**

```json
POST /api/v1/clinic/imaging-orders/io-uuid/amend-report
{
  "findings": "Yorum düzeltildi",
  "impression": "Kardiyomegali (revize)",
  "amendReason": "Ölçüm hatası düzeltildi"
}
```

- `findings` (string) opsiyonel.
- `impression` (string) opsiyonel; en az bir alan.
- `recommendations` opsiyonel.
- `amendReason` (string, 1-2000) zorunlu.

**Response 201 (`ImagingOrderAmend`):**

```json
{
  "id": "ioa-uuid",
  "imagingOrderId": "io-uuid",
  "findings": "Yorum düzeltildi",
  "impression": "Kardiyomegali (revize)",
  "amendReason": "Ölçüm hatası düzeltildi",
  "amendedAt": "2026-08-01T10:00:00.000Z"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Order bulunamadı.
- (409) — `completed`/`cancelled` olmalı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/imaging-order.ts`
- AI chunk: `flow-imaging-order`
- Audit event: `audit:imaging_order.amend_report`
