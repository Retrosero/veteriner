# API Endpoint Kataloğu (FAZ-1)

> **Otomatik doğrulama:** `pnpm docs:check` her controller için bu
> kataloğa karşılık gelen bir kayıt olmasını zorunlu kılar. Yeni
> endpoint eklerken burada bir bölüm oluşturulmalıdır.

Bu katalog FAZ-1 (platform çekirdeği) kapsamındaki tüm endpoint'leri
içerir. Sonraki fazlarda ilgili modüller eklenecektir.

---

## Tenant (`/api/v1/tenants`)

### POST /api/v1/tenants

Yeni tenant oluşturur. Yalnızca SUPERADMIN.

- **Modül:** tenant
- **Yetki:** `tenant:tenant:create` (SUPERADMIN)
- **Idempotency:** Önerilir (Idempotency-Key header)
- **Audit:** `audit:tenant.create` (severity: critical)

**Request body:**

```json
{
  "slug": "pilot-vet-kadikoy",
  "name": "Pilot Veteriner Kliniği",
  "country": "TR",
  "defaultLocale": "tr-TR",
  "timezone": "Europe/Istanbul",
  "taxId": "1234567890",
  "taxIdType": "company",
  "contactEmail": "info@pilot-vet.com"
}
```

**Response 201:**

```json
{
  "id": "tnt-uuid",
  "slug": "pilot-vet-kadikoy",
  "name": "Pilot Veteriner Kliniği",
  "country": "TR",
  "defaultLocale": "tr-TR",
  "timezone": "Europe/Istanbul",
  "status": "active",
  "taxId": "1234567890",
  "taxIdType": "company",
  "contactEmail": "info@pilot-vet.com",
  "createdAt": "2026-07-30T12:00:00.000Z",
  "updatedAt": "2026-07-30T12:00:00.000Z",
  "archivedAt": null,
  "archivedReason": null
}
```

**Hata kodları:**

- `VET-AUTHZ-0005` — SUPERADMIN gerekli (403)
- `VET-TENANT-0004` — Slug zaten kayıtlı (409)
- `VET-VALIDATION-0003` — Geçersiz format (slug, country) (422)

### GET /api/v1/tenants

Tenant listesi (sayfalı). SUPERADMIN tüm tenant'ları görür; tenant
kullanıcısı yalnızca kendi tenant'ını.

- **Modül:** tenant
- **Yetki:** `tenant:tenant:read` (SUPERADMIN, OWNER)
- **Sorgu:** `page`, `pageSize`, `status`, `country`, `search`

**Response 200:** `{ items: TenantResponse[], total, page, pageSize }`

### GET /api/v1/tenants/:id

Tenant detayı. Cross-tenant denemesi 404 döner (bilgi sızdırmaz).

- **Modül:** tenant
- **Yetki:** `tenant:tenant:read`
- **Hata kodları:** `VET-TENANT-0001` (404), `VET-TENANT-0002` (403, kapalı tenant)

### PATCH /api/v1/tenants/:id

Tenant bilgilerini günceller. SUPERADMIN veya kendi tenant OWNER'ı.

- **Modül:** tenant
- **Yetki:** `tenant:tenant:update`
- **Audit:** `audit:tenant.update` (severity: warning)

### POST /api/v1/tenants/:id/close

Tenant'ı kapatır (soft delete). Yalnızca SUPERADMIN. Fiziksel silme
yok; `status = closed` ve `archivedAt` set edilir.

- **Modül:** tenant
- **Yetki:** `tenant:tenant:archive` (SUPERADMIN)
- **Audit:** `audit:tenant.close` (severity: critical)

**Request body:** `{ "reason": "string (3-500 char)" }`

---

## Branch (`/api/v1/branches` ve `/api/v1/tenants/:tenantId/branches`)

### GET /api/v1/tenants/:tenantId/branches

Tenant'ın şubelerini listeler.

- **Modül:** branch
- **Yetki:** `branch:branch:read` (OWNER, VETERINARIAN, STAFF, SUPERADMIN)
- **Sorgu:** `status` (opsiyonel)
- **RLS:** `app.tenant_id` set edilir; actor.tenantId ile eşleşmeyen
  branch'ler otomatik filtrelenir.

**Response 200:** `{ items: BranchResponse[], total }`

### POST /api/v1/tenants/:tenantId/branches

Yeni şube oluşturur. SUPERADMIN veya tenant OWNER.

- **Modül:** branch
- **Yetki:** `branch:branch:create`
- **Audit:** `audit:branch.create` (severity: info)

**Request body:**

```json
{
  "code": "kadikoy",
  "name": "Kadıköy Şubesi",
  "city": "İstanbul",
  "address": {
    "line1": "Caferağa Mah. Mühürdar Cd.",
    "city": "İstanbul",
    "postalCode": "34710",
    "country": "TR"
  },
  "phone": "+902161234567"
}
```

**Hata kodları:** `VET-AUTHZ-0001` (403), `VET-BRANCH-0003` (409 code çakışma).

### GET /api/v1/branches/:id

Şube detayı. Cross-tenant denemesi 404.

- **Modül:** branch
- **Yetki:** `branch:branch:read`
- **Hata kodları:** `VET-BRANCH-0001` (404)

### PATCH /api/v1/branches/:id

Şube bilgilerini günceller. SUPERADMIN veya tenant OWNER.

- **Modül:** branch
- **Yetki:** `branch:branch:update`
- **Audit:** `audit:branch.update` (severity: info)

### POST /api/v1/branches/:id/archive

Şubeyi arşivler (soft delete). SUPERADMIN veya tenant OWNER.

- **Modül:** branch
- **Yetki:** `branch:branch:archive`
- **Audit:** `audit:branch.update` action: archive (severity: info)

**Request body (opsiyonel):** `{ "reason": "string" }`

**Hata kodları:** `VET-BRANCH-0004` (409 zaten kapalı).

---

## Auth Placeholder (GOAL-010 — kaldırılacak)

GOAL-010'da gerçek auth olmadığından actor bilgisi aşağıdaki
header'lardan okunur. GOAL-011 ile bu header'lar kaldırılır ve
JWT/session tabanlı kimlik doğrulama devreye girer.

| Header          | Açıklama                                | Zorunlu (dev) | Zorunlu (prod) |
| --------------- | --------------------------------------- | ------------- | -------------- |
| `X-Actor-Id`    | Kullanıcı UUID                          | hayır         | evet (auth sonra) |
| `X-Actor-Role`  | SUPERADMIN / OWNER / VETERINARIAN / STAFF | hayır       | evet            |
| `X-Tenant-Id`   | Aktif tenant UUID                        | hayır         | evet            |
| `X-Branch-Id`   | Aktif şube UUID                          | hayır         | hayır           |
| `X-Request-Id`  | Correlation ID (UUID v4)                | hayır         | önerilir        |

**Güvenlik notu:** Production'da bu header'lar yoksa `VET-AUTH-0001`
(401) döner. GOAL-011 sonrası bu header'lar yoksayılır.

---

## Ortak hata gövdesi

Tüm endpoint'ler standart `ErrorResponse` döner:

```json
{
  "error_code": "VET-TENANT-0004",
  "message": "Bu tenant slug zaten kayıtlı.",
  "source": "server",
  "severity": "warning",
  "correlation_id": "req-uuid",
  "timestamp": "2026-07-30T12:00:00.000Z",
  "i18n_key": "error.VET-TENANT-0004",
  "details": { "slug": "pilot-vet-kadikoy" }
}
```

Detay için: `docs/errors/ERROR_CODE_STANDARD.md` ve
`docs/errors/ERROR_CATALOG.md`.
