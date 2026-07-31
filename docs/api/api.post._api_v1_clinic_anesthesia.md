# POST /api/v1/clinic/anesthesia

Yeni anestezi takip kaydı. Bir ameliyat planı için açılır;
plan `in_progress` olmalı (422 VET-ANESTHESIA-0003). Aynı
plan için ikinci kayıt reddedilir (409
VET-ANESTHESIA-0004).

- **Modül:** anesthesia
- **Yetki:** `clinic:anesthesia:create`
- **Audit:** `audit:anesthesia.create` (info)

**Request body (`AnesthesiaCreateInput`):**

```json
POST /api/v1/clinic/anesthesia
{
  "surgeryPlanId": "sp-uuid",
  "patientId": "pat-uuid",
  "anesthesiologistId": "usr-uuid",
  "anesthesiaType": "general",
  "premedication": "Sedatif premed",
  "inductionAgent": "Propofol 1%",
  "maintenanceAgent": "Isoflurane",
  "airwayType": "endotracheal_tube",
  "notes": "Hasta ASA II"
}
```

- `surgeryPlanId` (string) zorunlu.
- `patientId` (string) zorunlu.
- `anesthesiologistId` (string) zorunlu.
- `anesthesiaType` (enum: `local|regional|general|sedation`)
  zorunlu.
- `premedication`/`inductionAgent`/`maintenanceAgent` opsiyonel.
- `airwayType` (enum: `none|face_mask|lma|endotracheal_tube`)
  opsiyonel.
- `notes` opsiyonel.

**Response 201 (`Anesthesia`):**

```json
{
  "id": "an-uuid",
  "tenantId": "tnt-uuid",
  "surgeryPlanId": "sp-uuid",
  "patientId": "pat-uuid",
  "anesthesiologistId": "usr-uuid",
  "anesthesiaType": "general",
  "status": "draft",
  "startedAt": null,
  "endedAt": null,
  "outcome": null
}
```

- `status`: `draft` → `finalized`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Plan/patient bulunamadı.
- `VET-ANESTHESIA-0003` (422) — Plan `in_progress`
  değil.
- `VET-ANESTHESIA-0004` (409) — Aynı plan için ikinci
  kayıt.

**Tenant izolasyonu:** Tüm CRUD tenant-scoped; SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/anesthesia.ts`
- Liste: `GET /api/v1/clinic/anesthesia`
- Detay: `GET /api/v1/clinic/anesthesia/{id}`
- İlaçlar: `POST /api/v1/clinic/anesthesia/{id}/medications`
- Vital: `POST /api/v1/clinic/anesthesia/{id}/vitals`
- Komplikasyonlar: `POST /api/v1/clinic/anesthesia/{id}/complications`
- Personel: `POST /api/v1/clinic/anesthesia/{id}/staff`
- Finalize: `POST /api/v1/clinic/anesthesia/{id}/finalize`
- Ameliyat: `flow-surgery-plan` (GOAL-080)
- AI chunk: `flow-anesthesia`
- Audit event: `audit:anesthesia.create`
