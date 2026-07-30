# POST /api/v1/auth/switch-branch/:branchId

> GOAL-012 (RBAC ve izin motoru) kapsamında eklenen branch switch
> endpoint'i. Multi-branch tenant senaryosu için aktif branch
> bağlamını değiştirir.

## Modül

`auth`

## Yetki

Authenticated. Aktif branch değişikliği için `@RequirePermission()`
gerekmez; sadece tenant üyeliği (veya SUPERADMIN) yeterlidir.
Normal kullanıcı yalnızca kendi tenant'ının branch'larına
geçebilir; SUPERADMIN herhangi bir tenant'ın branch'ına geçebilir.

## Path parametreleri

| Parametre | Tip   | Zorunlu | Açıklama                |
| --------- | ----- | ------- | ----------------------- |
| `branchId` | UUID | evet    | Geçilecek branch'ın ID'si |

## Request body

Boş.

## Response 200

```json
{
  "branchId": "550e8400-e29b-41d4-a716-446655440000"
}
```

## Audit

`audit:auth.branch.switch` (info) — kullanıcı ID, tenant ID,
branch ID, correlation ID, IP, user agent hash.

## Hata kodları

| Kod              | HTTP | Açıklama                                     |
| ---------------- | ---- | -------------------------------------------- |
| `VET-BRANCH-0001` | 404  | Şube bulunamadı (ID yanlış veya arşivlenmiş). |
| `VET-AUTHZ-0004`  | 403  | Kullanıcı bu şubenin tenant'ına üye değil.  |
| `VET-AUTH-0001`   | 401  | Oturum geçersiz veya süresi dolmuş.         |

## Örnek

```bash
curl -X POST \
  -H "Cookie: vetniva_session=..." \
  https://api.vetniva.local/api/v1/auth/switch-branch/550e8400-e29b-41d4-a716-446655440000
```

## Güvenlik notları

- Cross-tenant erişim denemeleri `VET-AUTHZ-0004` (403) ile reddedilir.
- SUPERADMIN için branch değişikliği audit log'a yansır (bypass
  bile denetlenir).
- Branch değişikliği sonrası `request.actor.branchId` yeni branch
  olarak AuthGuard'da taşınır.
