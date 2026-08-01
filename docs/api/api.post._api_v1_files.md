# POST /api/v1/files

> GOAL-014 (Dosya ve medya servisi) kapsamında eklenen upload
> endpoint'i. Multipart/form-data ile alınan dosya; MIME whitelist,
> boyut sınırı ve antivirus pipeline'dan geçirildikten sonra
> storage'a yazılır. Meta response olarak döner.

## Modül

`files`

## Yetki

- **Roller:** SUPERADMIN, OWNER, VET, TECHNICIAN, RECEPTIONIST
  (kategoriye göre permission detayı ileride)
- **Permission:** `file:file:upload`

## Request — multipart/form-data

| Alan                | Tip           | Zorunlu | Açıklama                                                                      |
| ------------------- | ------------- | ------- | ----------------------------------------------------------------------------- |
| `file`              | binary        | evet    | Yüklenecek dosya. 4 MIME tipinden biri olmalı (aşağıya bakın).                |
| `category`          | enum          | evet    | `patient_photo` / `lab_report` / `imaging` / `consent` / `invoice` / `other`. |
| `relatedEntityType` | string        | hayır   | İlişkili entity tipi (ör. `patient`, `encounter`, `consent`).                 |
| `relatedEntityId`   | string (UUID) | hayır   | İlişkili entity ID.                                                           |

### İzin verilen MIME tipleri

- `image/jpeg`
- `image/png`
- `application/pdf`
- `application/dicom` (görüntüleme; raw DICOM upload ileride)

### Boyut sınırı

- Maks. **10 MB** / dosya. Aşılırsa 413.

## Response 201

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

## İdempotency

Yok (henüz). Aynı dosya art arda yüklenebilir; her biri ayrı meta
kaydı üretir. DB persistence sonrası `Idempotency-Key` header'ı
eklenecek; semantik: aynı anahtar ile tekrar → mevcut response
döner.

## Audit

- **Event:** `audit:file.upload` (severity: info)
- **Actor:** user
- **Target:** `file:${fileId}`
- **Metadata:** `category`, `mimeType`, `sizeBytes`,
  `relatedEntityType?`, `relatedEntityId?`. Orijinal dosya adı
  PII olarak değerlendirilir ve mask'lenerek loglanır.

## Hata kodları

| Kod                   | HTTP | Açıklama                                            |
| --------------------- | ---- | --------------------------------------------------- |
| `VET-AUTH-0001`       | 401  | Oturum geçersiz veya süresi dolmuş.                 |
| `VET-AUTHZ-0001`      | 403  | Permission yok (`file:file:upload`).                |
| `VET-AUTHZ-0006`      | 403  | Aktif tenant bağlamı yok.                           |
| `VET-FILE-0001`       | 413  | Dosya 10 MB sınırını aşıyor.                        |
| `VET-FILE-0002`       | 415  | MIME tipi whitelist dışı.                           |
| `VET-FILE-0004`       | 422  | Antivirus temiz değil.                              |
| `VET-VALIDATION-0001` | 422  | multipart alanları eksik veya `category` enum dışı. |

## Örnek

```bash
curl -X POST \
  -H "Cookie: vetniva_session=..." \
  -F "file=@/path/to/karabas.jpg" \
  -F "category=patient_photo" \
  -F "relatedEntityType=patient" \
  -F "relatedEntityId=b6f0..." \
  https://api.vetniva.local/api/v1/files
```

## Güvenlik notları

- Storage key formatı `${tenantId}/${YYYY-MM}/${uuid}.${ext}` — path
  injection storage katmanında validate edilir; kullanıcı girdisi
  filename'e **asla** yansımaz.
- Tenant bilgisi oturumdan gelir; request body'den `tenantId`
  alınmaz.
- Orijinal dosya adı response'da döndürülür ama audit log'da
  mask'lenir (PII).
- `FileInterceptor` memory-storage kullanır; 10 MB üstü dosyalar
  upload aşamasında reddedilir.
- Antivirus stub her zaman temiz döner; üretim ortamında ClamAV
  daemon'a bağlanan implementasyon devreye alınmalıdır.
