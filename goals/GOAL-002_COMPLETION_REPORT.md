# GOAL-002 Tamamlanma Raporu

## Goal

- **Goal no:** GOAL-002
- **Başlık:** Rol ve yetki matrisi
- **Faz:** FAZ-0 (devamı)
- **Durum:** ✅ Tamamlandı
- **Tarih:** 2026-07-30

## Yapılan işler

1. **`docs/permissions/PERMISSION_CATALOG.yaml`** oluşturuldu.
   **Makinece okunabilir** yetki kataloğu, 113 permission, 5 rol,
   28 modül. Her permission için:
   - `permission` (anahtar, format `<domain>:<resource>:<action>`)
   - `description` (Türkçe açıklama)
   - `resource_type`, `action`
   - `tenant_scope` (required, not_required, not_applicable)
   - `branch_scope` (required, optional, not_applicable)
   - `self_only` (true/false)
   - `audit`, `pii`, `amend`, `system_only` flag'leri
   - `applies_to_roles` (hangi roller kullanabilir)
   - `notes` (varsa açıklayıcı notlar)
   - `summary` bölümünde toplam istatistikler.

2. **`docs/permissions/PERMISSION_MATRIX.md`** oluşturuldu.
   **İnsan okunabilir** modül bazlı tablolar. 13 modül için
   ayrı tablo (Common, Tenant, Branch, User, Clinic:Owner,
   Clinic:Patient, Appointment, Examination+SOAP, Vaccination,
   Prescription, Surgery+Anesthesia, Hospitalization, Lab+Imaging,
   Clinic Stock, Petshop Config/Product/Stock/Sale, Payment+Cash,
   Report, Audit+File, Portal). Her tablo 5 rol için
   ✓/—/✓(kendi) işaretleri.

3. **`docs/permissions/ROLE_DESCRIPTIONS.md`** oluşturuldu.
   5 temel rol için detaylı sorumluluk açıklamaları:
   - `SUPERADMIN` — platform yönetimi (onboarding, fatura)
   - `OWNER` — işletme sahibi (kullanıcı + finans + tüm veri)
   - `VETERINARIAN` — klinik tıbbi (muayene, aşı, reçete, ameliyat)
   - `STAFF` — resepsiyon + petshop (tıbbi değil)
   - `PET_OWNER_PORTAL` — salt okunur kendi hayvanları
     Her rol için: sorumluluklar, kapsam dışı, tipik senaryolar,
     dikkat noktaları. Sonunda karşılaştırma tablosu.

4. **`docs/permissions/README.md`** oluşturuldu. Üç ana
   dokümanın indeksi, format açıklaması, ekleme kuralı (CI
   kapısı için).

5. **`PROJECT_CONTEXT.md`** güncellendi: doküman haritası
   genişletildi (3 yeni permission dosyası eklendi), Faz 0
   durumu güncellendi (GOAL-002 ✅).

6. **`docs/ai/AI_KNOWLEDGE_BASE.md`** güncellendi: permission
   dokümanları bilgi kaynağı olarak eklendi ("bu işlemi kim
   yapabilir?" sorularının kaynağı).

7. **`docs/user-education/INDEX.md`** güncellendi: GOAL-002
   kapsamında üretilen yetki içeriğinin kullanıcı eğitiminin
   yetki temelini oluşturduğu not edildi.

## Değişen dosyalar

- `docs/permissions/PERMISSION_CATALOG.yaml` (yeni, ~57 KB, 113 permission)
- `docs/permissions/PERMISSION_MATRIX.md` (yeni, ~22 KB, modül bazlı tablolar)
- `docs/permissions/ROLE_DESCRIPTIONS.md` (yeni, ~14 KB, 5 rol)
- `docs/permissions/README.md` (yeni, ~4 KB indeks)
- `PROJECT_CONTEXT.md` (güncellendi)
- `docs/ai/AI_KNOWLEDGE_BASE.md` (güncellendi)
- `docs/user-education/INDEX.md` (güncellendi)

## Veritabanı değişiklikleri

- **Yok.** Bu goal kod yazmayı kapsamaz. Permission kataloğu,
  Prisma modelleri ve RLS policy'leri sonraki goal'larda
  (GOAL-012 RBAC + GOAL-010 Tenant) uygulanacak.

## API değişiklikleri

- **Yok.** Bu goal API uçlarını kapsamaz. Planlanan permission
  kontrol dekoratörü (`@Permission('domain:resource:action')`)
  ve `hasPermission()` frontend helper'ı GOAL-012'de kodlanacak.
  Şu an sadece katalog var.

## UI değişiklikleri

- **Yok.** Bu goal UI değişikliklerini kapsamaz. UI tarafında
  permission bazlı gizleme/gösterme Faz 2+ sırasında
  uygulanacak (her sayfa implementasyonu ile birlikte).

## Test sonucu

- **Unit:** N/A (kod yok)
- **Integration:** N/A
- **E2E:** N/A
- **Tenant isolation:** N/A
- **Yetki:** N/A
- **Başarısız/atlanmış test:** N/A

Doküman kalite kontrolü: içerik tarafımdan (orchestrator)
tutarlılık, tenant izolasyonu, append-only, audit ve
self_only kuralları açısından gözden geçirildi. Tüm
permission'larda `tenant_scope`, `branch_scope`, `self_only`,
`audit`, `pii` flag'leri tutarlı biçimde dolduruldu.

## Log ve audit

- **Yok.** Bu goal log ve audit kodunu kapsamaz. Ancak
  PERMISSION_CATALOG.yaml'de her permission için
  `audit: true/false` flag'i ile audit gereksinimi
  belirlendi (ör. `clinic:owner:erase` audit=true,
  `common:notification:read` audit=false). Bu flag'ler
  GOAL-004 (audit altyapısı) ile birlikte kodda enforce
  edilecek.

## Dokümantasyon

- **Kullanıcı eğitimi:** `docs/user-education/INDEX.md` Faz 2+
  için plan notu eklendi. Rol bazlı rehberler
  (`OWNER.md`, `VETERINARIAN.md` vb.) sonraki goal'larda
  doldurulacak. Bu goal, her rolün **sorumluluk haritasını**
  hazırladı.
- **Sayfa kataloğu:** Her permission `applies_to_roles` ile
  ilgili rolleri belirtir. Sayfa kataloğu (`docs/pages/`)
  Faz 2+ ile birlikte her sayfanın gerektirdiği
  permission'ları referans alacak.
- **Alan sözlüğü:** Değişiklik yok (alan sözlüğü alan
  düzeyindedir; bu goal varlık ve izin düzeyinde).
- **Hata kataloğu:** `TR_AUTHZ_0001` (yetki reddedildi) ve
  `TR_AUTHZ_0002` (cross-tenant erişim) gibi yeni hata
  kodları GOAL-004 kapsamında `ERROR_CATALOG.md`'ye
  eklenecek.
- **AI bilgi havuzu:** RAG chunk yapısı güncellendi.
  Örnek eşleştirme: "Bu işlemi kim yapabilir?" →
  `permission_catalog` chunk'ı.

## Bilinen riskler

1. **Permission kataloğu ile kod uyumu:** Katalog YAML'da
   tanımlandı, ancak henüz kod tarafında enforce edilmiyor.
   GOAL-012 (RBAC altyapısı) ile birlikte `@Permission` dekoratörü
   ve `pnpm docs:check` entegrasyonu gelecek. O zamana kadar
   katalog, sözleşme olarak kalıyor.

2. **Permission sayısı yönetilebilirliği:** 113 permission
   orta ölçekli bir SaaS için yönetilebilir; ancak pilot
   genişledikçe yeni permission'lar eklenecek. Katalog
   sürümleme (`version: 1.0.0`) ve `summary` bölümü ile
   kontrol altında.

3. **SUPERADMIN güç yoğunluğu:** SUPERADMIN tüm tenant'lara
   erişir. Bu, "süper admin abuse" riskini taşır. GOAL-011
   (auth) ile birlikte SUPERADMIN için MFA + audit alarm
   zorunlu tutulacak. Çözüm: `audit:log:read` ile SUPERADMIN
   eylemlerinin OWNER tarafından izlenebilmesi.

4. **STAFF ile VETERINARIAN sınırı net mi?** STAFF tıbbi
   kayıt oluşturamaz (SOAP, reçete, aşı) ama görebilir. Bu,
   bilgi asimetrisini önler (resepsiyon hastanın geçmişini
   görebilir) ancak tıbbi karar yetkisi sadece veterinerde
   kalır. Klinik pratiğinde bu net çizgi önemlidir.

5. **Petshop sınırı:** VETERINARIAN petshop permission'larına
   sahip değil. Bu kasıtlı bir sınırdır (veteriner tıbbi
   işine odaklanır). Ancak küçük kliniklerde aynı kişi hem
   veteriner hem de petshop yöneticisi olabilir. Çözüm:
   ileride "ek rol atama" ile bu sınır gevşetilebilir
   (VETERINARIAN + STAFF rolleri birleştirilerek).

## Teknik borç

- **Yok** (kod yazılmadı). Ancak bir sonraki goal'lar için
  öneriler:
  - `pnpm docs:check` aracı `PERMISSION_CATALOG.yaml`'ı
    parse edip koddaki `@Permission('...')` dekoratörlerini
    doğrulamalı (CI kapısı).
  - Frontend'de `hasPermission()` helper'ı yazılmalı;
    `usePermissions()` hook'u ile sayfa bazlı UI gizleme.
  - Backend'de `PermissionGuard` NestJS ile yazılmalı
    (GOAL-012).
  - `permissions` tablosu + `role_permissions` join tablosu
    Prisma'da modellenmeli (GOAL-012).

## Sonraki goal için notlar

### GOAL-003 — Çoklu dil ve ülke adaptörü sözleşmesi (Faz 0 devamı)

- Mevcut `packages/i18n/src/locales/` zaten tr-TR + en-GB
  iskeleti içeriyor.
- Yeni permission adları, rol adları ve aksiyon isimleri
  çeviri sözlüğüne eklenmeli:
  - `role.SUPERADMIN`, `role.OWNER`, `role.VETERINARIAN`,
    `role.STAFF`, `role.PET_OWNER_PORTAL`
  - `permission.*` (her permission için insan okunabilir
    etiket)
  - Hata mesajları: `error.TR_AUTHZ_0001`,
    `error.TR_AUTHZ_0002`
- Ülke adaptörü sözleşmesi: `apps/api/src/common/adaptors/`
  altında `CountryAdapter` interface'i (TR ve UK için
  implementasyonlar).

### GOAL-004 — Log, audit ve hata kodu standardı (Faz 0 devamı)

- PERMISSION_CATALOG'da her permission için `audit: true/false`
  flag'i var. Bu, audit altyapısının temelini oluşturur.
- Yeni hata kodları:
  - `TR_AUTHZ_0001` — yetki reddedildi (403)
  - `TR_AUTHZ_0002` — cross-tenant erişim denemesi (404)
  - `TR_AUTHZ_0003` — self_only kapsamı ihlali (404)
  - `TR_TENANT_0001` — tenant bulunamadı (404)
  - `TR_TENANT_0002` — tenant kapalı (403)
- CLINICAL_FLOWS.md'de listelenen tüm hata kodları da
  ERROR_CATALOG.md'ye taşınmalı.

### GOAL-005 — Dokümantasyon ve AI bilgi havuzu şeması (Faz 0 devamı)

- PERMISSION_CATALOG.yaml RAG chunk'larına bölünmeli. Her
  permission bir chunk (veya rol başına gruplanmış chunk).
  Metadata: `permission`, `role`, `module`, `tenant_scope`,
  `self_only`, `last_verified_at`.
- DOMAIN_GLOSSARY (18 chunk) + CLINICAL_FLOWS (16 chunk) +
  PERMISSION_CATALOG (113 chunk) = toplam ~150 chunk.
- Faz 11'de bu chunk'lar embedding'lenecek.

### GOAL-010+ — Faz 1 platform çekirdeği

- `Role` ve `Permission` Prisma modelleri bu kataloğa göre
  tasarlanmalı.
- `RolePermission` join tablosu: `role_id`, `permission_key`,
  `tenant_id` (tenant-scoped override için), `branch_id`
  (branch-scoped override için).
- SUPERADMIN tenant'ları platform genelinde görebilir, bu
  nedenle SUPERADMIN session'larında `tenant_id` context'i
  farklı çalışır (cross-tenant).
- Pilot tek şubeyle başlar, ancak veri modeli çoklu şubeye
  uygun olmalı.

## Özet

GOAL-002 (FAZ-0) **kod yazmadan tamamlandı**. Üretilen 3 ana
doküman (PERMISSION_CATALOG, PERMISSION_MATRIX,
ROLE_DESCRIPTIONS) + 1 indeks (README), sonraki tüm
goal'lar için (özellikle GOAL-012 RBAC) temel sözleşme görevi
görecek.

**Toplam:** 113 permission, 5 rol, 28 modül. Domain sözlüğü
(GOAL-001) ile uyumlu; her varlık için en az 1 permission.
Tüm permission'larda tenant_scope, branch_scope, self_only,
audit, pii flag'leri tutarlı biçimde dolduruldu.

GOAL-002 başarıyla tamamlandı. Sıradaki goal (GOAL-003 —
Çoklu dil ve ülke adaptörü sözleşmesi) bu dokümanları referans
alarak ilerleyebilir.
