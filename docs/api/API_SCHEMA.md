# @file API Kataloğu Şeması.
# @module docs/api/API_SCHEMA
#
# @description VetNiva API endpoint'leri için
# dokümantasyon şeması. Her endpoint `docs/api/`
# altında bir Markdown dosyası ile temsil edilir.
# CI tutarlılığı doğrular.
#
# @author GOAL-005 (FAZ-0) dokümantasyon ve AI bilgi havuzu
# @since 2026-07-30
# @security Endpoint dokümanları PII örneği içerebilir;
#   örnekler mask'lenmiş olmalı.
# =============================================================================

# API Kataloğu Şeması

Tüm HTTP endpoint'leri (REST) `docs/api/` altında bir Markdown
dosyası ile temsil edilir. Dosyalar hem **insan** (API kullanıcıları
+ frontend geliştiriciler) hem **makine** (AI asistanı + CI) için
tek kaynaktır. OpenAPI/Swagger spec ayrıca NestJS Swagger
interceptor'ı ile otomatik üretilir.

## 1. Konum ve İsimlendirme

```
docs/api/
  <method>.<path-with-underscores>.md
```

**Örnekler:**

- `get._api_v1_health.md` — `GET /api/v1/health`
- `get._api_v1_health_ready.md` — `GET /api/v1/health/ready`
- `post._api_v1_clinic_patients.md` — `POST /api/v1/clinic/patients`
- `get._api_v1_clinic_owners_[id].md` — `GET /api/v1/clinic/owners/{id}`

**Kural:** HTTP method + `_` + path (tireler `_` ile). Köşeli
parantezler `[]` ile belirtilir. Sonda `.md`.

## 2. Zorunlu Bölümler

Her API dosyası aşağıdaki bölümleri içerir:

```markdown
# endpoint_id: <method>.<path>

## Method & Path
`METHOD /path`

## Modül
`<module>`

## Açıklama
<1-3 cümle>

## Yetkilendirme
- **Roller:** [...]
- **Permission:** `<permission>`

## Request
### Headers
| Header | Tip | Zorunlu | Açıklama |
| --- | --- | --- | --- |
| `Authorization` | string | evet | Bearer token |
| `X-Tenant-Id` | uuid | evet | Aktif tenant |
| `X-Request-Id` | string | hayır | Correlation ID |
| `Idempotency-Key` | string | hayır | Tekrarlanabilirlik |

### Path Params
| Ad | Tip | Açıklama |
| --- | --- | --- |
| `id` | uuid | Varlık ID |

### Query Params
| Ad | Tip | Zorunlu | Açıklama |
| --- | --- | --- | --- |
| `from` | date | hayır | Başlangıç tarihi |
| `to` | date | hayır | Bitiş tarihi |
| `limit` | int | hayır | Sayfa boyutu (max 100) |

### Body
<JSON schema veya örnek>

## Response
### 200 OK
<JSON schema veya örnek>

### 4xx / 5xx
| HTTP | error_code | Ne zaman |
| --- | --- | --- |
| 401 | VET-AUTH-0001 | Oturum geçersiz |
| 403 | VET-AUTHZ-0001 | Yetki yok |
| 404 | VET-CLINIC-0001 | Varlık bulunamadı |

## Idempotency
<evet/hayır + anahtar header>

## Audit
- **Event:** `audit:<entity>.<action>`
- **Severity:** info / warning / error

## Örnek
<curl veya fetch örneği>

## Version
1.0.0
last_verified_at: 2026-07-30
```

## 3. Alan Açıklamaları

| Bölüm             | Açıklama |
| ----------------- | -------- |
| `endpoint_id`     | Dosya adıyla aynı (`<method>.<path>`). |
| `Method & Path`   | `METHOD /path` formatında. |
| `Modül`           | `health` / `clinic` / `petshop` / `finance` / `auth` / `tenant` / `audit` / `file` / `notif` / `ai`. |
| `Açıklama`        | 1-3 cümle, ne yapar / neden kullanılır. |
| `Yetkilendirme`   | Roller + permission. |
| `Request`         | Headers, path/query params, body. |
| `Response`        | 200, 4xx, 5xx. Hata kodları VET- formatında. |
| `Idempotency`     | Tekrarlanabilir mi? Hangi header ile? |
| `Audit`           | Oluşturacağı audit event(ler). |
| `Örnek`           | curl/fetch örneği. |
| `Version`         | Semver. |

## 4. Path Params

`{id}`, `{tenantId}` gibi path variable'lar köşeli parantez
olmadan yazılır. NestJS `@Param('id')` ile eşleşir.

## 5. Response

200 OK dışındaki tüm hatalar `error_code` (`VET-<MODULE>-<NNN>`)
referansı ile listelenir. Her hata kodu ERROR_CATALOG'da tanımlı
olmalı.

## 6. Audit

API'nin yazacağı audit event:

```markdown
## Audit
- **Event:** `audit:patient.create`
- **Severity:** info
- **Actor:** user
- **Target:** patient:<id>
```

Çoklu event varsa liste halinde yazılır.

## 7. Örnek Tam Dosya

```markdown
# endpoint_id: get._api_v1_clinic_owners_[id]

## Method & Path
`GET /api/v1/clinic/owners/{id}`

## Modül
`clinic`

## Açıklama
Belirli bir hasta sahibinin detaylarını döner. PII
alanları mask'lenmemiş halde döner (yetki kontrolünden
sonra). Tenant izolasyonu otomatik uygulanır.

## Yetkilendirme
- **Roller:** OWNER, VETERINARIAN, STAFF
- **Permission:** `clinic:owner:read`

## Request
### Headers
| Header | Tip | Zorunlu | Açıklama |
| --- | --- | --- | --- |
| `Authorization` | string | evet | Bearer token |
| `X-Tenant-Id` | uuid | evet | Aktif tenant |

### Path Params
| Ad | Tip | Açıklama |
| --- | --- | --- |
| `id` | uuid | Sahip ID |

## Response
### 200 OK
```json
{
  "id": "own-uuid",
  "first_name": "Ali",
  "last_name": "Yılmaz",
  "phone": "+905321234567",
  "email": "ali@example.com",
  "created_at": "2026-07-30T12:34:56.789Z"
}
```

### 4xx / 5xx
| HTTP | error_code | Ne zaman |
| --- | --- | --- |
| 401 | VET-AUTH-0001 | Oturum geçersiz |
| 403 | VET-AUTHZ-0001 | Tenant erişim yok |
| 404 | VET-CLINIC-0001 | Sahip bulunamadı |

## Idempotency
Evet (GET zaten idempotent).

## Audit
- **Event:** `audit:owner.read`
- **Severity:** info
- **Actor:** user

## Örnek
```bash
curl -X GET \
  "https://api.vetniva.local/api/v1/clinic/owners/own-123" \
  -H "Authorization: Bearer <token>" \
  -H "X-Tenant-Id: tnt-456"
```

## Version
1.0.0
last_verified_at: 2026-07-30
```

## 8. CI Doğrulama

`pnpm docs:check` şunları doğrular:

1. **Zorunlu bölümler:** Tüm bölümler mevcut.
2. **Endpoint id tutarlılığı:** Dosya adı ve `endpoint_id` aynı.
3. **Hata kodu geçerliliği:** Referans edilen tüm hata kodları
   `ERROR_CATALOG.md`'de var.
4. **Permission geçerliliği:** `clinic:owner:read` vb. `PERMISSION_CATALOG.yaml`'da var.
5. **Audit event geçerliliği:** `audit:owner.read` `AUDIT_EVENTS.yaml`'da var.
6. **Method doğruluğu:** Backend'de gerçekten tanımlı.
7. **Orphan:** Tanımlı ama kullanılmayan endpoint (info).

## İlgili dokümanlar

- [`../ai/CHUNK_SCHEMA.md`](../ai/CHUNK_SCHEMA.md) — chunk yapısı.
- [`../pages/PAGE_SCHEMA.md`](../pages/PAGE_SCHEMA.md) — sayfa
  kaydı.
- [`../fields/FIELD_SCHEMA.md`](../fields/FIELD_SCHEMA.md) —
  alan sözlüğü.
- [`../errors/ERROR_CATALOG.md`](../errors/ERROR_CATALOG.md) —
  hata kataloğu.
- [`../../docs/permissions/PERMISSION_CATALOG.yaml`](../../docs/permissions/PERMISSION_CATALOG.yaml)
  — yetki kataloğu.
- [`../errors/AUDIT_EVENTS.yaml`](../errors/AUDIT_EVENTS.yaml) —
  audit event kataloğu.
