# GET /api/v1/notifications/inbox

> GOAL-015 (Bildirim altyapısı temeli) kapsamında eklenen in-app
> inbox endpoint'i. Aktif kullanıcının tenant kapsamındaki
> uygulama içi bildirim kayıtlarını döner. Cross-tenant
> sorgulama yapılamaz; `userId` query parametresi opsiyonel
> olup default olarak `actor.actorId` kullanılır.

## Modül

`notifications`

## Yetki

- **Roller:** SUPERADMIN, OWNER, VET, TECHNICIAN, RECEPTIONIST, PORTAL_USER
- **Permission:** `common:notification:read`

## Query parametreleri

| Parametre | Tip    | Zorunlu | Açıklama                                                           |
| --------- | ------ | ------- | ------------------------------------------------------------------ |
| `userId`  | string | hayır   | Hedef kullanıcı ID. Belirtilmezse actor'un kendi ID'si kullanılır. |

## Response 200

```json
{
  "items": [
    {
      "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "category": "appointment",
      "templateKey": "appointment_reminder",
      "subject": "Randevu Hatırlatması",
      "body": "Sayın Ayşe Yılmaz, Karabaş için Kadıköy Veteriner kliniğinde 2026-08-01 14:30 saatinde randevunuz bulunmaktadır.",
      "createdAt": "2026-07-30T12:34:56.000Z",
      "readAt": null
    }
  ]
}
```

`items` her zaman tenant kapsamında filtrelenir. Boş inbox →
`{ "items": [] }`.

## Davranış

- `InboxStore` in-memory tutulur (FAZ-1). Server restart'ında
  inbox kayıtları kaybolur; DB persistence Faz 11+ ile gelecek
  (`NotificationRecord` tablosu).
- `readAt` alanı client tarafından `PATCH` ile set edilir
  (ileride). Şu an sadece okunur.
- `category` enum: `appointment` / `vaccination` / `lab` /
  `invoice` / `portal` / `system` / `marketing`.

## Audit

Bu endpoint okuma işlemidir; audit üretmez. Yalnızca `info`
seviyesinde `request log` correlation_id ile bırakılır.

## Hata kodları

| Kod              | HTTP | Açıklama                                      |
| ---------------- | ---- | --------------------------------------------- |
| `VET-AUTH-0001`  | 401  | Oturum geçersiz veya süresi dolmuş.           |
| `VET-AUTHZ-0001` | 403  | Permission yok (`common:notification:read`).  |
| `VET-AUTHZ-0006` | 403  | Aktif tenant bağlamı yok.                     |
| `VET-NOTIF-0002` | 404  | Şablon bulunamadı (yanıtta render edilemedi). |

## Örnek

```bash
curl -X GET \
  -H "Cookie: vetniva_session=..." \
  https://api.vetniva.local/api/v1/notifications/inbox
```

## Güvenlik notları

- `userId` query parametresi opsiyonel olsa da sonuç her zaman
  `actor.tenantId` ile filtrelenir; farklı tenant'ın
  kullanıcısı için inbox sorgulansa bile boş döner (bilgi
  sızdırmazlık).
- Inbox içeriği PII içerebilir (telefon, e-posta); response
  loglanmaz, yalnızca request log'unda `userId` ve `count`
  metadata olarak bırakılır.
- SUPERADMIN başka tenant'ların inbox'ını `userId` ile
  sorgulayabilir; audit kaydı `audit:notification.inbox.read`
  (info) olarak düşer (Faz 11+).
