# POST /api/v1/portal-auth/register

Yeni hasta sahibi portal hesabı oluşturur. `ownerId` önceden tenant
admin tarafından oluşturulmuş olmalıdır (cross-tenant → 404
`VET-AUTHZ-0002`). Personel auth'undan ayrı path; cookie set edilmez
(201 sonrası client ayrıca `/login` çağırır veya doğrudan
session-bağımsız UI).

- **Modül:** portal-auth
- **Yetki:** public (`@Public()`)
- **Idempotency:** Önerilir (`Idempotency-Key` header; FAZ-0'da
  opsiyonel).
- **Audit:** `audit:portal.auth.register` (severity: info) —
  `ownerId`, `locale`, `consentKvkkAt` payload.

**Request body (`PortalRegisterRequest`):**

```json
{
  "email": "ayse@example.com",
  "password": "StrongPass123!",
  "ownerId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "consentKvkk": true,
  "displayName": "Ayşe Y.",
  "locale": "tr-TR"
}
```

- `email` — RFC 5322; service `trim().toLowerCase()`.
- `password` — `passwordPolicySchema`: min 12, büyük+küçük harf+rakam.
- `ownerId` — UUID; aynı tenant'ta olmalı.
- `consentKvkk` — `z.literal(true)`; `false` → 422
  `VET-VALIDATION-0003`.
- `displayName` — Opsiyonel (1-100 char).
- `locale` — `tr-TR | en-GB`; default `tr-TR`.

**Response 201:**

```json
{
  "user": {
    "id": "pu-uuid",
    "tenantId": "tnt-uuid",
    "ownerId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "email": "ayse@example.com",
    "status": "active",
    "failedLoginCount": 0,
    "createdAt": "2026-07-30T12:00:00.000Z"
  }
}
```

**Hata kodları:**

- `VET-TENANT-0001` (400) — `x-tenant-slug` veya `x-tenant-id`
  header eksik.
- `VET-VALIDATION-0001` (422) — Body parse hatası.
- `VET-VALIDATION-0003` (422) — `consentKvkk !== true` veya diğer
  alan hataları.
- `VET-AUTHZ-0002` (404) — `ownerId` cross-tenant veya yok (bilgi
  sızdırmaz).
- `VET-AUTH-0003` (409) — Bu email ile kayıtlı portal hesabı zaten
  var (tenant-scoped).

**Tenant çözümleme:** Pilot tek-tenant. `x-tenant-slug` veya
`x-tenant-id` header zorunlu. Üretimde TenantResolver (domain-based)
kullanılacak.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/portal-auth.ts`
- Hata kataloğu: `docs/errors/ERROR_CATALOG.md` (VET-AUTH-0003,
  VET-VALIDATION-0003, VET-TENANT-0001)
- AI chunk: `flow-portal-auth`
