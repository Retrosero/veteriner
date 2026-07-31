# GET /api/v1/clinic/vaccinations

Tenant kapsamında aşı uygulama kayıtları listesi. Filtreler:
`patientId`, `protocolId`, `status`, `from` (administeredAt ≥
from), `to` (administeredAt ≤ to). En yeni kayıt üstte.
Sonuç `VaccinationListResponse` şemasında döner: `items` +
`total`.

- **Modül:** vaccinations
- **Yetki:** `clinic:vaccination:read`
- **Audit:** YAYINLAMAZ (read-heavy; gürültü kontrolü).

**Query (`VaccinationFilters`):**

```
GET /api/v1/clinic/vaccinations
  ?patientId=pat-uuid
  &protocolId=vacp-tnt12345-000001
  &status=administered
  &from=2026-01-01T00:00:00.000Z
  &to=2026-12-31T23:59:59.999Z
```

- `patientId` (string, opsiyonel) — belirli bir hayvanın
  kayıtları.
- `protocolId` (string, opsiyonel) — belirli bir protokolün
  kayıtları.
- `status` (enum, opsiyonel) — `administered` | `scheduled`
  | `cancelled` | `overdue`.
- `from` (ISO 8601 datetime, opsiyonel) — `administeredAt`
  alt sınırı.
- `to` (ISO 8601 datetime, opsiyonel) — `administeredAt`
  üst sınırı.

**Response 200 (`VaccinationListResponse`):**

```json
{
  "items": [
    {
      "id": "vacr-tnt12345-000001",
      "tenantId": "tnt-uuid",
      "patientId": "pat-uuid",
      "veterinarianId": "usr-uuid",
      "protocolId": "vacp-tnt12345-000001",
      "vaccineName": "DHPP - 1. doz",
      "dose": "1 ml",
      "lotNumber": "LOT-2026-0001",
      "manufacturer": "Nobivac",
      "administeredAt": "2026-07-30T09:30:00.000Z",
      "nextDueAt": "2026-08-20T09:30:00.000Z",
      "status": "administered",
      "notes": null,
      "createdBy": "usr-uuid",
      "createdAt": "2026-07-30T09:30:00.000Z",
      "cancelledAt": null,
      "cancellationReason": null
    }
  ],
  "total": 1
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok / tenant scope mismatch.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Query parse hatası (Zod).

**Tenant izolasyonu:** `repository.search(tenantId, ...)` her
zaman tenant filtresiyle çalışır. Service `requireTenantScope`
ile ek kontrol yapar. SUPERADMIN de kendi `tenantId`'si ile
sınırlıdır. Sıralama: `administeredAt DESC` (en yeni üstte).

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/vaccination.ts`
- Oluşturma: `POST /api/v1/clinic/vaccinations`
- Detay: `GET /api/v1/clinic/vaccinations/{id}`
- İptal: `POST /api/v1/clinic/vaccinations/{id}/cancel`
- Gelecek tarihli: `GET /api/v1/clinic/patients/{id}/vaccinations/next-due`
- Gecikmiş: `GET /api/v1/clinic/patients/{id}/vaccinations/overdue`
- AI chunk: `flow-vaccination`
