# POST /api/v1/portal-auth/logout

Aktif portal oturumunu kapatır. Token, `vetniva_portal_session`
cookie'den (tercih edilen) veya `Authorization: Bearer` header'dan
okunur. Token yoksa veya geçersizse idempotent 200 döner (güvenli
logout); cookie her durumda temizlenir.

- **Modül:** portal-auth
- **Yetki:** public (`@Public()`)
- **Audit:** `audit:portal.auth.logout` (info) — yalnızca geçerli
  session varsa.

**Request body:** Yok.

**Cookie/header:**

- Tercih 1: `Cookie: vetniva_portal_session=<token>`
- Tercih 2: `Authorization: Bearer <token>`

**Response 200 (`PortalMessageResponse`):**

```json
{ "message": "Oturum kapatıldı" }
```

Yanıtta `vetniva_portal_session` cookie `Path=/` ile temizlenir
(`Set-Cookie: vetniva_portal_session=; Max-Age=0`).

**Hata kodları:** Yok (idempotent 200).

**Güvenlik notları:**

- Logout her durumda 200 döner; token varlığı bilgi sızdırmaz.
- Session DB'de silinir; aynı token sonraki isteklerde 401 ile
  reddedilir (`validateSession` null).

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/portal-auth.ts`
- Login: `POST /api/v1/portal-auth/login`
- AI chunk: `flow-portal-auth`
