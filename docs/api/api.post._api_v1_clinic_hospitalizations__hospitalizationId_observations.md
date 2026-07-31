# POST /api/v1/clinic/hospitalizations/{hospitalizationId}/observations

Yatış sırasında gözlem kaydı. `category`: `vitals`
(vital bulgu) | `intake_output` (sıvı alım/çıkış) | `behavior`
(davranış) | `general`.

- **Modül:** discharge-summaries
- **Yetki:** `clinic:hospitalization:add_note`
- **Audit:** `audit:observation.create` (info)

**Path parametreleri:**

- `hospitalizationId` (UUID) zorunlu.

**Request body (`ObservationCreateInput`):**

```json
POST /api/v1/clinic/hospitalizations/hosp-uuid/observations
{
  "category": "vitals",
  "observedAt": "2026-07-30T16:00:00.000Z",
  "data": {
    "heartRate": "80",
    "temperature": "38.5",
    "respiratoryRate": "20"
  },
  "notes": "Ateş yükseldi"
}
```

- `category` (enum) zorunlu.
- `observedAt` (ISO datetime) zorunlu.
- `data` (object) zorunlu — kategoriye göre değişir
  (heartRate, temperature, respiratoryRate, fluidIntakeMl,
  fluidOutputMl, behavior vb.).
- `notes` opsiyonel.

**Response 201 (`Observation`):**

```json
{
  "id": "obs-uuid",
  "hospitalizationId": "hosp-uuid",
  "category": "vitals",
  "observedAt": "2026-07-30T16:00:00.000Z",
  "data": { "heartRate": "80", "temperature": "38.5" },
  "notes": "Ateş yükseldi",
  "recordedBy": "usr-uuid"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Yatış bulunamadı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/discharge-summary.ts`
- Liste: `GET /api/v1/clinic/hospitalizations/{hospitalizationId}/observations`
- Taburcu özeti: `POST /api/v1/clinic/hospitalizations/{hospitalizationId}/discharge-summary`
- AI chunk: `flow-discharge-summary`
- Audit event: `audit:observation.create`
