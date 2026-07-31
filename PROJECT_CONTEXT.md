# Proje Bağlamı
    (GOAL-103) + tenant bazlı job kuyruğu görünümü.
  - GOAL-094 ✅ Cihaz ve dış laboratuvar adaptör sözleşmesi (tamamlandı — 2026-07-30, core: 6c235bd, docs/i18n: bu commit). 9 endpoint (export/import + retry/cancel + adapters list); 4 format (HL7/FHIR/ASTM/proprietary); modality lab/imaging; async export/import + 3 retry; tenant-scoped. Audit udit:lab_adapter_export.* + udit:lab_adapter_import.create. Gerçek HL7/FHIR/PACS entegrasyonu Faz 14+ planı. **FAZ-9 TAMAMLANDI (GOAL-090 → 094, 5/5 docs).**
  - GOAL-093 ✅ Görüntüleme isteği ve raporu (tamamlandı — 2026-07-30, core: 8cf7ad1, docs/i18n: bu commit). 10 endpoint (POST/GET list/GET :id/POST :id/schedule/perform/report/approve-report/amend-report/complete/cancel); 5 modality (xray/ultrasound/ct/mri/dental_xray); state ordered→scheduled→performed→reported→completed|cancelled; PACS/DICOM imageIds[]; report findings+impression+recommendations; amend append-only. Audit udit:imaging_order.*. PACS gerçek entegrasyonu Faz 14+ cihaz adapter (GOAL-094).
  - GOAL-092 ✅ Laboratuvar sonuçları (tamamlandı — 2026-07-30, core: 8782ef3, docs/i18n: bu commit). 7 endpoint (POST/GET/GET history/PATCH/POST submit/POST approve/POST amend); state draft→submitted→approved|amended; analyte bazlı + 5 abnormal flag + reference range; submit tüm draft; approve uzman onayı; amend append-only (amendedFromId). Audit udit:lab_result.*.
  - GOAL-091 ✅ Laboratuvar isteği ve numune (tamamlandı — 2026-07-30, core: 473836, docs/i18n: bu commit). 7 endpoint (POST/GET list/GET :id/POST :id/collect/start/complete/cancel); state ordered→sample_collected→in_progress→completed|cancelled; 3 öncelik (routine/urgent/stat); specimenId + volumeMl opsiyonel; start cihaz adapter (Faz 14) üzerinden iş emri. Audit udit:lab_order.*. Sonuç (GOAL-092) complete ile veya sonradan.
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
  - GOAL-103 ⏳ partial — core: superadmin hata merkezi. Status
    yönetimi (new → investigating → resolved → reopened) +
    state machine validation (12 geçerli, geri kalan 422) +
    append-only status transition log (actorId/actorType/reason
    /occurredAt) + ErrorEvent alanları status + firstSeenAt +
    lastSeenAt + assignedToUserId + 4 yeni filtre (status,
    branchId, release, assignedToUserId) + 4 yeni endpoint
    (PATCH /:id/status, GET /:id/transitions, GET /groups, GET
    /groups/:fingerprint) + yeni hata kodu VET-ERRSTAT-0001
    (422) + otomatik resolved → reopened terfisi (yeni hata
    oluştuğunda sistem kaynaklı transition log'a yazar) +
    fingerprint grupları (severity/module/errorCode/status
    /assignedToUserId/eventCount/uniqueTenants/firstSeenAt/
    lastSeenAt toplu görünüm) + groups toGroup'da fingerprint
    filtresi düzeltildi (tüm tenant toplamı yerine sadece
    kendi fingerprint'inin kayıtları) + 50 yeni test
    (error-events 32 → 82: status+timestamp 4 + isValidTransition
    11 + updateErrorEventStatus 9 + listTransitions 4 +
    listErrorEventGroups 4 + getErrorEventGroup 3 + ek filtreler
    4 + 11 helper) + 1346/1346 api regresyon + tsc temiz.
    Mevcut permission: audit:log:read. Sonraki tick: docs/RAG
    chunk/i18n key parity + DB migration (Prisma) + atama/çözüm
    notları (GOAL-104) + güvenlik alarm kuralları (GOAL-105) +
    SUPERADMIN panel frontend (Next.js: hata listesi + grup +
    detay ekranı) + severity=kayıt kuralı konfigürabləşdirməsi
    + tenant bazlı hata filtresi iyileştirmesi.
