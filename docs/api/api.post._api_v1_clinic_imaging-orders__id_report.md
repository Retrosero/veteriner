# POST /api/v1/clinic/imaging-orders/{id}/report

Radyoloji raporu oluşturur. `status='performed'` →
`'reported'`. `findings` + `impression` zorunlu.

- **Modül:** imaging-orders
- **Yetki:** `clinic:imaging:report`
- **Audit:** `audit:imaging_order.report` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`ImagingOrderReportInput`):**

```json
POST /api/v1/clinic/imaging-orders/io-uuid/report
{
  "findings": "Kardiyak silüet normal. Akciğer alanları açık. Diafragma normal konturlu.",
  "impression": "Normal toraks radyografisi",
  "recommendations": "Kontrol gerekmez"
}
```

- `findings` (string, 1-5000) zorunlu.
- `impression` (string, 1-2000) zorunlu.
- `recommendations` (string) opsiyonel.

**Response 200 (`ImagingOrder`):**

`ImagingOrder`; `status='reported'`, `reportId`,
`reportedAt`, `reportedBy` set edilir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Order bulunamadı.
- (409) — Yalnızca `performed` raporlanabilir.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/imaging-order.ts`
- Approve: `POST .../approve-report`
- Amend: `POST .../amend-report`
- AI chunk: `flow-imaging-order`
- Audit event: `audit:imaging_order.report`
