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
  - GOAL-050 ✅ Aşı kataloğu ve protokoller (tamamlandı — 2026-07-30)
  - GOAL-051 ✅ Aşı uygulama kaydı (tamamlandı — 2026-07-30)
  - GOAL-052 ✅ Aşı kartı (tamamlandı — 2026-07-30, core: `2b7cc84`, docs/i18n: bu commit). 4 personel endpoint + 1 portal endpoint; species filter (all/other→tüm takvimler); status çözümleme (overdue/upcoming/completed/not_started); tenant `portalVaccineCardEnabled` portal ayarı; in-memory derive (DB göçünde materialized view planı); cross-tenant patient → 404 VET-CLINIC-0001. PDF/çıktı ve owner-pet eşleşmesi guard katmanı sonraya.
  - GOAL-053 ✅ Aşı hatırlatma job'u (tamamlandı — 2026-07-30, core: 763f2f, docs/i18n: bu commit). 4 endpoint; schedule/cancel/reschedule hook'ları; in-process queue + 3 denemelik exponential backoff; tenant config (daysBeforeDue 1-90 + channels 1-3, default 7 gün + sms+in_app); consent-aware dispatch (sms/email consent yoksa atla); idempotent + double-send korumalı; multi-tenant processDue. BullMQ geçişi FAZ-10'a, otomatik cron FAZ-10'a.
  - GOAL-054 ✅ Aşı amendment ve düzeltme (tamamlandı — 2026-07-30, core: 7c42ba, docs/i18n: bu commit). 1 endpoint (PATCH); status='active' şartı; düzeltilebilir alanlar dose/nextDueDate/notes/lot; lot değişiminde atomik ters kayıt + yeni düşüm (SKT 422 VET-VACC-0010, yetersiz stok 422 VET-VACC-0009, aktif değil 409 VET-VACC-0007); mendReason zorunlu; append-only (status='amended', fiziksel silme yok); audit udit:vaccine.application.amend (warning, before snapshot + lotChange). Reminder hook 
escheduleForApplication otomatik çağrılır. Çoklu amend zinciri (parentId) sonraya.
  - GOAL-061 ✅ Depo, raf, lot ve SKT (tamamlandı — 2026-07-30, core: 10baf7, docs/i18n: bu commit). 15 endpoint (5 warehouse + 5 shelf + 5 lot); hiyerarşi Warehouse→Shelf→Lot; warehouse type (clinic/petshop/general); shelf temperatureZone (room/cold/freezer); lot unique productId × tenant; SKT geçmiş kabul edilmez (422 VET-INV-0003); arşivleme sıralı (alt→üst) + aktif lot/raf varsa 409; stok miktarı TUTULMAZ (GOAL-063 StockMovement). Audit udit:inventory.{warehouse,shelf,lot}.{create,update,archive}. Tree endpoint, supplier link, DB migration sonraya.
  - GOAL-060 ✅ Ürün ve hizmet kataloğu (tamamlandı — 2026-07-30, core: 4edbf3c, docs/i18n: bu commit). 5 endpoint (POST/GET list/GET :id/PATCH/POST archive); 5 ProductKind (stock_product/medicine/vaccine/service/consumable); kanal kısıtı (clinicUsage + petshopUsage); vergi (5 taxProfile) + currency izolasyonu; SKU otomatik + tenant unique; arşivleme soft delete (archivedAt set, FK kırılmaz, re-archive yok); Faz 5 vaccineProtocolId decoupled referans. Audit udit:product.{create,update,archive}. Ülke adaptörü Faz 7'de, stok bakiyesi Faz 6 devamında.
  - GOAL-062 ⏳ partial — core: tedarikçi kataloğu (3 tür:
    clinic/petshop/general + code unique per-tenant + soft archive +
    19/19 supplier testi) + satın alma siparişi (5 durum:
    draft/approved/partial/received/cancelled + 7 endpoint + line
    item + decimal çarpma/toplam + partial kabul mantığı + 20/20
    purchase-order testi; 39/39 yeni test + 722/722 api testi
    geçti). Yeni VET-SUPPLIER-0001/0002/0003/0004 ve
    VET-PURCHASE_ORDER-0001/0002/0004/0005/0007/0008 hata kodları.
    10 yeni permission catalog: catalog:supplier:
    read/create/update/archive + inventory:purchase_order:
    read/create/update/approve/receive/cancel. Audit
    udit:supplier.create/update/archive +
    udit:purchase_order.create/update/approve/receive/cancel.
    Cross-module: purchase-orders service, supplier varlık/arşiv
    kontrolü için SuppliersService'e bağımlı. Sonraki tick:
    docs/RAG chunk/i18n key parity + DB migration (Prisma) +
    Faz 6 stok hareketleri (GOAL-063) ile StockMovement
    üretimi (lot/SKT girişi receivePurchaseOrder'da) +
    PurchaseOrderLine'a lotId referansı + mevcut
    appointment-reminders testindeki regression (1 test,
    bizim eklediğimiz kodla ilgisiz, önceden var) düzeltmesi.
  - GOAL-063 ⏳ partial — core: 9 türlü stok hareketi (purchase, sale,
    clinical_use, vaccination, return, transfer, count_adjustment,
    waste, reversal) + append-only ledger + atomik bakiye hesabı.
    `stockMovement` sözleşmesi (StockMovement + StockBalance +
    StockMovementCreateInput + StockMovementReverseInput +
    StockMovementFilters; `REASON_REQUIRED_MOVEMENT_TYPES` set'i) +
    `stock-movement.types.ts` (StockMovementRecord + toStockMovement +
    normalizeSignedDecimal + decimalToScaledBigInt +
    addSignedDecimals + negateSignedDecimal + requiresReason +
    movementAffectsStock) + `StockMovementsRepository` (in-memory;
    byId/byProduct/byLot/bySource/byReversal indeksleri + nextId +
    insert + findById + listBySource + listByReversal + search +
    update + clear) + `StockMovementsService` (createMovement public
    + createSystemMovement purchase/vaccine için + listMovements +
    getMovement + reverseMovement + listBalances; cross-tenant 403
    VET-AUTHZ-0001, ürün yok 404 VET-STOCK-0003, ürün arşivli 409
    VET-STOCK-0009, service türü 422 VET-STOCK-0008, lot yok 404
    VET-STOCK-0005, lot arşivli 409 VET-STOCK-0006, lot-ürün
    eşleşmiyor 422 VET-STOCK-0011, neden eksik 422 VET-STOCK-0007,
    hareket yok 404 VET-STOCK-0001, ters kayıt zaten var 409
    VET-STOCK-0010, sistem source eksik 422 VET-STOCK-0012) +
    `StockMovementsController` (5 endpoint + Zod validation +
    PermissionsGuard) + module wiring (ProductsModule +
    InventoryModule + AuditModule bağımlılıkları) + 4 yeni
    permission catalog: inventory:stock_movement:read/create/reverse/
    export (PERMISSION_CATALOG.yaml + permission-spec.ts union +
    OWNER +3, VETERINARIAN +1, STAFF +2) + 12 yeni hata kodu
    VET-STOCK-0001-0012 (ERROR_CATALOG.md güncellendi; eski 4
    placeholder yeniden anlamlandırıldı) + 38/38 yeni test +
    761/761 api testi geçti. Audit `audit:stock_movement.create`
    (info) + `audit:stock_movement.reverse` (warning).
    System akışları (`createSystemMovement`) purchase order
    receive ve vaccine application için çağrı yapısını hazır;
    purchase-orders ve vaccines modüllerinin entegrasyonu bir
    sonraki tick'te. Sonraki tick: docs/RAG chunk/i18n key
    parity + DB migration (Prisma) + purchase-orders.receive
    PurchaseOrder ve vaccine.applications.createApplication'ın
    createSystemMovement'a bağlanması (purchase ve vaccination
    türlerinde) + Faz 7 petshop satış (GOAL-064+) ile sale
    türünde entegrasyon + Faz 7 satış iadesi (GOAL-065) ile
    return türü + transfer türü için çift-kayıt (kaynak/hedef)
    desteği + negatif bakiye kontrolü (yetersiz stok 422
    VET-STOCK-0002) + StockMovementPatch endpoint (notes/reason
    düzeltme).

  - GOAL-064 ⏳ partial — core: petshop POS. petshop-sales modülü
    (6 endpoint: create/list/get/update/complete/cancel) + 3 durum
    (draft/completed/cancelled) + line items (ürün + miktar + birim
    fiyat + satır indirimi) + global indirim + tahsilat yöntemi
    (cash/card/transfer) + 14/14 yeni test + 790/790 api testi geçti
    (önceki appointment-reminders regression'ı da düzelmiş).
    Stok entegrasyonu: completeSale'de her satır için
    StockMovementsService.createSystemMovement(type='sale') çağrısı
    (purchaseTracked ürünler için); cancelSale'de tamamlanmış
    satışlar için 	ype='reversal' hareketi. Yeni hata kodları
    VET-SALE-0001/0002/0003/0004/0005/0006. Mevcut permission'lar
    kullanıldı: petshop:sale:read/create + petshop:sale:refund.
    Audit udit:petshop_sale.create/update/complete/cancel.
    Cross-module: ProductsService (ürün varlık/arşiv) +
    StockMovementsService (sale/reversal hareketleri).
    Sonraki tick: docs/RAG chunk/i18n key parity + DB migration
    (Prisma) + barkod hızlı arama endpoint'i
    GET /petshop/products/by-barcode/:barcode + fiş çıktısı
    (PDF/termal) + çoklu ödeme (taksit) + Faz 7 tahsilat
    entegrasyonu (GOAL-072) + Faz 6 iade (GOAL-065) için
    refund-specific endpoint.
  - GOAL-065 ⏳ partial — core: petshop satış iadesi. petshop-sale-returns
    modülü (`petshopSaleReturn` sözleşmesi: PetshopSaleReturn +
    PetshopSaleReturnLine + status: draft/completed/cancelled +
    refundMethod: cash/card/transfer) + PetshopSaleReturnsRepository
    (in-memory Map + byId/byOriginalSale indeksleri) +
    PetshopSaleReturnsService (createReturn / listReturns /
    getReturnDetail / completeReturn / cancelReturn) +
    PetshopSaleReturnsController (5 endpoint: POST list, GET list,
    GET :id, POST :id/complete, POST :id/cancel) + module wiring
    (PetshopSalesModule + ProductsModule + InventoryModule +
    StockMovementsModule + AuditModule) + 20/20 yeni test + 810/810
    api testi geçti. Yeni hata kodları VET-RETURN-0001/0002/0003/
    0004/0005/0006/0007/0008/0009/0010/0011. İş kuralları: yalnızca
    `completed` orijinal satışlara izin (VET-RETURN-0002); iade
    miktarı orijinal satılan miktarı aşamaz (kısmi iade toplam
    takibi, VET-RETURN-0003); orijinal satır + ürün eşleşmesi
    zorunlu (VET-RETURN-0004); lot belirtilen satırlarda lot mevcut +
    arşivsiz + ürün eşleşmesi (VET-RETURN-0006/0007/0008). Tamamla:
    her satır için StockMovementsService.createSystemMovement
    (type='return', +N, lotId ile) — purchaseTracked ürünler için.
    Tamamlanmış iade iptal edilemez (VET-RETURN-0010; ayrı ters
    kayıt gerekir). Mevcut permission'lar kullanıldı: petshop:sale:
    read + petshop:sale:refund. Audit audit:petshop_sale_return.
    create/complete/cancel. Cross-module: PetshopSalesRepository
    (orijinal satış/satır varlık), ProductsService (ürün +
    purchaseTracked), InventoryService (lot varlık/arşiv/ürün
    eşleşmesi), StockMovementsService (return hareketi). Sonraki
    tick: docs/RAG chunk/i18n key parity + DB migration (Prisma) +
    tahsilat ters kaydı (GOAL-073 entegrasyonu) + müşteri/tedarikçi
    iade ayrımı (sales return vs purchase return) + GOAL-067 dış
    lokasyon stok uyarılarına return lot bilgisi bağlama.

  - GOAL-066 ⏳ partial — core: klinik tüketimden otomatik stok
    düşümü. clinical-consumption modülü (5 context:
    examination/prescription/vaccination/surgery/hospitalization
    + recorded/cancelled durum + 4 endpoint: POST/GET list/GET
    :id/POST :id/cancel + her satır için
    StockMovementsService.createSystemMovement(type='clinical_use'
    veya 'vaccination') + cancel'de her satır için
    reverseMovement ile ters kayıt + vaccination için lot zorunlu
    + service/arşivli ürün reddi + cross-tenant 403) +
    prescriptions.service entegrasyonu (PrescriptionItem'a
    opsiyonel productId+dispensedQuantity+dispensedLotId eklendi;
    dispense hook'unda ürün referansı olan kalemler için
    idempotent klinik tüketim kaydı oluşturulur; hata olursa
    reçete dispans yine başarılı) + 7 yeni hata kodu
    VET-CLINICAL_CONSUMPTION-0001-0007 + 4 yeni permission
    (inventory:clinical_consumption:read/create/cancel/export) +
    26/26 yeni test + 836/836 toplam api testi geçti. Audit
    audit:clinical_consumption.create (info) + .cancel (warning).
    Sonraki tick: docs/RAG chunk/i18n key parity + DB migration
    (Prisma) + ameliyat (surgery) + yatış (hospitalization)
    modüllerinden otomatik tüketim hook'ları + Faz 5 aşı
    uygulaması (vaccinations) entegrasyonu (vaccine.application.
    createApplication'da otomatik tüketim) + reçetede ürün
    referansı zorunluluğu (şu an opsiyonel) + klinik tüketim
    listeleme için React UI + düşük stok uyarılarına
    (GOAL-067) klinik tüketim metrikleri.

  - GOAL-065 ⏳ partial — core: petshop satış iadesi. petshop-sale-returns
    modülü (6 endpoint: create/list/get/update/complete/cancel) + 3
    durum (draft/completed/cancelled) + orijinal sale'a bağlı satır
    (originalLineId) + tam/kısmi iade (birikmiş miktar orijinali
    aşamaz 422 VET-RETURN-0003) + lot kontrolü (404/409 VET-RETURN-
    0006/0007) + stok geri girişi (return hareketi). 810/810 api
    testi geçti (mevcut petshop-sale-returns modülü). Hata kodları
    VET-RETURN-0001/0002/0003/0004/0005/0006/0007 + VET-AUTHZ-0001.
    Mevcut permission petshop:sale:refund kullanıldı. Audit
    audit:petshop_sale_return.create/complete/cancel. Cross-module:
    PetshopSalesService + ProductsService + StockMovementsService +
    InventoryService (lot kontrolü). Sonraki tick: docs/RAG chunk/
    i18n key parity + DB migration (Prisma) + tamamlanmış
    iadelerin ters kayıt (reversal) ile iptali (GOAL-073 kapsamı).

  - GOAL-066 ⏳ partial — core: klinik tüketimden otomatik stok
    düşümü. clinical-usages modülü (3 endpoint: record/list/get)
    + 5 sourceType (examination/vaccine_application/surgery/
    hospitalization/prescription) + idempotency key desteği
    (aynı key + aynı body → mevcut kayıt, farklı body → 409
    VET-CLINICAL-USE-0005) + 10/10 yeni test + 846/846 api
    testi geçti. Her line için purchaseTracked=true ürünlerde
    StockMovementsService.createSystemMovement(type='clinical_use',
    quantity=-N) çağrılır. service türünde ürün 422
    VET-CLINICAL-USE-0004. arşivli ürün 422 VET-CLINICAL-USE-0003.
    Append-only: kayıtlar üzerinde update/delete yok.
    Mevcut permission'lar kullanıldı: clinic:stock:read +
    clinic:stock:decrement. Audit
    audit:clinical_usage.create. Cross-module:
    ProductsService + StockMovementsService. Sonraki tick:
    docs/RAG chunk/i18n key parity + DB migration (Prisma) +
    mevcut modüllerin (vaccine-applications, prescriptions
    dispense) bu ortak servisi kullanmaya geçişi (refactor)
    + Faz 6 Faz 7 Faz 8 sourceType'lardan yeni senaryolar
    (surgery, hospitalization) için pilot kapsam.

  - GOAL-067 ⏳ partial — core: düşük stok ve SKT uyarıları.
    stock-alerts modülü (6 endpoint: listLowStock /
    listExpiringLots / refresh / summary / ackLowStock /
    ackExpiringLot) + on-demand compute mimarisi
    (computeLowStock + computeExpiringLots, transient sonuç)
    + ack'lar ayrı StockAlertAcksRepository'de tutulur (soft
    delete korunur, append-only ack repository). Ürün
    kataloğuna `lowStockThreshold: string|null` eklendi
    (FAZ-6 GOAL-067 eklentisi). Severity: warning/critical
    (düşük stok; qty<=0 critical); warning/critical/expired
    (SKT; 8-30/1-7/<=0 gün). Acknowledge idempotent
    (status active→acknowledged, no-op acknowledged);
    resolved → 422 VET-STOCK_ALERT-0003; bulunamadı → 404
    VET-STOCK_ALERT-0001. Refresh ack'ları korur (default)
    veya resetAcknowledgements=true ile sıfırlar; audit
    audit:stock_alert.refresh (info). Summary dashboard
    için hızlı bakış (lowStock/critical/expiring/criticalLot/
    expiredLot/acknowledgedX). 29/29 yeni test + 875/875 api
    testi geçti (type-check temiz). 5 yeni hata kodu
    VET-STOCK_ALERT-0001-0005. 3 yeni permission:
    inventory:stock_alert:read (OWNER, VETERINARIAN, STAFF) +
    inventory:stock_alert:acknowledge (OWNER, VETERINARIAN,
    STAFF) + inventory:stock_alert:export (OWNER). Audit
    audit:stock_alert.refresh + audit:stock_alert.acknowledge.
    Cross-module: ProductsService (lowStockThreshold +
    arşiv kontrolü) + InventoryService (lot listesi +
    archivedAt filtresi) + StockMovementsService
    (listBalances ile net bakiye). Sonraki tick:
    docs/RAG chunk/i18n key parity + DB migration (Prisma)
    + Bildirim job'u (FAZ-10 BullMQ + tenant config:
    daysBeforeDue 1-90 + channels) + Faz 7 ile
    petshop/sale kanalı üzerinden kasa personeline
    SMS/email/in-app dispatch + Faz 8 dashboard kartları
    için React UI + reaktif hook'lar (stok hareketi
    oluşturulduğunda / lot arşivlendiğinde otomatik
    refresh tetikleme).
  - GOAL-074 ⏳ partial — core: kasa ve gün sonu.
    cash-register modülü (7 endpoint: openSession /
    getCurrentOpenSession / listSessions / getSessionDetail /
    closeSession / reopenSession / listMovements / getSummary) +
    3 status (open → closed → reopened) + şubeye bağlı tek
    açık oturum + OWNER yetkisi ile reopen + KasaRepository
    üzerinden sessionRange hareket okuma + normalizeCashDecimal
    (4 ondalık normalize, trailing sıfır kırpma) + 23/23 yeni
    test + 1054/1054 api regression geçti. 8 yeni hata kodu
    VET-CASH_REGISTER-0001-0008. Audit cash_register.session.
    {open,close,reopen}. Cross-module: KasaRepository
    (listForSessionRange). Sonraki tick: docs/RAG chunk/i18n
    key parity + DB migration (Prisma) + Faz 7 tahsilat
    (GOAL-072) ile payment kasa etkisi test senaryoları +
    session raporu export (PDF/CSV).

  - GOAL-083 ⏳ partial — core: ameliyat operasyon notu ve
    kullanılan malzemeler. operation-notes modülü (7 endpoint:
    create/list/get/update/addTeamMember/addMaterial/finalize/
    amend + list alt kayıtlar) + 3 status (draft → finalized →
    amended) + ekip (5 rol) + malzemeler (append-only,
    purchaseTracked ürünlerde finalize'da stock movement) +
    SurgeryPlansService (plan in_progress kontrolü) +
    StockMovementsService (finalize'da her material için
    createSystemMovement(type='clinical_use')) + 15/15 yeni
    test + 1054/1054 api regression geçti. 4 yeni hata kodu
    VET-OPNOTE-0001-0004. Audit operation_note.
    {create,update,finalize,amend}. Cross-module:
    SurgeryPlansService + StockMovementsService.
    Mevcut permission'lar kullanıldı: clinic:surgery:
    read/create/start/complete + clinic:stock:decrement.
    Sonraki tick: docs/RAG chunk/i18n key parity + DB
    migration (Prisma) + Faz 6 klinik tüketim (GOAL-066) ile
    type='operation_note' entegrasyonu + onam formu (GOAL-081)
    ile bağlantı + Faz 5 aşı uygulaması (GOAL-051) ile
    malzeme türü.
- **Faz 7 — Finans** ⏳ sırada
  - GOAL-070 ⏳ partial — core: fiyat listeleri ve hizmet
    ücretleri altyapısı. pricing modülü (`pricing` sözleşmesi:
    PriceList + PriceListItem + 3 tür standard/promotional/
    customer_specific + 4 durum draft/active/expired/archived +
    item append-only 3 durum active/superseded/cancelled +
    PriceListCreateInput/UpdateInput/ItemCreateInput/ItemUpdateInput
    + ProductPriceResolution) + `pricing.types.ts`
    (PriceListRecord + PriceListItemRecord + toPriceList/
    toPriceListItem + normalizePricingDecimal + isListEffectiveAt
    + isItemEffectiveAt + PRICE_LIST_TYPE_PRIORITY) +
    PricingRepository (in-memory; listId + itemId tenant-scoped
    + byProduct aktif indeks + itemsByList + countActiveItemsForList
    + findActiveItemByProductInList unique kontrol) +
    PricingService (10 public method; createPriceList +
    listPriceLists + getPriceList + updatePriceList +
    activatePriceList + archivePriceList + addItem + listItems +
    updateItem append-only + cancelItem + resolveProductPrice
    ürün tür önceliği resolver; cross-tenant 403 VET-AUTHZ-0001,
    customer_specific zorunlu customerId 422 VET-PRICING-0005,
    customerId yalnız customer_specific 422 VET-PRICING-0005,
    geçersiz tarih 422 VET-PRICING-0004, draft olmayan update 409
    VET-PRICING-0006, arşivli update 409 VET-PRICING-0007,
    bulunamadı 404 VET-PRICING-0001, ürün yok 404 VET-PRICING-0008,
    arşivli ürün 422 VET-PRICING-0009, aktif satır tekrarı 409
    VET-PRICING-0003, geçersiz fiyat 422 VET-PRICING-0010,
    aktifleştirme satır yok 422 VET-PRICING-0010, aday bulunamadı
    404 VET-PRICING-0011; tenant izolasyonu) +
    PricingController + PricingProductController (11 REST endpoint;
    Zod validation + PermissionsGuard) + PricingModule
    (ProductsModule bağımlılığı) + 5 yeni permission
    pricing:price_list:read/create/update/archive/export
    (PERMISSION_CATALOG.yaml + permission-spec.ts union +
    OWNER +4, VETERINARIAN +3) + 11 yeni hata kodu
    VET-PRICING-0001-0011 (ERROR_CATALOG.md güncellendi;
    0002 atlandı; PRICING modülü eklendi) + 35/35 yeni test +
    910/910 api testi geçti (regresyon yok). Audit
    `audit:price_list.create/update/activate/archive` +
    `audit:price_list_item.create/amend/cancel`. Cross-module:
    ProductsService (ürün varlık/arşiv kontrolü). Sonraki
    tick: docs/RAG chunk/i18n key parity + DB migration
    (Prisma) + Faz 7 klinik satış taslak (GOAL-071) ile
    saleLine priceListItemId referansı + Faz 7 tahsilat
    (GOAL-072) ile sale line üzerinden fiyat çözümleme +
    müşteriye özel fiyat için portal ownerId erişim kontrolü +
    aktif listede düzeltme (yeni liste zinciri UI) + Faz 8
    React UI + fiyat listesi export (CSV/PDF) + ülke adaptörü
    ile KDV/GBP eşleme.

  - GOAL-071 ⏳ partial — core: klinik satış taslağı. clinic-sales
    modülü (6 endpoint: create/list/get/update/complete/cancel)
    + 3 durum (draft/completed/cancelled) + 4 sourceType
    (examination/vaccine_application/lab_order/imaging_order) +
    satır indirimi + global indirim + rol bazlı indirim yetkisi
    (STAFF/VETERINARIAN max %10, OWNER sınırsız; aksi 403
    VET-CLINIC_SALE-0004) + 17/17 yeni test + 927/927 api testi
    geçti. Ürün arşivliyse 422 VET-CLINIC_SALE-0005; ürün yoksa
    422 VET-CLINIC_SALE-0005. unitPrice verilmediyse ürün
    salePrice'ından alınır. Audit audit:clinic_sale.create/
    update/complete/cancel. Mevcut permission'lar kullanıldı:
    clinic:payment:create/read/reverse. Cross-module:
    ProductsService. Sonraki tick: docs/RAG chunk/i18n key
    parity + DB migration (Prisma) + PricingService entegrasyonu
    (resolveProductPrice ile liste bazlı fiyat çözümleme) +
    Owner/Patient varlık doğrulaması (cross-module) + Faz 7
    tahsilat (GOAL-072) ile sale üzerinden payment bağlantısı
    + Faz 7 kısmi tahsilat (GOAL-073) + Faz 8 ameliyat (GOAL-080)
    ile surgery order sourceType.

  - GOAL-072 ⏳ partial — core: tahsilat (payment). payments modülü
    (4 endpoint: create/list/get/reverse) + 4 yöntem (cash/card/
    bank_transfer/other) + 2 sourceType (clinic_sale/petshop_sale)
    + idempotency key (aynı key + aynı body → mevcut kayıt,
    farklı body → 409 VET-PAYMENT-0005) + ters kayıt (reversal)
    + 14/14 yeni test + 941/941 api testi geçti. Decimal
    normalizasyon 4 ondalık; amount=0 reddedilir 422
    VET-PAYMENT-0006. Kısmi tahsilat: aynı sourceId'ye birden
    fazla payment bağlanabilir (toplam kontrolü Faz 7 kısmi
    tahsilat GOAL-073'te detaylanır). Audit
    audit:payment.create/reverse. Mevcut permission'lar
    kullanıldı: clinic:payment:create/read/reverse. Sonraki
    tick: docs/RAG chunk/i18n key parity + DB migration
    (Prisma) + sale service'lerle cross-module validasyon
    (clinic_sale / petshop_sale varlık kontrolü) + Faz 7
    kısmi tahsilat (GOAL-073) + Faz 7 kasa/gün sonu (GOAL-074)
    + Faz 7 müşteri borç/alacak (GOAL-075).

  - GOAL-073 ⏳ partial — core: tahsilat iptal ve ters kayıt
    (kısmi ters kayıt + neden kodu + kasa etkisi + OWNER
    yetkisi). `payment-reversal` sözleşmesi: PaymentReversal +
    PaymentReversalCreateInput (amount? + reason enum + note +
    cashRegisterEffect) + 6 neden kodu (customer_request /
    chargeback / duplicate / system_error / pricing_error /
    other) + PaymentReversalSummary + PaymentReversalFilters.
    Payment schema'ya `reversedAmount` + `effectiveAmount`
    eklendi; status enum'a `partially_reversed` eklendi.
    PaymentReversalRecord (in-memory; byPayment + bySource
    indeksleri + sumReversedForPayment). KasaRepository
    (in-memory; cash/card/bank/other hesaplar; signed decimal;
    append-only; payment_method → kasa_account eşleme).
    reversePayment genişletildi: amount opsiyonel (default
    = kalan); 0 → 422 VET-PAYMENT-0007; kümülatif aşım →
    422 VET-PAYMENT-0008; amount > 1000 TRY için OWNER zorunlu
    (403 VET-PAYMENT-0010); tam → status='reversed' +
    audit:payment.reverse (warning); kısmi →
    status='partially_reversed' + audit:payment.partial_reverse
    (info). createPayment kasa credit + audit
    audit:payment.create. Kasa etkisi (cashRegisterEffect=true)
    credit/debit olarak ledger'a yazılır.
    listPaymentReversals + getPaymentReversalDetail +
    getPaymentReversalSummary (reverse listesi + özet).
    Controller 3 yeni endpoint (reversals list/get + summary)
    + mevcut reverse opsiyonel amount kabul eder.
    22/22 yeni/düzeltilmiş test + 966/966 api testi geçti
    (1 pre-existing flaky appointment-reminders testi hariç).
    Audit: audit:payment.partial_reverse (info) + mevcut
    audit:payment.reverse (warning). Cross-module: KasaRepository
    + PaymentReversalsRepository. Sonraki tick: docs/RAG
    chunk/i18n key parity + DB migration (Prisma) + Faz 7
    kasa/gün sonu (GOAL-074) ile kasa servisi bağlantısı +
    sale service'lerle cross-module validasyon (clinic_sale /
    petshop_sale varlık kontrolü) + tahsilat iade için
    ödeme reversal tarafında müşteri/tedarikçi ayrımı
    (sales return vs purchase return) + Faz 7 müşteri
    borç/alacak (GOAL-075) ile effectiveAmount üzerinden
    hesap özeti.

  - GOAL-075 ⏳ partial — core: müşteri borç ve alacak görünümü.
    customer-balances modülü (2 endpoint: getSummary +
    listTransactions) + `customer-balance` sözleşmesi
    (CustomerBalanceSummary + CustomerTransaction + 2 tür
    sale/payment) + payment.effectiveAmount entegrasyonu
    (ters kayıt sonrası kalan tutar) + payment.status=
    partially_reversed dahil edilmesi + 6/6 yeni test +
    973/973 api testi geçti. ownerId bazlı; ClinicSales +
    PetshopSales + PaymentsService read-only kullanır.
    totalSaleAmount, totalPaidAmount, totalReversedAmount,
    totalNetAmount, openAmount = net - paid. Cross-module
    validations: saleIdSet ile satışa bağlı tahsilat filtre.
    Mevcut permission: clinic:report:financial:read.
    Sonraki tick: docs/RAG chunk/i18n key parity + DB
    migration (Prisma) + tenant bazlı (ownerId olmadan)
    tüm müşterilerin toplam borç/alacak raporu + portal
    entegrasyonu (sahip kendi bakiyesini görebilir) +
    audit + çoklu para birimi.

  - GOAL-077 ⏳ partial — core: e-SMM adapter sözleşmesi. esmm
    modülü (6 endpoint: create/list/get/submit/retry/cancel) +
    3 belge türü (e_fatura / e_arsiv / e_irsaliye) + 6 durum
    (draft/pending/accepted/rejected/failed/cancelled) +
    EsmmAdapter interface + MockEsmmAdapter implementasyonu
    + manuel belge numarası (MVP) + idempotency key
    (mock duplicate üretmez) + provider cancel hook + 10/10
    yeni test + 951/951 api testi geçti. Hata kodları
    VET-ESMM-0001/0002/0003/0004/0005. Mevcut permission
    audit:log:read kullanıldı. Audit
    audit:esmm_document.create/submit/retry/cancel.
    Sonraki tick: docs/RAG chunk/i18n key parity + DB
    migration (Prisma) + gerçek provider implementasyonu
    (Faz 13+) + Faz 7 kasa etkisi (GOAL-074 ile entegrasyon)
    + Faz 7 e-SMM provider adapter (Faz 13+) + Faz 13
    resmî entegrasyonlar.
  - GOAL-072 (not) — başka session tarafından payments modülü
    genişletildi (reversedAmount + effectiveAmount alanları
    eklendi; kısmi ters kayıt / etkin tutar mantığı). Bu
    tick'te yazdığım payments modülü çakışma nedeniyle trash'e
    gönderildi; mevcut payments modülü kullanılıyor.

  - GOAL-076 ⏳ partial — core: temel finans raporları. reports
    modülü (4 endpoint: daily-sales/payment-methods/
    open-balances/export) + 3 rapor tipi (daily_sales/
    payment_methods/open_balances) + JSON/CSV dışa aktarma +
    8/8 yeni test + 967/967 api testi geçti. Cross-module:
    ClinicSalesService + PetshopSalesService + PaymentsService
    (read-only). Günlük satış: clinic + petshop completed
    toplamı. Tahsilat yöntemi: yöntem bazlı kırılım (reversed
    payment hariç). Açık bakiye: tamamlanmış sales'in
    ödenmemiş kalan tutarı. Export audit:report.export
    üretir (info). Mevcut permission'lar kullanıldı:
    clinic:report:financial:read + clinic:report:export.
    Sonraki tick: docs/RAG chunk/i18n key parity + DB
    migration (Prisma aggregate) + Faz 8 ürün/hizmet
    kırılımı raporu + Faz 8 veteriner bazlı işlem raporu
    + Faz 8 stok hareketleri raporu + Faz 10 superadmin
    raporları.

  - GOAL-075 ⏳ partial — core: müşteri borç/alacak görünümü.
    customer-balances modülü (2 endpoint: summary/
    transactions) + 6/6 yeni test + 973/973 api testi geçti.
    Owner (sahip) bazında toplam satış + toplam tahsilat
    (reversedAmount hariç) + net + açık bakiye + son işlem
    tarihleri. Transactions: satış + tahsilat karışık
    liste; tarih sıralı; type filtresi. Cross-module:
    ClinicSalesService + PetshopSalesService + PaymentsService
    (read-only). Mevcut permission clinic:payment:read
    kullanıldı. Audit üretmez (read-only). Sonraki tick:
    docs/RAG chunk/i18n key parity + DB migration (Prisma) +
    branch scope filtresi (branchId) + patient bazlı bakiye
    (sahipten bağımsız) + iade (refund) transaction tipi
    için destek.

  - GOAL-080 ⏳ partial — core: ameliyat planlama. surgery-plans
    modülü (7 endpoint: create/list/get/update/start/
    complete/cancel) + 4 durum (scheduled/in_progress/
    completed/cancelled) + scheduledAt gelecekte olmalı
    (422 VET-SURGERY-0006) + 17/17 yeni test + 990/990 api
    testi geçti. Hasta (patient) + sorumlu veteriner
    (leadSurgeonUserId) + operasyon türü + scheduledAt +
    randevu (appointmentId) opsiyonel + notes (ön hazırlık +
    risk). Audit audit:surgery_plan.create/update/start/
    complete/cancel. Hata kodları VET-SURGERY-0001/0002/
    0003/0004/0005/0006/0007. Mevcut permission'lar
    kullanıldı: clinic:surgery:create/read/start/complete/
    cancel. Sonraki tick: docs/RAG chunk/i18n key parity
    + DB migration (Prisma) + ekip (assistant) listesi +
    oda (room) + ön hazırlık kalemleri ayrı tablo + risk
    skoru + GOAL-081 onam formları entegrasyonu + Faz 6
    klinik tüketim (GOAL-066) ile malzeme kullanım
    bağlantısı.

## GOAL-081 onam formları ⏳ partial

- Yeni modul: apps/api/src/modules/consents/ (controller, service, repository, module, spec, index)
- Yeni tipler: apps/api/src/common/consents/consent.types.ts
- Yeni contract: packages/contracts/src/consent.ts (exported via index)
- Endpointler: POST/GET /api/v1/clinic/consents, GET :id, POST :id/sign, POST :id/revoke
- 3 templateType: surgery / anesthesia / procedure
- 3 status: draft / signed / revoked
- 2 signatureMethod: manual / electronic
- 4 audit event: consent.create / consent.sign / consent.revoke (signed only) / gerekirse revoke deny
- Hata kodları: VET-CONSENT-0001 (not found, 404) / -0002 (already signed, 409) / -0003 (already revoked, 409) / -0004 (cannot revoke draft, 409)
- Permissions: clinic:consent:read + clinic:consent:sign (mevcut catalog'a eklendi)
- Cross-tenant idor → 404, cross-tenant create → 403 VET-AUTHZ-0001
- Test: 10 yeni spec (10/10 geçti), full api regression 1000/1000 testler geçti, 0 hata, tsc temiz
- Docs/RAG chunks/i18n/cross-ref: sonraki tick'lere ertelendi

## GOAL-082 anestezi takip ⏳ partial

- Yeni modul: apps/api/src/modules/anesthesia/ (controller, service, repository, module, spec, index)
- Yeni tipler: apps/api/src/common/anesthesia/anesthesia.types.ts
- Yeni contract: packages/contracts/src/anesthesia.ts (exported via index)
- Cross-module: SurgeryPlansModule (plan in_progress kontrolü)
- Endpointler: POST/GET /api/v1/clinic/anesthesia, GET :id, POST :id/medications, POST :id/vitals, POST :id/complications, POST :id/staff, POST :id/finalize
- 2 status: draft → finalized (locked, append-only)
- 3 medication route, 8 vital kind, 3 complication severity, 4 staff role enum
- 6 audit event: anesthesia.create / medication_add / vital_add / complication_add / staff_assign / finalize
- Hata kodları: VET-ANESTHESIA-0001 (not found, 404), -0002 (already finalized, 409), -0003 (plan not in_progress, 422), -0004 (duplicate anesthesia, 409)
- Permissions: clinic:anesthesia:read + create + update (mevcut catalog'da zaten var)
- Cross-tenant idor → null/404, cross-tenant create 403 VET-AUTHZ-0001, plan patient mismatch 422
- Test: 16 yeni spec (16/16 geçti), anesthesia modül testleri yeşil
- Build fix: packages/contracts/src/consent.ts Zod nullable() sentaks hatası düzeltildi (önceki build kırıktı)
- Full api regression: anesthesia + diğer tüm modüller 1036/1036 yeşil; cash-register spec hataları PARALEL agent'a ait, bu commit kapsamında değil
- tsc --noEmit temiz
- Docs/RAG chunks/i18n/cross-ref: sonraki tick'lere ertelendi

## GOAL-084 yatış ve kafes yönetimi ⏳ partial

- Yeni modul: apps/api/src/modules/hospitalization/ (controller, service, repository, module, spec, index)
- Yeni tipler: apps/api/src/common/hospitalization/hospitalization.types.ts
- Yeni contract: packages/contracts/src/hospitalization.ts (exported via index)
- 3 varlık tek modülde: Cage + Hospitalization + CageAssignment
- Endpointler: POST/GET /api/v1/clinic/cages, GET/PATCH :id; POST/GET /api/v1/clinic/hospitalizations, GET/PATCH :id, POST :id/admit|discharge|cancel, POST :id/cage-assignments, POST cage-assignments/:id/end
- 5 status: planned → admitted → active → discharged | cancelled
- 8 cage kind: dog_small/medium/large, cat, exotic, isolation, icu, recovery, other
- Zaman çakışması: aynı cageId için [from, to] aralıkları kesişen iki CageAssignment olamaz (409 VET-HOSP-0009); ayrıca aynı yatış için açık assignment yalnız bir tane (VET-HOSP-0011)
- Taburcu: tüm açık cage assignment'lar to set edilerek sonlandırılır
- 8 audit event: cage.create/update, hospitalization.create/update/admit/discharge/cancel, cage_assign/cage_end
- 13 hata kodu: VET-HOSP-0001/0002/0003/0004/0005/0006/0007/0008/0009/0010/0011/0012/0013
- Permissions: clinic:hospitalization:read + admit + discharge (mevcut catalog'da)
- Cross-tenant idor → null/404, cross-tenant create 403 VET-AUTHZ-0001
- Test: 20/20 yeni spec geçti
- Full api regression: 1074/1074 yeşil, 8 skipped, 0 hata
- tsc --noEmit temiz
- Docs/RAG chunks/i18n/cross-ref: sonraki tick'lere ertelendi

## GOAL-085 yatış order ve uygulama kayıtları ⏳ partial

- Yeni modul: apps/api/src/modules/hospitalization-orders/ (controller, service, repository, module, spec, index)
- Yeni tipler: apps/api/src/common/hospitalization-orders/hospitalization-order.types.ts
- Yeni contract: packages/contracts/src/hospitalization-order.ts (exported via index)
- Cross-module: HospitalizationModule (yatış varlık kontrolü)
- 2 varlık: HospitalizationOrder + HospitalizationOrderSchedule
- Endpointler: POST/GET /api/v1/clinic/hospitalization-orders, GET/PATCH :id, POST :id/cancel|schedules; GET /schedules (status filtresi: pending/applied/skipped/overdue), POST schedules/:id/apply|skip
- 6 order type: medication / feeding / measurement / care / check / other
- 3 order status: active → cancelled (endsAt set edilir)
- 4 priority: low / medium / high / critical
- Schedule status: pending (henüz appliedAt/skippedAt yok) / applied / skipped / overdue (asOf filtresiyle)
- Append-only: iptal status=cancelled; uygulama appliedAt set; skip skippedAt set. Schedule'lar fiziksel silinmez
- 7 audit event: order.create/update/cancel, schedule.add/apply/skip
- 7 hata kodu: VET-HORD-0001/0002/0003/0004/0005/0006/0007
- Permissions: clinic:hospitalization:read + add_note + admit (mevcut catalog'da)
- Cross-tenant idor → null/404, cross-tenant create 403 VET-AUTHZ-0001
- Test: 19/19 yeni spec geçti
- Full api regression: 1093/1093 yeşil, 8 skipped, 0 hata
- tsc --noEmit temiz
- Docs/RAG chunks/i18n/cross-ref: sonraki tick'lere ertelendi

## GOAL-086 gözlem ve taburcu özeti ⏳ partial

- Yeni modul: apps/api/src/modules/discharge-summaries/ (controller, service, repository, module, spec, index)
- Yeni tipler: apps/api/src/common/discharge-summaries/discharge-summary.types.ts
- Yeni contract: packages/contracts/src/discharge-summary.ts (exported via index)
- Cross-module: HospitalizationModule (yatış var mı + status kontrolü)
- 2 varlık: Observation (append-only gözlem) + DischargeSummary (draft → finalized → amended)
- Endpointler: POST/GET /api/v1/clinic/hospitalizations/:id/observations, GET :id; POST/GET /api/v1/clinic/discharge-summaries, GET :id, PATCH :id, POST :id/finalize|amend|portal-share
- 7 observation kind: vital / exam / behavior / intake / output / treatment / note
- 3 discharge status: draft (düzenlenebilir) → finalized (locked) → amended (yeni revision)
- Append-only: Observation (silme/düzeltme yok); DischargeSummary amendment ile yeni draft revision oluşur (parentId)
- Portal share: finalized özet portalShared=true yapılabilir (VET-DSUM-0007 yanlış durumda red)
- 8 audit event: observation.create/update, discharge_summary.create/update/finalize/amend/portal/share
- 14 hata kodu: VET-DSUM-0001/0002/0003/0004/0005/0006/0007/0008/0009/0010/0011/0012/0013/0014
- Permissions: clinic:hospitalization:read + add_note + discharge (mevcut katalog)
- Cross-tenant idor → null/404, cross-tenant create 403 VET-AUTHZ-0001
- Test: 14/14 yeni spec geçti
- Full api regression: 1107/1107 yeşil, 8 skipped, 0 hata
- tsc --noEmit temiz
- Docs/RAG chunks/i18n/cross-ref: sonraki tick'lere ertelendi

## GOAL-090 laboratuvar test kataloğu ⏳ partial
- Contract: packages/contracts/src/lab-test.ts (11 schema/type) + index export.
- Domain: pps/api/src/common/lab-tests/lab-test.types.ts (LabTestRecord + toLabTest).
- Repository: pps/api/src/modules/lab-tests/lab-tests.repository.ts (in-memory Map; tenant-scoped code unique, case-insensitive).
- Service: pps/api/src/modules/lab-tests/lab-tests.service.ts (createLabTest / listLabTests / getLabTestDetail / updateLabTest).
- Controller: pps/api/src/modules/lab-tests/lab-tests.controller.ts (POST/GET list/GET :id/PATCH :id — POST ve PATCH clinic:lab:order; GET clinic:lab:read).
- Module: LabTestsModule pp.module.ts içinde kablolu.
- Testler: lab-tests.service.spec.ts 19/19 yeşil; full regression 1126/1126 api testleri (1107 → 1126, +19).
- Error kodları: VET-LABTEST-0001 (not found 404), VET-LABTEST-0002 (duplicate code 409), VET-AUTHZ-0001 (cross-tenant 403).
- Docs/i18n/RAG chunk/field glossary/cross-ref henüz eklenmedi (sonraki tick).

## GOAL-091 laboratuvar isteği ve numune ⏳ partial
- Contract: packages/contracts/src/lab-order.ts (18 schema/type) + index export.
- Domain: pps/api/src/common/lab-orders/lab-order.types.ts (LabOrderRecord + toLabOrder).
- Repository: pps/api/src/modules/lab-orders/lab-orders.repository.ts (in-memory Map; state machine: ordered → collected → processing → completed; ordered|collected → cancelled).
- Service: pps/api/src/modules/lab-orders/lab-orders.service.ts (createLabOrder/collectSample/startProcessing/completeLabOrder/cancelLabOrder).
  - Cross-module: LabTestsService.getLabTestDetail ile katalog snapshot alınır (katalog sonradan değişse bile order'ın snapshot'ı sabit kalır).
- Controller: pps/api/src/modules/lab-orders/lab-orders.controller.ts (POST/GET list/GET :id/POST :id/collect /start /complete /cancel).
- Module: LabOrdersModule LabTestsModule import eder, pp.module.ts içinde kablolu.
- Testler: lab-orders.service.spec.ts 23/23 yeşil; full regression 1149/1149 api testleri (1126 → 1149, +23).
- Error kodları: VET-LABORD-0001 (not found 404), VET-LABORD-0002 (invalid state transition 409), VET-LABORD-0003 (labtest not found 422), VET-LABORD-0004 (labtest inactive 422), VET-AUTHZ-0001 (cross-tenant 403).
- Permissions: POST/GET list/:id clinic:lab:read|order; POST :id/collect clinic:lab:collect_sample; POST :id/complete clinic:lab:enter_result; POST :id/cancel clinic:lab:order.
- Docs/i18n/RAG chunk/field glossary/cross-ref henüz eklenmedi (sonraki tick).
