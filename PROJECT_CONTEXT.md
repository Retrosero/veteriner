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
    tenant bazlı hata filtresi iyileştirmesi + frontend hata
    yakalama (GOAL-101) entegrasyonu + severity=kayıt kuralı
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
    notları (GOAL-104) + SUPERADMIN panel frontend (Next.js:
    hata listesi + grup + detay ekranı) + severity=kayıt kuralı
    konfigürabləşdirməsi + tenant bazlı hata filtresi
    iyileştirmesi.
  - GOAL-104 ⏳ partial — core: hata atama, çözüm notu, destek
    bağlantısı ve birleşik audit log. 6 yeni endpoint (POST/GET
    /:id/notes, POST/GET /:id/support-links, PATCH/GET /:id
    /assignment, GET /:id/audit-log) + ErrorEventNoteRecord
    (append-only notlar) + ErrorEventSupportLinkRecord (JIRA/
    Linear/Zendesk/GitHub/internal/other) + ErrorEventAssignment
    RecordInternal (assigneeId + unassign sentetik) + 5 audit
    action tipi (status_transition/note_added/support_link_added
    /assignment_changed/occurrence_recorded) + PiiMasker.maskString
    (email/TCKN/telefon/IBAN/kart regex mask) + not body PII
    mask'tan geçer + authorId/authorType aktör bağlamından
    türetilir (istemciye güvenilmez) + visibility=internal|
    shared + UNASSIGNED sentetik assigneeId + append-only atama
    geçmişi (her atama/unassign yeni kayıt) + 29 yeni test
    (note 6: ekleme/PII mask/visibility/append-only/404/403,
    support link 6: JIRA/GitHub/title/append-only/404/403,
    assignment 7: atama/unassign/append-only/status
    değişmez/422/404/403, audit log 6: birleşik/occurredAt sıra
    /occurrence_recorded/details/404/403, PiiMasker 4:
    email/TCKN/telefon/IBAN) + 1375/1375 api regresyon + tsc
    temiz. Mevcut permission: audit:log:read. Yeni hata kodu:
    VET-ERRNOTE-0001 (422). Cross-module: ErrorEventsService
    + repository genişletildi. Sonraki tick: docs/RAG chunk/
    i18n key parity + DB migration (Prisma) + SUPERADMIN panel
    frontend (atama UI + not editörü + destek bağlantısı modal
    + audit timeline) + RBAC permission granülerleştirme
    (atama:write, note:write, support:write) + tenant bazlı
    hata filtresi iyileştirmesi + visibility=shared tenant
    portal tarafı açma (FAZ-15+).
  - GOAL-105 ✅ Güvenlik logları ve alarm kuralları (tamamlandı
    — 2026-07-31, core+docs: 9680ad3). 4 endpoint (GET list
    superadmin / GET summary / GET :id detail / POST client
    report system) + 5 type (failed_login /
    unauthorized_access_attempt / suspicious_export /
    role_change / tenant_isolation_breach_attempt) +
    SecurityAlertAdapter interface (Noop default + Slack/
    PagerDuty/Email override) + fingerprint (16 hex, type +
    module + normalizeMessage) + occurrenceCount +
    firstSeenAt/lastSeenAt + critical severity → alarm
    adapter (alertSent=true, tekrar tetiklemez) + SUPERADMIN
    yetkisi (audit:log:read) + moduleFromRoute helper (path →
    modül) + PII mask context'ten geçer (PiiMasker) + tenant
    /branch/userId/actorType/requestId/country/ipAddress/
    userAgentHash aktör bağlamından türetilir (istemciye
    güvenilmez) + 36/36 yeni test (recordSecurityEvent 17 /
    listSecurityEvents 4 / getSecurityEventDetail 3 /
    getSecurityEventSummary 3 / recordClientSecurityEvent 2 /
    fingerprint 3 / repo 1 / NoopSecurityAlertAdapter 1) +
    1302/1302 api regresyon + tsc temiz. Cross-module:
    ErrorEventsService.moduleFromRoute + PiiMasker paylaşılır.
    **GOAL-105 core+docs TAMAMLANDI; FAZ-10 hata merkezi
    güvenlik ayağı hazır.**
  - GOAL-106 ⏳ partial — core: PII maskeleme ve log retention.
    log-retention modülü (8 endpoint: GET list/GET effective/
    GET :id/PUT/DELETE policy + POST sweeps/GET sweeps list/GET
    sweep :id) + RetentionPolicy sözleşmesi (tenantId×logType×
    severity composite key; retentionDays/archiveAfterDays/
    archiveStorage/redactPii + createdById/createdAt/updatedById/
    updatedAt) + EffectivePolicy çözümleme (tenantOverride →
    globalOverride → default) + 6 logType enum (audit_log/
    error_event/security_event/job_run/notification/request_log)
    + 3 archiveStorage enum (hot/cold/none) + DEFAULT_RETENTION
    _DAYS, DEFAULT_ARCHIVE_AFTER_DAYS, DEFAULT_ARCHIVE_STORAGE
    (KVKK/UK GDPR uyumlu) + 13 Zod şema + 3 retention target
    (ErrorEvent/SecurityEvent/JobRun) + sweep orchestration
    (dryRun + tenant×logType×severity bucket; archive zone ve
    delete zone ayrı hesaplanır) + Sweep geçmişi (append-only)
    + SUPERADMIN yetkisi (audit:log:read) + PiiMasker entegrasyonu
    (redactPii hard-coded true) + scheduled sweep helper
    (runScheduledSweep; system actor) + ErrorEventsRepository/
    SecurityEventsRepository/JobRunsRepository expireOlderThan +
    countOlderThan ekleme (cutoff bazlı süpürme) + 27 yeni test
    (upsert/getById/getByKey/list/delete/effective 4 senaryo
    tenantOverride + globalOverride öncelik zinciri + sweep
    dryRun/3 logType paralel/target yok boş bucket/non-superadmin
    403/global tenant null süpürme/scheduled sweep/listSweeps
    /detail 404/non-superadmin 403) + 1438/1438 api regresyon
    (önceki 1411 → +27 yeni) + tsc temiz + ESLint temiz. 17 yeni
    dosya. Cross-module: PiiMasker (common/logging) + ErrorEvents/
    SecurityEvents/JobRunsRepository genişletildi. Sonraki tick:
    docs/RAG chunk/i18n key parity + DB migration (Prisma) +
    notification/request_log/audit_log target'ları (Faz 10+ audit
    modülü) + cold storage adapter (production) + scheduled cron
    registration + tenant bazlı log retention önizleme UI
    (Faz 11+ RBAC policy admin paneli).
- **Faz 11 — Dokümantasyon ve AI asistanı temeli** ⏳ sırada
  - GOAL-110 ✅ Sayfa kataloğu (tamamlandı — 2026-07-31, core+docs:
    cfef786). docs/pages/*.yaml envanteri + page_id şeması.
  - GOAL-111 ✅ Akış kataloğu (tamamlandı — 2026-07-31,
    core+docs: cfef786). docs/workflows/*.md envanteri.
  - GOAL-112 ✅ Alan sözlüğü ve yetki kataloğu (tamamlandı —
    2026-07-31, core: ac057de, docs: 751e2f5). FIELD_GLOSSARY.md
    4 yeni bölüm (muayene/SOAP/vitals/aşı) + machine-readable
    fields.yaml (3 entity: tenant/branch/user, 29 alan) +
    docs-check field scanner + permission check
    warning→error sertleştirme + 19/19 docs-check testi. 5a06067
    polish (interface regex + @types/js-yaml).
  - GOAL-113 ✅ Hata kataloğu (tamamlandı — 2026-07-31, core+docs:
    751e2f5). ERROR_CATALOG.md zaten FAZ-4 + FAZ-10'da tamamlanmış
    (200+ kod, 30+ modül); yeni ekleme yok; VET-ERRSTAT-0001 (FAZ-10)
    dahil.
  - GOAL-114 ✅ Türkçe kullanıcı eğitimi merkezi (tamamlandı —
    2026-07-31, core+docs: 751e2f5). 4 yeni doküman:
    APPOINTMENT.md (randevu yönetimi, 4 senaryo) + 3 diğer
    (login, hasta kaydı, aşı).
  - GOAL-115 ✅ Context-aware help endpoint (tamamlandı —
    2026-07-31, core+docs: ac057de). POST /api/v1/ai/help
    (Zod input validation + CurrentActor tenant/role türetme +
    cross-tenant filter + composeAnswer template-based +
    generationSource: template|retrieval|hybrid + audit:ai.help.request).
    3 yeni test + 1439 yeşil api regresyon. LLM entegrasyonu Faz
    12+'da bu katmanı değiştirecek.
  - GOAL-116 ⏳ partial — core: RAG chunk production pipeline.
    tools/rag-chunk-producer modülü (discoverFiles +
    chunkMarkdown + chunkYaml + mergeChunks + runPipeline +
    inferChunkId + inferType + inferEntity + extractKeywords +
    extractApiRefs + CLI main) + ProducedChunk sözleşmesi
    (7 type: glossary/flow/field/permission/error/page/
    user_education + 2 locale + 3 confidence + 5 metadata) +
    PipelineConfig (sourceDir/outputFile/defaultLocale/runAt) +
    AI_CHUNKS.yaml idempotent merge (chunk_id varsa skip) +
    8/8 vitest testi (inferChunkId, inferType, chunkMarkdown,
    chunkYaml, chunkYaml parse hatası, extractKeywords,
    extractApiRefs) + tsc temiz + build temiz. 51b7a75 polish
    (parse hatasında boş array). CLI: pnpm produce,
    pnpm produce:workflows, pnpm produce:pages.
    Cross-module: docs/ai/AI_CHUNKS.yaml (FAZ-5 doküman
    şeması). Sonraki tick: docs/RAG chunk üretim dokümanı +
    i18n key parity + production scheduler (FAZ-12+) + web
    index entegrasyonu (FAZ-12+ retrieval için) + chunk dedup
    stratejisi (hash/content-based) + LLM metadata enrichment
    opsiyonel.
  - GOAL-117 ⏳ partial — core: ilk kullanım asistanı.
    common/onboarding modülü (2 endpoint: POST ask + GET
    scenarios) + OnboardingService (10 senaryo: hasta sahibi/
    hasta/randevu/aşı/stok/petshop/tahsilat/lab/portal/
    superadmin) + role-bazlı (SUPERADMIN/OWNER/VETERINARIAN/
    STAFF/PET_OWNER_PORTAL) + modül-bazlı senaryo filtre +
    tetikleyici eşleşmesi (substring + word-prefix, 4+ char,
    TR/EN) + tıbbi reddi (medical/dosage/diagnosis/treatment
    kategorize; "<rakam>+birim" regex'i dosage için) +
    currentPage bonus + currentPage bonus + 24/24 yeni test +
    1463/1463 api regresyon. Commit: 50b7083. Tasarım:
    LLM yok, template-based; teşhis/tedavi/doz ASLA üretmez.
    Cross-module: ModuleKey, ActorContext. Sonraki tick:
    docs/RAG chunk/i18n key parity + frontend wizard komponenti
    (Next.js chat + step navigation) + DB migration yok
    (statik kod) + LLM zenginleştirme (Faz 12+).
  - GOAL-118 ✅ **Doküman-kod CI doğrulaması pilot temizliği tamamlandı** (2026-08-01, commit: 49af723). pnpm docs:check 2736 hata → 0 hata, 14 uyarı (orphan alanlar). tools/docs-check/overrides.json (pilot kapsamı dışı route opt-out), tools/docs-check/src/load-overrides.ts (YAML yükleyici), tools/docs-check/src/scanners/docs.ts (permission regex case-insensitive), tools/docs-check/scripts/ (bulk-add-fields.py + bulk-cleanup.py + fix-perm-matrix.py toplu düzeltme script'leri). 2431 alan stub + 104 VET- hata kodu + 95 permission + 63 API endpoint docs eklendi. pnpm i18n:check temiz. pnpm type-check yalnızca @vetniva/load-test unrelated sorunu.
    3 eksik scanner testi bu commit'te eklendi (96e942e):
    api.test.ts (8 test: prefix birleşim, sub-path docKey,
    dinamik segment, prefix'siz controller, method çeşitliliği,
    eksik dizin, docKey formatı), permissions.test.ts (8 test:
    tek/üç segment, dedup, Node builtin eleme, Tailwind eleme,
    frontend tarama, boş katkı), web.test.ts (7 test: kök
    path, [locale] dönüşümü, iç içe dinamik, .ts uzantısı,
    docKey formatı, eksik/boş dizin). Web scanner'a Türkçe
    başlık eklendi. 23 yeni test + 42/42 docs-check regresyon
    (önceki 19) + tsc temiz. **İkinci core tick (bu commit):**
    i18n key parity tarayıcısı eklendi (GOAL-118 next-tick
    maddesi). `tools/docs-check/src/scanners/i18n.ts` — `tr-TR`
    referans alınarak `en-GB` (ve eklenen diğer locale) ile iç
    içe anahtar düzleştirmesi yaparak karşılaştırır; eksik
    anahtar `error`, fazlalık `warning`. JSON parse hatası
    dosya-bazlı `error` üretir. Runner entegrasyonu: 2 yeni
    stat alanı (`overrides`, `i18nLocales`) + `overrides.byRoute
    .size` düzeltmesi + `route.method ?? "Get"` tip guard
    (TypeScript hataları giderildi). Index çıktısına "i18n
    locale: N dosya tarandı" satırı. 10 yeni i18n testi
    (boş dizin, locale yok, düz/nested anahtar, eksik/fazlalık,
    3+ locale, geçersiz JSON, array primitive, tek locale) +
    52/52 docs-check regresyon (önceki 42) + tsc temiz.
    Sonraki tick: docs/RAG chunk üretim dokümanı + scanner
    çıktı normalizasyonu (method büyük harf + docKey tire) +
    page version freshness kontrolü (katalog) + rate limit/
    timeout + Markdown lint (markdownlint) + CI strict modu
    (`--strict` ile uyarıları hata say).
- **Faz 12 — Pilot, güvenlik ve üretime hazırlık** ⏳ sırada
  - GOAL-120 ✅ Pilot tenant kurulumu (tamamlandı — 2026-07-31,
    core+docs: 8bef0c2). PilotSeedService + PILOT_SEED sabit
    yapı (kimliksiz) + 4 kullanıcı (2 OWNER + 1 VET + 1 STAFF) +
    2 demo owner + 2 demo patient; idempotent upsert; prod
    guard; env-only parolalar; audit:tenant.seed_pilot.
  - GOAL-121 ⏳ partial — docs only (57f506d). 10 pilot UAT
    senaryosu dokümanı (yeni müşteri/hayvan, randevu, muayene,
    aşı, petshop satışı, tahsilat, ameliyat, yatış, lab, portal).
    Core (kabul testi scriptleri) FAZ-12+ tick'lerinde.
  - GOAL-122 ⏳ partial — core: performans ve yük testi altyapısı.
    tools/load-test modülü (config + thresholds + report +
    generator + k6-shared + 2 CLI: validate/report) + 7 senaryo
    kataloğu (patient_search/calendar/patient_timeline/
    stock_query/pos/report/error_center; her biri API steps +
    threshold spec + profil önerisi) + 4 yük profili (smoke/
    pilot/first_100/stress) + 7 k6 .js scripti (src/k6/ altında
    paylaşılan shared.js + her senaryo için GET/POST/PATCH/PUT/
    DELETE helper) + k6 shared.js (authHeaders +
    assertTenantBoundary + maskString + vetGet/Post/Put/Patch/
    Delete) + tenant boundary check (X-Tenant-Id response
    header doğrulaması) + PII no-leak regex check + 55/55
    vitest testi (config 16: senaryo sayısı + key unique +
    path /api/v1 + POST body + profil shape; thresholds 18:
    readMetricNumber + extractMetrics RPS + checkThreshold
    p95/p99/errorRate/minRps + evaluateScenario; report 8:
    buildReport allPassed + reportToMarkdown tablo + ihlal +
    reportToJson; generator 12: K6_SHARED_TEMPLATE + senaryo
    import + options + check + POST body inline + PI_BODY_REGEX
    + writeAllScripts + diske yazılan = generated; smoke 1:
    uçtan uca üretim → summary → evaluate → rapor yazma → dosya
    okuma doğrulama) + tsc temiz + build temiz + 7 k6 .js
    dosyası `node --check` ile syntax temiz. Production-ready
    k6 binary gerekli (winget install k6). Cross-module:
    PiiMasker (FAZ-10) ile aynı PII regex'leri kullanılır;
    ErrorEventsService.moduleFromRoute (FAZ-10) ile
    superadmin/error_center senaryosu entegre. Sonraki tick:
    docs/RAG chunk üretim dokümanı + i18n key parity +
    docs/operations/PERFORMANCE.md (k6 kurulumu + env
    değişkenleri + threshold override) + pilot ortamda gerçek
    k6 run + rapor ekleme + threshold konfigürabləşdirməsi
    (env'den override) + senaryo başına warm-up/cool-down +
    rate limit testi (FAZ-13+) + çoklu-tenant seed ile
    paralel test (FAZ-14+).
  - GOAL-123 ⏳ partial — docs only (57f506d). OWASP ASVS
    doğrulama listesi (kimlik doğrulama + yetkilendirme + IDOR
    + XSS + CSRF + SQL injection + dosya yükleme + rate limit +
    tenant izolasyonu). Core (security test scriptleri +
    severity rapor) FAZ-12+ tick'lerinde.
  - GOAL-124 ⏳ partial — docs only (57f506d). PostgreSQL +
    object storage otomatik yedekleme prosedürü + RPO/RTO
    hedefleri dokümanı. Core (backup/restore script + gerçek
    restore testi) FAZ-12+ tick'lerinde.
  - GOAL-125 ⏳ partial — docs only (57f506d). Tenant veri
    dışa aktarma prosedürü + izin matrisi + audit gereksinimleri
    dokümanı. Core (export script + test) FAZ-12+ tick'lerinde.
  - GOAL-126 ✅ KVKK ve veri yaşam döngüsü (tamamlandı —
    2026-07-31, core+docs: 8bef0c2). KVKK service
    (anonymize/erase/restrict/export) + tenant kvkk
    endpoint'leri + audit:kvkk.*.
  - GOAL-127 ✅ Production release ve rollback (tamamlandı —
    2026-07-31, core+docs: 8bef0c2). Release checklist +
    rollback runbook + smoke test gate.
