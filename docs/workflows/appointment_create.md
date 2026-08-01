# İş Akışı — Randevu Oluşturma (Appointment Create)

**Kısa ad:** `appointment-create`
**Modül:** appointment
**İlgili API:** `POST /api/v1/calendar/appointments`
**Sayfa:** `/[locale]/clinic/calendar/new`

## Amaç

Belirli bir tarih/saatte belirli bir hayvan için randevu
rezerve etmek. Klinik takvimi üzerinden slot seçilir.

## Aktör

- VETERINARIAN
- STAFF (resepsiyon)
- OWNER (kendi hayvanı için self-service)

## Tetikleyici

- Hayvan sahibi telefonla/içeriden randevu talep eder.
- Klinik dashboard'unda "yeni randevu" butonuna tıklanır.
- Portal self-service randevu talebi (GOAL-035) onaylanır.

## Akış adımları

1. **Randevu formu açılır.**
   - `route = /[locale]/clinic/calendar/new`
   - Yetki: `clinic:appointment:create` (personel),
     `portal:appointment:request` (portal self-service).

2. **Hasta ve sahip seçilir.**
   - `ownerId` + `patientId` (active ownership kontrolü).
   - Veya portal'dan: sadece kendi `patientId`'si seçilebilir.

3. **Veteriner hekim seçilir.**
   - `veterinarianId` (aktif, çalışma saatleri içinde).

4. **Tarih ve saat seçilir.**
   - `startAt`, `endAt` (endAt > startAt; aralık ≤ 8 saat).
   - `serviceType` (genel muayene, aşı, kontrol, ameliyat, vb.).

5. **Slot uygunluğu kontrol edilir.**
   - `moduleFromRoute('/api/v1/calendar/appointments')` → `appointment`.
   - Sunucu: aynı veteriner için aynı slot dolu mu?
     `VET-APPT-0005` (409 slot çakışması).
   - Çalışma saatleri dışı: `VET-APPT-0001` veya
     `VET-APPT-0003`.

6. **Form doğrulanır.**
   - `VET-APPT-0004` (geçersiz tarih formatı).
   - `VET-VALIDATION-0010` (geçersiz tutar; eğer service fee).

7. **`POST /api/v1/calendar/appointments` çağrılır.**

8. **Sunucu tarafı kontrolleri:**
   - Cross-tenant: patient + veterinarian aynı tenant'ta mı?
   - Cross-tenant: 404 `VET-CLINIC-0001`.

9. **Randevu oluşturulur.**
   - `id` (uuid), `status = "scheduled"`.
   - Audit: `audit:appointment.create` (info).

10. **Response 201 + `Appointment` döner.**

11. **Opsiyonel: hatırlatma job'u planlanır (GOAL-036).**
    - Default: 24 saat önce SMS/email.

12. **UI randevu detay sayfasına yönlendirir.**

## Tenant izolasyonu

- Patient + veterinarian + branch aynı tenant'ta olmalı.
- Cross-tenant → 404 `VET-CLINIC-0001`.

## Audit

- `audit:appointment.create` (info).
- `audit:appointment_notification.schedule` (info; hatırlatma).

## Hata senaryoları

| Senaryo            | HTTP | Hata kodu        |
| ------------------ | ---- | ---------------- |
| Slot çakışması     | 409  | `VET-APPT-0005`  |
| Çalışma saati dışı | 422  | `VET-APPT-0003`  |
| End < start        | 422  | `VET-APPT-0001`  |
| Geçersiz tarih     | 422  | `VET-APPT-0004`  |
| Yetkisiz           | 403  | `VET-AUTHZ-0001` |

## İlgili dokümanlar

- `docs/api/api.post._api_v1_calendar_appointments.md`
- `goals/GOAL-031_COMPLETION_REPORT.md`
- `goals/GOAL-036_COMPLETION_REPORT.md` (hatırlatma)
- `docs/permissions/PERMISSION_CATALOG.yaml#clinic:appointment:create`
