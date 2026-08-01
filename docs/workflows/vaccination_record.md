# İş Akışı — Aşı Kaydı (Vaccination Record)

**Kısa ad:** `vaccination-record`
**Modül:** vaccine
**İlgili API:** `POST /api/v1/clinic/vaccines/applications`
**Sayfa:** `/[locale]/clinic/patients/{patientId}/vaccinations/new`

## Amaç

Hayvana aşı uygulaması kaydetmek. Aşı kataloğundan (protokol)
seçim, lot numarası, son kullanma tarihi, uygulayan kişi ve
bir sonraki hatırlatma tarihi otomatik hesaplanır.

## Aktör

- VETERINARIAN
- STAFF (yardımcı)

## Tetikleyici

- Aşı protokolü tamamlandığında (tek seferlik puppy vaccine
  series).
- Yıllık booster zamanı geldiğinde.
- Seyahat öncesi ek aşı talebi.

## Akış adımları

1. **Aşı formu açılır.**
   - `route = /[locale]/clinic/patients/{patientId}/vaccinations/new`
   - Yetki: `clinic:vaccine:apply`.

2. **Aşı kataloğundan seçim yapılır.**
   - `vaccineId` (katalogdan).
   - `protocolId` (opsiyonel; protokol takibi için).

3. **Lot ve son kullanma tarihi girilir.**
   - `lotNumber` (string, max 64).
   - `expirationDate` (date, gelecekte olmalı).

4. **Uygulama bilgileri.**
   - `appliedAt` (default now).
   - `route` (subcutaneous | intramuscular | intranasal | oral).
   - `site` (string, max 100, opsiyonel).
   - `dose` (string, max 64, opsiyonel).

5. **Stok düşümü.**
   - `lotId` ile stok hareketi otomatik üretilir
     (`stock_movement: out`).
   - Lot aktif ve miktar > 0 olmalı; aksi halde
     `VET-INVENTORY-0001`.

6. **`POST /api/v1/clinic/vaccines/applications` çağrılır.**

7. **Sunucu tarafı kontrolleri:**
   - Patient aynı tenant'ta mı?
   - Aşı kataloğu aktif mi?
   - Lot aktif ve SKT geçmemiş mi?

8. **Aşı kaydı oluşturulur.**
   - `id` (uuid), `status = "applied"`.
   - `nextDueAt` otomatik hesaplanır
     (protokolün `boosterIntervalDays`'ından).
   - Audit: `audit:vaccination.create` (info).
   - Stok hareketi: `audit:stock_movement.create` (info).

9. **Response 201 + `VaccineApplication` döner.**

10. **Aşı kartı güncellenir (GOAL-052).**
    - Patient'in tüm aşılarına eklenir.
    - `nextDueAt` mevcutsa kartın üstünde gösterilir.

11. **Opsiyonel: hatırlatma planlanır (GOAL-053).**
    - `nextDueAt - reminderOffsetDays` ile job oluşturulur.
    - SMS/email gönderilir.

12. **Opsiyonel: sertifika PDF (GOAL-047).**
    - "Aşı Sertifikası" butonu → PDF render.

13. **Portal paylaşımı (otomatik).**
    - `category: "vaccine_certificate"` ile portal'a
      görünür olur.

## Tenant izolasyonu

- Patient + vaccine + lot aynı tenant'ta olmalı.

## Audit

- `audit:vaccination.create` (info).
- `audit:vaccination.amend` (info; hatalı kayıt düzeltme).
- `audit:stock_movement.create` (info; stok düşümü).

## Hata senaryoları

| Senaryo            | HTTP | Hata kodu            |
| ------------------ | ---- | -------------------- |
| Pasif aşı kataloğu | 409  | `VET-VACC-0001`      |
| Stok yetersiz      | 409  | `VET-INVENTORY-0001` |
| Lot SKT geçmiş     | 422  | `VET-VACC-0003`      |
| Cross-tenant       | 404  | `VET-CLINIC-0001`    |
| Yetkisiz           | 403  | `VET-AUTHZ-0001`     |

## İlgili dokümanlar

- `docs/api/api.post._api_v1_clinic_vaccines_applications.md`
- `goals/GOAL-050 → GOAL-054_COMPLETION_REPORT.md`
- `docs/permissions/PERMISSION_CATALOG.yaml#clinic:vaccine:apply`
