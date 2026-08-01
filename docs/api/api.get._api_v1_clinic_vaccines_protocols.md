# GET /api/v1/clinic/vaccines/protocols

Tenant kapsamında aşı protokolü listesi. Filtreler: `species`,
`category`, `isCore`, `limit` (1-200, default 20), `offset`
(default 0). Arşivlenmiş kayıtlar dönmez. Sonuç
`VaccineProtocolListResponse` şemasında döner: `items` + `total`.

- **Modül:** vaccines
- **Yetki:** `clinic:vaccination:read`
- **Audit:** YAYINLAMAZ (read-heavy; gürültü kontrolü).

**Query (`VaccineProtocolFilters`):**

```
GET /api/v1/clinic/vaccines/protocols
  ?species=dog
  &category=core
  &isCore=true
  &limit=20
  &offset=0
```

- `species` (enum, opsiyonel) — `dog | cat | bird | all`.
- `category` (enum, opsiyonel) — `core | non_core |
lifestyle | not_recommended`.
- `isCore` (boolean, opsiyonel) — yalnızca core aşıları
  filtrele (`true`) veya core olmayanları (`false`).
- `limit` (1-200, default 20), `offset` (0-10000, default 0).

**Response 200 (`VaccineProtocolListResponse`):**

```json
{
  "items": [
    {
      "id": "vacp-tnt12345-000001",
      "tenantId": "tnt-uuid",
      "name": "Köpek yavru karma aşı takvimi (DHPP)",
      "species": "dog",
      "category": "core",
      "manufacturer": "Nobivac",
      "defaultDose": { "amount": 1, "unit": "ml" },
      "steps": [
        {
          "ageWeeks": 6,
          "vaccineName": "DHPP - 1. doz",
          "boosterIntervalDays": 21,
          "notes": "yavru"
        }
      ],
      "totalDurationMonths": 3,
      "isCore": true,
      "createdAt": "2026-07-30T12:00:00.000Z",
      "createdBy": "usr-uuid",
      "updatedAt": "2026-07-30T12:00:00.000Z",
      "archivedAt": null
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
zaman tenant filtresiyle çalışır. SUPERADMIN de kendi
`tenantId`'si ile sınırlıdır; service `requireTenantScope`
ile ek kontrol yapar. Arşivli kayıtlar sorgudan hariç tutulur
(`archivedAt === null` filtresi repo'da zorunlu).

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/vaccine.ts`
- Oluşturma: `POST /api/v1/clinic/vaccines/protocols`
- Detay: `GET /api/v1/clinic/vaccines/protocols/{id}`
- Güncelle: `PATCH /api/v1/clinic/vaccines/protocols/{id}`
- Arşivle: `DELETE /api/v1/clinic/vaccines/protocols/{id}`
- AI chunk: `glossary-vaccine-protocol`
