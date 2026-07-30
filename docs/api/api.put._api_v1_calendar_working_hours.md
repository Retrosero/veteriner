# PUT /api/v1/calendar/working-hours

Tenant (veya belirtilen veterinarian) için haftalık çalışma saatlerini
günceller. `hours` dizisi 1-7 gün tanımı taşır; her gün için
`dayOfWeek` (0-6), `startTime` (HH:mm), `endTime` (HH:mm) ve
`slotDurationMin` (5-240) zorunludur. Aynı `dayOfWeek` için birden fazla
tanım kabul edilmez; aynı gün tekrarı veya `endTime <= startTime`
→ 422 `VET-APPT-0003`.

- **Modül:** calendar
- **Yetki:** `tenant:tenant:update` (OWNER)
- **Audit:** `audit:calendar.hours.update` (severity: info) —
  `previous` + `next` payload ile.

**Request body (`SetWorkingHoursInput`):**

```json
{
  "veterinarianId": "vet-uuid",
  "hours": [
    { "dayOfWeek": 1, "startTime": "09:00", "endTime": "17:00", "slotDurationMin": 30 },
    { "dayOfWeek": 2, "startTime": "09:00", "endTime": "17:00", "slotDurationMin": 30 },
    { "dayOfWeek": 3, "startTime": "09:00", "endTime": "17:00", "slotDurationMin": 30 },
    { "dayOfWeek": 4, "startTime": "09:00", "endTime": "17:00", "slotDurationMin": 30 },
    { "dayOfWeek": 5, "startTime": "09:00", "endTime": "14:00", "slotDurationMin": 30 }
  ]
}
```

- `veterinarianId` (string, opsiyonel) — atlanırsa tenant default
  (`vet-default`) güncellenir.
- `hours` (array, zorunlu) — 1-7 öğe. Her öğe:
  - `dayOfWeek` (int, 0-6, 0=Pazar) — haftanın günü.
  - `startTime` (HH:mm) — gün başlangıç saati.
  - `endTime` (HH:mm) — gün bitiş saati. `> startTime` olmalı.
  - `slotDurationMin` (int, 5-240) — slot uzunluğu (dakika).

**Response 200:**

```json
{ "updated": true }
```

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok veya tenant uyumsuz.
- `VET-VALIDATION-0001` (400) — Body parse hatası.
- `VET-APPT-0003` (422) — Aynı gün tekrarı veya `endTime <= startTime`.

**Tenant izolasyonu:** Kayıt `actor.tenantId` altında tutulur.
`veterinarianId` belirtilse bile cross-tenant slot üretimi mümkün
değil (slot okuma tarafında tenant guard zorunlu).

**Davranış notları:**

- Mevcut booked veya blocked slot'lar ETKİLENMEZ. Yalnızca
  `getDay` çağrılarında geleceğe yönelik slot üretiminde yeni
  kurallar geçerli olur.
- Pazar (dayOfWeek=0) dahil edilebilir; bu durumda o gün için
  slot üretilir.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/calendar.ts`
- Slot okuma: `GET /api/v1/calendar/days/{date}`
- AI chunk: `calendar-overview`
