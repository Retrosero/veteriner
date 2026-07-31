# PATCH /api/v1/clinic/hospitalizations/{hospitalizationId}/discharge-summary

Taburcu özeti kısmi güncelleme. Yalnız `status='draft'`
güncellenebilir (409).

- **Modül:** discharge-summaries
- **Yetki:** `clinic:hospitalization:discharge`
- **Audit:** `audit:discharge_summary.update` (info)

**Path parametreleri:**

- `hospitalizationId` (UUID) zorunlu.

**Request body (`DischargeSummaryUpdateInput`):**

```json
PATCH /api/v1/clinic/hospitalizations/hosp-uuid/discharge-summary
{
  "homeCareInstructions": "Hafif diyet, bol su (güncellendi)",
  "medications": [
    {
      "name": "Famotidin",
      "dose": "20 mg BID",
      "duration": "7 gün"
    }
  ]
}
```

- `diagnosis`, `treatmentSummary`, `homeCareInstructions`,
  `medications[]`, `followUpDate`, `dietNotes`
  opsiyonel; en az bir alan.

**Response 200 (`DischargeSummary`):**

`DischargeSummary` şeması için bkz.
`POST /api/v1/clinic/hospitalizations/{hospitalizationId}/discharge-summary`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Özet bulunamadı.
- (409) — Yalnızca `draft` güncellenebilir.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/discharge-summary.ts`
- Detay: `GET /api/v1/clinic/hospitalizations/{hospitalizationId}/discharge-summary`
- AI chunk: `flow-discharge-summary`
- Audit event: `audit:discharge_summary.update`
