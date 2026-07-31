# POST /api/v1/clinic/surgery-plans

Yeni ameliyat planı oluşturur. `patientId` + `surgeonId` +
`scheduledAt` + `procedureName` zorunlu. `status='planned'`.

- **Modül:** surgery-plans
- **Yetki:** `clinic:surgery:create`
- **Audit:** `audit:surgery_plan.create` (info)

**Request body (`SurgeryPlanCreateInput`):**

```json
POST /api/v1/clinic/surgery-plans
{
  "patientId": "pat-uuid",
  "surgeonId": "usr-uuid",
  "scheduledAt": "2026-08-10T10:00:00.000Z",
  "procedureName": "Kısırlaştırma (OVH)",
  "estimatedDuration": "60",
  "anesthesiaType": "general",
  "notes": "Pre-op kan testi gerekli"
}
```

- `patientId` (string) zorunlu.
- `surgeonId` (string) zorunlu.
- `scheduledAt` (ISO datetime) zorunlu.
- `procedureName` (string, 1-200) zorunlu.
- `estimatedDuration` (integer, dakika) opsiyonel.
- `anesthesiaType` (enum: `local|regional|general|sedation`)
  opsiyonel.
- `notes` (string) opsiyonel.

**Response 201 (`SurgeryPlan`):**

```json
{
  "id": "sp-uuid",
  "tenantId": "tnt-uuid",
  "patientId": "pat-uuid",
  "surgeonId": "usr-uuid",
  "scheduledAt": "2026-08-10T10:00:00.000Z",
  "procedureName": "Kısırlaştırma (OVH)",
  "estimatedDuration": 60,
  "anesthesiaType": "general",
  "status": "planned",
  "notes": "Pre-op kan testi gerekli",
  "createdAt": "2026-07-30T12:00:00.000Z"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-CLINIC-0001` (404) — Hayvan bulunamadı.

**Tenant izolasyonu:** Tüm sorgular tenant-scoped; SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/surgery-plan.ts`
- Liste: `GET /api/v1/clinic/surgery-plans`
- Detay: `GET /api/v1/clinic/surgery-plans/{id}`
- Güncelle: `PATCH /api/v1/clinic/surgery-plans/{id}`
- Başlat: `POST /api/v1/clinic/surgery-plans/{id}/start`
- Tamamla: `POST /api/v1/clinic/surgery-plans/{id}/complete`
- İptal: `POST /api/v1/clinic/surgery-plans/{id}/cancel`
- Onam: `flow-consent` (GOAL-081)
- Anestezi: `flow-anesthesia` (GOAL-082)
- AI chunk: `flow-surgery-plan`
- Audit event: `audit:surgery_plan.create`
