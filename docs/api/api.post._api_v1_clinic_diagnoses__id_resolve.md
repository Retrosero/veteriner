# POST /api/v1/clinic/diagnoses/{id}/resolve

Teşhis kaydını çözümlenmiş (`resolved`) olarak işaretler. Yalnızca
`status='active'` olan teşhisler çözümlenebilir; aksi durumda 409
`VET-DIAG-0001` (state machine kuralı). `resolvedAt` set edilir.

- **Modül:** diagnoses
- **Yetki:** `clinic:examination:create` (STAFF / VETERINARIAN)
- **Audit:** `audit:diagnosis.resolve` (severity: info) —
  before/after status + resolvedAt.

**Path params:**

- `id` (string, zorunlu) — `diagnosis-<tenant8>-<uuid8>`.

**Request body:** yok.

**Response 200 (`Diagnosis`):**

```json
{
  "id": "diagnosis-7a1b2c3d-000001",
  "tenantId": "tnt-uuid",
  "examinationId": "exam-7a1b2c3d-9b1deb4d",
  "patientId": "33333333-3333-3333-333333333333",
  "code": null,
  "name": "Gastroenterit",
  "category": "secondary",
  "status": "resolved",
  "notes": null,
  "createdAt": "2026-07-30T10:00:00.000Z",
  "createdBy": "usr-vet-uuid",
  "resolvedAt": "2026-07-30T14:00:00.000Z"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-CLINIC-0001` (404) — Teşhis bulunamadı / cross-tenant.
- `VET-DIAG-0001` (409) — Teşhis durumu `active` değil
  (resolved/chronic/ruled_out zaten). details'te `id`, `status`.

**İş kuralları:**

- `status='active'` olan teşhis `resolved`'a geçirilir;
  `resolvedAt = now`. Status başka bir değerde ise 409
  `VET-DIAG-0001` (state machine: yalnızca aktif teşhis
  çözümlenebilir).
- `resolvedAt` null olan aktif teşhis `resolved`'a geçince
  `resolvedAt` set edilir; kronik teşhislerde ise `resolvedAt`
  her zaman null kalır (kronik = süregelen).
- Yanlış çözümleme düzeltmesi yeni bir teşhis kaydı
  (`POST .../diagnoses`) ile yapılır; mevcut kayıt append-only
  (klinik kayıt politikası).

**Tenant izolasyonu:** Service `requireTenantScope(actor, tenantId)`
+ `findById(tenantId, id)` tenant-scoped; cross-tenant denemesi →
403 `VET-AUTHZ-0001` veya 404 `VET-CLINIC-0001`.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/diagnosis.ts`
- Teşhis ekle: `POST /api/v1/clinic/examinations/{id}/diagnoses`
- Kronik yap: `POST /api/v1/clinic/diagnoses/{id}/chronic`
- AI chunk: `flow-diagnosis`
