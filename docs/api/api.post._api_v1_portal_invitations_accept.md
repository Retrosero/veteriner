# POST /api/v1/portal/invitations/accept

**Public** endpoint. Davet token'ı ile kabul işlemi yapar;
`PortalUser` ve session token oluşturur. Guard YOK (token
yetki yerine geçer; davet zaten tenant-scoped ve tek
kullanımlık).

- **Modül:** portal
- **Yetki:** public (token tabanlı)
- **Audit:** `audit:portal.invite.accept` (severity: info) —
  yalnızca başarılı kabulde.

**Request body (`PortalAcceptInput`):**

```json
{
  "token": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
}
```

- `token` (UUID, zorunlu) — davet bağlantısındaki `invitationToken`.
- `passwordHash` (string, opsiyonel) — FAZ-3+ portal login ile
  birlikte. Şimdilik yok sayılır.

**Response 200 (`PortalAcceptResponse`):**

```json
{
  "portalUserId": "pusr-12345678-abcdefgh",
  "sessionToken": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
}
```

- `sessionToken` httpOnly cookie'ye bağlanır
  (`vetniva_portal_session`); frontend sonraki isteklerde
  otomatik taşır.
- `portalUserId` frontend'in owner/hayvan listesini sorgulaması
  için gerekir (GOAL-034, FAZ-3).

**Hata kodları:**

- `VET-VALIDATION-0001` (400) — Body parse hatası / token UUID
  değil.
- `VET-PORTAL-0001` (404) — Token bulunamadı.
- `VET-PORTAL-0002` (409) — Davet zaten kabul edilmiş
  (`status=accepted`).
- `VET-PORTAL-0001` (410) — Davet süresi dolmuş veya iptal
  edilmiş.

**Tenant izolasyonu:** Token içinde implicit tenant ID
(davet oluşturulurken set edilmiş); response'daki
`portalUserId` de aynı tenant'a aittir. Cross-tenant IDOR
mümkün değil.

**Idempotency:**

- Pending + expired değil → kabul edilir, 200.
- Zaten accepted → 409 `VET-PORTAL-0002`.
- Pending + expired → expired işaretlenir, 410
  `VET-PORTAL-0001`.
- Revoked → 410 `VET-PORTAL-0001`.

**Kullanım senaryoları:**

- Owner e-postadaki bağlantıyı açar (`/portal/accept?token=...`),
  frontend form submit eder.
- Klinik personeli "Owner'a yeni davet gönderin" dediğinde yeni
  token üretilir; eski token geçersiz sayılır.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/portal.ts`
- Kullanıcı eğitimi: `docs/user-education/PATIENT_OWNER.md`
- AI chunk: `flow-portal-invite`, `error-VET-PORTAL-0001`,
  `error-VET-PORTAL-0002`
