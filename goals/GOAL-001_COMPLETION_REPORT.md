# GOAL-001 Tamamlanma Raporu

## Goal

- **Goal no:** GOAL-001
- **Başlık:** Domain sözlüğü ve pilot klinik iş akışları
- **Faz:** FAZ-0 (devamı)
- **Durum:** ✅ Tamamlandı
- **Tarih:** 2026-07-30

## Yapılan işler

1. **`docs/domain/DOMAIN_GLOSSARY.md`** oluşturuldu. 18
   varlık/kavram (hasta sahibi, hayvan, kedi/köpek/kuş türleri,
   randevu, muayene, SOAP, aşı, reçete, ameliyat, anestezi, yatış,
   laboratuvar, görüntüleme, petshop, stok, satış, tahsilat, hasta
   sahibi portalı) için:
   - Tanım
   - İlişkiler (diğer kavramlarla)
   - Zorunlu alanlar
   - Opsiyonel alanlar
   - Yaşam döngüsü (durum makineleri)
   - Silme/düzeltme kuralları (append-only, amendment, ters kayıt)
   - Audit event'leri
2. **`docs/domain/CLINICAL_FLOWS.md`** oluşturuldu. 16 uçtan
   uca iş akışı (klinik + petshop + sistem) tanımlandı. Her akış
   için aktör, ön koşullar, adımlar, tenant bağlamı, yetki,
   audit event'leri, hata senaryoları, ilgili sayfa/API'ler yer
   alıyor.
3. **`docs/domain/PILOT_SCOPE.md`** oluşturuldu. Pilot klinik
   için MVP-1 kapsamı, MVP dışı bırakılan konular (en-GB, e-SMM,
   cihaz entegrasyonları, white-label, mobil, AI, vb.) ve
   kapsam güncelleme süreci tanımlandı.
4. **`docs/domain/README.md`** indeks oluşturuldu.
5. **`docs/workflows/OVERVIEW.md`** güncellendi: GOAL-001
   kapsamındaki üretimleri referans alır; Faz 1+ akışları için
   CLINICAL_FLOWS.md'ye yönlendirir.
6. **`docs/ai/AI_KNOWLEDGE_BASE.md`** güncellendi: domain
   sözlüğü ve iş akışlarını bilgi kaynağı olarak tanımlar; RAG
   chunk yapısı ve örnek eşleştirmeler eklendi.
7. **`docs/user-education/INDEX.md`** güncellendi: GOAL-001
   kapsamında üretilen içeriğin kullanıcı eğitiminin kavramsal
   temelini oluşturduğu ve Faz 2+ ile rehberlerin doldurulacağı
   not edildi.
8. **`docs/fields/FIELD_GLOSSARY.md`** güncellendi: domain
   sözlüğüne çapraz referans eklendi (alan vs varlık ayrımı).
9. **`PROJECT_CONTEXT.md`** güncellendi: doküman haritası ve
   faz durumu eklendi.

## Değişen dosyalar

- `docs/domain/DOMAIN_GLOSSARY.md` (yeni, ~24 KB)
- `docs/domain/CLINICAL_FLOWS.md` (yeni, ~23 KB)
- `docs/domain/PILOT_SCOPE.md` (yeni, ~7 KB)
- `docs/domain/README.md` (yeni)
- `docs/workflows/OVERVIEW.md` (güncellendi)
- `docs/ai/AI_KNOWLEDGE_BASE.md` (güncellendi)
- `docs/user-education/INDEX.md` (güncellendi)
- `docs/fields/FIELD_GLOSSARY.md` (güncellendi)
- `PROJECT_CONTEXT.md` (güncellendi)

## Veritabanı değişiklikleri

- **Yok.** Bu goal kod yazmayı kapsamaz. Migration, index ve RLS
  değişiklikleri sonraki goal'larda (GOAL-010+) yapılacak.

## API değişiklikleri

- **Yok.** Bu goal API uçlarını kapsamaz. CLINICAL_FLOWS.md'de
  her akış için planlanan API yolları listelendi; implementasyon
  ilgili Faz'lar'da yapılacak.

## UI değişiklikleri

- **Yok.** Bu goal UI değişikliklerini kapsamaz.

## Test sonucu

- **Unit:** N/A (kod yok)
- **Integration:** N/A
- **E2E:** N/A
- **Tenant isolation:** N/A
- **Yetki:** N/A
- **Başarısız/atlanmış test:** N/A

Doküman kalite kontrolü: içerik tarafımdan (orchestrator) tutarlılık,
tenant izolasyonu, append-only, audit ve silme/düzeltme kuralları
açısından gözden geçirildi.

## Log ve audit

- **Yok.** Bu goal log ve audit kodunu kapsamaz. Ancak
  DOMAIN_GLOSSARY.md'de her varlık için hangi olayların
  audit'e yansıyacağı listelendi (ör. `vaccination.created`,
  `patient.transferred`, `kvkk.erasure.completed`). Bu listeler
  GOAL-004 ve GOAL-010+ sırasında audit altyapısına rehberlik
  edecek.

## Dokümantasyon

- **Kullanıcı eğitimi:** `docs/user-education/INDEX.md` Faz 2+
  için plan notu eklendi. Rol bazlı rehberler
  (`OWNER.md`, `VETERINARIAN.md` vb.) sonraki goal'larda
  doldurulacak.
- **Sayfa kataloğu:** CLINICAL_FLOWS.md'de her akış için
  "İlgili sayfalar" bölümü var. Bu referanslar ilgili sayfalar
  implementasyonu sırasında `docs/pages/*.yaml` dosyalarına
  yansıyacak.
- **Alan sözlüğü:** `docs/fields/FIELD_GLOSSARY.md` güncellendi
  (alan vs varlık ayrımı netleştirildi, çapraz referans eklendi).
- **Hata kataloğu:** CLINICAL_FLOWS.md'de her akış için olası
  hata kodları listelendi (ör. `TR_VAC_0001`, `TR_PATIENT_0001`).
  Bu kodlar `docs/errors/ERROR_CATALOG.md`'ye Faz 1+ sırasında
  eklenecek. Şu an error catalog hâlâ Faz 0 iskeleti seviyesinde.
- **AI bilgi havuzu:** `docs/ai/AI_KNOWLEDGE_BASE.md` güncellendi;
  RAG chunk yapısı ve örnek eşleştirmeler eklendi. Faz 11'de
  bu chunk'lar embedding'lenecek.

## Bilinen riskler

1. **Doküman-tutarlılık riski:** 18 kavram + 16 akış büyük bir
   yüzey; sonraki goal'lar bu dokümanları referans alırken
   tutarsızlık olabilir. Çözüm: `pnpm docs:check` aracı Faz 1'de
   genişletilerek `docs/domain/` altındaki dosyalar için de
   link/cross-reference kontrolü eklenecek.

2. **Pilot kapsam kayması riski:** PILOT_SCOPE.md "MVP dışı"
   bırakılan konular listesi mevcut ihtiyaçlara göre
   şekillendi. Klinik pilot başladığında gerçek ihtiyaçlar
   bu listeyi zorlayabilir. Çözüm: Kapsam güncelleme süreci
   (PR + onay) bu dokümanda tanımlı.

3. **Hata kodu tutarsızlığı:** CLINICAL_FLOWS.md'de listelenen
   hata kodları (TR_OWNER_0001, TR_VAC_0001, vb.) henüz
   `docs/errors/ERROR_CATALOG.md`'de tanımlı değil. GOAL-004
   ile birlikte catalog doldurulacak ve bu kodlar resmi listeye
   alınacak. Kullanılan kodların tam listesi için CLINICAL_FLOWS.md
   ilgili bölümlerine bakılabilir.

## Teknik borç

- **Yok** (kod yazılmadı). Ancak bir sonraki goal'lar için
  öneriler:
  - `docs/errors/ERROR_CATALOG.md`'de GOAL-001 akışlarında
    listelenen hata kodları tanımlanmalı (GOAL-004 kapsamında).
  - `docs/permissions/PERMISSION_MATRIX.md`'de GOAL-001
    kapsamındaki tüm yeni varlıklar için permission anahtarları
    tanımlanmalı (ör. `clinic:vaccination:create`,
    `petshop:sale:create`, `clinic:record:amend`,
    `clinic:owner:erase`). Mevcut matriste sadece user/patient/
    vaccination placeholder'ları var; genişletilmeli.
  - `docs/pages/*.yaml` dosyaları CLINICAL_FLOWS.md'de
    referans verilen sayfalar için oluşturulmalı (Faz 2+).

## Sonraki goal için notlar

### GOAL-002 — Rol/yetki matrisi (Faz 0 devamı)

- `docs/permissions/PERMISSION_MATRIX.md` güncellenmeli:
  - 18 varlık × 5 temel aksiyon (read, create, update, archive,
    amend/erase) için permission anahtarları.
  - 5 rol (OWNER, VETERINARIAN, STAFF, SUPERADMIN,
    PET_OWNER_PORTAL) için matris.
  - Yeni varlıklar: `clinic:vaccination:create`,
    `clinic:prescription:create`, `clinic:surgery:create`,
    `clinic:hospitalization:admit`, `clinic:lab:order`,
    `clinic:imaging:order`, `clinic:record:amend`,
    `clinic:owner:erase`, `petshop:sale:create`,
    `petshop:stock:receive`, `clinic:stock:decrement` vb.
- Kullanıcı eğitimi için rol bazlı sorumluluk haritası çıkarılmalı.

### GOAL-003 — Çoklu dil ve ülke adaptörü sözleşmesi (Faz 0 devamı)

- `packages/i18n/src/locales/` zaten mevcut (tr-TR + en-GB).
- Yeni kavram anahtarları (`vaccination`, `surgery`,
  `hospitalization` vb.) çeviri sözlüklerine eklenmeli.
- Ülke adaptörü sözleşmesi: `apps/api/src/common/adaptors/`
  altında TR/UK adapter interface'leri tanımlanmalı.

### GOAL-004 — Log, audit ve hata kodu standardı (Faz 0 devamı)

- CLINICAL_FLOWS.md'de listelenen tüm hata kodları
  `ERROR_CATALOG.md`'ye taşınmalı.
- Her varlık için DOMAIN_GLOSSARY'de belirtilen audit event'leri
  (`vaccination.created`, `patient.transferred` vb.) implementasyon
  planına alınmalı.
- Merkezi log yapısı: `request_id` + `tenant_id` + `actor_id` +
  `action` + `entity_type` + `entity_id` + `before/after` +
  `correlation_id`.

### GOAL-005 — Dokümantasyon ve AI bilgi havuzu şeması (Faz 0 devamı)

- `docs/ai/AI_KNOWLEDGE_BASE.md`'de tanımlanan RAG chunk
  yapısı implementasyona alınmalı.
- DOMAIN_GLOSSARY.md ve CLINICAL_FLOWS.md chunk'lara
  bölünmeli, metadata eklenmeli.

### GOAL-010+ — Faz 1 platform çekirdeği

- DOMAIN_GLOSSARY.md'deki her varlık için Prisma modelleri ve
  RLS policy'leri yazılmalı.
- CLINICAL_FLOWS.md'deki her akış için service + controller
  + test yazılmalı.
- Append-only / amendment kuralları `prisma-extension-soft-delete`
  veya benzer yapılarla enforce edilmeli.

## Özet

GOAL-001 (FAZ-0) **kod yazmadan tamamlandı**. Üretilen 3 ana
doküman (DOMAIN_GLOSSARY, CLINICAL_FLOWS, PILOT_SCOPE) sonraki
tüm goal'lar için ortak sözleşme görevi görecek. 18 varlık ve
16 iş akışı pilot kapsamda net biçimde tanımlandı; tenant
izolasyonu, append-only kayıt kuralları, audit ve KVKK
gereksinimleri tutarlı biçimde dokümante edildi.

GOAL-001 başarıyla tamamlandı. Sıradaki goal (GOAL-002 — Rol/yetki
matrisi) bu dokümanları referans alarak ilerleyebilir.
