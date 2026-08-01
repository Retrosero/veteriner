# DELETE /api/v1/portal/invitations/:id

Daveti iptal eder. Yalnızca `pending` durumdaki davetler
iptal edilir (`status=revoked` + `revokedAt` set); diğer durumlar
(`accepted` / `expired` / `revoked`) idempotent no-op (mevcut
kayıt döner). Tenant-scoped: cross-tenant → 404 `VET-PORTAL-0001`.

- **Modül:** portal
- **Yetki:** `user:user:invite` (STAFF, VETERINARIAN, OWNER)
- **Audit:** `audit:portal.invite.revoke` (severity: warning) —
  yalnızca gerçek `pending → revoked` geçişinde.

**Path parametreleri:**

| Ad   | Tip    | Zorunlu | Açıklama                |
| ---- | ------ | ------- | ----------------------- |
| `id` | string | evet    | Davet ID. UUID formatı. |

**Response 200 (`PortalInvitation`):**

```json
{
  "id": "pinv-aaaaaaaa-12345678",
  "tenantId": "tnt-uuid",
  "ownerId": "11111111-1111-1111-1111-111111111111",
  "email": "ayse@example.com",
  "status": "revoked",
  "invitedAt": "2026-07-30T12:00:00.000Z",
  "expiresAt": "2026-08-06T12:00:00.000Z",
  "acceptedAt": null,
  "revokedAt": "2026-07-30T13:00:00.000Z",
  "invitationToken": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "patientIds": ["33333333-3333-3333-3333-333333333333"],
  "locale": "tr-TR",
  "invitedBy": "usr-staff-uuid"
}
```

- Pending dışı durumlarda response body'sinde `status` ve
  `revokedAt` mevcut halleriyle döner (no-op).
- HTTP 200 (idempotent). 204 tercih edilmedi; UI güncel kaydı
  görmek isteyebilir.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok veya tenant uyumsuz.
- `VET-PORTAL-0001` (404) — Davet bulunamadı (cross-tenant dahil).

**Kullanım senaryoları:**

- Owner yanlış e-posta girdi, yeniden davet gönderilecek.
- Owner telefonla "iptal edin" dedi, personel daveti iptal ediyor.
- Şüpheli davet (yanlışlıkla oluşturulmuş, farklı kişiye gitmiş).

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/portal.ts`
- İlgili davet oluşturma: `api.post._api_v1_portal_invitations.md`
- AI chunk: `flow-portal-invite`, `error-VET-PORTAL-0001`
