# GET /api/v1/clinic/patients/{id}/vitals/latest

Hastanın tüm muayenelerindeki en yeni vital kaydını döndürür
(`takenAt` desc). Hiç kayıt yoksa `null`. Cross-tenant patient
→ 404 `VET-CLINIC-0001` (bilgi sızdırmaz).

- **Modül:** vitals
- **Yetki:** `clinic:patient:read` (STAFF / VETERINARIAN)
- **Audit:** Okuma işlemi audit üretmez (listeleme standardı).

**Path params:**

- `id` (string, zorunlu) — patient UUID.

**Response 200 (`VitalsRecord | null`):**

```json
{
  "id": "vitals-7a1b2c3d-000003",
  "tenantId": "tnt-uuid",
  "examinationId": "exam-7a1b2c3d-9b1deb4d",
  "patientId": "33333333-3333-3333-3333-333333333333",
  "veterinarianId": "vet-uuid",
  "vitalSigns": {
    "temperatureC": 38.5,
    "heartRateBpm": 110,
    "respiratoryRateBpm": 24
  },
  "takenAt": "2026-07-30T12:00:00.000Z",
  "recordedBy": "usr-vet-uuid"
}
```

Hiç vital kaydı yoksa `null` döner:

```json
null
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-CLINIC-0001` (404) — Hayvan bulunamadı / cross-tenant.

**İş kuralları:**

- `latestForPatient(tenantId, patientId, actor)` önce
  `PatientsService.findById(tenantId, id, actor)` ile hastanın aynı
  tenant'ta olduğunu doğrular. Cross-tenant veya olmayan patient →
  404 `VET-CLINIC-0001` (bilgi sızdırmaz; "hayvan yok" ile aynı
  kod).
- Tenant-scoped tüm vital kayıtları arasında `takenAt` en yeni olan
  döner. Hasta birden fazla muayenede vital kaydına sahip olabilir;
  tüm muayeneler taranır.
- Hiç kayıt yoksa `null` (200) — 404 değil. "Vital yok" bir hata
  değil, normal durum (ilk muayene öncesi).

**Tenant izolasyonu:** Service `requireTenantScope(actor, tenantId)`
+ `PatientsService.findById` + `latestForPatient` tümü
`actor.tenantId` kapsamında; cross-tenant denemesi → 403
`VET-AUTHZ-0001` veya 404 `VET-CLINIC-0001`.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/vitals.ts`
- Vital kaydet: `POST /api/v1/clinic/examinations/{id}/vitals`
- Muayene vital listesi: `GET /api/v1/clinic/examinations/{id}/vitals`
- AI chunk: `flow-vitals`
