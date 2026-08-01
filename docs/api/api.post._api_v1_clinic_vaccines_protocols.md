# POST /api/v1/clinic/vaccines/protocols

Tenant kapsamında yeni bir aşı protokolü oluşturur. Protokol;
tür (species) + kategori (WSAVA/AAHA: core/non_core/lifestyle/
not_recommended) + adım listesi (ageWeeks + vaccineName) +
opsiyonel doz ve üretici bilgisi taşır. `isCore` ve
`totalDurationMonths` alanları client'tan alınmaz; service
katmanında türetilir.

- **Modül:** vaccines
- **Yetki:** `clinic:vaccination:create`
- **Audit:** `audit:vaccine.protocol.create` (info)

**Request body (`VaccineProtocolCreateInput`):**

```json
POST /api/v1/clinic/vaccines/protocols
{
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
    },
    {
      "ageWeeks": 9,
      "vaccineName": "DHPP - 2. doz",
      "boosterIntervalDays": 21
    },
    {
      "ageWeeks": 12,
      "vaccineName": "DHPP - 3. doz + Kuduz",
      "boosterIntervalDays": 365
    }
  ]
}
```

- `name` (string, 1-200) zorunlu.
- `species` (enum) zorunlu: `dog | cat | bird | all`.
- `category` (enum) zorunlu: `core | non_core | lifestyle |
not_recommended`.
- `manufacturer` (string, ≤200) opsiyonel.
- `defaultDose` (`{amount, unit}`) opsiyonel — `unit`:
  `ml | dose | mg | drop`; `amount` 0-1000.
- `steps` (array) zorunlu, en az 1 (boş → 422). Her step:
  `ageWeeks` (0-2080), `vaccineName` (1-200),
  `boosterIntervalDays` (0-3650, opsiyonel),
  `dose` (override, opsiyonel), `notes` (≤500, opsiyonel).
- `isCore` / `totalDurationMonths` client'tan KABUL EDİLMEZ
  (`.strict()`; service türetir).

**Türetme kuralları (service):**

- `category === "core"` → `isCore = true`; diğer kategorilerde
  `false`.
- `totalDurationMonths` son step'in `ageWeeks`'inden hesaplanır
  (hafta → ay yuvarlama). `steps[steps.length-1].ageWeeks = 12`
  → `totalDurationMonths = 3` (yaklaşık 3 ay).

**Response 201 (`VaccineProtocol`):**

```json
{
  "id": "vacp-tnt12345-000001",
  "tenantId": "tnt-uuid",
  "name": "Köpek yavru karma aşı takvimi (DHPP)",
  "species": "dog",
  "category": "core",
  "manufacturer": "Nobivac",
  "defaultDose": { "amount": 1, "unit": "ml" },
  "steps": [/* ... steps as above ... */],
  "totalDurationMonths": 3,
  "isCore": true,
  "createdAt": "2026-07-30T12:00:00.000Z",
  "createdBy": "usr-uuid",
  "updatedAt": "2026-07-30T12:00:00.000Z",
  "archivedAt": null
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok / tenant scope mismatch.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası (Zod).
- `VET-VALIDATION-0010` (422) — `steps` boş (en az 1 adım
  zorunlu).

**Tenant izolasyonu:** `actor.tenantId` zorunlu; service
`requireTenantScope` ile tenant doğrular. SUPERADMIN
farklı tenant adına oluşturabilir. ID `vacp-<tenant8>-000001`
formatında, tenant başına artan sayaç.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/vaccine.ts`
- Liste: `GET /api/v1/clinic/vaccines/protocols`
- Detay: `GET /api/v1/clinic/vaccines/protocols/{id}`
- Güncelle: `PATCH /api/v1/clinic/vaccines/protocols/{id}`
- Arşivle: `DELETE /api/v1/clinic/vaccines/protocols/{id}`
- AI chunk: `glossary-vaccine-protocol`
- Audit event: `audit:vaccine.protocol.create`
