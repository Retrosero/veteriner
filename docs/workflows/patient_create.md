# İş Akışı — Hayvan Ekleme (Patient Create)

**Kısa ad:** `patient-create`
**Modül:** patient
**İlgili API:** `POST /api/v1/patient/patients`
**Sayfa:** `/[locale]/clinic/owners/{ownerId}/patients/new`

## Amaç

Mevcut bir sahibe hayvan kaydı eklemek. Mikroçip, tür, ırk,
doğum tarihi, cinsiyet ve kısırlaştırma bilgileri girilir.

## Aktör

- VETERINARIAN
- STAFF

## Tetikleyici

- Sahip kliniğe gelir ve yeni hayvanını kayıt ettirmek ister.
- Sahip sahiplik devri (GOAL-022) ile gelir.

## Akış adımları

1. **Sahip detay sayfasından "Hayvan Ekle" butonuna tıklanır.**
   - `route = /[locale]/clinic/owners/{ownerId}/patients/new`
   - Yetki: `clinic:patient:create`.

2. **Zorunlu alanlar doldurulur.**
   - `name` (string, max 100).
   - `species` (enum: dog | cat | bird).
   - `sex` (enum: male | female | unknown).
   - `birthDate` (date; gelecek tarih → 422).

3. **Opsiyonel alanlar.**
   - `breed` (string).
   - `microchip` (15 hane ISO 11784/11785; unique).
   - `color`, `weightKg`.
   - `neutered` (bool).
   - `passportNumber`.

4. **Form doğrulanır.**
   - `VET-VALIDATION-0003` (geçersiz format).
   - `VET-VALIDATION-0009` (geçersiz tarih).

5. **`POST /api/v1/patient/patients` çağrılır.**

6. **Sunucu tarafı kontrolleri:**
   - Aynı `microchip` zaten kayıtlı mı? Varsa:
     `VET-CLINIC-0003` (409).
   - `species` izin verilen listede mi? Değilse:
     `VET-CLINIC-0004` (422).
   - Owner mevcut ve aynı tenant'ta mı? Değilse:
     `VET-CLINIC-0001` (404).

7. **Hayvan kaydı oluşturulur.**
   - `id` (uuid), `tenantId`, `createdById`, `createdAt`.
   - `ownerId` ile bağlanır.
   - Audit: `audit:patient.create` (info).

8. **Response 201 + `Patient` döner.**

9. **UI hayvan detay sayfasına yönlendirir.**
   - `/[locale]/clinic/patients/{id}`.

10. **Opsiyonel: aşı kartı başlatma.**
    - CTA: "Aşı kartı oluştur" → GOAL-051.

## Tenant izolasyonu

- Owner aynı tenant'ta olmalı; cross-tenant → 404.
- Mikroçip tenant çapında unique.

## Audit

- `audit:patient.create` (info).
- `audit:patient.read` (info; liste/detay).
- `audit:owner.read` (info; sahip özet bilgisi).

## Hata senaryoları

| Senaryo               | HTTP | Hata kodu             |
| --------------------- | ---- | --------------------- |
| Duplicate microchip   | 409  | `VET-CLINIC-0003`     |
| İzin verilmeyen tür   | 422  | `VET-CLINIC-0004`     |
| Cross-tenant owner    | 404  | `VET-CLINIC-0001`     |
| Geçersiz doğum tarihi | 422  | `VET-VALIDATION-0009` |
| Yetkisiz              | 403  | `VET-AUTHZ-0001`      |

## İlgili dokümanlar

- `docs/api/api.post._api_v1_patient_patients.md`
- `goals/GOAL-021_COMPLETION_REPORT.md`
- `docs/permissions/PERMISSION_CATALOG.yaml#clinic:patient:create`
