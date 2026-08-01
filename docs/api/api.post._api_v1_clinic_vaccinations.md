# POST /api/v1/clinic/vaccinations

Bir hayvana aşı uygulaması kaydeder. Hasta ve protokol
cross-tenant → 404. `lotNumber` aynı tenant + protokol altında
tekil olmalı; duplicate → 409 `VET-VACC-0003`. `nextDueAt`
protokolün adımlarından türetilir (otomatik).

- **Modül:** vaccinations
- **Yetki:** `clinic:vaccination:create`
- **Audit:** `audit:vaccination.create` (info)

**Request body (`VaccinationCreateInput`):**

```json
POST /api/v1/clinic/vaccinations
{
  "patientId": "pat-uuid",
  "protocolId": "vacp-tnt12345-000001",
  "vaccineName": "DHPP - 1. doz",
  "dose": "1 ml",
  "lotNumber": "LOT-2026-0001",
  "manufacturer": "Nobivac",
  "administeredAt": "2026-07-30T09:30:00.000Z",
  "notes": "yavru, sağlıklı"
}
```

- `patientId` (string, 1-100) zorunlu.
- `protocolId` (string, 1-100) zorunlu — aşı kataloğundan
  (GOAL-050).
- `vaccineName` (string, 1-200) zorunlu — uygulanan aşının
  adı (protokol adımından gelir).
- `dose` (string, 1-100) zorunlu — serbest metin (ör.
  "1 ml", "0.5 dose").
- `lotNumber` (string, 1-100) zorunlu — aynı tenant + protokol
  altında tekil olmalı.
- `manufacturer` (string, ≤200) opsiyonel.
- `administeredAt` (ISO 8601 datetime) opsiyonel; yoksa
  `now()` (UTC).
- `notes` (string, ≤2000) opsiyonel.

**Türetme kuralları (service):**

- `nextDueAt`:
  - 2+ step → `administeredAt + (steps[1].ageWeeks −
steps[0].ageWeeks) × 7 gün`.
  - Tek step + `boosterIntervalDays` → `administeredAt +
boosterIntervalDays`.
  - Aksi hâlde → `null`.
- `status` her zaman `administered` (oluşturma anında).
- `veterinarianId` → `actor.actorId` (veya "system").
- ID `vacr-<tenant8>-000001`, tenant başına artan sayaç.

**Response 201 (`Vaccination`):**

```json
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
  "notes": "yavru, sağlıklı",
  "createdBy": "usr-uuid",
  "createdAt": "2026-07-30T09:30:00.000Z",
  "cancelledAt": null,
  "cancellationReason": null
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok / tenant scope mismatch.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası (Zod).
- `VET-CLINIC-0001` (404) — Hayvan bulunamadı.
- `VET-VACC-0004` (404) — Aşı protokolü bulunamadı.
- `VET-VACC-0003` (409) — Aynı lot numarası bu protokol için
  zaten kullanılmış (iptal edilmiş kayıtlar sayılmaz).

**Tenant izolasyonu:** `actor.tenantId` zorunlu; service
`requireTenantScope` ile tenant doğrular. Patient ve protocol
ayrı modüllere `findById`/`getProtocol` ile sorgulanır; her
ikisi de cross-tenant → null (bilgi sızdırmaz). SUPERADMIN
bypass'lı.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/vaccination.ts`
- Liste: `GET /api/v1/clinic/vaccinations`
- Detay: `GET /api/v1/clinic/vaccinations/{id}`
- İptal: `POST /api/v1/clinic/vaccinations/{id}/cancel`
- Gelecek tarihli: `GET /api/v1/clinic/patients/{id}/vaccinations/next-due`
- Gecikmiş: `GET /api/v1/clinic/patients/{id}/vaccinations/overdue`
- AI chunk: `flow-vaccination`
- Audit event: `audit:vaccination.create`
