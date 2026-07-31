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
