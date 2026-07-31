# GOAL-102 — Background Job ve Entegrasyon Logları (Completion Report)

## Faz
FAZ-10 (Hata merkezi)

## Özet
BullMQ kuyruğu, dış entegrasyon çağrısı, cron tetikleyicisi
veya sistem aksiyonu için tek denemeye karşılık gelen
JobRun kaydı. SUPERADMIN görünürlüğünde 8 endpoint; retry
zinciri, dead-letter view, summary aggregate.

## Çıktılar

### Core (GOAL-102 core commit `9912475`)
- `packages/contracts/src/job-run.ts` — JobRun + StartInput
  + FinishInput + RetryInput + Filters + ListResponse +
  AttemptsByKeyResponse + DeadLetterQuery + Summary +
  SummaryQuery + 20+ Zod şema/tip.
- `apps/api/src/common/job-runs/job-run.types.ts` —
  JobRunRecord + toJobRun dönüşümü.
- `apps/api/src/modules/job-runs/job-runs.repository.ts` —
  In-memory Map; insert/update/findById/findByJobKey/search/
  listDeadLetter/countByQueue/countByStatus/countDeadLetterSince/
  oldestActiveStartedAt.
- `apps/api/src/modules/job-runs/job-runs.service.ts`:
  - `startRun` (yeni JobRun açar; attempt=1, status=running).
  - `finishRun` (succeeded/failed/dead_letter kapatır;
    `attempt >= maxAttempts` ise failed otomatik
    dead_letter'a terfi eder; durationMs + finishedAt
    hesaplanır; idempotency guard VET-JOBRUN-0001).
  - `retryRun` (failed/dead_letter'dan yeni deneme;
    parentRunId + attempt+1, triggeredBy=manual_retry;
    succeeded/running/pending → VET-JOBRUN-0003).
  - `listJobRuns`, `listAttemptsByJobKey`, `listDeadLetter`,
    `getJobRunSummary`, `getJobRunDetail`.
- `apps/api/src/modules/job-runs/job-runs.controller.ts` —
  8 endpoint (POST start, POST :id/finish, POST :id/retry,
  GET list, GET summary, GET dead-letter, GET attempts/:jobKey,
  GET :id).

### Döküman (bu commit)
- 8 API doc (docs/api/api.*._superadmin_job-runs*.md).
- `docs/ai/AI_CHUNKS.yaml` — yeni `glossary-job-run` ve
  `flow-job-run` chunk'ları v1.0.0.
- `docs/pages/web.superadmin.locale.job-runs.yaml` — yeni
  sayfa kataloğu.

## İş Kuralları
- **5 status:** pending, running, succeeded, failed, dead_letter.
- **4 source:** queue, adapter, cron, system.
- **4 triggeredBy:** user, system, manual_retry, integration.
- **Idempotency:** Zaten terminal run tekrar finish edilemez
  (409 `VET-JOBRUN-0001`).
- **Retry guard:** succeeded/running/pending run retry edilemez
  (409 `VET-JOBRUN-0003`).
- **Auto dead_letter:** `attempt >= maxAttempts` olan failed
  otomatik dead_letter'a terfi eder; `durationMs` hesaplanır.
- **PII mask:** `input` ve `output` `PiiMasker`'dan geçirilir;
  `errorStack` yalnızca failed/dead_letter için saklanır.
- **Audit:** `audit:job_run.*` (`started`, `finished`, `retried`).

## Yapılmayanlar / Bilinçli Atlamalar
- **Prisma migration** → Faz 10+ DB katmanı.
- **BullMQ adapter (auto caller)** → Faz 10+ worker iskeleti.
- **Cross-correlation (ErrorEvents ↔ JobRuns)** → Faz 10+ unified.
- **Tenant bazlı job kuyruğu görünümü** → Faz 10+ tenant panel.

## Döküman Uyum
- `pnpm docs:check` → temiz (job-runs özgü).
- `pnpm i18n:check` → temiz.

## Testler
- `job-runs.service.spec.ts` → 40 unit test.
- Full api regresyon: 1306/1306 yeşil, 9 skipped, 0 hata.

## Commit
- Core: `9912475` — `GOAL-102 core: background job ve entegrasyon logları`
- Docs: (bu commit) — `docs(error-events): GOAL-100/101/102/103/104 doküman ve i18n tamamla`
