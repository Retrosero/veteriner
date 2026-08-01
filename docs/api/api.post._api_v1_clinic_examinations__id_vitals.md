# POST /api/v1/clinic/examinations/{id}/vitals

Muayeneye bağlı yeni vital bulguları (vücut sıcaklığı, nabız, solunum,
ağırlık, BCS, kan basıncı, CRT, mukoza rengi) kaydeder. `patientId`

- `veterinarianId` muayeneden türetilir; client gönderemez. En az
  bir ölçüm alanı dolu olmalı (`notes` tek başına yetmez). Vital
  kaydı append-only; düzeltme yeni vital kaydı yazımı ile yapılır.

* **Modül:** vitals
* **Yetki:** `clinic:examination:create` (STAFF / VETERINARIAN)
* **Audit:** `audit:vitals.record` (severity: info) —
  examinationId, patientId, veterinarianId, takenAt, fields.

**Path params:**

- `id` (string, zorunlu) — `exam-<tenant8>-<uuid8>`.

**Request body (`VitalSignsCreateInput`):**

```json
{
  "vitalSigns": {
    "temperatureC": 38.5,
    "temperatureMethod": "rectal",
    "heartRateBpm": 110,
    "respiratoryRateBpm": 24,
    "weightKg": 12.4,
    "bodyConditionScore": 5,
    "bloodPressureSystolic": 130,
    "bloodPressureDiastolic": 80,
    "capillaryRefillTime": 1.5,
    "mucousMembraneColor": "pink",
    "notes": "Hasta sakin, muayene koopere."
  },
  "takenAt": "2026-07-30T10:15:00.000Z"
}
```

- `vitalSigns` (object, zorunlu) — ölçülen vital bulgular seti.
  - `temperatureC` (number, 35-42, opsiyonel) — vücut sıcaklığı °C.
  - `temperatureMethod` (enum, opsiyonel) — `rectal` | `ear` |
    `axillary`.
  - `heartRateBpm` (int, 30-300, opsiyonel) — nabız BPM.
  - `respiratoryRateBpm` (int, 8-100, opsiyonel) — solunum hızı BPM.
  - `weightKg` (number, 0-200, opsiyonel) — ağırlık kg.
  - `bodyConditionScore` (int, 1-9, opsiyonel) — vücut kondüsyon skoru.
  - `bloodPressureSystolic` (int, 60-250, opsiyonel) — sistolik mmHg.
  - `bloodPressureDiastolic` (int, 40-150, opsiyonel) — diyastolik mmHg.
  - `capillaryRefillTime` (number, 0-5, opsiyonel) — CRT saniye.
  - `mucousMembraneColor` (enum, opsiyonel) — `pink` | `pale` |
    `cyanotic` | `icteric` | `congested`.
  - `notes` (string, max 2000, opsiyonel) — serbest klinik not.
- `takenAt` (ISO 8601 datetime, opsiyonel) — ölçüm zamanı; belirtilmezse
  service `new Date().toISOString()` set eder.

**Response 201 (`VitalsRecord`):**

```json
{
  "id": "vitals-7a1b2c3d-000001",
  "tenantId": "tnt-uuid",
  "examinationId": "exam-7a1b2c3d-9b1deb4d",
  "patientId": "33333333-3333-3333-3333-333333333333",
  "veterinarianId": "vet-uuid",
  "vitalSigns": {
    "temperatureC": 38.5,
    "temperatureMethod": "rectal",
    "heartRateBpm": 110,
    "respiratoryRateBpm": 24
  },
  "takenAt": "2026-07-30T10:15:00.000Z",
  "recordedBy": "usr-vet-uuid"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası veya range
  validation (örn. `temperatureC=45`).
- `VET-CLINIC-0001` (404) — Muayene bulunamadı / cross-tenant.
- `VET-VALIDATION-0010` (422) — Boş vital seti (tüm ölçüm
  alanları boş; yalnız `notes` girilmiş). details'te `examinationId`.

**İş kuralları:**

- Examination aynı tenant'ta olmalı
  (`ExaminationsService.findById(tenantId, id, actor)`); cross-tenant
  → 404 `VET-CLINIC-0001` (bilgi sızdırmaz).
- Zod şema `.strict()` — bilinmeyen alan reddedilir (422
  `VET-VALIDATION-0001`).
- Tüm ölçüm alanları opsiyoneldir (UI esnekliği); ancak service
  `hasAnyMeasurement()` ile en az bir ölçüm alanı dolu olmalı
  kontrolü yapar. Yalnız `notes` girilmesi klinik değer taşımaz
  → 422 `VET-VALIDATION-0010`.
- Range validation Zod'da: `temperatureC` 35-42, `heartRateBpm`
  30-300 int, `respiratoryRateBpm` 8-100 int, `weightKg` 0-200,
  `bodyConditionScore` 1-9 int, `bloodPressureSystolic` 60-250
  int, `bloodPressureDiastolic` 40-150 int, `capillaryRefillTime`
  0-5. Geçersiz aralık → 422 `VET-VALIDATION-0001` (Zod parse).
- `patientId` + `veterinarianId` muayeneden türetilir; client
  gönderemez. `id` client tarafından set edilmez; service
  `vitals-<tenant8>-000001` (artan sayaç, tenant başına) üretir.
- Vital kaydı append-only; mevcut kayıt üzerinde UPDATE/DELETE
  yok. Yanlış ölçüm düzeltmesi yeni vital kaydı yazımı ile yapılır
  (önceki kayıt korunur; muayene zaman çizelgesinde tüm ölçümler
  görünür kalır). Production'da DB trigger (`update`/`delete` →
  reddet) FAZ-0'da no-op flag.

**Tenant izolasyonu:** Service `requireTenantScope(actor, tenantId)`
ile `actor.tenantId` kapsamı enforce edilir; cross-tenant denemesi →
403 `VET-AUTHZ-0001`.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/vitals.ts`
- Muayene vital listesi: `GET /api/v1/clinic/examinations/{id}/vitals`
- Hastanın en yeni vitali: `GET /api/v1/clinic/patients/{id}/vitals/latest`
- AI chunk: `flow-vitals`
