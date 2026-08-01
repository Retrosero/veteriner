# @file Çoklu Dil ve Ülke Adaptörü Dokümanları.

# @module docs/i18n/README

#

# @description VetNiva'nın i18n ve country adapter mimarisine

# ilişkin tüm sözleşme ve rehber dokümanları. GOAL-003 ile

# birlikte üretildi.

# =============================================================================

# Çoklu Dil ve Ülke Adaptörü Dokümanları

Bu klasör, VetNiva'nın **çoklu dil (i18n)** ve **ülke adaptörü**
mimarisinin sözleşmelerini içerir. Her iki sözleşme de
"kod içine dağınık koşullar yazma" anti-pattern'ini engellemek
için standart bir arayüz ile çalışır.

## Dosyalar

- [`I18N_CONTRACT.md`](./I18N_CONTRACT.md) — **Çoklu dil
  sözleşmesi**. Locale'ler, çeviri anahtarı formatı, yükleme
  stratejisi, pluralization, formatlama, yeni çeviri ekleme
  süreci.
- [`COUNTRY_ADAPTER_CONTRACT.md`](./COUNTRY_ADAPTER_CONTRACT.md)
  — **Ülke adaptörü sözleşmesi**. TR ve GB için adapter
  arayüzleri; tarih, saat, para, sayı, adres, telefon, vergi,
  KDV, fiş, reçete, bildirim kuralları.

## İlişkili kod (uygulama)

- `packages/contracts/src/locale.ts` — desteklenen locale'ler.
- `packages/i18n/src/locales/{tr-TR,en-GB}.json` — çeviri
  dosyaları.
- `apps/web/src/lib/labels.ts` — UI etiket kütüphanesi.
- `apps/web/src/i18n/config.ts` — server-side i18n yapılandırması.
- `apps/api/src/common/adapters/` — country adapter
  implementasyonu (GOAL-003 sonrasında).

## İlişkili dokümanlar

- `../domain/DOMAIN_GLOSSARY.md` — varlık/kavram sözlüğü
  (alanlar için referans).
- `../permissions/PERMISSION_CATALOG.yaml` — permission
  kataloğu (role/permission çevirileri için).
- `../errors/ERROR_CATALOG.md` — hata kataloğu (Faz 4'te
  genişletilecek).
- `../ai/AI_KNOWLEDGE_BASE.md` — RAG chunk yapısı.
- `../../PROJECT_CONTEXT.md` — ürün vizyonu, ilkeler.
- `../../goals/GOAL-003_COMPLETION_REPORT.md` — tamamlanma
  raporu.

## Üretim sürümü

- **GOAL-003 (FAZ-0 devamı)** ile birlikte üretildi
  (2026-07-30).
- Sonraki goal'lar (GOAL-004, GOAL-005, GOAL-010+) bu
  sözleşmeleri referans alır.
