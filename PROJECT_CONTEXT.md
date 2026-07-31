# Proje Bağlamı
    (GOAL-103) + tenant bazlı job kuyruğu görünümü.
  - GOAL-090 ✅ Laboratuvar test kataloğu (tamamlandı — 2026-07-30, core: 6e92831, docs/i18n: bu commit). 4 endpoint (POST/GET list/GET :id/PATCH); 8 kategori (hematology/biochemistry/microbiology/parasitology/urinalysis/cytology/imaging/other) + 6 specimenType; referenceRanges analyte+unit+low+high; tatHours + price; update snapshot. Audit udit:lab_test.*. Cihaz adapter (GOAL-094) ayrı goal.
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
  - GOAL-101 ⏳ partial — core: frontend hata yakalama.
    Next.js error boundary'leri (route [locale]/error.tsx +
    global-error.tsx) + error-reporter (PII sanitizer:
    email/TCKN/telefon/CC mask; maxQueueSize 50; dedup window
    1 sn; flush interval 2 sn; sendBeacon sayfa unload'ında) +
    api-error-integration (apiRequest failure otomatik raporlama
    + severity mapping 5xx→error, 4xx→warning) + backend
    SystemErrorEventsController (POST /api/v1/system/error-events
    — auth placeholder, oturum açmış tüm kullanıcılar) +
    ErrorEventsService.recordClientError (actor bağlamından
    tenant/branch/userId/actorType türetir; istemciye güvenmez)
    + clientErrorReportInputSchema sözleşmesi (severity/
    errorCode/message/stack/context/route/occurredAt/release/
    country) + clientErrorReportResponseSchema (id + fingerprint
    korelasyon) + 41/41 frontend yeni test (error-reporter
    24, api-error-integration 9, error boundary 4+4) +
    error-events backend 42/42 (önceki 32 + 10 yeni
    recordClientError testi: tenant/branch/userId türetme,
    default errorCode TR_FE_0001, actorType portal_user,
    info/critical stack, PII mask'lı context, occurredAt/release
    override) + 1266/1266 api regresyon + 46/46 web
    regresyon. SendBeacon sayfa kapatma anında sync flush
    yapar; navigator yoksa atlanır. Reporter hiçbir koşulda
    throw etmez. Cross-module: ErrorEventsService + repository
    paylaşılır. Sonraki tick: docs/RAG chunk/i18n key parity +
    Next.js client instrumentation.ts hook (unhandledrejection
    global yakalama) + sentry/otel adapter opsiyonel +
    SUPERADMIN panel frontend (GOAL-103) + rate limit
    (token bucket per user) + retry/backoff stratejisi.
  - GOAL-102 ⏳ partial — core: background job ve entegrasyon
    logları. job-runs modülü (8 endpoint: POST start/POST
    :id/finish/POST :id/retry/GET list/GET summary/GET
    dead-letter/GET attempts/:jobKey/GET :id) + JobRun
    sözleşmesi (JobRun + StartInput + FinishInput +
    RetryInput + Filters + ListResponse +
    AttemptsByKeyResponse + DeadLetterQuery + Summary +
    20+ Zod şema) + 5 status (pending/running/succeeded/
    failed/dead_letter) + 4 source (queue/adapter/cron/
    system) + 4 triggeredBy (user/system/manual_retry/
    integration) + failed → dead_letter otomatik terfi
    (attempt >= maxAttempts) + parentRunId retry zinciri +
    durationMs hesabı + PII mask input/output (PiiMasker
    + truncate >100 key) + attemptsByKey view + dead-letter
    view + summary aggregate (status + queue + 24h dead +
    oldestRunning) + 40/40 yeni test + 1306/1306 api
    regresyon geçti. SUPERADMIN yetkisi audit:log:read.
    Cross-module: PiiMasker (common/logging); AuditService
    ileride eklenecek. Sonraki tick: docs/RAG chunk/i18n
    key parity + DB migration (Prisma) + cross-correlation
    (ErrorEvents + JobRuns) + auto caller (BullMQ worker
    integration) + Faz 10+ superadmin panel frontend
    (GOAL-103) + tenant bazlı job kuyruğu görünümü.
