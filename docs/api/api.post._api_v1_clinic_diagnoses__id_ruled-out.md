# POST /api/v1/clinic/diagnoses/{id}/ruled-out

Teşhis kaydını elenmiş (`ruled_out`) olarak işaretler. Yalnızca
`status='active'` olan teşhisler elenebilir; aksi durumda 409
`VET-DIAG-0001` (state machine kuralı). `differential` kategorili
teşhisler de elenebilir (FAZ-4 istisnası).

- **Modül:** diagnoses
- **Yetki:** `clinic:examination:create` (STAFF / VETERINARIAN)
- **Audit:** `audit:diagnosis.ruled_out` (severity: info) —
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
  "code": null,
  "name": "Pankreatit",
  "category": "differential",
  "status": "ruled_out",
  "notes": "cPL normal; dışlandı.",
  "createdAt": "2026-07-30T10:00:00.000Z",
  "createdBy": "usr-vet-uuid",
  "resolvedAt": null
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

- `status='active'` olan teşhis `ruled_out`'a geçirilir. Status
  başka bir değerde ise 409 `VET-DIAG-0001` (state machine).
- `category` bağımsız: `primary`, `secondary`, `differential`,
  `rule_out` hepsi `active` iken `ruled_out` yapılabilir.
  `differential` aday teşhisler tipik olarak test sonuçları
  sonrası elenir (örn. cPL negatif → pankreatit dışlandı).
- Elenen teşhis `?status=ruled_out` filtresiyle görüntülenebilir;
  problem listesinde görünmez (default `?status=active+chronic`).

**Tenant izolasyonu:** Service `requireTenantScope(actor, tenantId)`
+ `findById(tenantId, id)` tenant-scoped; cross-tenant denemesi →
403 `VET-AUTHZ-0001` veya 404 `VET-CLINIC-0001`.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/diagnosis.ts`
- Teşhis ekle: `POST /api/v1/clinic/examinations/{id}/diagnoses`
- Çözümle: `POST /api/v1/clinic/diagnoses/{id}/resolve`
- AI chunk: `flow-diagnosis`
