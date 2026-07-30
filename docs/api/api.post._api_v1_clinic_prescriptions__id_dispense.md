# POST /api/v1/clinic/prescriptions/{id}/dispense

`status='active'` olan reçeteyi `dispensed` yapar; `dispensedAt` +
`dispensedBy` set edilir. `active` değilse → 409 `VET-PRESC-0003`
(state machine kuralı).

- **Modül:** prescriptions
- **Yetki:** `clinic:prescription:dispense` (STAFF)
- **Audit:** `audit:prescription.dispense` (severity: info) — id,
  dispensedBy, items snapshot.

**Path params:**

- `id` (string, zorunlu) — `prsc-<tenant8>-<uuid8>`.

**Request body:** Yok.

**Response 200 (`Prescription`):**

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
  "status": "dispensed",
  "prescribedAt": "2026-07-30T10:30:00.000Z",
  "expiresAt": "2026-08-06T10:30:00.000Z",
  "dispensedAt": "2026-07-30T11:00:00.000Z",
  "dispensedBy": "usr-staff-uuid",
  "createdAt": "2026-07-30T10:30:00.000Z",
  "updatedAt": "2026-07-30T11:00:00.000Z",
  "cancelReason": null
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-CLINIC-0001` (404) — Reçete bulunamadı / cross-tenant.
- `VET-PRESC-0003` (409) — Reçete `active` değil (dispensed,
  cancelled, expired, completed); dağıtılamaz.

**İş kuralları:**

- Yalnızca `status='active'` olan reçeteler dağıtılabilir. Diğer
  durumlarda → 409 `VET-PRESC-0003` (state machine kuralı).
- Service `requireTenantScope(actor, tenantId)` + `findById` tenant
  doğrulaması yapar. Cross-tenant → 404 `VET-CLINIC-0001` (bilgi
  sızdırmaz).
- `dispensedAt` (şu an), `dispensedBy` (actor.userId) otomatik set
  edilir; client gönderemez.
- Dispense aksiyonu stok düşümü (GOAL-066) ile köprü kurar; FAZ-0'da
  yalnızca reçete state transition yapılır.
- Append-only politika: dağıtım sonrası reçete üzerinde UPDATE yok;
  alanlar immutable. Yanlış dağıtım düzeltmesi reçete iptali
  edilemez (`dispensed` durumda cancel → 409 `VET-PRESC-0004`);
  yeni reçete yazılır.

**Tenant izolasyonu:** Service `requireTenantScope(actor, tenantId)`
ile `actor.tenantId` kapsamı enforce edilir; cross-tenant denemesi →
403 `VET-AUTHZ-0001`.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/prescription.ts`
- Reçete oluştur: `POST /api/v1/clinic/examinations/{id}/prescriptions`
- Reçete iptal: `POST /api/v1/clinic/prescriptions/{id}/cancel`
- AI chunk: `flow-prescription-dispense`
