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
- **Faz 4 — Klinik muayene/aşı/reçete** ⏳ sırada
  - GOAL-040 ✅ Muayene başlatma ve yaşam döngüsü (tamamlandı — 2026-07-30)
  - GOAL-041 ✅ SOAP klinik kaydı (tamamlandı — 2026-07-30)
  - GOAL-042 ✅ Vital bulgular (tamamlandı — 2026-07-30)
  - GOAL-043 ✅ Teşhis ve problem listesi (tamamlandı — 2026-07-30)
  - GOAL-044 ✅ Tedavi planı ve klinik order (tamamlandı — 2026-07-30)
  - GOAL-045 ✅ Reçete oluşturma (tamamlandı — 2026-07-30)
  - GOAL-046 ✅ Kontrol randevusu oluşturma (tamamlandı — 2026-07-30)
  - GOAL-047 ⏳ Klinik kayıt PDF ve paylaşım
