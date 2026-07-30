# GET /api/v1/modules

> GOAL-013 (Modül/feature flag altyapısı) kapsamında eklenen tenant
> modül listesi endpoint'i. Aktif tenant için tüm modüllerin
> enable/disable durumunu döner. Yalnızca okuma; herhangi bir
> değişiklik yapmaz.

## Modül

`feature-flag`

## Yetki

- **Roller:** SUPERADMIN, OWNER
- **Permission:** `tenant:tenant:read`

## Path parametreleri

Yok.

## Query parametreleri

Yok.

## Request body

Yok.

## Response 200

```json
{
  "items": [
    { "key": "clinic", "enabled": true },
    { "key": "appointments", "enabled": true },
    { "key": "vaccinations", "enabled": false },
    { "key": "inventory", "enabled": true },
    { "key": "petshop", "enabled": true },
    { "key": "billing", "enabled": true },
    { "key": "hospitalization", "enabled": true },
    { "key": "laboratory", "enabled": true },
    { "key": "imaging", "enabled": true },
    { "key": "portal", "enabled": true }
  ]
}
```

Default davranış: bilinçli bir disable yoksa `enabled: true` döner
(yeni tenant onboarding bloklanmaz).

## Audit

Yalnızca okuma yapıldığı için bu endpoint'te audit event yazılmaz.
Modül listesi hassas bilgi taşımaz (PII etiketi: false).

## Hata kodları

| Kod               | HTTP | Açıklama                                       |
| ----------------- | ---- | ---------------------------------------------- |
| `VET-AUTH-0001`   | 401  | Oturum geçersiz veya süresi dolmuş.            |
| `VET-AUTHZ-0001`  | 403  | Permission yok (`tenant:tenant:read`).         |
| `VET-AUTHZ-0006`  | 403  | Aktif tenant bağlamı yok.                      |

## Örnek

```bash
curl -X GET \
  -H "Cookie: vetniva_session=..." \
  https://api.vetniva.local/api/v1/modules
```

## Güvenlik notları

- SUPERADMIN her tenant için listeyi görebilir; normal kullanıcı
  yalnızca kendi tenant'ını (`actor.tenantId`).
- Modül listesi tenant-scoped; cross-tenant sızıntı yok
  (audit EDİLMEZ, bilgi sızdırmaz).
- Bu endpoint in-memory cache'i okur; `PATCH` sonrası anlık
  güncel değer döner (eventual consistency: çok-instance
  deployment'ta birkaç saniye gecikme olabilir).
