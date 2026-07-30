# GET /api/v1/clinic/prescriptions

Reçete listesi. Tenant-scoped; opsiyonel `patientId`, `status`, `from`,
`to` filtreleri; pagination `limit` + `offset`.

- **Modül:** prescriptions
- **Yetki:** `clinic:prescription:read` (STAFF / VETERINARIAN)
- **Audit:** Okuma — audit üretmez.

**Query params (`PrescriptionFilters`):**

- `patientId` (string, opsiyonel) — Hasta UUID filtresi.
- `status` (enum, opsiyonel) — `active` | `dispensed` | `cancelled` |
  `expired` | `completed`.
- `from` (ISO 8601 datetime, opsiyonel) — `prescribedAt >= from`.
- `to` (ISO 8601 datetime, opsiyonel) — `prescribedAt <= to`.
- `limit` (integer, 1-200, default 20) — Sayfa boyutu.
- `offset` (integer, 0-10000, default 0) — Sayfa başlangıç offset'i.

**Response 200 (`PrescriptionListResponse`):**

```json
{
  "items": [
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
      "notes": null,
      "status": "active",
      "prescribedAt": "2026-07-30T10:30:00.000Z",
      "expiresAt": "2026-08-06T10:30:00.000Z",
      "dispensedAt": null,
      "dispensedBy": null,
      "createdAt": "2026-07-30T10:30:00.000Z",
      "updatedAt": "2026-07-30T10:30:00.000Z",
      "cancelReason": null
    }
  ],
  "total": 42
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (422) — Query parse hatası (enum, range).

**İş kuralları:**

- `list(tenantId, filters, actor)` tenant-scoped; tüm sorgular
  `tenantId` zorunlu filtresi ile yapılır. Cross-tenant sonuç
  ifşa edilmez.
- Filtre kombinasyonları AND; boş filtre tüm tenant reçetelerini
  döner (pagination ile sınırlı).
- Sıralama: varsayılan `prescribedAt DESC` (yeni reçete önce).
- `total` filtresiz toplamı değil, filtrelenmiş toplamı döner
  (UI pagination hesabı için).

**Tenant izolasyonu:** Service `requireTenantScope(actor, tenantId)`
ile `actor.tenantId` kapsamı enforce edilir; cross-tenant denemesi →
403 `VET-AUTHZ-0001`.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/prescription.ts`
- Reçete oluştur: `POST /api/v1/clinic/examinations/{id}/prescriptions`
- Reçete detayı: `GET /api/v1/clinic/prescriptions/{id}`
- AI chunk: `flow-prescription-create`
