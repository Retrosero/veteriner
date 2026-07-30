# endpoint_id: get._api_v1_superadmin_tenants

## Method & Path
`GET /api/v1/superadmin/tenants`

## Modül
`audit` (superadmin tenant görünümü)

## Açıklama
Tüm tenant'ların özet görünümünü döner. Her öğe için branch
sayısı, kullanıcı sayısı, açık modüller, son login, hata sayısı
(stub) ve storage kullanımı toplanır. Yalnızca SUPERADMIN
erişebilir; normal kullanıcılar 403 alır.

## Yetkilendirme
- **Roller:** SUPERADMIN
- **Permission:** `audit:log:read` (SUPERADMIN bypass otomatik uygulanır)

## Request
### Headers
| Header | Tip | Zorunlu | Açıklama |
| --- | --- | --- | --- |
| `Authorization` | string | evet | Bearer token |
| `X-Actor-Id` | uuid | evet | Aktör kullanıcı |
| `X-Actor-Role` | string | evet | `SUPERADMIN` |

### Query Params
| Ad | Tip | Zorunlu | Açıklama |
| --- | --- | --- | --- |
| `page` | int | hayır | Sayfa numarası (default 1) |
| `pageSize` | int | hayır | Sayfa boyutu (default 20, max 100) |
| `status` | enum | hayır | `active` \| `suspended` \| `closed` |
| `country` | enum | hayır | `TR` \| `GB` |
| `search` | string | hayır | Ad veya slug içinde arama (1-100 karakter) |

## Response
### 200 OK
```json
{
  "items": [
    {
      "tenantId": "tnt-uuid",
      "name": "Pilot Veteriner Kliniği",
      "country": "TR",
      "status": "active",
      "createdAt": "2026-07-30T12:00:00.000Z",
      "branchCount": 1,
      "userCount": 4,
      "enabledModules": ["clinic", "petshop", "file"],
      "lastLoginAt": "2026-07-30T11:45:12.000Z",
      "errorCountLast24h": 0,
      "storageUsedMb": 12.5
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20
}
```

### 4xx / 5xx
| HTTP | error_code | Ne zaman |
| --- | --- | --- |
| 401 | VET-AUTH-0001 | Oturum geçersiz |
| 403 | VET-AUTHZ-0001 | Yetki yok (SUPERADMIN değil) |

## Idempotency
Evet (GET zaten idempotent).

## Audit
Yok (okuma; FAZ-3+'da `audit:superadmin.tenant.read` eklenecek).

## Örnek
```bash
curl -X GET \
  "https://api.vetniva.local/api/v1/superadmin/tenants?status=active&page=1&pageSize=20" \
  -H "Authorization: Bearer <token>" \
  -H "X-Actor-Id: usr-super-admin" \
  -H "X-Actor-Role: SUPERADMIN"
```

## Version
1.0.0
last_verified_at: 2026-07-30
