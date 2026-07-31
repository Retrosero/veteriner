# Proje Bağlamı

## Ürün vizyonu

Veteriner klinikleri ve petshop işletmeleri için modüler, çok kiracılı ve çok dilli bir SaaS platformu geliştirilecektir. İlk hedef Türkiye'deki küçük ve orta ölçekli veteriner klinikleridir. İkinci büyüme alanı İngiltere pazarıdır.

Sistem iki ürün ailesini ortak çekirdek üzerinde çalıştırır:

### Veteriner Klinik Yönetimi

- Hasta sahibi ve hayvan kayıtları
- Randevu ve klinik akış
- Muayene, SOAP notları, teşhis ve tedavi
- Reçete ve aşı
- Ameliyat, anestezi ve yatış
- Laboratuvar ve görüntüleme
- Klinik stok ve ilaç takibi
- Satış, tahsilat ve finans
- Hasta sahibi portalı

### Petshop Yönetimi

- Barkodlu satış
- Ürün, stok, lot ve son kullanma tarihi
- Tedarikçi ve satın alma
- Kampanya ve müşteri sadakati
- Müşteri/hayvan bazlı alışveriş geçmişi
- Klinik ve petshop stoklarının kontrollü biçimde birlikte çalışması

## İlk sürüm hedefi

Pilot klinikte günlük işlerin gerçek kullanımda yönetilebildiği, kararlı ve denetlenebilir bir sistem:

- 1 şube
- 2 işletme sahibi
- 2 çalışan
- Kedi, köpek ve kuş
- Muayene, aşı, ameliyat, yatış, laboratuvar, görüntüleme
- Petshop satışı
- Hasta sahibi portalı
- e-SMM entegrasyonu daha sonraki faz
- White-label yok

## Ürün ilkeleri

- Kullanım kolaylığı, özellik sayısından daha önemlidir.
- Klinik personeli aynı işlem için gereksiz ekranlar arasında dolaştırılmamalıdır.
- Tenant verisi hiçbir koşulda başka tenant tarafından görülemez.
- Tıbbi ve finansal kayıtların geçmişi silinmez; değişiklikler versiyonlanır.
- Hatalar kullanıcı bildirmeden Superadmin panelinde görünür olmalıdır.
- Her sayfanın kullanım açıklaması AI bilgi havuzuna eklenmelidir.
- Çoklu dil, sonradan eklenen bir özellik değil sistem çekirdeğidir.
- Türkiye ve İngiltere kuralları ülke adaptörleriyle ayrılmalıdır.

## Doküman haritası

- `docs/domain/DOMAIN_GLOSSARY.md` — **varlık/kavram** sözlüğü (18
  kavram; tanım + ilişkiler + alanlar + yaşam döngüsü + silme/düzeltme).
  Sonraki tüm goal'ların ortak ürün sözleşmesi.
- `docs/domain/CLINICAL_FLOWS.md` — **uçtan uca iş akışları** (16
  akış; randevu, muayene, aşı, reçete, ameliyat, yatış, lab,
  görüntüleme, transfer, petshop, stok, tahsilat, KVKK, amendment).
- `docs/domain/PILOT_SCOPE.md` — pilot kapsamı, MVP dışı bırakılan
  konular, karar kriterleri.
- `docs/fields/FIELD_GLOSSARY.md` — alan düzeyinde sözlük (alan adı,
  tip, kısıt).
- `docs/workflows/OVERVIEW.md` — üst düzey akış kataloğu (fazlara
  göre).
- `docs/permissions/PERMISSION_CATALOG.yaml` — **makinece
  okunabilir** yetki kataloğu (113 permission, CI doğrulamalı).
- `docs/permissions/PERMISSION_MATRIX.md` — **insan okunabilir**
  yetki matrisi (modül bazlı tablolar).
- `docs/permissions/ROLE_DESCRIPTIONS.md` — 5 rol için detaylı
  sorumluluk açıklamaları.
- `docs/i18n/I18N_CONTRACT.md` — **çoklu dil sözleşmesi**
  (locale, çeviri anahtarı, formatlama, yükleme stratejisi).
- `docs/i18n/COUNTRY_ADAPTER_CONTRACT.md` — **ülke adaptörü
  sözleşmesi** (TR tam, GB iskelet).
- `docs/errors/ERROR_CODE_STANDARD.md` — **hata kodu standardı**
  (`VET-<MODULE>-<NNN>` formatı, 35+ modül, 4 severity, HTTP eşlemesi).
- `docs/errors/ERROR_CATALOG.md` — hata kataloğu (kod → mesaj → çözüm,
  VET- formatında).
- `docs/errors/AUDIT_LOG_STANDARD.md` — audit log sözleşmesi
  (append-only, 7 yıl retention, PII mask'li).
- `docs/errors/LOG_STANDARD.md` — sistem/job/entegrasyon/güvenlik
  log türleri, JSON format, log seviyeleri.
- `docs/errors/CORRELATION_ID.md` — request ID standardı
  (`req-<uuidv4>`, AsyncLocalStorage).
- `docs/errors/PII_MASKING.md` — PII maskeleme kuralları
  (KVKK / UK GDPR uyumlu).
- `docs/errors/AUDIT_EVENTS.yaml` — makinece okunabilir audit event
  kataloğu (clinical / petshop / finance / identity / system / security).
- `docs/ai/CHUNK_SCHEMA.md` — AI RAG chunk şeması (12 chunk türü,
  metadata, versiyonlama, PII etiketi).
- `docs/ai/AI_CHUNKS.yaml` — RAG chunk kataloğu (initial seed,
  glossary + flow + error + page + permission + audit + log + pii +
  correlation chunk'ları).
- `docs/pages/PAGE_SCHEMA.md` — sayfa kataloğu şeması.
- `docs/api/API_SCHEMA.md` — API endpoint kataloğu şeması.
- `docs/fields/FIELD_SCHEMA.md` — alan sözlüğü şeması.
- `docs/api/`, `docs/pages/`, `docs/user-education/`, `docs/ai/` —
  sayfa, API, eğitim ve AI kaynakları.

## Faz durumu

- **Faz 0 — Keşif, ürün kuralları ve proje iskeleti**
  - GOAL-000 ✅ repository, monorepo, kalite kapıları (tamamlandı)
  - GOAL-001 ✅ domain sözlüğü ve pilot klinik iş akışları (tamamlandı)
  - GOAL-002 ✅ rol/yetki matrisi (tamamlandı — 113 permission, 5 rol)
  - GOAL-003 ✅ çoklu dil + ülke adaptörü sözleşmesi (tamamlandı)
  - GOAL-004 ✅ audit + log + hata kodu standardı (tamamlandı —
    VET- formatı, audit/log/PII/correlation iskeleti, 121 i18n error
    anahtarı tr/en parity, 52 unit test geçti)
  - GOAL-005 ✅ dokümantasyon ve AI bilgi havuzu şeması
    (tamamlandı — chunk/page/api/field şemaları, AI_CHUNKS.yaml
    seed, RAG retrieval + AI help endpoint iskeleti,
    docs-check VET- + AI chunks validator, 18 unit test geçti)
- **Faz 1 — Platform çekirdeği** ✅ tamamlandı
  - GOAL-010 ✅ tenant ve şube (tamamlandı — 2026-07-30)
  - GOAL-011 ✅ kimlik doğrulama ve oturum (tamamlandı — 2026-07-30)
  - GOAL-012 ✅ RBAC ve izin motoru (tamamlandı — 2026-07-30)
  - GOAL-013 ✅ Modül ve paket feature flag altyapısı (tamamlandı — 2026-07-30)
  - GOAL-014 ✅ Dosya ve medya servisi (tamamlandı — 2026-07-30)
  - GOAL-015 ✅ Bildirim altyapısı temeli (tamamlandı — 2026-07-30)
  - GOAL-016 ✅ Superadmin tenant görünümü (tamamlandı — 2026-07-30)
- **Faz 2 — Klinik domain** ✅ tamamlandı
  - GOAL-020 ✅ Hasta sahibi kayıt ve arama (tamamlandı — 2026-07-30)
  - GOAL-021 ✅ Hayvan kayıt sistemi (tamamlandı — 2026-07-30)
  - GOAL-022 ✅ Sahiplik geçmişi (tamamlandı — 2026-07-30)
  - GOAL-023 ✅ Alerji, kronik durum, klinik uyarılar (tamamlandı — 2026-07-30)
  - GOAL-024 ✅ Hayvan zaman çizelgesi (tamamlandı — 2026-07-30)
  - GOAL-025 ✅ Portal erişim daveti (tamamlandı — 2026-07-30)
- **Faz 3 — Randevu + portal** ✅ tamamlandı
  - GOAL-030 ✅ Klinik takvimi (tamamlandı — 2026-07-30)
  - GOAL-031 ✅ Randevu oluşturma ve yönetim (tamamlandı — 2026-07-30)
  - GOAL-032 ✅ Bekleme listesi ve resepsiyon akışı (tamamlandı — 2026-07-30)
  - GOAL-033 ⏳ partial — core: davet üzerinden kayıt + email doğrulama +
    PortalSessionGuard; register/login/logout/forgot/reset brute-force
    ile. 24/24 portal-auth testi + 385/385 api testi geçti. Sonraki
    tick: docs/RAG chunk/i18n key parity + telefon doğrulama stub +
    DB migration.
  - GOAL-034 ✅ Portal hayvan listesi ve detayı (tamamlandı — 2026-07-30)
  - GOAL-035 ✅ Online randevu talebi (tamamlandı — 2026-07-30)
  - GOAL-036 ✅ Randevu hatırlatma sistemi (tamamlandı — 2026-07-30)
- **Faz 4 — Klinik muayene/aşı/reçete** ✅ tamamlandı
  - GOAL-040 ✅ Muayene başlatma ve yaşam döngüsü (tamamlandı — 2026-07-30)
  - GOAL-041 ✅ SOAP klinik kaydı (tamamlandı — 2026-07-30)
  - GOAL-042 ✅ Vital bulgular (tamamlandı — 2026-07-30)
  - GOAL-043 ✅ Teşhis ve problem listesi (tamamlandı — 2026-07-30)
  - GOAL-044 ✅ Tedavi planı ve klinik order (tamamlandı — 2026-07-30)
  - GOAL-045 ✅ Reçete oluşturma (tamamlandı — 2026-07-30)
  - GOAL-046 ✅ Kontrol randevusu oluşturma (tamamlandı — 2026-07-30)
  - GOAL-047 ✅ Klinik kayıt PDF ve paylaşım (tamamlandı — 2026-07-30)
- **Faz 5 — Aşı + stok** ⏳ sırada
  - GOAL-050 ⏳ partial — core: aşı kataloğu + tür/kategori/yaş/adım +
    `isCore`/`totalDurationMonths` türetme + soft archive +
    tenant izolasyonu + 18/18 vaccines testi + 544/544 api testi
    geçti. Bu tick'te eklendi: `defaultDose` (protokol düzeyinde ml/dose/
    mg/drop) + her step için `boosterIntervalDays` ve step-bazlı `dose`
    override. Sonraki tick: docs/RAG chunk/i18n key parity + Faz 6 stok
    modülü ile `stockProductId` referansı.
  - GOAL-051 ⏳ partial — core: aşı uygulama kaydı + atomik stok
    düşümü + in-memory stock ledger. `vaccineApplication`
    sözleşmesi (create/amend/cancel/list/byPatient + SKT/stok/tür
    validasyonu) + `VaccineStockLedger` (decrement + reverse) +
    service (cross-tenant 404, arşivli protokol 409, tür
    uyumsuz 422, SKT geçmiş 422, yetersiz stok 422, amend +
    cancel stok ters kayıt) + controller (POST/GET/PATCH/DELETE)
    + 24/24 yeni test + 568/568 api testi geçti. Hata kodları
    VET-VACC-0002/0003/0004/0005/0006/0007/0008. Audit
    `audit:vaccine.application.create/amend/cancel`. Sonraki
    tick: docs/RAG chunk/i18n key parity + DB migration
    (Prisma) + Faz 6 stok modülü ile `stockProductId` referansı
    gerçek tabloya bağlanacak.
  - GOAL-052 ⏳ partial — core: aşı kartı. `vaccineCard` sözleşmesi
    (VaccineCard + VaccineCardEntry + entry status:
    completed/upcoming/overdue/not_started + tenant portal
    ayarı) + `vaccine-card.types.ts` (buildCardEntry +
    resolveEntryStatus + resolveEntryNextDueDate + UTC date
    yardımcıları) + `VaccineCardsRepository` (tenant portal
    ayarı in-memory) + `VaccineCardsService` (getVaccineCard +
    getPortalVaccineCard + getPortalSetting +
    updatePortalSetting) + 2 controller (VaccineCardsController
    personel + PortalVaccineCardsController portal) +
    module wiring + 26/26 yeni test + 594/594 api testi geçti.
    Personel endpoint: `GET /api/v1/clinic/vaccines/cards/patient/:patientId`
    + `GET/PUT /api/v1/clinic/vaccines/cards/portal-setting`.
    Portal endpoint: `GET /api/v1/portal/vaccines/cards/patient/:patientId`
    (tenant ayarı kapalıysa 403 VET-AUTHZ-0002). Audit
    `audit:vaccine.card.portal_setting.update`. Sonraki tick:
    docs/RAG chunk/i18n key parity + PDF/çıktı + DB migration.
  - GOAL-053 ⏳ partial — core: aşı hatırlatma job'u. `vaccineReminder`
    sözleşmesi (VaccineReminder + VaccineReminderListQuery +
    VaccineReminderConfigInput + `vaccine_reminder` notification
    category) + `vaccine-reminder.types.ts` (VaccineReminderRecord +
    VaccineReminderConfig + DEFAULT_VACCINE_REMINDER_CONFIG +
    computeScheduledFor + pickStepForApplication + buildVaccineReminderDedupeKey
    yardımcıları) + `VaccineRemindersRepository` (in-memory; dedupe
    + tenant config) + `VaccineRemindersService`
    (scheduleForApplication + cancelForApplication +
    cancelForPatient + rescheduleForApplication +
    processDueReminders + listForPatient + getTenantConfig +
    updateTenantConfig) + `VaccineRemindersController` (list +
    config get/update + processDue endpoint'leri) + vaccines
    module wiring (Notifications + Consent + Patient + Owner +
    Tenant bağımlılıkları) + 30/30 yeni test + 624/624 api testi
    geçti. Personel endpoint'ler:
    `GET /api/v1/clinic/vaccines/reminders/patient/:patientId` +
    `GET/PUT /api/v1/clinic/vaccines/reminders/config` +
    `POST /api/v1/clinic/vaccines/reminders/process`. Default
    config 7 gün önce + sms + in_app; marketing consent yoksa
    sms atlanır, in_app'e düşer. Snapshot deseni (application +
    step) ile circular import koruması. Audit
    `audit:vaccine.reminder.schedule/cancel/cancel_patient/
    reschedule/config.update/process_due`. Hata kodları
    VET-AUTHZ-0001 (cross-tenant), VET-VALIDATION-0010 (config
    invalid). Sonraki tick: docs/RAG chunk/i18n key parity +
    DB migration (Prisma) + Faz 6 stok modülü ile `stockProductId`
    gerçek referans + zaman-locale timezone adapter (tenant
    timezone).
  - GOAL-054 ⏳ partial — core: aşı amendment ve düzeltme. Eski
    kayıt korunur (status='amended' + `amendedAt`/`amendedBy`/
    `amendedReason`); düzeltilebilir alanlar `dose`,
    `nextDueDate`, `notes`, `lot`. `lot` değişirse atomik
    stok ters+yeni hareket (yeni lot önce SKT + yeterlilik
    kontrolü, başarılıysa eski lot'a `reverse` + yeni lot'tan
    `decrement`). Yeni lot SKT geçmişse 422 VET-VACC-0010;
    yetersiz stok 422 VET-VACC-0009; eski lot değişmez
    (atomiklik korunur). Aynı lot tekrar gönderilirse yalnızca
    alanlar güncellenir, stok hareketi oluşmaz. Audit
    `audit:vaccine.application.amend` (warning) — `lotChange`
    varsa before/after hareket ID'leri ile birlikte loglanır.
    `vaccineApplicationAmendInputSchema`'ya `lot` opsiyonel
    alanı + `vaccineApplicationSchema`'ya `amendedReason` eklendi.
    `VaccineApplicationPatch` + `VaccineApplicationRecord`
    `lot`/`amendedReason` alanları. `VaccineApplicationsRepository`
    `isSameLot()` yardımcısı. Controller amend description
    güncellendi (GOAL-054 lot değişimi davranışını kapsıyor).
    5/5 yeni test + 629/629 api testi geçti. Sonraki tick:
    docs/RAG chunk/i18n key parity + DB migration (Prisma) +
    Faz 6 stok modülü ile `stockProductId` gerçek referans +
    amendment zinciri (parentId) için çoklu amend.
  - GOAL-061 ⏳ partial — core: depo, raf ve lot tanımları.
    `inventory` sözleşmesi (Warehouse + Shelf + StockLot +
    3 tür: clinic/petshop/general + raf temperatureZone:
    room/cold/freezer + lot SKT/tedarik/raf atama +
    10 yeni VET-INV-* hata kodu: 0001-0010) +
    `inventory.types.ts` (WarehouseRecord + ShelfRecord +
    StockLotRecord + toWarehouse/toShelf/toStockLot +
    normalizeLotQuantity + isExpired) +
    InventoryRepository (in-memory; warehouse code unique +
    shelf code per-warehouse unique + lot number per-product
    unique + byProduct/byShelf/byWarehouse indeksleri +
    countActiveShelvesForWarehouse + countActiveLotsForShelf) +
    InventoryService (3 varlık × 5 mutasyon = 15 public method;
    cross-tenant 403 VET-AUTHZ-0001, archive chain
    VET-INV-0007/0008/0010, code unique VET-INV-0004/0005,
    lot unique VET-INV-0006, SKT geçmiş 422 VET-INV-0009;
    manufactureAt ≤ expiryDate refine; tenant izolasyonu) +
    InventoryController (15 REST endpoint: POST/GET/PATCH
    + POST :id/archive × 3 varlık; Zod validation +
    PermissionsGuard) + InventoryModule (AppModule
    entegrasyonu) + 12 yeni permission catalog:
    inventory:warehouse:read/create/update/archive,
    inventory:shelf:read/create/update/archive,
    inventory:lot:read/create/update/archive
    (PERMISSION_CATALOG.yaml + permission-spec.ts union +
    OWNER +9, VETERINARIAN +3, STAFF +9) + 28/28 yeni test +
    684/684 api testi geçti. Audit
    `audit:inventory.warehouse.create/update/archive`,
    `audit:inventory.shelf.create/update/archive`,
    `audit:inventory.lot.create/update/archive`. Sonraki
    tick: docs/RAG chunk/i18n key parity + DB migration
    (Prisma) + Faz 6 stok hareketleri (GOAL-063+) ile
    `stockProductId` gerçek referans + Faz 5 vaccine
    protokol lot + Faz 7 satın alma ile `supplierName`
    bağlantısı + lokasyon ağacı için tree endpoint.

- **Faz 6 — Klinik + petshop ortak stok/petshop** ⏳ sırada
  - GOAL-060 ⏳ partial — core: ürün ve hizmet kataloğu. product
    s�zle�mesi (ProductKind: stock_product/medicine/vaccine/service/
    consumable + ProductUnit � 11 + ProductTaxProfile + ProductCurrency
    + SKU/barkod unique per-tenant + auto-SKU prd-{kindChar}{6} +
    vaccine t�r�nde accineProtocolId Faz 5 referans� + medicine
    t�r�nde 
equiresPrescription/controlledDrug UK ila�
    reg�lasyonu i�in) + products.types.ts (ProductRecord +
    toProduct + normalizeDecimalString + generateSku) +
    ProductsRepository (in-memory Map + bySku + byBarcode
    index + nextSkuCounter) + ProductsService (createProduct
    SKU/barkod unique + auto-SKU + audit info + Decimal
    normalizasyon + 422 VET-VALIDATION-0010 invalid price;
    listProducts kind/kinds/clinic/petshop/search/category/active
    filtreleri; getProduct cross-tenant null; updateProduct k�smi
    + ar�ivli kay�t 409 VET-PRODUCT-0004 + SKU/barkod de�i�imi
    unique kontrol� + null=barkod temizle + audit info;
    archiveProduct soft delete + active=false + zaten ar�ivli
    409 VET-PRODUCT-0003 + audit warning) + ProductsController
    (5 endpoint + Zod validation + PermissionsGuard) + module
    wiring (AppModule entegrasyonu) + 5 yeni permission
    catalog:product:read/create/update/archive/export
    (PERMISSION_CATALOG.yaml + permission-spec.ts union +
    OWNER +5, VETERINARIAN +1, STAFF +4) + 26/26 yeni test +
    655/655 api testi ge�ti. Hata kodlar�: VET-PRODUCT-0001
    (bulunamad�), VET-PRODUCT-0002 (SKU/barkod duplicate),
    VET-PRODUCT-0003 (zaten ar�ivli), VET-PRODUCT-0004
    (ar�ivli g�ncellenemez), VET-VALIDATION-0010 (invalid
    price), VET-AUTHZ-0001 (cross-tenant). Audit
    udit:product.create/update/archive. Sonraki tick:
    docs/RAG chunk/i18n key parity + DB migration (Prisma) +
    Faz 6 stok mod�l� ile ger�ek stockProductId referans�
    + Faz 5 vaccine protokol� tam entegrasyonu.
