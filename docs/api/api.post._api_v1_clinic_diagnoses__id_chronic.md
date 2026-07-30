# POST /api/v1/clinic/diagnoses/{id}/chronic

Teşhis kaydını kronik (`chronic`) olarak işaretler. Yalnızca
`status='active'` olan teşhisler kronik yapılabilir; aksi durumda
409 `VET-DIAG-0001` (state machine kuralı). `resolvedAt` null
kalır (kronik = süregelen durum).

- **Modül:** diagnoses
- **Yetki:** `clinic:examination:create` (STAFF / VETERINARIAN)
- **Audit:** `audit:diagnosis.chronic` (severity: info) —
  before/after status.

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
  "code": "N18.9",
  "name": "Kronik böbrek yetmezliği",
  "category": "primary",
  "status": "chronic",
  "notes": "IRIS stage 2.",
  "createdAt": "2026-07-15T10:00:00.000Z",
  "createdBy": "usr-vet-uuid",
  "resolvedAt": null
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-CLINIC-0001` (404) — Teşhis bulunamadı / cross-tenant.
- `VET-DIAG-0001` (409) — Teşhis durumu `active` değil.
  details'te `id`, `status`.

**İş kuralları:**

- `status='active'` olan teşhis `chronic`'e geçirilir. Status
  başka bir değerde ise 409 `VET-DIAG-0001` (state machine).
- Kronik teşhis problem listesinde ayrı görünür
  (`?status=chronic`); `resolvedAt` her zaman null kalır
  (kronik = süregelen; çözülmüş değil).
- `chronic` → `resolved` geçişi şu an desteklenmiyor; yanlış
  kronik işaretleme düzeltmesi yeni teşhis kaydı ile yapılır
  (append-only politika).

**Tenant izolasyonu:** Service `requireTenantScope(actor, tenantId)`
+ `findById(tenantId, id)` tenant-scoped; cross-tenant denemesi →
403 `VET-AUTHZ-0001` veya 404 `VET-CLINIC-0001`.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/diagnosis.ts`
- Teşhis ekle: `POST /api/v1/clinic/examinations/{id}/diagnoses`
- Çözümle: `POST /api/v1/clinic/diagnoses/{id}/resolve`
- AI chunk: `flow-diagnosis`
