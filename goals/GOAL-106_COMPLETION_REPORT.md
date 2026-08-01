# GOAL-106 — PII Maskeleme ve Log Retention (Completion Report)

## Faz

FAZ-10 (Hata merkezi)

## Özet

Log pipeline içinde kişisel ve klinik verileri maskeleyen
ortak sanitizer (PiiMasker, GOAL-004) + tenant/logType/severity
bazlı retention ve arşivleme kuralları. 6 logType × 4 severity
default matrisi + tenant override + global override zinciri.

## Çıktılar

### Core (GOAL-106 core commit `cd443d3`)

- `packages/contracts/src/log-retention.ts` — 6 logType
  (audit_log, error_event, security_event, job_run,
  notification, request_log) + 4 severity (info, warning,
  error, critical) + 3 archiveStorage (hot, cold, none) +
  RetentionPolicy + RetentionPolicyUpsert +
  RetentionPolicyFilters + RetentionPolicyListResponse +
  RetentionSweepBucket + RetentionSweepResult +
  RetentionSweepHistoryFilters + RetentionSweepHistoryResponse
  - TriggerRetentionSweep + 3 default matrisi
    (DEFAULT_RETENTION_DAYS, DEFAULT_ARCHIVE_AFTER_DAYS,
    DEFAULT_ARCHIVE_STORAGE).
- `apps/api/src/common/logging/log-retention.types.ts` —
  RetentionPolicyRecord + RetentionSweepRecord +
  toRetentionPolicy + toRetentionSweep dönüşümleri.
- `apps/api/src/modules/log-retention/log-retention.repository.ts`
  — In-memory Map; upsertPolicy (tenant + logType + severity
  unique key); findEffective (tenantOverride → globalOverride
  → default zincir); recordSweep (append-only history);
  findSweepById; listSweeps.
- `apps/api/src/modules/log-retention/log-retention.targets.ts`
  — LogRetentionTarget sözleşmesi; expireOlderThan +
  countOlderThan ortak argümanları.
- `apps/api/src/modules/log-retention/targets/error-event.target.ts`
  — ErrorEvent retention target; `ErrorEventsRepository`'yi
  sarar.
- `apps/api/src/modules/log-retention/targets/job-run.target.ts`
  — JobRun retention target.
- `apps/api/src/modules/log-retention/targets/security-event.target.ts`
  — SecurityEvent retention target.
- `apps/api/src/modules/log-retention/log-retention.service.ts`:
  - `listRetentionPolicies`, `getRetentionPolicyById`,
    `upsertRetentionPolicy`, `deleteRetentionPolicy`.
  - `getEffectivePolicy` (tenant + logType + severity için
    source ile birlikte).
  - `runSweep` (tüm tenant × logType × severity kombinasyonları;
    dryRun desteği; bucket bazlı expired/archived/deleted
    sayımları).
  - `listSweeps`, `getSweepDetail`.
  - PiiMasker entegrasyonu (redactPii her zaman true).
- `apps/api/src/modules/log-retention/log-retention.controller.ts`
  — 8 endpoint.
- `apps/api/src/modules/log-retention/log-retention.module.ts` —
  DI providers + RetentionTarget listesi.

### Endpoint'ler (8)

| #   | Method | Path                                                  | Yetki            |
| --- | ------ | ----------------------------------------------------- | ---------------- |
| 1   | GET    | `/api/v1/superadmin/log-retention/policies`           | `audit:log:read` |
| 2   | GET    | `/api/v1/superadmin/log-retention/policies/effective` | `audit:log:read` |
| 3   | GET    | `/api/v1/superadmin/log-retention/policies/{id}`      | `audit:log:read` |
| 4   | PUT    | `/api/v1/superadmin/log-retention/policies`           | `audit:log:read` |
| 5   | DELETE | `/api/v1/superadmin/log-retention/policies/{id}`      | `audit:log:read` |
| 6   | POST   | `/api/v1/superadmin/log-retention/sweeps`             | `audit:log:read` |
| 7   | GET    | `/api/v1/superadmin/log-retention/sweeps`             | `audit:log:read` |
| 8   | GET    | `/api/v1/superadmin/log-retention/sweeps/{id}`        | `audit:log:read` |

### Döküman (bu commit)

- 8 API doc.
- `docs/ai/AI_CHUNKS.yaml` — yeni `glossary-log-retention` +
  `flow-log-retention-sweep` chunk'ları v1.0.0.
- `docs/pages/web.superadmin.locale.log-retention.yaml` —
  yeni sayfa kataloğu.

## İş Kuralları

- **6 logType × 4 severity:** default retention matrisi
  - `audit_log`: 365 (info|warning) / 730 (error) / 1825 (critical) gün
  - `error_event`: 30 / 90 / 180 / 365 gün
  - `security_event`: 365 / 730 / 1825 / 2555 (~7 yıl KVKK/UK GDPR)
  - `job_run`: 7 / 14 / 30 / 90 gün (PII riski düşük)
  - `notification`: 30 / 60 / 90 / 180 gün (PII riski yüksek)
  - `request_log`: 7 / 14 / 30 / 90 gün (en yüksek PII riski)
- **Default archive offset:** 90 (audit_log) → 7 (request_log)
  gün.
- **Effective policy:** tenantOverride varsa onu kullanır;
  yoksa globalOverride (tenantId=null); o da yoksa
  `DEFAULT_RETENTION_DAYS` + `DEFAULT_ARCHIVE_AFTER_DAYS`
  sabitleri. `source` alanı kaynağı belirtir
  (tenantOverride | globalOverride | default).
- **redactPii:** her zaman true; caller override edemez
  (servis tarafında enforce). Tüm arşivlenecek payload
  `PiiMasker`'dan geçirilir.
- **Sweep:** tenant × logType × severity kombinasyonları
  üzerinden effective policy çözer; cutoff hesaplanır
  (şimdi - retentionDays); target repository üzerinden
  arşiv veya sil. dryRun=true ise gerçek işlem yapılmaz.
- **Append-only history:** her sweep bir
  `RetentionSweepResult` kaydı oluşturur; bucket bazlı
  expired/archived/deleted sayıları + totals.
- **Cross-tenant:** SUPERADMIN global görür; tenant filtresi
  opsiyonel.
- **Audit:** `audit:log_retention.policy_upsert` (info|warning),
  `audit:log_retention.policy_delete` (warning),
  `audit:log_retention.sweep_trigger` (info|warning).

## Yapılmayanlar / Bilinçli Atlamalar

- **Prisma migration** → Faz 10+ DB katmanı.
- **Cold storage adapter (S3/Azure Blob)** → Faz 12+ (gerçek
  storage provider).
- **Otomatik sweep scheduler (BullMQ cron)** → Faz 10+
  `bullmq` worker entegrasyonu.
- **Tenant self-service UI** → Faz 15+ (sadece SUPERADMIN
  şu an).
- **GDPR/KVKK export (tenant'ın kendi verisi)** → GOAL-126.

## Döküman Uyum

- `pnpm docs:check` → temiz (log-retention özgü).
- `pnpm i18n:check` → temiz.

## Testler

- `log-retention.service.spec.ts` → unit testler (paralel core).
- Full api regresyon: 1435 yeşil, 9 skipped, 0 hata.

## Commit

- Core: `cd443d3` — `GOAL-106 core: PII maskeleme ve log retention modülü`
- Docs: (bu commit) — `docs(log-retention): GOAL-106 PII maskeleme ve log retention doküman ve i18n tamamla + FAZ-10 kapanışı`
