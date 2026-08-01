# GET /api/v1/files/:id

> GOAL-014 (Dosya ve medya servisi) kapsamında eklenen meta
> endpoint'i. Verilen ID için `FileMeta` döner. Cross-tenant
> erişim denemeleri 404 ile sessizce reddedilir (bilgi
> sızdırmazlık).

## Modül

`files`

## Yetki

- **Roller:** SUPERADMIN, OWNER, VET, TECHNICIAN, RECEPTIONIST
- **Permission:** `file:file:read`

## Path parametreleri

| Parametre | Tip  | Zorunlu | Açıklama                              |
| --------- | ---- | ------- | ------------------------------------- |
| `id`      | UUID | evet    | Dosya ID. `ParseUUIDPipe` ile valide. |

## Response 200

```json
{
  "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "tenantId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "category": "patient_photo",
  "mimeType": "image/jpeg",
  "originalName": "karabas.jpg",
  "sizeBytes": 184320,
  "storageDriver": "local",
  "storageKey": "f47ac10b/2026-07/9b1deb4d.jpg",
  "uploadedBy": "a3c0…",
  "uploadedAt": "2026-07-30T12:34:56.000Z",
  "archivedAt": null,
  "relatedEntityType": "patient",
  "relatedEntityId": "b6f0…"
}
```

Arşivlenmiş dosya için `archivedAt` dolu olur. Response yapısı
aynıdır.

## Idempotency

Evet. Salt okunur; tekrar tekrar çağrılabilir.

## Audit

Yok (salt okunur; PII taşımaz). Download endpoint'i ayrı audit
eder (`audit:file.download`).

## Hata kodları

| Kod                   | HTTP | Açıklama                                                     |
| --------------------- | ---- | ------------------------------------------------------------ |
| `VET-AUTH-0001`       | 401  | Oturum geçersiz veya süresi dolmuş.                          |
| `VET-AUTHZ-0001`      | 403  | Permission yok (`file:file:read`).                           |
| `VET-AUTHZ-0006`      | 403  | Aktif tenant bağlamı yok.                                    |
| `VET-FILE-0003`       | 404  | Dosya bulunamadı **veya** farklı tenant'a ait (sızıntı yok). |
| `VET-VALIDATION-0001` | 422  | `id` UUID formatında değil.                                  |

## Örnek

```bash
curl \
  -H "Cookie: vetniva_session=..." \
  https://api.vetniva.local/api/v1/files/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d
```

## Güvenlik notları

- 404 hem gerçek bulunamadı hem cross-tenant durumunu kapsar;
  ayrım dışarıya sızdırılmaz (tenant enumeration koruması).
- SUPERADMIN her tenant'ın dosyalarını okuyabilir; `actor.tenantId`
  filtresi atlanır.
- `originalName` response'da açık döner; UI tarafında
  XSS/sanitization uygulanmalıdır (escape + filename sanitization).
- `archivedAt` doluysa frontend "arşivlenmiş" rozeti göstermelidir.
