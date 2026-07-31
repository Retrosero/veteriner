# İş Akışı — Muayene Başlatma (Examination Start)

**Kısa ad:** `examination-start`
**Modül:** examination
**İlgili API:** `POST /api/v1/clinic/examinations`
**Sayfa:** `/[locale]/clinic/patients/{patientId}/examinations/new`

## Amaç
Bir randevuya bağlı veya doğrudan muayene kaydı açmak. SOAP
notu, vital bulgular, teşhis, tedavi planı, reçete, order
ve kontrol randevusu alt kayıtları bu ana muayeneye bağlanır.

## Aktör
- VETERINARIAN (muayeneyi yapan)
- STAFF (giriş/yardım)

## Tetikleyici
- Hayvan sahibi muayeneye gelir (randevulu veya doğrudan).
- Bekleme listesindeki hasta sırası gelir.
- Acil servis (acil olarak işaretlenmiş).

## Akış adımları

1. **Muayene formu açılır.**
   - `route = /[locale]/clinic/patients/{patientId}/examinations/new`
   - Yetki: `clinic:examination:create`.

2. **Kaynak seçilir.**
   - `appointmentId` (varsa bağlı randevu) veya
     `walkIn=true` (doğrudan geldi).

3. **Branch seçilir.**
   - `branchId` (aktif şube).

4. **Tür seçilir.**
   - `kind` (general | vaccination | surgery | followup | lab | imaging).

5. **`POST /api/v1/clinic/examinations` çağrılır.**

6. **Sunucu tarafı kontrolleri:**
   - Patient aynı tenant'ta mı? Cross-tenant → 404 `VET-CLINIC-0001`.
   - Aktif ownership var mı? Değilse: `VET-CLINIC-0011`.
   - Appointment varsa: status = `scheduled` veya
     `confirmed` olmalı (`VET-APPT-0006` aksi halde).

7. **Muayene kaydı oluşturulur.**
   - `id` (uuid), `status = "in_progress"`.
   - `patientId`, `veterinarianId`, `branchId`, `startedAt`.
   - Audit: `audit:examination.create` (info).

8. **Response 201 + `Examination` döner.**

9. **UI muayene çalışma ekranına yönlendirir.**
   - `/[locale]/clinic/examinations/{id}/work`.
   - Sekmeler: **SOAP**, **Vitals**, **Diagnoses**, **Orders**,
     **Prescriptions**, **Followups**.

10. **Veteriner hekim SOAP notunu girer (GOAL-041).**
    - S, O, A, P alanları.

11. **Vital bulgular eklenir (GOAL-042).**
    - Ateş, nabız, solunum, vb.

12. **Teşhis eklenir (GOAL-043).**
    - ICD-10 / VetBERT code.

13. **Tedavi planı + order verilir (GOAL-044).**

14. **Opsiyonel: Reçete yazılır (GOAL-045).**
    - PDF çıktısı + portal paylaşımı.

15. **Opsiyonel: Kontrol randevusu oluşturulur (GOAL-046).**
    - `followupDate` ile.

16. **Muayene tamamlanır (sign).**
    - Status `in_progress → completed` (imza).
    - `signedAt`, `signedBy` set edilir.
    - Audit: `audit:examination.sign` (info).
    - Sonradan değişiklik: **amendment** (append-only).

## Tenant izolasyonu
- Patient + branch aynı tenant'ta olmalı.

## Audit
- `audit:examination.create` (info).
- `audit:examination.sign` (info).
- `audit:examination.amend` (info; sonradan düzeltme).

## Hata senaryoları

| Senaryo | HTTP | Hata kodu |
|---------|------|-----------|
| Aktif ownership yok | 404 | `VET-CLINIC-0011` |
| Randevu uygun değil | 409 | `VET-APPT-0006` |
| Cross-tenant | 404 | `VET-CLINIC-0001` |
| İmzalı muayene değişiklik | 409 | `VET-EXAM-0002` |
| Yetkisiz | 403 | `VET-AUTHZ-0001` |

## İlgili dokümanlar
- `docs/api/api.post._api_v1_clinic_examinations.md`
- `goals/GOAL-040_COMPLETION_REPORT.md`
- `goals/GOAL-041 → 047_*COMPLETION_REPORT.md` (alt akışlar)
- `docs/permissions/PERMISSION_CATALOG.yaml#clinic:examination:create`
