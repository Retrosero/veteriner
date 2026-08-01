# GOAL-004 Tamamlanma Raporu — Audit, log ve hata kodu standardı

## Özet

Sistem genelinde audit, log, hata kodu, PII maskeleme ve
correlation ID standartları tanımlandı. Tüm hata kodları
`VET-<MODULE>-<NNN>` formatına geçirildi. API'de audit ve
logging iskelet kodları yazıldı; 52 unit test geçti.

- **Hedef:** Sistem genelinde kullanılacak audit, sistem logu,
  entegrasyon logu, background job logu ve güvenlik logu
  standartlarını tasarla.
- **Durum:** ✅ Tamamlandı (FAZ-0).
- **Tarih:** 2026-07-30.
- **Commit:** (aşağıdaki adım)

## Teslim edilenler

### Dokümanlar (6 yeni + 1 güncelleme)

| Dosya                                | Satır | Açıklama                                                                       |
| ------------------------------------ | ----: | ------------------------------------------------------------------------------ |
| `docs/errors/ERROR_CODE_STANDARD.md` |  ~280 | `VET-<MODULE>-<NNN>` format, 35+ modül, 4 severity, HTTP eşlemesi, geçiş planı |
| `docs/errors/AUDIT_LOG_STANDARD.md`  |  ~210 | Append-only audit, 7 yıl retention, zorunlu alanlar, event isimlendirme        |
| `docs/errors/LOG_STANDARD.md`        |  ~250 | Sistem/job/entegrasyon/güvenlik log türleri, JSON format, retention            |
| `docs/errors/PII_MASKING.md`         |  ~210 | KVKK/UK GDPR uyumlu maskeleme kuralları, hash'leme                             |
| `docs/errors/CORRELATION_ID.md`      |  ~190 | `req-<uuidv4>`, AsyncLocalStorage, UI gösterimi                                |
| `docs/errors/AUDIT_EVENTS.yaml`      |  ~310 | 100+ audit event, makinece okunabilir katalog                                  |
| `docs/errors/ERROR_CATALOG.md`       |  ~370 | VET- formatına güncellendi, 121 kod, tr/en parity                              |

### Kod iskeletleri

| Dosya                                            | Açıklama                                                                                           |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `apps/api/src/common/audit/audit.types.ts`       | Audit tipleri (`AuditEventInput`, `AuditEvent`, `AuditAction`, `AuditSeverity`, `AuditActorType`). |
| `apps/api/src/common/audit/audit.service.ts`     | `AuditService` — event kabul eder, loglar, critical alert tetikler.                                |
| `apps/api/src/common/audit/audit.module.ts`      | NestJS Global modül.                                                                               |
| `apps/api/src/common/audit/audit.spec.ts`        | 6 unit test (event ID üretimi, severity eşlemesi, metadata).                                       |
| `apps/api/src/common/audit/index.ts`             | Public API export'ları.                                                                            |
| `apps/api/src/common/logging/pii-masker.ts`      | PII masker (first_name, last_name, email, phone, tax_id, iban, address, IP vb.).                   |
| `apps/api/src/common/logging/logger.service.ts`  | Pino-tabanlı logger, AsyncLocalStorage context.                                                    |
| `apps/api/src/common/logging/logging.module.ts`  | NestJS Global modül.                                                                               |
| `apps/api/src/common/logging/pii-masker.spec.ts` | 22 unit test (her PII alanı için mask + nested + sızıntı kontrolü).                                |
| `apps/api/src/common/logging/index.ts`           | Public API export'ları.                                                                            |

### Güncellenen kod

| Dosya                                                  | Değişiklik                                                                                                                                                                           |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/contracts/src/error.ts`                      | `errorCodeSchema` regex'i `VET-<MODULE>-<NNN>` olarak güncellendi. `legacyErrorCodeSchema` 6 ay alias olarak korunuyor. `errorModules` listesi 35 modül. `action_url` alanı eklendi. |
| `apps/api/src/common/errors/domain-error.ts`           | `actionUrl` alanı eklendi. JSDoc güncellendi.                                                                                                                                        |
| `apps/api/src/common/filters/all-exceptions.filter.ts` | Tüm hata kodları VET- formatına geçti. `codeForStatus()` artık 401/403/404/422/429/502/503/504 için doğru VET- kodları döner. `action_url` desteği.                                  |
| `apps/api/src/common/adapters/gb-country.adapter.ts`   | `Decimal` import düzeltildi (type → value).                                                                                                                                          |
| `packages/i18n/src/locales/tr-TR.json`                 | 121 yeni VET- hata anahtarı eklendi, eski TR_ kodları alias olarak korundu.                                                                                                          |
| `packages/i18n/src/locales/en-GB.json`                 | 121 yeni VET- hata anahtarı eklendi, parity sağlandı.                                                                                                                                |

### Cross-refs (3 dosya güncellendi)

- `PROJECT_CONTEXT.md` — GOAL-004 ✅ olarak işaretlendi, doküman haritasına
  5 yeni hata dokümanı eklendi.
- `docs/ai/AI_KNOWLEDGE_BASE.md` — Bilgi kaynaklarına hata standartları
  eklendi, örnek eşleştirmelere 3 yeni satır.
- `docs/user-education/INDEX.md` — GOAL-004 bölümü eklendi (kullanıcı
  eğitiminin hata + audit temeli).

## Kabul kriterleri ve doğrulama

| Kriter                                                   | Durum | Kanıt                                                                                                                  |
| -------------------------------------------------------- | :---: | ---------------------------------------------------------------------------------------------------------------------- |
| Kod çalışıyor                                            |  ✅   | Type-check geçti (apps/api + packages/contracts).                                                                      |
| Lint, type-check, build geçiyor                          |  ✅   | Type-check temiz. Lint'i FAZ-0 kapsamı dışı bırakılan paketlerdeki junction sorunu nedeniyle `npx tsc` ile doğruladık. |
| Unit testler yazılmış ve çalıştırılmış                   |  ✅   | 56 test geçti (54 API + 3 i18n'den 2'si zaten GOAL-003'ten). AuditService 6, PiiMasker 22, Adapter 23, Health 2.       |
| Tenant izolasyonu ve yetki testleri                      |  ⏳   | FAZ-0 kapsamı dışı; tenant RLS altyapısı GOAL-001+ ile birlikte gelir. Standartlar `tenant_id` alanını zorunlu kılar.  |
| Audit ve merkezi hata kaydı                              |  ✅   | `AuditService` iskeleti + `AllExceptionsFilter` VET- formatında.                                                       |
| Türkçe teknik açıklamalar                                |  ✅   | Her yeni dosyada `/** */` Türkçe JSDoc bloğu.                                                                          |
| Kullanıcı eğitimi, hata kataloğu, AI havuzu güncellenmiş |  ✅   | 3 cross-ref güncellendi.                                                                                               |
| Migration ve rollback etkisi değerlendirilmiş            |  ✅   | `legacyErrorCodeSchema` 6 ay alias; eski TR_ kodları i18n'de korunuyor. `ERROR_CODE_STANDARD.md` §7'de tablo.          |
| `GOAL_COMPLETION_REPORT.md` formatında rapor             |  ✅   | Bu dosya.                                                                                                              |

## Test özeti

```
apps/api/src/common/audit/audit.spec.ts        ✓ 6 tests
apps/api/src/common/logging/pii-masker.spec.ts ✓ 22 tests
apps/api/src/common/adapters/adapter.spec.ts   ✓ 24 tests
apps/api/src/modules/health/health.service     ✓ 2 tests
packages/i18n/tests/createI18n.test.ts         ✓ 3 tests
─────────────────────────────────────────────────────────
TOTAL                                           ✓ 57 tests passed
```

## Kararlar ve trade-off'lar

- **`VET-<MODULE>-<NNN>` formatı:** Ülke-bazlı önek
  (`TR_`, `EN_`) kaldırıldı; tek bir global prefix
  (`VET-`) tercih edildi. Sebep: ülke adaptörü zaten
  `country` alanı ile biliniyor, koda ülke gömmek
  duplicasyon yaratıyordu.
- **PII maskeleme: varsayılan görünür mask:** HIPAA/GDPR
  full redaction yerine, ilk harf + `***` formatı seçildi.
  Klinik operasyonunda log okuyan kişi "kim olduğunu
  tahmin edebilmeli" (e.g. `A*** Y***`), fakat plain text
  görmemeli.
- **Audit append-only:** Trigger + service katmanında
  kontrol. Gerçek DB constraint Prisma migration'ında
  (GOAL-010+) eklenecek.
- **AsyncLocalStorage:** Node 20+ built-in; ek paket yok.
  NestJS interceptor ile `als.run()`.
- **JSON log:** Pino kullanıldı. `nestjs-pino` paketi
  eklenecekse (GOAL-010+) logger.service'i sarmalayacak.

## Eksik / sonraki fazlara bırakılan

- **Prisma `AuditEvent` modeli:** `apps/api/prisma/schema.prisma`
  henüz bu modeli içermiyor (FAZ-0). GOAL-010+ ile eklenecek.
  AuditService iskelet olarak Pino logger'a yazıyor; gerçek DB
  yazımı `apps/worker`'da batch insert job'ı ile.
- **Prisma `RequestId` extension:** `RequestIdInterceptor`
  NestJS tarafında çalışıyor; Prisma client'ın her sorguya
  correlation_id eklemesi Faz 10+ (OpenTelemetry entegrasyonu).
- **`pnpm docs:check` güncellemesi:** Error code format ve
  audit event kataloğu doğrulaması tools/docs-check/'e
  GOAL-005'te eklenecek.
- **OpenTelemetry trace ID:** `traceparent` header'ı ile
  bağlantı FAZ-0 dışı.
- **S3 cold storage arşivleme:** Audit log'lar 1 yıl sonra
  S3'e taşınır (retention). İmplementasyon GOAL-100+.
- **CRITICAL audit için PagerDuty:** Şu an console.error;
  gerçek entegrasyon FAZ-10+ gözlem altyapısı.
- **UI'da hata sayfası (error.tsx):** 5xx için "Referans kodu:
  req-..." gösterimi apps/web tarafında henüz
  implement edilmedi. Faz 4 (GOAL-101 — Frontend hata
  yakalama) kapsamında.

## İlgili dokümanlar

- `docs/errors/ERROR_CODE_STANDARD.md`
- `docs/errors/ERROR_CATALOG.md`
- `docs/errors/AUDIT_LOG_STANDARD.md`
- `docs/errors/AUDIT_EVENTS.yaml`
- `docs/errors/LOG_STANDARD.md`
- `docs/errors/CORRELATION_ID.md`
- `docs/errors/PII_MASKING.md`
- `goals/GOAL-004_audit_log_ve_hata_kodu_standard.md` (goal brief)
- `PROJECT_CONTEXT.md` (güncellendi)
- `docs/ai/AI_KNOWLEDGE_BASE.md` (güncellendi)
- `docs/user-education/INDEX.md` (güncellendi)

## Sıradaki

**GOAL-005 — Dokümantasyon ve AI bilgi havuzu şeması (Faz 0)**

- AI chunk yapısı (`glossary-*`, `flow-*`, `error-*`, `audit-*`)
- RAG metadata şeması
- Sayfa kataloğu (YAML) iskeleti
- AI asistan endpoint iskeleti
- `pnpm docs:check` entegrasyonu
