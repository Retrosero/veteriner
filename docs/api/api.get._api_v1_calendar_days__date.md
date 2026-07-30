# GET /api/v1/calendar/days/{date}

Belirtilen tarih için veterinarian'ın (veya tenant default'unun) çalışma
saatlerinden üretilmiş slot listesini, mevcut booked slot'ları ve
blocked slot'ları birlikte döner. Slot'lar `slotDurationMin` aralıklarla
(working hours kaydından, default 30 dk) oluşturulur; her slot'un
durumu `available | booked | blocked` olabilir.

- **Modül:** calendar
- **Yetki:** `clinic:appointment:read` (STAFF, VETERINARIAN, OWNER)
- **Audit:** Yayınlamaz (gürültü kontrolü; takvim okuması read-only).

**Path parametreleri:**

| Ad | Tip | Zorunlu | Açıklama |
| --- | --- | --- | --- |
| `date` | string | evet | `YYYY-MM-DD` formatında tarih. Geçersiz → 422 `VET-APPT-0004`. |

**Query parametreleri:**

| Ad | Tip | Zorunlu | Açıklama |
| --- | --- | --- | --- |
| `veterinarianId` | string | hayır | Belirtilirse yalnızca o veteriner için üretilmiş slot'lar. Atlanırsa tenant default (`vet-default`) kullanılır. |

**Response 200 (`CalendarDay`):**

```json
{
  "date": "2026-07-30",
  "slots": [
    {
      "start": "2026-07-30T09:00:00.000Z",
      "end": "2026-07-30T09:30:00.000Z",
      "status": "available",
      "veterinarianId": "vet-default"
    },
    {
      "start": "2026-07-30T09:30:00.000Z",
      "end": "2026-07-30T10:00:00.000Z",
      "status": "booked",
      "appointmentId": "apt-uuid",
      "veterinarianId": "vet-default"
    },
    {
      "start": "2026-07-30T12:00:00.000Z",
      "end": "2026-07-30T12:30:00.000Z",
      "status": "blocked",
      "veterinarianId": "vet-default"
    }
  ]
}
```

Slot'lar `start` artan sırada döner. Pazar (dayOfWeek=0) için
tenant default çalışma saati tanımlı değilse 0 slot döner.

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok veya tenant uyumsuz.
- `VET-APPT-0004` (422) — `date` `YYYY-MM-DD` formatında değil.

**Tenant izolasyonu:** Sorgu daima `actor.tenantId` kapsamında çalışır.
Çalışma saati kaydı tenant-scoped; cross-tenant slot üretimi mümkün
değil.

**Kullanım senaryoları:**

- Resepsiyon: günlük takvimi açar, müsait saatleri listeler.
- Portal (FAZ-3+): online randevu talebi için uygun slot'ları gösterir.
- Mobil (FAZ-3+): veteriner kendi gününü görür.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/calendar.ts`
- Çalışma saati yönetimi: `PUT /api/v1/calendar/working-hours`
- Slot bloklama: `POST /api/v1/calendar/block`
- AI chunk: `calendar-overview`
