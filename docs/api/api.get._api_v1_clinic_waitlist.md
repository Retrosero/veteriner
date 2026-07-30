# GET /api/v1/clinic/waitlist

Bekleme listesini filtreli olarak döner. Sıralama: **emergency >
urgent > normal**, sonra `createdAt asc` (en eski waiting acil kayıt
üstte).

- **Modül:** waitlist
- **Yetki:** `clinic:appointment:read` (STAFF / VETERINARIAN)
- **Audit:** Yok (salt okuma).

**Query (`WaitlistFilters`):**

| Param   | Tip     | Açıklama |
| ------- | ------- | -------- |
| status  | enum    | `waiting | notified | scheduled | cancelled | expired` |
| priority | enum   | `normal | urgent | emergency` |
| patientId | string | Hasta ID filtresi. |
| from    | ISO 8601 | `createdAt >= from`. |
| to      | ISO 8601 | `createdAt <= to`. |

**Response 200 (`WaitlistListResponse`):**

```json
{
  "items": [
    {
      "id": "wl-uuid",
      "tenantId": "tnt-uuid",
      "patientId": "pat-uuid",
      "ownerId": "own-uuid",
      "status": "waiting",
      "preferredDate": "2026-08-01T10:00:00.000Z",
      "preferredVeterinarianId": null,
      "reason": "Acil muayene",
      "priority": "emergency",
      "createdAt": "2026-07-30T11:55:00.000Z",
      "notifiedAt": null,
      "scheduledAppointmentId": null,
      "expiresAt": "2026-08-29T11:55:00.000Z"
    }
  ],
  "total": 1
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Query parse hatası.

**Sıralama garantisi:** Aynı `priority` içinde `createdAt` artan
sırada. Acil vakalar (priority=emergency) her zaman en üstte; stable
sort.

**Tenant izolasyonu:** `repo.search(tenantId, filters)` yalnızca
actor.tenantId kapsamında arar.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/waitlist.ts`
- Ekleme: `POST /api/v1/clinic/waitlist`
- AI chunk: `flow-waitlist`
