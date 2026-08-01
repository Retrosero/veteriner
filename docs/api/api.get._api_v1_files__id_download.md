# GET /api/v1/files/:id/download

> GOAL-014 (Dosya ve medya servisi) kapsamında eklenen download
> endpoint'i. Meta verisinde kaydedilen içeriği binary stream
> olarak döner. Tenant izolasyonu: cross-tenant denemeler 404
> ile sessizce reddedilir.

## Modül

`files`

## Yetki

- **Roller:** SUPERADMIN, OWNER, VET, TECHNICIAN, RECEPTIONIST
- **Permission:** `file:file:read`

## Path parametreleri

| Parametre | Tip  | Zorunlu | Açıklama                              |
| --------- | ---- | ------- | ------------------------------------- |
| `id`      | UUID | evet    | Dosya ID. `ParseUUIDPipe` ile valide. |

## Response 200 (binary)

- `Content-Type`: dosyanın MIME tipi (`image/jpeg` vb.)
- `Content-Disposition`: `attachment; filename="<safe-name>"`
- `Content-Length`: byte cinsinden boyut.
- Body: ham dosya içeriği (Buffer).

Örnek response header'ları:

```
HTTP/1.1 200 OK
Content-Type: image/jpeg
Content-Disposition: attachment; filename="karabas.jpg"
Content-Length: 184320
```

## Idempotency

Evet. Salt okunur; tekrar tekrar çağrılabilir. Her çağrı
`audit:file.download` eventi yazar.

## Audit

- **Event:** `audit:file.download` (severity: info)
- **Actor:** user
- **Target:** `file:${fileId}`
- **Metadata:** `category`, `sizeBytes`. PII mask'lenir.

## Hata kodları

| Kod                   | HTTP | Açıklama                                          |
| --------------------- | ---- | ------------------------------------------------- |
| `VET-AUTH-0001`       | 401  | Oturum geçersiz veya süresi dolmuş.               |
| `VET-AUTHZ-0001`      | 403  | Permission yok (`file:file:read`).                |
| `VET-AUTHZ-0006`      | 403  | Aktif tenant bağlamı yok.                         |
| `VET-FILE-0003`       | 404  | Dosya bulunamadı, arşivlenmiş veya farklı tenant. |
| `VET-VALIDATION-0001` | 422  | `id` UUID formatında değil.                       |

## Örnek

```bash
curl -OJ \
  -H "Cookie: vetniva_session=..." \
  https://api.vetniva.local/api/v1/files/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d/download
```

## Güvenlik notları

- Cross-tenant denemeler 404 ile reddedilir; ayrım dışarıya
  sızdırılmaz (tenant enumeration koruması).
- `Content-Disposition` filename'i sanitize edilir (yalnızca
  `[A-Za-z0-9._-]`); orijinal ad response header'ına yansımaz.
- Storage'dan okunan buffer boyutu metadata ile aynı olmalı;
  uyuşmazlık audit edilir (ileride, streaming eklendikçe).
- Arşivlenmiş dosyalar (`archivedAt != null`) download için 404
  döner.
