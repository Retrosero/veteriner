# POST /api/v1/clinic/hospitalizations/{hospitalizationId}/discharge-summary/amend

Finalize edilmiş taburcu özetini amendment ile düzeltir.
Eski özet korunur (append-only).

- **Modül:** discharge-summaries
- **Yetki:** `clinic:hospitalization:discharge` (yüksek yetki)
- **Audit:** `audit:discharge_summary.amend` (warning)

**Path parametreleri:**

- `hospitalizationId` (UUID) zorunlu.

**Request body (`DischargeSummaryAmendInput`):**

```json
POST /api/v1/clinic/hospitalizations/hosp-uuid/discharge-summary/amend
{
  "treatmentSummary": "Sıvı + antibiyotik (revize)",
  "amendReason": "Kültür sonucu geldi"
}
```

- `diagnosis`, `treatmentSummary`, `homeCareInstructions`,
  `medications[]`, `followUpDate`, `dietNotes`
  opsiyonel; en az bir alan.
- `amendReason` (string, 1-2000) zorunlu.

**Response 201 (`DischargeSummaryAmend`):**

```json
{
  "id": "dsa-uuid",
  "dischargeSummaryId": "ds-uuid",
  "treatmentSummary": "Sıvı + antibiyotik (revize)",
  "amendReason": "Kültür sonucu geldi",
  "amendedAt": "2026-08-02T10:00:00.000Z",
  "amendedBy": "usr-uuid"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Özet bulunamadı.
- (409) — `finalized`/`amended` olmalı; `draft`
  amend edilemez.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/discharge-summary.ts`
- Detay: `GET /api/v1/clinic/hospitalizations/{hospitalizationId}/discharge-summary`
- Aşı amendment: `flow-vaccine-application-amend` (GOAL-054)
- Operasyon amendment: `flow-operation-note` (GOAL-083)
- AI chunk: `flow-discharge-summary`
- Audit event: `audit:discharge_summary.amend`
