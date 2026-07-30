# POST /api/v1/calendar/block

Belirtilen slot aralığını blocked yapar (mola, izin, tatil). Bu aralık
`getDay` çağrılarında `status='blocked'` olarak döner; appointment
oluşturma akışında bu slot'lar müsait görünmez. Birden fazla blocked
aralık aynı slot'u kapsayabilir (idempotent ekleme).

- **Modül:** calendar
- **Yetki:** `tenant:tenant:update` (OWNER)
- **Audit:** `audit:calendar.block` (severity: info) — blockId,
  veterinarianId, start, end, reason payload ile.

**Request body (`BlockSlotInput`):**

```json
{
  "veterinarianId": "vet-uuid",
  "start": "2026-07-30T12:00:00.000Z",
  "end": "2026-07-30T13:00:00.000Z",
  "reason": "Öğle molası"
}
```

- `veterinarianId` (string, zorunlu) — hedef veteriner.
- `start` (ISO 8601 datetime, zorunlu) — aralık başlangıcı.
- `end` (ISO 8601 datetime, zorunlu) — aralık bitişi. `> start`
  olmalı; aksi → 422 `VET-APPT-0001`.
- `reason` (string, zorunlu) — 1-200 karakter. UI'da görünür açıklama
  (ör. "Öğle molası", "Toplantı", "İzin").

**Response 201 (`BlockedSlotResponse`):**

```json
{
  "id": "blk-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "veterinarianId": "vet-uuid",
  "start": "2026-07-30T12:00:00.000Z",
  "end": "2026-07-30T13:00:00.000Z",
  "reason": "Öğle molası",
  "createdAt": "2026-07-30T11:30:00.000Z"
}
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok veya tenant uyumsuz.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-APPT-0001` (422) — `end <= start`.

**Tenant izolasyonu:** Block kaydı `actor.tenantId` ile birlikte
saklanır. Cross-tenant `id` ile `DELETE` çağrısı → 404 `VET-APPT-0002`
(bilgi sızdırmaz).

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/calendar.ts`
- Block kaldırma: `DELETE /api/v1/calendar/block/{id}`
- Slot okuma: `GET /api/v1/calendar/days/{date}`
- AI chunk: `calendar-overview`
