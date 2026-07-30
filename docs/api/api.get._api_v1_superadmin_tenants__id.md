# endpoint_id: get._api_v1_superadmin_tenants__id

## Method & Path
`GET /api/v1/superadmin/tenants/{id}`

## Modül
`audit` (superadmin tenant görünümü)

## Açıklama
Tek tenant'ın detay görünümünü döner. Özet metrikler
(`TenantOverview` ile aynı: branchCount, userCount, enabledModules,
lastLoginAt, errorCountLast24h, storageUsedMb) + son 10 audit
event'i. Yalnızca SUPERADMIN erişebilir. Tenant bulunamazsa
404 (bilgi sızdırmaz).

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

### Path Params
| Ad | Tip | Açıklama |
| --- | --- | --- |
| `id` | uuid | Tenant ID |

## Response
### 200 OK
```json
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
  "storageUsedMb": 12.5,
  "recentEvents": [
    {
      "id": "evt-uuid",
      "eventName": "audit:tenant.create",
      "actorId": "usr-uuid",
      "targetType": "tenant",
      "targetId": "tnt-uuid",
      "createdAt": "2026-07-30T12:00:00.000Z"
    }
  ]
}
```

### 4xx / 5xx
| HTTP | error_code | Ne zaman |
| --- | --- | --- |
| 401 | VET-AUTH-0001 | Oturum geçersiz |
| 403 | VET-AUTHZ-0001 | Yetki yok (SUPERADMIN değil) |
| 404 | VET-TENANT-0001 | Tenant bulunamadı |

## Idempotency
Evet (GET zaten idempotent).

## Audit
Yok (okuma; FAZ-3+'da `audit:superadmin.tenant.read` eklenecek).

## Örnek
```bash
curl -X GET \
  "https://api.vetniva.local/api/v1/superadmin/tenants/tnt-uuid" \
  -H "Authorization: Bearer <token>" \
  -H "X-Actor-Id: usr-super-admin" \
  -H "X-Actor-Role: SUPERADMIN"
```

## Version
1.0.0
last_verified_at: 2026-07-30
