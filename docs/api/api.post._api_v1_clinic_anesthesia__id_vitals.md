# POST /api/v1/clinic/anesthesia/{id}/vitals

Anestezi sırasında vital bulgu ekler (NIBP, SpO2, HR, RR
vb.). Sıklıkla çağrılır; `recordedAt` ile sıralı liste.

- **Modül:** anesthesia
- **Yetki:** `clinic:anesthesia:create`
- **Audit:** `audit:anesthesia.vital.add` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`AnesthesiaVitalInput`):**

```json
POST /api/v1/clinic/anesthesia/an-uuid/vitals
{
  "recordedAt": "2026-08-10T10:15:00.000Z",
  "heartRate": "75",
  "systolic": "120",
  "diastolic": "80",
  "spo2": "98",
  "respiratoryRate": "14",
  "temperature": "37.2",
  "etco2": "38",
  "notes": "Stabil"
}
```

- `recordedAt` (ISO datetime) zorunlu.
- Diğer vital alanları opsiyonel (string, Decimal).
  `heartRate`/`respiratoryRate`/`systolic`/`diastolic` int
  okur, diğerleri Decimal.

**Response 201 (`AnesthesiaVital`):**

```json
{
  "id": "anv-uuid",
  "anesthesiaId": "an-uuid",
  "recordedAt": "2026-08-10T10:15:00.000Z",
  "heartRate": 75,
  "systolic": 120,
  "diastolic": 80,
  "spo2": 98,
  "respiratoryRate": 14,
  "temperature": "37.2",
  "etco2": 38
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
- Detay: `GET /api/v1/clinic/anesthesia/{id}`
- AI chunk: `flow-anesthesia`
- Audit event: `audit:anesthesia.vital.add`
