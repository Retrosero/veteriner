# İş Akışı — Laboratuvar Sonucu (Lab Result Entry)

**Kısa ad:** `lab-result-entry`
**Modül:** lab-result
**İlgili API:** `POST /api/v1/clinic/lab-orders/{orderId}/result`
**Sayfa:** `/[locale]/clinic/lab-orders/{orderId}/result/new`

## Amaç

Bir lab order'ın sonucunu girmek. Analyte bazlı değer,
referans aralığı ve abnormal flag eklenir; draft → submitted
→ approved → (amended) state machine ile yönetilir.

## Aktör

- VETERINARIAN (uzman onayı)
- LAB_TECH (sonuç girişi)
- EXTERNAL_ADAPTER (cihaz/lab adapter, FAZ-9 GOAL-094)

## Tetikleyici

- Numune toplandıktan sonra cihaz/laboratuvar sonuç döner.
- Manuel giriş (override).

## Akış adımları

1. **Sonuç formu açılır.**
   - `route = /[locale]/clinic/lab-orders/{orderId}/result/new`
   - Yetki: `clinic:lab:enter_result`.

2. **Analyte'ler listelenir (test kataloğundan).**
   - `analytes[]` (her biri: name, unit, referenceRange).
   - Önceden doldurulmuş olabilir (katalog + adapter).

3. **Her analyte için değer girilir.**
   - `value` (Decimal veya string).
   - `abnormalFlag` (low | high | critical_low | critical_high | normal).
   - Hesaplama: referans aralığına göre otomatik önerilir.

4. **`POST /api/v1/clinic/lab-orders/{orderId}/result` çağrılır.**

5. **Sunucu tarafı kontrolleri:**
   - Lab order mevcut ve aynı tenant'ta mı?
   - Order status `in_progress` veya `completed` olmalı.
   - Cross-tenant → 404.

6. **Sonuç draft oluşturulur.**
   - `id` (uuid), `status = "draft"`.
   - `enteredBy`, `enteredAt` set edilir.
   - Audit: `audit:lab_result.create` (info).

7. **Response 201 + `LabResult` döner.**

8. **Submit (uzman onayına gönder).**
   - `POST /api/v1/clinic/lab-orders/{orderId}/result/submit`.
   - Status `draft → submitted`.
   - Audit: `audit:lab_result.submit` (info).

9. **Approve (uzman onayı).**
   - `POST /api/v1/clinic/lab-orders/{orderId}/result/approve`.
   - Status `submitted → approved`.
   - `approvedBy`, `approvedAt`.
   - Audit: `audit:lab_result.approve` (info).

10. **Sonuç muayeneye bağlanır (otomatik).**
    - `examinationId` (varsa) ile ilişkilendirilir.

11. **Opsiyonel: Amend (düzeltme).**
    - `POST /api/v1/clinic/lab-orders/{orderId}/result/amend`.
    - Yeni sonuç oluşturulur; eski `amendedFromId` ile bağlanır.
    - Status `approved → amended` (append-only).
    - Audit: `audit:lab_result.amend` (info).

12. **Portal görünürlüğü (otomatik).**
    - `visibility: "portal"` ile hasta sahibi görebilir.
    - Anormal flag varsa portal'da kırmızı işaret.

## Tenant izolasyonu

- Lab order + test catalog aynı tenant'ta olmalı.

## Audit

- `audit:lab_result.create` (info).
- `audit:lab_result.submit` (info).
- `audit:lab_result.approve` (info).
- `audit:lab_result.amend` (info).

## Hata senaryoları

| Senaryo           | HTTP | Hata kodu             |
| ----------------- | ---- | --------------------- |
| Order uygun değil | 409  | `VET-LAB-0001`        |
| Cross-tenant      | 404  | `VET-CLINIC-0001`     |
| Geçersiz analyte  | 422  | `VET-VALIDATION-0001` |
| Yetkisiz          | 403  | `VET-AUTHZ-0001`      |

## İlgili dokümanlar

- `docs/api/api.post._api_v1_clinic_lab-orders__orderId_result.md`
- `goals/GOAL-091_COMPLETION_REPORT.md`
- `goals/GOAL-092_COMPLETION_REPORT.md` (sonuç yönetimi)
- `goals/GOAL-094_COMPLETION_REPORT.md` (adapter)
- `docs/permissions/PERMISSION_CATALOG.yaml#clinic:lab:enter_result`
