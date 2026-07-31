# POST /api/v1/clinic/anesthesia/{id}/medications

Anestezi takibine ilaç ekler. `status='draft'` iken eklenir.
Finalize sonrası reddedilir.

- **Modül:** anesthesia
- **Yetki:** `clinic:anesthesia:create`
- **Audit:** `audit:anesthesia.medication.add` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`AnesthesiaMedicationInput`):**

```json
POST /api/v1/clinic/anesthesia/an-uuid/medications
{
  "name": "Propofol",
  "dose": "120",
  "unit": "mg",
  "route": "iv",
  "administeredAt": "2026-08-10T10:10:00.000Z",
  "notes": "İdüksiyon"
}
```

- `name` (string, 1-200) zorunlu.
- `dose` (Decimal, >0) zorunlu.
- `unit` (enum: `mg|ml|mcg|ug|units`) zorunlu.
- `route` (enum: `iv|im|po|sc|inhalation|epidural`)
  zorunlu.
- `administeredAt` (ISO datetime) zorunlu.
- `notes` opsiyonel.

**Response 201 (`AnesthesiaMedication`):**

```json
{
  "id": "anm-uuid",
  "anesthesiaId": "an-uuid",
  "name": "Propofol",
  "dose": "120",
  "unit": "mg",
  "route": "iv",
  "administeredAt": "2026-08-10T10:10:00.000Z",
  "notes": "İdüksiyon"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Anestezi bulunamadı.
- (409) — Finalize sonrası eklenemez.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/anesthesia.ts`
- Detay: `GET /api/v1/clinic/anesthesia/{id}`
- AI chunk: `flow-anesthesia`
- Audit event: `audit:anesthesia.medication.add`
