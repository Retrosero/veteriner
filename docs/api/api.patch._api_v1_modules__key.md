# PATCH /api/v1/modules/:key

> GOAL-013 (Modül/feature flag altyapısı) kapsamında eklenen modül
> enable/disable endpoint'i. Aktif tenant için verilen modülü açar
> veya kapatır. Her değişiklik audit log'a yansır.

## Modül

`feature-flag`

## Yetki

- **Roller:** SUPERADMIN, OWNER
- **Permission:** `tenant:tenant:update`

## Path parametreleri

| Parametre | Tip  | Zorunlu | Açıklama                                                                                                                                   |
| --------- | ---- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `key`     | enum | evet    | `clinic` / `appointments` / `vaccinations` / `inventory` / `petshop` / `billing` / `hospitalization` / `laboratory` / `imaging` / `portal` |

## Request body

```json
{
  "enabled": true
}
```

| Alan      | Tip     | Zorunlu | Açıklama                                |
| --------- | ------- | ------- | --------------------------------------- |
| `enabled` | boolean | evet    | true → modül açılır; false → kapatılır. |

## Response 200

```json
{
  "key": "appointments",
  "enabled": false
}
```

## Idempotency

Evet. Aynı `key` + aynı `enabled` değeriyle tekrarlanan istekler
yeni bir audit event daha yazar (event başına ayrı log). DB
taşıması sonrası tek transaction içinde upsert yapılacak.

## Audit

- **Event:** `audit:feature_flag.enable` (severity: info) veya
  `audit:feature_flag.disable` (severity: warning)
- **Actor:** user (veya system, job tarafından tetiklenirse)
- **Target:** `tenant_module:${tenantId}::${moduleKey}`
- **Metadata:** `module`, `previous` (önceki enabled durumu),
  `enabled` (yeni durum).

Disable işlemi operasyonel risk taşıdığı için `warning` seviyesinde
loglanır.

## Hata kodları

| Kod                   | HTTP | Açıklama                                    |
| --------------------- | ---- | ------------------------------------------- |
| `VET-AUTH-0001`       | 401  | Oturum geçersiz veya süresi dolmuş.         |
| `VET-AUTHZ-0001`      | 403  | Permission yok (`tenant:tenant:update`).    |
| `VET-AUTHZ-0006`      | 403  | Aktif tenant bağlamı yok.                   |
| `VET-VALIDATION-0001` | 422  | Body şeması hatalı (enabled boolean değil). |

## Örnek

```bash
# Appointments modülünü kapat
curl -X PATCH \
  -H "Cookie: vetniva_session=..." \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}' \
  https://api.vetniva.local/api/v1/modules/appointments
```

## Güvenlik notları

- SUPERADMIN her tenant için değişiklik yapabilir; normal kullanıcı
  yalnızca kendi tenant'ı (`actor.tenantId`).
- Bilinmeyen `key` değeri 400 (`BadRequestException`) ile reddedilir
  (Zod `moduleKeySchema`).
- İşlem `ModuleEnabledGuard` tarafından değil, controller-level
  permission guard + service-level tenant scope kontrolü ile korunur.
- Disable edilen modüle yapılan sonraki erişim denemeleri
  `VET-MODULE-0001` (403) ile reddedilir; bu event audit EDİLMEZ
  (sinyal/şüphe ayrımı için).
- In-memory cache process-scoped. Çok-instance deployment'ta
  eventual consistency: tüm instance'lara ulaşma birkaç saniye
  sürebilir.
