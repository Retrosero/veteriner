# POST /api/v1/reports/export

Rapor export (PDF/CSV) talebi oluşturur. Asenkron işlenir;
sonuç `reportId` ile takip edilir. Format: `pdf` | `csv`.

- **Modül:** reports
- **Yetki:** `clinic:report:export` (yüksek yetki)
- **Audit:** `audit:report.export` (info)

**Request body (`ReportExportInput`):**

```json
POST /api/v1/reports/export
{
  "reportType": "daily_sales",
  "format": "pdf",
  "filters": {
    "dateFrom": "2026-07-01T00:00:00.000Z",
    "dateTo": "2026-07-30T23:59:59.000Z",
    "currency": "TRY"
  },
  "title": "Temmuz 2026 Satış Raporu"
}
```

- `reportType` (enum: `daily_sales|payment_methods|
  open_balances|custom`) zorunlu.
- `format` (enum: `pdf|csv`) zorunlu.
- `filters` (object) zorunlu — report type'a göre.
- `title` (string) opsiyonel.

**Response 201 (`ReportExport`):**

```json
{
  "id": "exp-uuid",
  "tenantId": "tnt-uuid",
  "reportType": "daily_sales",
  "format": "pdf",
  "status": "pending",
  "title": "Temmuz 2026 Satış Raporu",
  "createdAt": "2026-07-30T17:00:00.000Z",
  "createdBy": "usr-uuid",
  "downloadUrl": null
}
```

- `status`: `pending` | `processing` | `completed` | `failed`.
- `downloadUrl`: tamamlandığında set edilir (signed URL,
  süreli).

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.

**İşlem:** Asenkron job (Faz 10 BullMQ ile); FAZ-7'de
in-process queue. Tamamlandığında bildirim.

**Tenant izolasyonu:** Tüm CRUD tenant-scoped; SUPERADMIN
bypass'lı.

**Audit detayı:** `reportType` + `format` + `filters`
payload.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/report.ts`
- AI chunk: `flow-report`
- Audit event: `audit:report.export`
