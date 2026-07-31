# POST /api/v1/clinic/anesthesia/{id}/complications

Anestezi sırasında komplikasyon kaydı. `severity`:
`mild` | `moderate` | `severe` | `life_threatening`.

- **Modül:** anesthesia
- **Yetki:** `clinic:anesthesia:create`
- **Audit:** `audit:anesthesia.complication.add` (warning)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`AnesthesiaComplicationInput`):**

```json
POST /api/v1/clinic/anesthesia/an-uuid/complications
{
  "type": "hypotension",
  "severity": "moderate",
  "occurredAt": "2026-08-10T10:45:00.000Z",
  "duration": "120",
  "intervention": "IV sıvı + vasopressor",
  "outcome": "Düzeldi"
}
```

- `type` (enum: `hypotension|hypertension|bradycardia|
  tachycardia|hypoxia|hypercapnia|airway_obstruction|
  anaphylaxis|other`) zorunlu.
- `severity` (enum) zorunlu.
- `occurredAt` (ISO datetime) zorunlu.
- `duration` (integer, saniye) opsiyonel.
- `intervention` (string) opsiyonel.
- `outcome` (string) opsiyonel.

**Response 201 (`AnesthesiaComplication`):**

```json
{
  "id": "anc-uuid",
  "anesthesiaId": "an-uuid",
  "type": "hypotension",
  "severity": "moderate",
  "occurredAt": "2026-08-10T10:45:00.000Z",
  "duration": 120,
  "intervention": "IV sıvı + vasopressor",
  "outcome": "Düzeldi"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Anestezi bulunamadı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/anesthesia.ts`
- AI chunk: `flow-anesthesia`
- Audit event: `audit:anesthesia.complication.add`
