# İş Akışı — Yatış Açma (Hospitalization Open)

**Kısa ad:** `hospitalization-open`
**Modül:** hospitalization
**İlgili API:** `POST /api/v1/clinic/hospitalizations`
**Sayfa:** `/[locale]/clinic/patients/{patientId}/hospitalizations/new`

## Amaç
Muayene sonrası veya doğrudan yatış gereken hayvanı kliniğe
yatırmak. Kafes/yatak atanır, yatış order'ları planlanır,
gözlem kayıtları başlatılır.

## Aktör
- VETERINARIAN (yatış kararı)
- STAFF (kafes atama, order uygulama)

## Tetikleyici
- Ameliyat sonrası gözlem gerekir.
- Kritik hasta stabilizasyonu.
- Tedavi planı hastanede uygulanacak (IV, nebül, vb.).

## Akış adımları

1. **Yatış formu açılır.**
   - `route = /[locale]/clinic/patients/{patientId}/hospitalizations/new`
   - Yetki: `clinic:hospitalization:create`.

2. **Bağlam seçilir.**
   - `patientId`, `branchId`.
   - `examinationId` (varsa bağlı muayene).

3. **Kafes/yatak tipi seçilir.**
   - `cageType` (small_dog | medium_dog | large_dog | cat |
     bird | isolation | icu | general).
   - Kafes atanır (`POST /:id/cage-assignments`).
   - Dolu ise: `VET-CLINIC-0006` (409).

4. **Yatış order'ları planlanır.**
   - `POST /:id/orders` (her biri için).
   - Order type: medication | fluid_therapy | feeding |
     vital_check | grooming | other.
   - Schedule: start time + interval + count.

5. **`POST /api/v1/clinic/hospitalizations` çağrılır.**

6. **Sunucu tarafı kontrolleri:**
   - Patient aynı tenant'ta mı?
   - Aktif yatış var mı? Varsa: `VET-HOSP-0001` (409).

7. **Yatış oluşturulur.**
   - `id` (uuid), `status = "active"`.
   - `admittedAt` = now.
   - Audit: `audit:hospitalization.create` (info).

8. **Response 201 + `Hospitalization` döner.**

9. **Kafes ataması.**
   - `POST /:id/cage-assignments` ile kafes atanır.
   - `cageId` + `startedAt`.
   - Audit: `audit:hospitalization.cage_assign` (info).

10. **Order'lar planlanır.**
    - `POST /:id/orders` ile her order.
    - `schedules[]` ile cron benzeri plan (start + interval + count).
    - Audit: `audit:hospitalization_order.create` (info).

11. **Order schedule uygulanır (GOAL-085).**
    - `POST /:schedules/:id/apply` → gerçek kayıt.
    - `POST /:schedules/:id/skip` → atla (gerekçe ile).

12. **Gözlem kayıtları (GOAL-086).**
    - `POST /:id/observations` periyodik.

13. **Taburcu özeti (discharge summary).**
    - `POST /:id/discharge-summary` ile taburcu.
    - Status `active → discharged`.
    - Audit: `audit:hospitalization.discharge` (info).
    - Opsiyonel: PDF + portal paylaşımı.

## Tenant izolasyonu
- Patient + branch + cage aynı tenant'ta olmalı.

## Audit
- `audit:hospitalization.create` (info).
- `audit:hospitalization.cage_assign` (info).
- `audit:hospitalization.discharge` (info).
- `audit:hospitalization_order.create` (info).
- `audit:hospitalization_observation.create` (info).

## Hata senaryoları

| Senaryo | HTTP | Hata kodu |
|---------|------|-----------|
| Aktif yatış var | 409 | `VET-HOSP-0001` |
| Kafes dolu | 409 | `VET-CLINIC-0006` |
| Cross-tenant | 404 | `VET-CLINIC-0001` |
| Geçersiz order | 422 | `VET-VALIDATION-0001` |
| Yetkisiz | 403 | `VET-AUTHZ-0001` |

## İlgili dokümanlar
- `docs/api/api.post._api_v1_clinic_hospitalizations.md`
- `goals/GOAL-084 → GOAL-086_COMPLETION_REPORT.md`
- `docs/permissions/PERMISSION_CATALOG.yaml#clinic:hospitalization:create`
