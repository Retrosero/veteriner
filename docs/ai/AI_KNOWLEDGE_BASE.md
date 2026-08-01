# AI Bilgi Havuzu — İskelet

Bu doküman, VetNiva AI asistanının kullanıcı sorularını yanıtlarken
başvurduğu bilgi kaynağını oluşturur. Faz 11'de (Dokümantasyon ve AI
kullanım asistanı temeli) zenginleştirilecektir.

## Bilgi kaynakları (klasör yapısı)

- `docs/domain/DOMAIN_GLOSSARY.md` — **varlık/kavram sözlüğü** (18
  kavram, GOAL-001'de üretildi). AI asistanı "X nedir?" sorularını
  bu kaynaktan yanıtlar.
- `docs/domain/CLINICAL_FLOWS.md` — **uçtan uca iş akışları** (16
  akış, GOAL-001'de üretildi). AI asistanı "X nasıl yapılır?"
  sorularını bu kaynaktan yanıtlar.
- `docs/domain/PILOT_SCOPE.md` — pilot kapsamı ve MVP dışı konular.
  AI asistanı "bu özellik var mı?" sorularını buradan yanıtlar.
- `docs/permissions/PERMISSION_CATALOG.yaml` — **makinece
  okunabilir** yetki kataloğu (113 permission, GOAL-002'de
  üretildi). AI asistanı "bu işlemi kim yapabilir?" sorularını
  buradan yanıtlar.
- `docs/permissions/PERMISSION_MATRIX.md` — insan okunabilir
  yetki matrisi.
- `docs/permissions/ROLE_DESCRIPTIONS.md` — 5 rol için sorumluluk
  açıklamaları.
- `docs/i18n/I18N_CONTRACT.md` — **çoklu dil sözleşmesi**
  (GOAL-003'te üretildi). AI asistanı çeviri anahtarlarını ve
  locale'leri buradan referans alır.
- `docs/i18n/COUNTRY_ADAPTER_CONTRACT.md` — **ülke adaptörü
  sözleşmesi** (GOAL-003'te üretildi). AI asistanı tarih, para,
  telefon formatı sorularını buradan yanıtlar.
- `docs/fields/FIELD_GLOSSARY.md` — alan düzeyinde sözlük (alan
  adı, tip, kısıt). Form alanlarını açıklamak için.
- `docs/pages/` — sayfa bilgi kayıtları (YAML).
- `docs/workflows/` — iş akışları üst katalogu (fazlara göre
  gruplama).
- `docs/errors/` — hata kataloğu ve standartları:
  - `ERROR_CODE_STANDARD.md` — `VET-<MODULE>-<NNN>` formatı.
  - `ERROR_CATALOG.md` — kod → mesaj → çözüm listesi.
  - `AUDIT_LOG_STANDARD.md` — audit log sözleşmesi
    (GOAL-004'te üretildi).
  - `AUDIT_EVENTS.yaml` — audit event kataloğu.
  - `LOG_STANDARD.md` — sistem/job/entegrasyon/güvenlik log
    türleri.
  - `CORRELATION_ID.md` — request ID standardı.
  - `PII_MASKING.md` — PII maskeleme kuralları.
- `docs/user-education/` — Türkçe kullanıcı eğitimi.

## AI asistan kapsamı (GOAL-000)

İlk sürümde AI asistan **yoktur**. Sadece altyapı hazırlanır.

## İlk sürüm AI asistanının kuralları (Faz 11+)

Asistan **tıbbi teşhis vermez**. Yalnızca:

1. Uygulama kullanımını anlatır (CLINICAL_FLOWS.md).
2. Kavramları açıklar (DOMAIN_GLOSSARY.md).
3. Doğru menüye yönlendirir.
4. Alanları açıklar (FIELD_GLOSSARY.md).
5. Hata çözüm adımlarını gösterir (ERROR_CATALOG.md).
6. Kullanıcının yetki durumunu açıklar (PERMISSION_MATRIX.md).
7. Pilot kapsamı dışındaki konular için "MVP dışı" yönlendirmesi
   yapar (PILOT_SCOPE.md).

Cevaplamadan önce:

- Tenant modülleri (hangi özellikler açık)
- Kullanıcının rolü ve izinleri
- Kullanıcının dili
- Mevcut sayfa
- Seçili hasta/hayvan bağlamı

değerlendirilir.

## Arama anahtarları (keywords)

Her sayfa kaydı (`docs/pages/...yaml`) `keywords` alanı içerir. AI
asistanı kullanıcı sorusunun niyetini bu anahtarlarla eşleştirir.

Ek olarak, `DOMAIN_GLOSSARY.md` ve `CLINICAL_FLOWS.md` dosyaları
"RAG chunk"larına bölünür; her chunk'ın metadata'sı:

```yaml
- chunk_id: glossary-patient-owner
  source: docs/domain/DOMAIN_GLOSSARY.md
  type: glossary
  entity: patient_owner
  locale: tr-TR
  last_verified_at: 2026-07-30
  keywords:
    - hasta sahibi
    - patient owner
    - hayvan sahibi
    - müşteri
    - KVKK
```

## Chunk/metadata planı (Faz 11+)

- `DOMAIN_GLOSSARY.md` → 18 chunk (her kavram).
- `CLINICAL_FLOWS.md` → 16 chunk (her akış).
- `FIELD_GLOSSARY.md` → alan başına chunk.
- Sayfa kayıtları → sayfa başına chunk.
- Metadata: `chunk_id`, `source`, `type`, `entity/page_id`,
  `locale`, `version`, `last_verified_at`.
- Türkçe anahtarlar öncelikli; İngilizce iskeleti korunur.

## Örnek eşleştirmeler

| Kullanıcı sorusu               | Kaynak                   | Chunk                                 | Yanıt tipi             |
| ------------------------------ | ------------------------ | ------------------------------------- | ---------------------- |
| "Aşı nasıl uygulanır?"         | `CLINICAL_FLOWS.md`      | `flow-vaccination`                    | Adım adım akış         |
| "Hasta sahibi ne demek?"       | `DOMAIN_GLOSSARY.md`     | `glossary-patient-owner`              | Tanım + ilişkiler      |
| "Stok düşümü nasıl olur?"      | `CLINICAL_FLOWS.md`      | `flow-vaccination` (stok düşüm adımı) | Akış + teknik not      |
| "e-SMM var mı?"                | `PILOT_SCOPE.md`         | `pilot-scope-mvp-out`                 | "MVP dışı" notu        |
| "Aşı SKT kontrolü"             | `FIELD_GLOSSARY.md`      | `vaccination-lot`                     | Alan açıklaması        |
| "Sahiplik nasıl devredilir?"   | `CLINICAL_FLOWS.md`      | `flow-ownership-transfer`             | Uçtan uca akış         |
| "KVKK silme talebi?"           | `CLINICAL_FLOWS.md`      | `flow-kvkk-erasure`                   | Akış + uyarılar        |
| "Bu hatayı nasıl çözerim?"     | `ERROR_CATALOG.md`       | `error-<code>` chunk                  | Mesaj + çözüm adımları |
| "Hata kodu ne anlama geliyor?" | `ERROR_CODE_STANDARD.md` | `error-code-<module>` chunk           | Modül + HTTP eşlemesi  |
| "Audit log nedir?"             | `AUDIT_LOG_STANDARD.md`  | `audit-overview` chunk                | Amaç + retention + PII |

## Güncelleme politikası

- `docs/pages/`, `docs/domain/`, `docs/fields/`, `docs/errors/`,
  `docs/permissions/` değiştiğinde AI asistan bilgi tabanı otomatik
  güncellenir.
- `pnpm docs:check` geçmeden PR merge edilmez.
- `last_verified_at` 90 günü geçen chunk'lar `degraded` flag'i alır.
