# POST /api/v1/clinic/waitlist

Hastayı bekleme listesine ekler. Uygun bir randevu slot'u
bulunamadığında resepsiyon tarafından çağrılır. Hasta (patient) aynı
tenant'ta olmalı; `expiresAt` verilmezse 30 gün sonrasına
(`WAITLIST_DEFAULT_TTL_DAYS`) ayarlanır.

- **Modül:** waitlist
- **Yetki:** `clinic:appointment:create` (STAFF, VETERINARIAN)
- **Audit:** `audit:waitlist.add` (severity: info) — patientId,
  ownerId, priority, preferredDate, preferredVeterinarianId, expiresAt.

**Request body (`WaitlistEntryCreate`):**

```json
{
  "patientId": "33333333-3333-3333-3333-333333333333",
  "preferredDate": "2026-08-01T10:00:00.000Z",
  "preferredVeterinarianId": "vet-uuid",
  "reason": "Muayene için uygun slot yok",
  "priority": "urgent",
  "expiresAt": "2026-09-01T00:00:00.000Z"
}
```

- `patientId` (string, zorunlu) — aynı tenant'ta aktif hasta.
  Cross-tenant / yok → 404 `VET-CLINIC-0001`.
- `preferredDate` (ISO 8601, opsiyonel) — tercih edilen tarih.
- `preferredVeterinarianId` (string, opsiyonel) — tercih edilen
  veteriner (FAZ-3+ sıkılaştırılacak).
- `reason` (string, zorunlu) — 1-500 karakter.
- `priority` (enum, zorunlu) — `normal | urgent | emergency`.
- `expiresAt` (ISO 8601, opsiyonel) — override; verilmezse
  `now + 30 gün`.

**Response 201 (`WaitlistEntry`):**

```json
{
  "id": "wl-<uuid>",
  "tenantId": "tnt-uuid",
  "patientId": "33333333-3333-3333-3333-333333333333",
  "ownerId": "own-uuid",
  "status": "waiting",
  "preferredDate": "2026-08-01T10:00:00.000Z",
  "preferredVeterinarianId": "vet-uuid",
  "reason": "Muayene için uygun slot yok",
  "priority": "urgent",
  "createdAt": "2026-07-30T12:00:00.000Z",
  "notifiedAt": null,
  "scheduledAppointmentId": null,
  "expiresAt": "2026-08-29T12:00:00.000Z"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok veya tenant uyumsuz.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-CLINIC-0001` (404) — Patient bulunamadı / cross-tenant.

**Tenant izolasyonu:** `patients.findById(tenantId, patientId)` yalnızca
actor.tenantId kapsamında arar.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/waitlist.ts`
- Listeleme: `GET /api/v1/clinic/waitlist`
- AI chunk: `flow-waitlist`
