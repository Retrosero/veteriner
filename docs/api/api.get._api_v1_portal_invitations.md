# GET /api/v1/portal/invitations

Owner'a ait tüm davetleri tenant-scoped listeler. `ownerId` query
parametresi zorunlu. Tüm durumlar (pending / accepted / expired /
revoked) döner; UI filtreleme yapabilir.

- **Modül:** portal
- **Yetki:** `clinic:owner:read` (STAFF, VETERINARIAN, OWNER)

**Query parametreleri:**

| Ad        | Tip  | Zorunlu | Açıklama                                |
| --------- | ---- | ------- | --------------------------------------- |
| `ownerId` | UUID | evet    | Hasta sahibi ID. Aynı tenant'ta olmalı. |

**Response 200 (`PortalInvitationListResponse`):**

```json
{
  "items": [
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
  ],
  "total": 1
}
```

- `invitationToken` yalnızca `pending` durumdaki kayıtlarda
  aktiftir; `accepted`/`expired`/`revoked` sonrası kullanılamaz
  ama response'da görünür (klinik personeli denetim amaçlı
  görebilir).
- Sıralama: `invitedAt` azalan (yeniden eskiye).

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok veya tenant uyumsuz.
- `VET-VALIDATION-0001` (400) — `ownerId` UUID değil.

**Tenant izolasyonu:** Sorgu daima `actor.tenantId` kapsamında
çalışır. Farklı tenant'ın owner'ları sonuçta YOK.

**Audit:** Yayınlamaz (sık çağrılan listeleme; gürültü kontrolü).

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/portal.ts`
- İlgili davet oluşturma: `api.post._api_v1_portal_invitations.md`
- AI chunk: `flow-portal-invite`
