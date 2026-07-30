# GET /api/v1/clinic/prescriptions/{id}

ID'ye göre reçete detayını döner. Tenant-scoped; cross-tenant
denemesi → 404 `VET-CLINIC-0001` (bilgi sızdırmaz).

- **Modül:** prescriptions
- **Yetki:** `clinic:prescription:read` (STAFF / VETERINARIAN)
- **Audit:** Okuma — audit üretmez.

**Path params:**

- `id` (string, zorunlu) — `prsc-<tenant8>-<uuid8>`.

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

**İş kuralları:**

- `findById(tenantId, id, actor)` tenant-scoped; cross-tenant → null
  (controller 404 raise eder). Bilgi sızdırmaz: başka tenant'ın
  reçetesinin varlığı bile ifşa edilmez.
- Response `Prescription` şeması: `items`, `status`, `expiresAt`,
  `dispensedAt`, `dispensedBy`, `cancelReason` tamamı response'ta
  yer alır; null olan alanlar açıkça null döner.
- Append-only politika: response anlık reçete snapshot'udur;
  reçete üzerinde UPDATE/DELETE yok.

**Tenant izolasyonu:** Service `requireTenantScope(actor, tenantId)`
ile `actor.tenantId` kapsamı enforce edilir; cross-tenant denemesi →
403 `VET-AUTHZ-0001`.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/prescription.ts`
- Reçete oluştur: `POST /api/v1/clinic/examinations/{id}/prescriptions`
- Reçete listesi: `GET /api/v1/clinic/prescriptions`
- AI chunk: `flow-prescription-create`
