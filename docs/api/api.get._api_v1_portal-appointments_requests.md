# GET /api/v1/portal-appointments/requests

Giriş yapmış hasta sahibinin oluşturduğu **tüm** randevu taleplerini
listeler. Yalnızca `ownerId` filtresi uygulanır; başka sahiplerin
talepleri hiçbir koşulda dönmez (bilgi sızdırmaz). Sıralama
`requestedAt` azalan (en yeni üstte).

- **Modül:** portal-appointments
- **Yetki:** `PortalSessionGuard` (`actorType: "portal_user"`,
  `role: "PET_OWNER_PORTAL"`, `source: "portal_session"`).
- **Audit:** Yok (read-only).
- **Idempotency:** N/A (GET).
- **Yan etki:** Yok.

## Request

**Headers:**

- `Cookie: vetniva_portal_session=<token>` **veya**
  `Authorization: Bearer <sessionToken>` — zorunlu.

Query: Yok (FAZ-0). İleride `?status=pending&limit=...` eklenebilir.

## Response

**200 OK (`AppointmentRequestListResponse`):**

```json
{
  "items": [
    {
      "id": "pareq-tntaaaaa-aaaa-bbbb",
      "tenantId": "tnt-uuid",
      "patientId": "pat-uuid-1",
      "ownerId": "own-uuid",
      "status": "pending",
      "preferredDate": "2026-08-15T10:00:00.000Z",
      "preferredVeterinarianId": null,
      "type": "consultation",
      "reason": "Yıllık kontrol",
      "contactPreference": "phone",
      "requestedAt": "2026-07-30T12:00:00.000Z",
      "decidedAt": null,
      "decidedBy": null,
      "rejectionReason": null,
      "approvedAppointmentId": null
    },
    {
      "id": "pareq-tntaaaaa-cccc-dddd",
      "tenantId": "tnt-uuid",
      "patientId": "pat-uuid-1",
      "ownerId": "own-uuid",
      "status": "approved",
      "preferredDate": "2026-08-10T11:00:00.000Z",
      "preferredVeterinarianId": "vet-uuid",
      "type": "vaccination",
      "reason": "Aşı tekrarı",
      "contactPreference": "email",
      "requestedAt": "2026-07-25T09:00:00.000Z",
      "decidedAt": "2026-07-26T08:30:00.000Z",
      "decidedBy": "usr-staff",
      "rejectionReason": null,
      "approvedAppointmentId": "appt-stub-1"
    }
  ],
  "total": 2
}
```

- `items[].status` — `pending | approved | rejected | cancelled |
auto_scheduled`.
- `items[].approvedAppointmentId` — yalnızca `approved` ise dolu;
  `GET /api/v1/clinic/appointments/{id}` ile detay alınabilir.
- `total` — `items.length` (pagination FAZ-0'da yok).

## Hata kodları

- `VET-AUTH-0001` (401) — Portal session yok / süresi dolmuş.
- `VET-AUTHZ-0001` (403) — Cross-tenant session.

**Not:** Portal user bulunamadığında **boş liste** döner (404
değil). Cross-owner hasta ID'si yoktur (zaten `ownerId` filtreli
sorgu). `requireTenantScope` cross-tenant denemeyi 403 ile reddeder.

## Güvenlik notları

- `ownerId` filtre kaynağı **yalnızca** `PortalUser.ownerId`.
- `tenantId === actor.tenantId` zorunlu; farklı tenant → 403.
- In-memory Map üzerinden `tenantId + ownerId` çift filtreleme
  yapılır; tenant-scoped index (DB persistence sonrası) için
  `(tenantId, ownerId, requestedAt DESC)` önerilir.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/portal-appointment-request.ts`
- Oluşturma: `POST /api/v1/portal-appointments/requests`
- İptal: `POST /api/v1/portal-appointments/requests/{id}/cancel`
- AI chunk: `flow-portal-appointment-request`
