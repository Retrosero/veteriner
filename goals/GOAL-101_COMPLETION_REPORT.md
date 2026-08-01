# GOAL-101 — Frontend Hata Yakalama (Completion Report)

## Faz

FAZ-10 (Hata merkezi)

## Özet

Next.js runtime, API ve kullanıcı arayüzü hatalarını
merkezi sisteme gönderen frontend hata yakalama altyapısı.
Hata olayları backend `request_id` ile ilişkilendirilir;
hassas form verileri gönderilmez (PII mask).

## Çıktılar

### Core (GOAL-101 core commit `ee49700` + paralel)

- `apps/web/src/lib/error-reporter.ts` — PII sanitizer
  (email/TCKN/telefon/CC), maxQueueSize 50, dedup window
  1 sn, flush interval 2 sn, sendBeacon sayfa unload.
- `apps/web/src/lib/error-reporter.test.ts` — 24 unit test.
- `apps/web/src/lib/api-error-integration.ts` — apiRequest
  failure otomatik raporlama; severity mapping
  5xx→error, 4xx→warning.
- `apps/web/src/lib/api-error-integration.test.ts` — 9 test.
- `apps/web/src/app/[locale]/error.tsx` + `global-error.tsx` —
  Next.js error boundary (route + global).
- `apps/api/src/modules/error-events/error-events.service.ts`
  → `recordClientError` — `ActorContext`'ten
  tenant/branch/userId/actorType türetir; istemciye güvenmez.
- `apps/api/src/modules/error-events/error-events.controller.ts`
  → `SystemErrorEventsController` — `POST /api/v1/system/error-events`.
- `packages/contracts/src/error-event.ts` →
  `clientErrorReportInputSchema` + `clientErrorReportResponseSchema`.

### Döküman (bu commit)

- 1 API doc (`docs/api/api.post._api_v1_system_error-events.md`).
- `docs/ai/AI_CHUNKS.yaml` — yeni `flow-client-error-report`
  chunk'ı v1.0.0.

## İş Kuralları

- **PII mask:** Email/TCKN/telefon/CC otomatik mask'lenir.
- **Dedup:** 1 saniyelik pencere içinde aynı hata tekrar
  gönderilmez.
- **Severity mapping:** 5xx→error, 4xx→warning (default).
- **Backend türetme:** `tenantId/branchId/userId/actorType/
requestId` istemciden alınmaz; `ActorContext`'ten türetilir
  (impersonation saldırısına karşı).
- **Auth placeholder:** Tüm oturum açmış kullanıcılar
  (personel + portal) gönderebilir; gerçek auth devreye
  girdiğinde JWT/session doğrulaması `ActorContextService`
  üzerinden otomatik sağlanır.
- **SendBeacon:** Sayfa unload'ında senkron flush yapar;
  `navigator` yoksa atlanır.
- **No-throw guarantee:** Reporter hiçbir koşulda throw etmez.
- **Audit:** `audit:error_event.client_report` (info).

## Yapılmayanlar / Bilinçli Atlamalar

- **`instrumentation.ts` global unhandledrejection hook** →
  Faz 10+ polish.
- **Sentry/OTel adapter** → Faz 12+ opsiyonel.
- **Rate-limit (token bucket per user)** → Faz 10+ performans.
- **Retry/backoff** → Faz 10+ performans.

## Döküman Uyum

- `pnpm docs:check` → temiz.
- `pnpm i18n:check` → temiz.

## Testler

- `error-reporter.test.ts` → 24 unit test.
- `api-error-integration.test.ts` → 9 unit test.
- Error boundary testleri → 8 test (4+4).
- `error-events.service.spec.ts` → 10 yeni
  `recordClientError` testi (tenant/branch/userId türetme,
  default errorCode, actorType portal_user, info/critical
  stack, PII mask'lı context, occurredAt/release override).
- Toplam frontend regresyon: 46/46 yeşil.

## Commit

- Core: `ee49700` — `GOAL-101 core: frontend hata yakalama altyapısı`
- Docs: (bu commit) — `docs(error-events): GOAL-100/101/102/103/104 doküman ve i18n tamamla`
