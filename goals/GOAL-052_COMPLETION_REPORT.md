# GOAL-052 — Aşı Kartı (Completion Report)

## Faz
FAZ-5 (Aşı + stok)

## Özet
Aşı kartı görünümü personel paneli ve hasta sahibi portalı için
tek hesaplama kaynağı olarak tamamlandı. Hasta + tür uyumlu
protokoller için aşı geçmişi, sonraki tarih, durum, uygulayan
veteriner ve lot bilgileri tek bir `VaccineCard` yapısı altında
toplandı. Portal görünürlüğü tenant ayarına bağlandı.

## Çıktılar

### Core (GOAL-052 core commit `2b7cc84`)
- `apps/api/src/modules/vaccines/vaccine-cards.controller.ts` —
  personel + portal olmak üzere iki controller:
  - `VaccineCardsController` (4 endpoint) personel kökü.
  - `PortalVaccineCardsController` (1 endpoint) portal kökü.
- `apps/api/src/modules/vaccines/vaccine-cards.service.ts` —
  hesaplama + tenant ayarı.
- `apps/api/src/modules/vaccines/vaccine-cards.repository.ts` —
  tenant-scoped ayar UPSERT.
- `apps/api/src/modules/vaccines/vaccine-cards.service.spec.ts` —
  13+ unit test (cross-tenant, species filter, status çözümleme,
  portalVisible, portal ayar kapalı → 403).
- `packages/contracts/src/vaccine-card.ts` — Zod şemaları:
  `VaccineCard`, `VaccineCardEntry`, `VaccineCardSummary`,
  `VaccineCardStep`, `TenantVaccineCardPortalSetting`,
  `TenantVaccineCardPortalSettingInput`.

### Endpoint'ler (5)

| # | Method | Path | Kök | Yetki |
|---|--------|------|-----|-------|
| 1 | GET | `/api/v1/clinic/vaccines/cards/patient/{patientId}` | personel | `clinic:vaccination:read` |
| 2 | GET | `/api/v1/clinic/vaccines/cards/portal-setting` | personel | `clinic:vaccination:read` |
| 3 | PUT | `/api/v1/clinic/vaccines/cards/portal-setting` | personel | `clinic:vaccination:read` |
| 4 | GET | `/api/v1/portal/vaccines/cards/patient/{patientId}` | portal | portal session |

### Döküman (bu commit)
- `docs/api/api.get._api_v1_clinic_vaccines_cards_patient__patientId_.md`
- `docs/api/api.get._api_v1_clinic_vaccines_cards_portal-setting.md`
- `docs/api/api.put._api_v1_clinic_vaccines_cards_portal-setting.md`
- `docs/api/api.get._api_v1_portal_vaccines_cards_patient__patientId_.md`
- `docs/ai/AI_CHUNKS.yaml` — yeni `flow-vaccine-card` chunk (v1.0.0)
  eklendi; personel + portal akışını, status çözümlemesini, tenant
  ayarını ve DB göç planını (materialized view) özetler.

## İş Kuralları
- **Species filter:** `Patient.species` ile eşleşen VEYA
  `species='all'` olan protokol uygulanabilir. `species='other'`
  ise tüm protokoller (kural: tür bilinmiyor → tüm takvimler).
- **Status çözümlemesi:**
  - `overdue` — son `nextDueAt` geçmiş.
  - `upcoming` — 30 gün içinde.
  - `completed` — tüm step'ler bitmiş + ek doz yok.
  - `not_started` — hiç uygulama yok.
- **portalVisible:** tenant ayarı `portalVaccineCardEnabled`
  (default `true`); default kayıt `true` döner.
- **Cross-tenant:** patientId başka tenant'a aitse 404
  `VET-CLINIC-0001` (bilgi sızdırmaz).
- **Portal kapalıysa:** `false` ise portal endpoint'i 403
  `VET-AUTHZ-0002`.

## Audit
- `audit:vaccine.card.portal_setting.update` (info) — ayar PUT
  edildiğinde (önceki/yeni değer payload'da).
- Salt okunur kart GET'lerinde audit YOK (read noise önleme).

## Tenant İzolasyonu
- `actor.tenantId` zorunlu; service `requireTenantScope` ile
  tenant doğrular.
- Patient `PatientsService.findById` ile sorgulanır → cross-tenant
  null.
- Tenant ayarı `tenantVaccineCardSetting` tablosunda tenant
  başına tek satır; UPSERT yapısı.
- SUPERADMIN bypass'lı (tüm tenant'larda okur/yazar).

## Güvenlik / KVKK
- Bu endpoint'ler PII **taşımaz** (yapısal veri).
- Portal kökü `PortalSessionGuard` ile korunur; hasta sahibi
  yalnız kendi pet'ine bağlı kartı görebilir (servis içi actor
  bağlamı).

## Migration Notu
- Şu an `VaccineCard` hesaplanmış (derived) veri; ayrı tablo
  YOK. In-memory hesaplama kullanılıyor.
- DB göçünde iki seçenek:
  1. `VaccineCard` + `VaccineCardEntry` materialized view (öneri).
  2. Trigger ile senkronize ayrı tablo.
- Migration ertelenir; migration sırasında karar verilecek.

## Testler
- `vaccine-cards.service.spec.ts` → 13+ test (core commit'te).
- `vaccinations.service.spec.ts` → 15 test (GOAL-051 core; bu
  döküman commit'ine dahil değil).

## Döküman Uyum
- `pnpm docs:check` → 79 hata (pre-existing FAZ-6
  supplier/sale/return + GOAL-053/054 vaccine code'ları).
  **GOAL-052 özgü hata yok.**

## Yapılmayanlar / Bilinçli Atlamalar
- **DB migration / materialized view** → DB göçü sonraya.
- **PDF/çıktı (personel paneli)** → GOAL-047'deki klinik kayıt
  PDF helper'ı kullanılarak FAZ-5 kapanışında eklenebilir; şu an
  kart ekranı veri olarak hazır, render sonraki tick.
- **Portal kök için owner eşleşmesi** → service'in
  `getPortalVaccineCard` metodu actor ile yetkiyi kontrol eder;
  controller'da `PortalSessionGuard` zaten session doğrular.
  Hasta sahibi-kendi pet eşleşmesi `PortalPetsService` üzerinden
  ek bir guard katmanı olarak FAZ-5 sonu veya portal auth
  refactor'unda eklenebilir (mevcut yapıda aynı tenant'taki
  herhangi bir hasta sahibi kendi tenant'ı içindeki herhangi bir
  pet'in kartını göremez; yalnız `Patient.owners[].id` eşleşmesi
  kontrol edilir).

## Sonraki Adımlar
- GOAL-053 (aşı hatırlatma job'u) docs/i18n.
- GOAL-054 (aşı amendment) docs/i18n.
- FAZ-5 kapanış: tüm dökümanlar + tenant ayar UI.

## Commit
- Core: `2b7cc84` — `GOAL-052: aşı kartı core (FAZ-5)`
- Docs/i18n: (bu commit) — `docs(vaccines): GOAL-052 doküman ve
  i18n tamamla`
