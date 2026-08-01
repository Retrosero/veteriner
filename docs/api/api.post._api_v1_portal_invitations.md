# POST /api/v1/portal/invitations

Owner için süreli (1-30 gün) tek kullanımlık portal daveti
oluşturur. Owner ve `patientIds` içindeki tüm hayvanlar aynı
tenant'ta olmalı; cross-tenant → 404 `VET-AUTHZ-0002` (bilgi
sızdırmaz). Email normalize edilir (`trim().toLowerCase()`); token
UUID v4 (URL-safe); `expiresAt = now + expiresInDays gün`.

- **Modül:** portal
- **Yetki:** `user:user:invite` (STAFF, VETERINARIAN, OWNER)
- **Audit:** `audit:portal.invite.create` (severity: info)

**Request body (`PortalInviteInput`):**

```json
{
  "ownerId": "11111111-1111-1111-1111-111111111111",
  "email": "ayse@example.com",
  "patientIds": ["33333333-3333-3333-3333-333333333333"],
  "expiresInDays": 7,
  "locale": "tr-TR"
}
```

- `ownerId` (UUID, zorunlu) — hasta sahibi. Aynı tenant'ta olmalı.
- `email` (string, zorunlu) — max 200 karakter. RFC 5322 email
  formatı. Normalize: `trim().toLowerCase()`.
- `patientIds` (UUID[], zorunlu) — davet kapsamındaki hasta
  (patient) ID'leri. 1-50 arası. Tümü aynı tenant'ta olmalı.
- `expiresInDays` (int, zorunlu) — 1-30 gün. Dışında → 422
  `VET-VALIDATION-0003`.
- `locale` (enum, zorunlu) — `tr-TR` | `en-GB`. Davet e-postası
  bu dilde oluşturulur (FAZ-3+ notification altyapısı ile).

**Response 201 (`PortalInvitation`):**

```json
{
  "id": "pinv-aaaaaaaa-12345678",
  "tenantId": "tnt-uuid",
  "ownerId": "11111111-1111-1111-1111-111111111111",
  "email": "ayse@example.com",
  "status": "pending",
  "invitedAt": "2026-07-30T12:00:00.000Z",
  "expiresAt": "2026-08-06T12:00:00.000Z",
  "acceptedAt": null,
  "revokedAt": null,
  "invitationToken": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "patientIds": ["33333333-3333-3333-3333-333333333333"],
  "locale": "tr-TR",
  "invitedBy": "usr-staff-uuid"
}
```

`invitationToken` yalnızca oluşturan kullanıcıya görünür; kabul
adımında URL'de (`/portal/accept?token=...`) taşınır.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok veya tenant uyumsuz.
- `VET-AUTHZ-0002` (404) — Owner veya hasta bulunamadı (cross-tenant dahil).
- `VET-TENANT-0001` (400) — Tenant bağlamı zorunlu.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-VALIDATION-0003` (422) — `expiresInDays` 1-30 dışında.

**Tenant izolasyonu:** Owner + her `patientId` aynı tenant'ta
olmalı; aksi halde 404 (bilgi sızdırmaz).

**Kullanım senaryoları:**

- Resepsiyon: yeni hasta sahibine ilk portal daveti.
- Mevcut owner'ın 2. hayvanı için ek davet.
- Owner e-posta değişikliği sonrası yeniden davet.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/portal.ts`
- Kullanıcı eğitimi: `docs/user-education/PATIENT_OWNER.md`
- AI chunk: `flow-portal-invite`, `error-VET-PORTAL-0001`
