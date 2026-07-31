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
  - GOAL-062 ✅ Tedarikçi ve satın alma (tamamlandı — 2026-07-30, core: 770dec0, docs/i18n: bu commit). 12 endpoint (5 supplier + 7 PO); supplier 3 tür (clinic/petshop/general) + code unique; PO state machine (draft→approved→partial|received | cancelled); Decimal toplam; receive ile StockMovement (GOAL-063) 	ype='purchase' atomik bakiye + lot/SKT bağlama; iptal sonrası otomatik ters kayıt YOK (manuel reversal). Audit udit:supplier.* + udit:purchase_order.{create,update,approve,receive,cancel}. Supplier doc'ları başka pencerede yazılmıştı (5 dosya); bu commit'te PO doc'ları (7) + AI_CHUNKS eklendi.
  - GOAL-063 ✅ Stok hareketleri ve sayım (tamamlandı — 2026-07-30, core: 8d78c74, docs/i18n: bu commit). 5 endpoint (create/list/balances/get/reverse); 9 hareket türü (purchase/sale/clinical_use/vaccination/return/transfer/count_adjustment/waste/reversal); append-only ledger + atomik bakiye (saklanmaz, her sorguda hesaplanır); reversal idempotent (VET-STOCK-0010); service ürün için stok YOK (VET-STOCK-0008); arşivli ürün/lot engelli (VET-STOCK-0006/0009). Audit udit:stock_movement.{create,reverse}. PO receive + Petshop sale + Klinik tüketim bu ledger'a yazar.
  - GOAL-064 ✅ Petshop POS (tamamlandı — 2026-07-30, core: 9c754e7, docs/i18n: bu commit). 6 endpoint (POST/GET list/GET :id/PATCH/POST complete/POST cancel); state machine draft→completed|cancelled; line item (productId × quantity × unitPrice); complete ile atomik StockMovement (type='sale', direction='out'); cancel/completed'da reversal hareketi (stok iade); müşteri ownerId opsiyonel; Faz 7 payments entegrasyonu sonra. Audit udit:petshop_sale.{create,update,complete,cancel}. Tam iade GOAL-065 (petshop-sale-returns).
  - GOAL-065 ✅ Petshop satış iadesi (tamamlandı — 2026-07-30, core: 503aa14, docs/i18n: bu commit). 5 endpoint (POST/GET list/GET :id/POST complete/POST cancel); state draft→completed|cancelled; orijinal petshop_sale'a bağlı; miktar orijinal satılanı aşamaz (VET-RETURN-0008); complete ile StockMovement (type='return', direction='in'); refundMethod (cash/card/credit) Faz 7 PaymentReversal (GOAL-073) + customer-balances (GOAL-075) entegre. Audit udit:petshop_sale_return.{create,complete,cancel}.
  - GOAL-066 ✅ Klinik tüketimden otomatik stok düşümü (tamamlandı — 2026-07-30, core: de6b6df, docs/i18n: bu commit). 3 endpoint (POST/GET list/GET :id); 4 sourceType (examination/vaccine_application/surgery/hospitalization); atomik StockMovement (vaccine_application→vaccination, diğer→clinical_use; direction='out'); yetersiz stok 422 VET-STOCK-0007. Audit udit:clinical_usage.create. Faz 8 reaktif hook planı (otomatik tetikleme).
  - GOAL-067 ✅ Düşük stok ve SKT uyarıları (tamamlandı — 2026-07-30, core: d6765df + fix 690ba90, docs/i18n: bu commit). 6 endpoint (low-stock/expiring-lots/refresh/summary + 2 ack); düşük stok severity (warning: qty>0&<=reorder, critical: qty<=min veya <=0); SKT severity (warning: 8-30, critical: 1-7, expired: ≤0 gün); acknowledge idempotent (mevcut acknowledgedAt korunur); refresh idempotent. Audit udit:stock_alert.{refresh,low_stock.acknowledge,expiring_lot.acknowledge}. Faz 7+ dispatch + Faz 8 dashboard planı.
  - GOAL-070 ✅ Fiyat listeleri ve hizmet ücretleri (tamamlandı — 2026-07-30, core: 32ceb6c, docs/i18n: bu commit). 11 endpoint (6 list + 4 item + 1 product price resolve); 3 liste türü (standard/promotional/contract); aktif liste zincirleme (aynı type+currency deaktive); müşteri-özel fiyat (ownerId) + miktar kademeli (minQuantity); çözümleme sırası contract_owner → standard/promotional → product default. Audit udit:price_list.* + udit:price_list_item.*. KDV/GST ülke adaptörü Faz 7'de.
  - GOAL-071 ✅ Klinik satış taslağı (tamamlandı — 2026-07-30, core: 1e6bf50, docs/i18n: bu commit). 6 endpoint (POST/GET list/GET :id/PATCH/POST complete/POST cancel); state draft→completed|cancelled; 6 sourceType (examination/prescription/lab_test/imaging/surgery/order) + sourceId zorunlu; line item (productId × quantity × unitPrice + priceListItemId ref); complete ile Faz 7 Payment (GOAL-072, paymentMethod); cancel ile Faz 7 PaymentReversal (GOAL-073). Stok düşümü YOK (GOAL-066 ayrı akış). Audit udit:clinic_sale.{create,update,complete,cancel}. Tam iade Faz 7+ clinic-sale-returns.
  - GOAL-072 ✅ Tahsilat (tamamlandı — 2026-07-30, core: 564dff3, docs/i18n: bu commit). 4 ana endpoint (POST/GET list/GET :id/POST :id/reverse); 2 sourceType (clinic_sale/petshop_sale) + 4 method (cash/card/bank_transfer/other); kısmi tahsilat (toplam > sale → 422 VET-PAYMENT-0002); ters kayıt (PaymentReversal — GOAL-073 docs ayrı). Audit udit:payment.{create,reverse}. Kasa etkisi Faz 8 (GOAL-074).
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

## GOAL-092 laboratuvar sonuçları ⏳ partial
- Contract: packages/contracts/src/lab-result.ts (13 schema/type) + index export.
- Domain: pps/api/src/common/lab-results/lab-result.types.ts (LabResultRecord + toLabResult + toLabResultRevision).
- Repository: pps/api/src/modules/lab-results/lab-results.repository.ts (in-memory Map; revision counter; activeByOrder).
- Service: pps/api/src/modules/lab-results/lab-results.service.ts (createLabResult / updateLabResult / submitForReview / approveLabResult / amendLabResult).
  - Cross-module: LabOrdersService.getLabOrderDetail ile order guard + unit/referenceRange snapshot.
- Controller: lab-results.controller.ts — POST/GET/PATCH /api/v1/clinic/lab-orders/:orderId/result + /history, /submit, /approve, /amend.
- Module: LabResultsModule LabOrdersModule import eder, pp.module.ts içinde kablolu.
- Testler: lab-results.service.spec.ts 23/23 yeşil; full regression 1172/1172 api testleri (1149 → 1172, +23).
- Error kodları: VET-LABRES-0001 (not found 404), VET-LABRES-0002 (invalid state 409), VET-LABRES-0003 (already exists 409), VET-LABRES-0004 (order not processing/completed 422), VET-LABRES-0005 (cancelled order 422), VET-AUTHZ-0001 (cross-tenant 403).
- State machine: draft → pending_review → approved; approved → amended + yeni draft revision (her amendment revision++).
- Permissions: create/update/submit/approve clinic:lab:enter_result; read/history clinic:lab:read; amend clinic:lab:amend.
- Docs/i18n/RAG chunk/field glossary/cross-ref henüz eklenmedi (sonraki tick).

## GOAL-093 görüntüleme isteği ve raporu ⏳ partial
- Contract: packages/contracts/src/imaging-order.ts (12 schema/type) + index export.
- Domain: apps/api/src/common/imaging-orders/imaging-order.types.ts (ImagingOrderRecord + ImagingReportRecord + toImagingOrder + toImagingReport).
- Repository: apps/api/src/modules/imaging-orders/imaging-orders.repository.ts (in-memory Map; tenant-scoped; reportRevisions append-only).
- Service: apps/api/src/modules/imaging-orders/imaging-orders.service.ts (createImagingOrder / scheduleImagingOrder / performImagingOrder / reportImagingOrder / approveReport / amendReport / completeImagingOrder / cancelImagingOrder).
  - Dahili görüntüleme kataloğu (11 varsayılan test: XR-THX, XR-ABD, XR-EXT, US-ABD, US-CARD, CT-THX, CT-ABD, MRI-BRAIN, MRI-SPINE, ENDO-GI + 1 pasif); tenant-scoped genişletme sonraki tick'te `imaging-tests` modülüne taşınacak.
  - Katalog snapshot (code, name, modality, bodyPart, price) order üzerinde dondurulur.
  - Rapor: append-only revision listesi, onaylanmış rapor değiştirilemez, amend ile yeni revision oluşur. portalVisible flag'i ile portal görünürlüğü ayrıca kontrol edilir.
- Controller: imaging-orders.controller.ts — 11 endpoint (POST/GET list/GET :id + POST :id/schedule|perform|report|approve-report|amend-report|complete|cancel) Zod validation + PermissionsGuard ile.
- Module: ImagingOrdersModule app.module.ts içinde kablolu.
- Testler: imaging-orders.service.spec.ts 23/23 yeşil; full regression 1195/1195 api testleri (1172 → 1195, +23).
- State machine: ordered → scheduled → performed → reported/amended → completed; ordered|scheduled → cancelled.
- Error kodları: VET-IMG-0001 (not found 404), VET-IMG-0002 (invalid state transition 409), VET-IMG-0003 (katalog yok 422), VET-IMG-0004 (katalog pasif 422), VET-IMG-0006 (rapor onayı yanlış durum 409), VET-IMG-0007 (rapor yok 422), VET-IMG-0008 (zaten onaylı 409), VET-IMG-0009 (rapor düzeltme yanlış durum 409), VET-AUTHZ-0001 (cross-tenant 403).
- Permissions: create/schedule/complete/cancel clinic:imaging:order; read clinic:imaging:read; perform clinic:imaging:perform; report/amend/approve clinic:imaging:report|amend.
- 8 audit event: audit:imgorder.{create,schedule,perform,report,approve_report,amend_report,complete,cancel}.
- Cross-module: AuditService (global modül).
- Docs/i18n/RAG chunk/field glossary/cross-ref henüz eklenmedi (sonraki tick).

## GOAL-094 cihaz ve dış laboratuvar adapter altyapısı ⏳ partial
- Yeni modül: apps/api/src/modules/lab-adapters/ (controller, service, repository, module, spec, index).
- Yeni tipler: apps/api/src/common/lab-adapters/lab-adapter.types.ts (LabAdapter interface + LabAdapterExportRecord + LabAdapterImportRecord + toLabAdapterExport / toLabAdapterImport).
- Yeni contract: packages/contracts/src/lab-adapter.ts (20+ Zod şema/tip + index export).
- 2 mock adapter: MockLabDeviceAdapter (in_clinic_device) + MockExternalLabAdapter (external_lab). Her ikisi idempotencyKey ile duplicate order üretmez; simulateFailure=true ile rejected simülasyonu (test/ops).
- Endpointler (9 REST):
  - POST /api/v1/clinic/lab-orders/:labOrderId/adapter-exports (exportOrder)
  - GET /api/v1/clinic/lab-adapter-exports (listExports)
  - GET /api/v1/clinic/lab-adapter-exports/:id (getExport)
  - POST /api/v1/clinic/lab-adapter-exports/:id/retry (retryExport)
  - POST /api/v1/clinic/lab-adapter-exports/:id/cancel (cancelExport)
  - POST /api/v1/clinic/lab-orders/:labOrderId/adapter-imports (importResult)
  - GET /api/v1/clinic/lab-adapter-imports (listImports)
  - GET /api/v1/clinic/lab-adapter-imports/:id (getImport)
  - GET /api/v1/clinic/lab-adapters (listAdapters)
- İş kuralları: exportOrder idempotency (aynı key → mevcut kayıt döner HTTP idempotency); accepted sonrası aynı adapterType ile yeni export 409 VET-LABADAPTER-0006; retry yalnız failed/rejected (409 VET-LABADAPTER-0007); cancel accepted iptal edilemez (409 VET-LABADAPTER-0008); importResult rawPayload içinde readings + value varsa otomatik labResult mapping (status=applied + mappedResultId), aksi received veya rejected.
- Hata kodları: 10 yeni — VET-LABADAPTER-0001 (export not found 404) / -0002 (unknown adapter 422) / -0003 (lab order not found 404) / -0004 (cancelled order export 422) / -0005 (import not found 404) / -0006 (accepted exists 409) / -0007 (only failed/rejected retry 409) / -0008 (accepted cancel 409) / -0009 (cancelled order import 422) / VET-AUTHZ-0001 (cross-tenant 403 mevcut).
- 4 audit event: audit:lab_adapter_export.create / .retry / .cancel + audit:lab_adapter_import.create.
- Permissions: mevcut katalogdan — clinic:lab:order (export/retry/cancel), clinic:lab:read (list/get), clinic:lab:enter_result (import). Yeni permission eklenmedi.
- Cross-tenant IDOR → null/404. Cross-tenant create → 403 VET-AUTHZ-0001.
- Test: 29/29 yeni spec yeşil (1 placeholder skipped). Full api regression 1224/1224 yeşil, 9 skipped, 0 hata. tsc --noEmit temiz.
- Docs/i18n/RAG chunk/field glossary/cross-ref: sonraki tick'lere ertelendi.
- Sonraki: docs/RAG chunk/i18n key parity + DB migration (Prisma) + Faz 13+ gerçek provider entegrasyonu (Idexx/Heska/Reflab/...) + tenant-bazlı adapter konfigürasyonu + Faz 8 React UI + adapter auto-discovery (heartbeat/health check).

- **Faz 10 — Hata merkezi** ⏳ sırada
  - GOAL-100 ⏳ partial — core: merkezi backend hata yakalama.
    error-events modülü (4 endpoint: list/summary/
    byFingerprint/:id) + AllExceptionsFilter entegrasyonu (5xx
    + critical; 4xx kayıt dışı) + ErrorEvent sözleşmesi
    (request_id/tenant/branch/user/module/route/release/
    severity/fingerprint/sanitized context) + 37 modül enum
    (auth/clinic/lab/inventory/...) + fingerprint üretimi
    (errorCode + module + normalizeMessage) + duplicate
    gruplama (occurrenceCount) + SUPERADMIN yetkisi
    (`audit:log:read`) + moduleFromRoute helper (path →
    modül) + PII mask context'ten geçer + 4xx için stack null.
    32/32 yeni test + 1256/1256 api regresyon geçti.
    Cross-module: AllExceptionsFilter (5xx + critical hata
    olaylarını ErrorEventsService.recordError'a yönlendirir).
    Sonraki tick: docs/RAG chunk/i18n key parity + DB
    migration (Prisma) + atama/çözüm notları (GOAL-104) +
    güvenlik alarm kuralları (GOAL-105) + tenant bazlı hata
    filtresi iyileştirmesi + frontend hata yakalama
    (GOAL-101) entegrasyonu + severity=kayıt kuralı
    konfigürabləşdirməsi.
