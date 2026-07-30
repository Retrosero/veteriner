# POST /api/v1/clinic/examinations/{id}/prescriptions

Muayeneye bağlı yeni reçete oluşturur. `items` en az 1 kalem
içermelidir (boş → 422). `durationDays` 1-30 gün arası (aşımı → 422
`VET-VALIDATION-0010`). `expiresAt = now + durationDays` gün
olarak hesaplanır. Yeni reçete `status='active'` olarak başlatılır;
yaşam döngüsü state machine ile yönetilir (`active` → `dispensed` |
`cancelled` | `expired` | `completed`).

- **Modül:** prescriptions
- **Yetki:** `clinic:prescription:create` (STAFF / VETERINARIAN)
- **Audit:** `audit:prescription.create` (severity: info) —
  examinationId, patientId, items, status, expiresAt.

**Path params:**

- `id` (string, zorunlu) — `exam-<tenant8>-<uuid8>`.

**Request body (`PrescriptionCreateInput`):**

```json
{
  "items": [
    {
      "drugName": "Amoksisilin",
      "dosage": "250 mg",
      "frequency": "twice_daily",
      "durationDays": 7,
      "route": "oral",
      "instructions": "Yemek sonrası. Allerji yok."
    }
  ],
  "notes": "7 günlük antibiyotik tedavisi.",
  "durationDays": 7
}
```

- `items` (array, ≥1, zorunlu) — Reçete kalemleri.
  - `drugName` (string, 1-200, zorunlu) — İlaç/ürün adı.
  - `dosage` (string, 1-100, zorunlu) — Dozaj metni; ör. "5 mg",
    "0.5 ml", "1 tablet".
  - `frequency` (enum, zorunlu) — `once_daily` | `twice_daily` |
    `three_times_daily` | `every_8h` | `every_12h` | `as_needed` |
    `custom`.
  - `customFrequency` (string, max 200, opsiyonel) —
    `frequency='custom'` ise açıklayıcı metin.
  - `durationDays` (integer, 1-365, zorunlu) — Kalem başı tedavi
    süresi (gün).
  - `route` (enum, zorunlu) — `oral` | `topical` | `injection_im` |
    `injection_iv` | `injection_sc` | `inhalation` | `other`.
  - `instructions` (string, max 2000, opsiyonel) — Serbest klinik
    talimat.
- `notes` (string, max 2000, opsiyonel) — Reçete seviyesinde serbest
  not.
- `durationDays` (integer, 1-30, zorunlu) — Reçete seviyesinde
  geçerlilik süresi (gün); `expiresAt = now + durationDays`.

**Response 201 (`Prescription`):**

```json
{
  "id": "prsc-7a1b2c3d-000001",
  "tenantId": "tnt-uuid",
  "examinationId": "exam-7a1b2c3d-9b1deb4d",
  "patientId": "33333333-3333-3333-333333333333",
  "veterinarianId": "usr-vet-uuid",
  "items": [
    {
      "drugName": "Amoksisilin",
      "dosage": "250 mg",
      "frequency": "twice_daily",
      "durationDays": 7,
      "route": "oral",
      "instructions": "Yemek sonrası. Allerji yok."
    }
  ],
  "notes": "7 günlük antibiyotik tedavisi.",
  "status": "active",
  "prescribedAt": "2026-07-30T10:30:00.000Z",
  "expiresAt": "2026-08-06T10:30:00.000Z",
  "dispensedAt": null,
  "dispensedBy": null,
  "createdAt": "2026-07-30T10:30:00.000Z",
  "updatedAt": "2026-07-30T10:30:00.000Z",
  "cancelReason": null
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (422) — Body parse hatası (enum, range,
  `.strict()`).
- `VET-VALIDATION-0010` (422) — `items` boş veya `durationDays` 0/31+
  gün.
- `VET-CLINIC-0001` (404) — Examination bulunamadı / cross-tenant.

**İş kuralları:**

- Examination `ExaminationsService.findById(tenantId, id, actor)` ile
  aynı tenant'ta mı doğrulanır; cross-tenant → 404 `VET-CLINIC-0001`
  (bilgi sızdırmaz).
- Zod şema `.strict()` — bilinmeyen alan reddedilir (422
  `VET-VALIDATION-0001`).
- `patientId` muayeneden türetilir; client gönderemez (tutarlılık
  garantisi). `id` client tarafından set edilmez; service
  `prsc-<tenant8>-000001` (artan sayaç, tenant başına) üretir.
- Yeni reçete her zaman `status='active'` olarak başlatılır; diğer
  state'lere geçiş `dispense` / `cancel` endpoint'leri veya
  `expireOverdue` job'ı ile yapılır.
- `items` en az 1 kalem içermelidir; boş → 422
  `VET-VALIDATION-0010`. Her kalem kendi `durationDays`'ini (1-365)
  taşır; reçete seviyesinde `durationDays` (1-30) `expiresAt`'i
  belirler.
- Append-only politika: reçete üzerinde UPDATE/DELETE yok; iptal
  `cancelled` durumu + `cancelReason` ile; düzeltme `cancel` + yeni
  reçete.

**Tenant izolasyonu:** Service `requireTenantScope(actor, tenantId)`
ile `actor.tenantId` kapsamı enforce edilir; cross-tenant denemesi →
403 `VET-AUTHZ-0001`.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/prescription.ts`
- Reçete detayı: `GET /api/v1/clinic/prescriptions/{id}`
- Reçete listesi: `GET /api/v1/clinic/prescriptions`
- Reçete dağıt: `POST /api/v1/clinic/prescriptions/{id}/dispense`
- Reçete iptal: `POST /api/v1/clinic/prescriptions/{id}/cancel`
- Reçete PDF: `GET /api/v1/clinic/prescriptions/{id}/pdf`
- AI chunk: `flow-prescription-create`
