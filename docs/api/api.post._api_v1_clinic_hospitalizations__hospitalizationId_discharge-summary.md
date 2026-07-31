# POST /api/v1/clinic/hospitalizations/{hospitalizationId}/discharge-summary

Taburcu özeti taslağı oluşturur. `status='draft'`.
Finalize sonrası güncelleme reddedilir; değişiklik `amend`
ile olur.

- **Modül:** discharge-summaries
- **Yetki:** `clinic:hospitalization:discharge` (yüksek yetki)
- **Audit:** `audit:discharge_summary.create` (info)

**Path parametreleri:**

- `hospitalizationId` (UUID) zorunlu.

**Request body (`DischargeSummaryCreateInput`):**

```json
POST /api/v1/clinic/hospitalizations/hosp-uuid/discharge-summary
{
  "diagnosis": "Gastroenterit",
  "treatmentSummary": "Sıvı tedavisi + diyet yönetimi",
  "homeCareInstructions": "Hafif diyet, bol su, 3 gün kontrol",
  "medications": [
    {
      "name": "Famotidin",
      "dose": "20 mg BID",
      "duration": "5 gün"
    }
  ],
  "followUpDate": "2026-08-02T10:00:00.000Z",
  "dietNotes": "Yağsız, baharatsız"
}
```

- `diagnosis` (string, 1-2000) zorunlu.
- `treatmentSummary` (string) zorunlu.
- `homeCareInstructions` (string) opsiyonel.
- `medications[]` opsiyonel — her biri name+dose+duration.
- `followUpDate` (ISO datetime) opsiyonel.
- `dietNotes` (string) opsiyonel.

**Response 201 (`DischargeSummary`):**

```json
{
  "id": "ds-uuid",
  "hospitalizationId": "hosp-uuid",
  "diagnosis": "Gastroenterit",
  "status": "draft",
  "createdAt": "2026-07-31T09:00:00.000Z"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Yatış bulunamadı.
- (409) — Zaten `finalized`/`amended` özet var.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/discharge-summary.ts`
- Getir: `GET /api/v1/clinic/hospitalizations/{hospitalizationId}/discharge-summary`
- Güncelle: `PATCH /api/v1/clinic/hospitalizations/{hospitalizationId}/discharge-summary`
- Finalize: `POST /api/v1/clinic/hospitalizations/{hospitalizationId}/discharge-summary/finalize`
- Amend: `POST /api/v1/clinic/hospitalizations/{hospitalizationId}/discharge-summary/amend`
- AI chunk: `flow-discharge-summary`
- Audit event: `audit:discharge_summary.create`
