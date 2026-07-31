# PATCH /api/v1/clinic/surgery-plans/{id}

Ameliyat planı kısmi güncelleme. Yalnız `status='planned'`
güncellenebilir (409). Onam/anestezi/zatürre/operasyon
notu sonradan eklenir.

- **Modül:** surgery-plans
- **Yetki:** `clinic:surgery:create`
- **Audit:** `audit:surgery_plan.update` (info)

**Path parametreleri:**

- `id` (UUID) zorunlu.

**Request body (`SurgeryPlanUpdateInput`):**

```json
PATCH /api/v1/clinic/surgery-plans/sp-uuid
{
  "scheduledAt": "2026-08-11T10:00:00.000Z",
  "estimatedDuration": "90",
  "notes": "Süre tahmini güncellendi"
}
```

- `patientId`, `surgeonId`, `scheduledAt`, `procedureName`,
  `estimatedDuration`, `anesthesiaType`, `notes`
  opsiyonel; en az bir alan.

**Response 200 (`SurgeryPlan`):**

`SurgeryPlan` şeması için bkz.
`POST /api/v1/clinic/surgery-plans`.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- (404) — Plan bulunamadı.
- (409) — Yalnızca `planned` güncellenebilir.

**Tenant izolasyonu:** Cross-tenant id → 404. SUPERADMIN
bypass'lı.

**Audit detayı:** `before`+`after` snapshot.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/surgery-plan.ts`
- Detay: `GET /api/v1/clinic/surgery-plans/{id}`
- AI chunk: `flow-surgery-plan`
- Audit event: `audit:surgery_plan.update`
