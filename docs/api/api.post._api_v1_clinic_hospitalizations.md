# POST /api/v1/clinic/hospitalizations

Yeni yatış kaydı oluşturur (`status='planned'`). `patientId`

- `admittingVetId` + `reason` zorunlu. Kafes
  opsiyonel (admit sırasında atanır).

* **Modül:** hospitalization
* **Yetki:** `clinic:hospitalization:admit`
* **Audit:** `audit:hospitalization.create` (info)

**Request body (`HospitalizationCreateInput`):**

```json
POST /api/v1/clinic/hospitalizations
{
  "patientId": "pat-uuid",
  "admittingVetId": "usr-uuid",
  "reason": "Post-op gözlem",
  "expectedDuration": "48",
  "initialCageId": "cage-uuid",
  "notes": "NSAID + antibiyotik"
}
```

- `patientId` (string) zorunlu.
- `admittingVetId` (string) zorunlu.
- `reason` (string, 1-500) zorunlu.
- `expectedDuration` (integer, saat) opsiyonel.
- `initialCageId` (string|null) opsiyonel.
- `notes` opsiyonel.

**Response 201 (`Hospitalization`):**

```json
{
  "id": "hosp-uuid",
  "tenantId": "tnt-uuid",
  "patientId": "pat-uuid",
  "admittingVetId": "usr-uuid",
  "reason": "Post-op gözlem",
  "status": "planned",
  "expectedDuration": 48,
  "currentCageId": "cage-uuid",
  "admittedAt": null,
  "dischargedAt": null,
  "createdAt": "2026-07-30T12:00:00.000Z"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Patient veya cage bulunamadı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/hospitalization.ts`
- Liste: `GET /api/v1/clinic/hospitalizations`
- Detay: `GET /api/v1/clinic/hospitalizations/{id}`
- Kabul: `POST /api/v1/clinic/hospitalizations/{id}/admit`
- Taburcu: `POST /api/v1/clinic/hospitalizations/{id}/discharge`
- İptal: `POST /api/v1/clinic/hospitalizations/{id}/cancel`
- Kafes atama: `POST /api/v1/clinic/hospitalizations/{id}/cage-assignments`
- AI chunk: `flow-hospitalization`
- Audit event: `audit:hospitalization.create`
