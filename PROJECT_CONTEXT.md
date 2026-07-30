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
- `docs/errors/ERROR_CATALOG.md` — hata kataloğu (kod → mesaj → çözüm).
- `docs/api/`, `docs/pages/`, `docs/user-education/`, `docs/ai/` —
  sayfa, API, eğitim ve AI kaynakları.

## Faz durumu

- **Faz 0 — Keşif, ürün kuralları ve proje iskeleti**
  - GOAL-000 ✅ repository, monorepo, kalite kapıları (tamamlandı)
  - GOAL-001 ✅ domain sözlüğü ve pilot klinik iş akışları (tamamlandı)
  - GOAL-002 ✅ rol/yetki matrisi (tamamlandı — 113 permission, 5 rol)
  - GOAL-003 ✅ çoklu dil + ülke adaptörü sözleşmesi (tamamlandı)
  - GOAL-004 ⏳ log, audit ve hata kodu standardı
  - GOAL-005 ⏳ dokümantasyon ve AI bilgi havuzu şeması
- **Faz 1 — Platform çekirdeği** ⏳ sırada
  - GOAL-010 tenant ve şube
  - GOAL-011 kimlik doğrulama ve oturum
  - GOAL-012 RBAC ve izin motoru
  - GOAL-013 feature flag
  - GOAL-014 dosya servisi
  - GOAL-015 bildirim
  - GOAL-016 superadmin tenant görünümü
