# endpoint_id: get._api_v1_superadmin_tenants__id_events

## Method & Path
`GET /api/v1/superadmin/tenants/{id}/events`

## Modül
`audit` (superadmin tenant görünümü)

## Açıklama
Belirtilen tenant'ın son 10 audit event'ini tarih azalan
sırada döner. SUPERADMIN'in tenant bazlı şüpheli aktivite
incelemesi için kullanılır. Tenant bulunamazsa 404.

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
  "items": [
    {
      "id": "evt-uuid",
      "eventName": "audit:auth.login.success",
      "actorId": "usr-uuid",
      "targetType": "user",
      "targetId": "usr-uuid",
      "createdAt": "2026-07-30T11:45:12.000Z"
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
  "https://api.vetniva.local/api/v1/superadmin/tenants/tnt-uuid/events" \
  -H "Authorization: Bearer <token>" \
  -H "X-Actor-Id: usr-super-admin" \
  -H "X-Actor-Role: SUPERADMIN"
```

## Version
1.0.0
last_verified_at: 2026-07-30
