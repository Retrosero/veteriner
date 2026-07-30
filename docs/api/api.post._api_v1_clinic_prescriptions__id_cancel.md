# POST /api/v1/clinic/prescriptions/{id}/cancel

`status='active'` olan reçeteyi `cancelled` yapar; `cancelReason`
(1-2000, zorunlu) kaydedilir. Zaten iptal edilmiş / `expired` /
`completed` → 409 `VET-PRESC-0004` (state machine kuralı).

- **Modül:** prescriptions
- **Yetki:** `clinic:prescription:cancel` (VETERINARIAN)
- **Audit:** `audit:prescription.cancel` (severity: warning) — id,
  cancelReason.

**Path params:**

- `id` (string, zorunlu) — `prsc-<tenant8>-<uuid8>`.

**Request body (`PrescriptionCancelInput`):**

```json
{
  "reason": "Hasta allerji gösterdi; tedavi değiştirildi."
}
```

- `reason` (string, 1-2000, zorunlu) — İptal nedeni.

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
  "status": "cancelled",
  "prescribedAt": "2026-07-30T10:30:00.000Z",
  "expiresAt": "2026-08-06T10:30:00.000Z",
  "dispensedAt": null,
  "dispensedBy": null,
  "createdAt": "2026-07-30T10:30:00.000Z",
  "updatedAt": "2026-07-30T11:15:00.000Z",
  "cancelReason": "Hasta allerji gösterdi; tedavi değiştirildi."
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (422) — Body parse hatası (`reason` zorunlu,
  1-2000, `.strict()`).
- `VET-CLINIC-0001` (404) — Reçete bulunamadı / cross-tenant.
- `VET-PRESC-0004` (409) — Reçete `active` değil (cancelled, expired,
  completed); iptal edilemez.

**İş kuralları:**

- Yalnızca `status='active'` olan reçeteler iptal edilebilir.
  `cancelled` / `expired` / `completed` → 409 `VET-PRESC-0004`
  (state machine kuralı; tekrarlı iptal reddedilir).
- Service `requireTenantScope(actor, tenantId)` + `findById` tenant
  doğrulaması yapar. Cross-tenant → 404 `VET-CLINIC-0001` (bilgi
  sızdırmaz).
- `cancelReason` zorunlu (1-2000); Zod `.strict()` — bilinmeyen
  alan reddedilir (422 `VET-VALIDATION-0001`).
- Append-only politika: iptal `cancelled` durumu + `cancelReason`
  ile yapılır; fiziksel silme yok. Yanlış reçete düzeltmesi
  `cancel` + yeni reçete; önceki kayıt korunur.
- Audit severity **warning**: iptal hassas işlem (klinik kayıt
  değişikliği).

**Tenant izolasyonu:** Service `requireTenantScope(actor, tenantId)`
ile `actor.tenantId` kapsamı enforce edilir; cross-tenant denemesi →
403 `VET-AUTHZ-0001`.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/prescription.ts`
- Reçete oluştur: `POST /api/v1/clinic/examinations/{id}/prescriptions`
- Reçete dağıt: `POST /api/v1/clinic/prescriptions/{id}/dispense`
- AI chunk: `flow-prescription-dispense`
