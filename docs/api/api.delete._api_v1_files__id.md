# DELETE /api/v1/files/:id

> GOAL-014 (Dosya ve medya servisi) kapsamında eklenen arşivleme
> endpoint'i. **Fiziksel silme YAPMAZ**; metadata'da `archivedAt`
> set edilir. KVKK ve klinik kayıt bütünlüğü gereği storage'da
> dosya kalır.

## Modül

`files`

## Yetki

- **Roller:** SUPERADMIN, OWNER
- **Permission:** `file:file:delete`

## Path parametreleri

| Parametre | Tip  | Zorunlu | Açıklama              |
| --------- | ---- | ------- | --------------------- |
| `id`      | UUID | evet    | Dosya ID.             |

## Request body

Yok. Gövde gönderilirse yoksayılır.

## Response

- **204 No Content** — arşivlendi.
- **404 Not Found** — dosya yok, zaten arşivlenmiş veya farklı tenant.

## Idempotency

Kısmi. Aynı dosya art arda DELETE edilirse ilk çağrı 204, sonrakiler
404 döner. Tekrar-tekrar arşivlenebilir durum oluşmaz.

## Audit

- **Event:** `audit:file.archive` (severity: **warning**)
- **Actor:** user
- **Target:** `file:${fileId}`
- **Metadata:** `category`, `previousArchivedAt?`. Arşivleme
  operasyonel risk taşıdığı için warning seviyesinde loglanır
  (upload/download info).

## Hata kodları

| Kod                 | HTTP | Açıklama                                              |
| ------------------- | ---- | ----------------------------------------------------- |
| `VET-AUTH-0001`     | 401  | Oturum geçersiz veya süresi dolmuş.                   |
| `VET-AUTHZ-0001`    | 403  | Permission yok (`file:file:delete`).                  |
| `VET-AUTHZ-0006`    | 403  | Aktif tenant bağlamı yok.                             |
| `VET-FILE-0003`     | 404  | Dosya bulunamadı, zaten arşivlenmiş veya farklı tenant. |
| `VET-VALIDATION-0001` | 422 | `id` UUID formatında değil.                           |

## Örnek

```bash
curl -X DELETE \
  -H "Cookie: vetniva_session=..." \
  https://api.vetniva.local/api/v1/files/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d
```

## Güvenlik notları

- Fiziksel silme yoktur — `archivedAt` set edilir. 90 gün sonra
  retention job (ileride, audit'li) gerçekten silebilir.
- Cross-tenant denemeler 404 döner; ayrım dışarıya sızdırılmaz.
- Arşivlenen dosyanın download'u 404 ile reddedilir; meta GET
  hâlâ döner (audit amaçlı).
- Arşivleme operasyonel risk taşır (KVKK, yasal ibraz); bu yüzden
  `warning` seviyesinde loglanır ve OWNER/SUPERADMIN ile sınırlı.
