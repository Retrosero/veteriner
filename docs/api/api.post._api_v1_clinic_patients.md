# POST /api/v1/clinic/patients

Yeni hasta (hayvan) kaydı oluşturur. Owner'ın aynı tenant'ta olduğu
doğrulanır (cross-tenant → 404). Tür TR pilot whitelist'inde olmalı
(`dog`, `cat`, `bird`). Tenant bağlamı `actor.tenantId`'den alınır
(URL'de taşınmaz — cross-tenant IDOR koruması).

- **Modül:** clinic (patient)
- **Yetki:** `clinic:patient:create` (STAFF, VETERINARIAN)
- **Idempotency:** Önerilir (`Idempotency-Key` header, FAZ-3+ ile
  zorunlu olacak)
- **Audit:** `audit:patient.create` (severity: info)

**Request body (`PatientCreateInput`):**

```json
{
  "ownerId": "own-uuid",
  "name": "Boncuk",
  "species": "dog",
  "breed": "Golden Retriever",
  "birthDate": "2022-04-15",
  "gender": "male",
  "microchip": "123456789012345",
  "color": "Kahverengi",
  "neutered": true,
  "notes": "Sahibine bağlı, sosyal."
}
```

- `ownerId` (UUID, zorunlu) — hasta sahibi. Aynı tenant'ta olmalı.
- `name` (string, zorunlu) — 1-100 karakter.
- `species` (enum, zorunlu) — `dog` | `cat` | `bird` (TR pilot).
  `other` henüz aktif değil.
- `breed` (string, opsiyonel) — max 100 karakter.
- `birthDate` (string, opsiyonel) — ISO `YYYY-MM-DD`. Gelecekte
  olamaz.
- `gender` (enum, zorunlu) — `male` | `female` | `unknown`.
- `microchip` (string, opsiyonel) — 15 haneli rakam (ISO 11784/11785).
  Aynı tenant'ta aktif kayıtlar içinde unique.
- `color` (string, opsiyonel) — max 100 karakter.
- `neutered` (boolean, zorunlu) — kısırlaştırma durumu.
- `notes` (string, opsiyonel) — max 2000 karakter.

**Response 201 (`Patient`):**

```json
{
  "id": "pat-uuid",
  "tenantId": "tnt-uuid",
  "ownerId": "own-uuid",
  "name": "Boncuk",
  "species": "dog",
  "breed": "Golden Retriever",
  "birthDate": "2022-04-15",
  "gender": "male",
  "microchip": "123456789012345",
  "color": "Kahverengi",
  "neutered": true,
  "notes": "Sahibine bağlı, sosyal.",
  "createdAt": "2026-07-30T12:00:00.000Z",
  "archivedAt": null
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok veya tenant uyumsuz.
- `VET-AUTHZ-0002` (404) — Owner bulunamadı (cross-tenant dahil).
- `VET-CLINIC-0003` (409) — Aynı tenant'ta aynı mikroçiple kayıt var.
- `VET-CLINIC-0004` (422) — Tür whitelist dışı.
- `VET-VALIDATION-0003` (422) — Mikroçip 15 hane değil.
- `VET-VALIDATION-0009` (422) — Doğum tarihi geçersiz veya gelecekte.

**Kullanım senaryoları:**

- Resepsiyon: yeni hasta geldiğinde owner + hasta kaydı.
- Portal daveti sonrası (GOAL-025) hayvan ekleme.
- Sahiplik devri için `flow-ownership-transfer` (GOAL-022) yerine
  BU endpoint yeni owner'a yeni hasta kaydı açar.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/patient.ts`
- Alan sözlüğü: `docs/fields/FIELD_GLOSSARY.md` (Patient)
- AI chunk: `flow-patient-create`, `error-VET-CLINIC-0003`,
  `error-VET-CLINIC-0004`
