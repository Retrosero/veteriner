# GOAL-100 — Merkezi Backend Hata Yakalama (Completion Report)

## Faz

FAZ-10 (Hata merkezi, gözlemlenebilirlik)

## Özet

NestJS `AllExceptionsFilter` tarafından 5xx + critical
hataları tek bir `ErrorEvent` kaydında toplayan, fingerprint
ile gruplayan ve SUPERADMIN paneline açan merkezi backend
hata yakalama altyapısı.

## Çıktılar

### Core (GOAL-100 core commit `52880f8` + `9dc3d3f` + `de876ee`)

- `packages/contracts/src/error-event.ts` — Zod şemalar +
  enum'lar (37 modül, 4 status, 3 actorType, 3 country).
- `apps/api/src/common/error-events/error-event.types.ts` —
  Domain tipleri + record→public dönüşüm.
- `apps/api/src/modules/error-events/error-events.repository.ts`
  — In-memory Map (fingerprint index + transition log).
- `apps/api/src/modules/error-events/error-events.service.ts`
  — `recordError`, `listErrorEvents`, `getErrorEventDetail`,
  `listOccurrencesByFingerprint`, `getErrorEventSummary`,
  `recordClientError` + GOAL-103/104 metotları.
- `apps/api/src/modules/error-events/error-events.controller.ts`
  — 16 superadmin + 1 system endpoint.

### Endpoint'ler (16 superadmin + 1 system = 17)

| #   | Method | Path                                                         | Yetki            |
| --- | ------ | ------------------------------------------------------------ | ---------------- |
| 1   | GET    | `/api/v1/superadmin/error-events`                            | `audit:log:read` |
| 2   | GET    | `/api/v1/superadmin/error-events/summary`                    | `audit:log:read` |
| 3   | GET    | `/api/v1/superadmin/error-events/groups`                     | `audit:log:read` |
| 4   | GET    | `/api/v1/superadmin/error-events/groups/{fingerprint}`       | `audit:log:read` |
| 5   | GET    | `/api/v1/superadmin/error-events/fingerprints/{fingerprint}` | `audit:log:read` |
| 6   | GET    | `/api/v1/superadmin/error-events/{id}`                       | `audit:log:read` |
| 7   | GET    | `/api/v1/superadmin/error-events/{id}/transitions`           | `audit:log:read` |
| 8   | PATCH  | `/api/v1/superadmin/error-events/{id}/status`                | `audit:log:read` |
| 9   | GET    | `/api/v1/superadmin/error-events/{id}/notes`                 | `audit:log:read` |
| 10  | POST   | `/api/v1/superadmin/error-events/{id}/notes`                 | `audit:log:read` |
| 11  | GET    | `/api/v1/superadmin/error-events/{id}/support-links`         | `audit:log:read` |
| 12  | POST   | `/api/v1/superadmin/error-events/{id}/support-links`         | `audit:log:read` |
| 13  | PATCH  | `/api/v1/superadmin/error-events/{id}/assignment`            | `audit:log:read` |
| 14  | GET    | `/api/v1/superadmin/error-events/{id}/assignments`           | `audit:log:read` |
| 15  | GET    | `/api/v1/superadmin/error-events/{id}/audit-log`             | `audit:log:read` |
| 16  | POST   | `/api/v1/system/error-events`                                | oturum gerekli   |

### Döküman (bu commit)

- 16 API doc (docs/api/api._.error-events_.md).
- `docs/ai/AI_CHUNKS.yaml` — yeni `glossary-error-event`,
  `glossary-job-run`, `flow-error-capture`, `flow-error-status`,
  `flow-error-assignment`, `flow-client-error-report`,
  `flow-job-run` chunk'ları v1.0.0.
- `docs/pages/web.superadmin.locale.error-center.yaml` +
  `web.superadmin.locale.job-runs.yaml` — yeni sayfa kataloğu.
- `docs/errors/ERROR_CATALOG.md` — yeni `VET-ERRSTAT-0001`
  - `VET-AUDIT-0001/0002` anlam güncellemesi.
- `packages/i18n/{tr-TR,en-GB}.json` — yeni
  `VET-ERRSTAT-0001` i18n key parity.

## İş Kuralları

- **Fingerprint:** 16 hex (sha256) — `errorCode + module + normalizeMessage(message)`.
  Mesajdaki UUID/sayılar normalize edilir.
- **Occurrence:** Aynı fingerprint için mevcut kayıt varsa
  `occurrenceCount` artırılır, `lastSeenAt` güncellenir.
- **Status state machine (GOAL-103):** new → {investigating,
  resolved}; investigating → {resolved, new}; resolved →
  {reopened, investigating}; reopened → {investigating,
  resolved}. Geçersiz geçişlerde 422.
- **Otomatik reopened:** `resolved` durumdaki kayıt için
  yeni hata oluştuğunda sistem kaynaklı
  `resolved → reopened` terfisi (append-only transition log).
- **PII:** Context her zaman `PiiMasker`'dan geçirilir;
  `stack` yalnızca 5xx + critical için saklanır.
- **Modül tespiti:** `derivedModule` (test) → `input.module`
  (filter) → `moduleFromRoute(route)` (path).
- **Frontend raporu (GOAL-101):** İstemciden gelen
  `tenantId/branchId/userId/actorType/requestId` alanlarına
  güvenilmez; `ActorContext`'ten türetilir.
- **Audit:**
  `audit:error_event.status_change` (info),
  `audit:error_event.note_added` (info),
  `audit:error_event.support_link_added` (info),
  `audit:error_event.assignment_change` (info),
  `audit:error_event.client_report` (info).

## Yapılmayanlar / Bilinçli Atlamalar

- **Prisma migration** → Faz 10+ DB katmanı.
- **Sentry/OTel adapter** → Faz 12+ opsiyonel.
- **Rate-limit (token bucket per user)** → Faz 10+ performans.
- **Cross-correlation (ErrorEvents ↔ JobRuns)** → Faz 10+
  unified observability.

## Döküman Uyum

- `pnpm docs:check` → pre-existing hatalar. **GOAL-100/101/102/103/104 özgü hata yok** (16+8+1 API doc eklendi).
- `pnpm i18n:check` → temiz.

## Testler

- `error-events.service.spec.ts` → 82 test (recordError 6,
  listErrorEvents 5, getErrorEventDetail 3,
  listOccurrencesByFingerprint 3, getErrorEventSummary 5,
  updateErrorEventStatus 6, listErrorEventTransitions 4,
  listErrorEventGroups 7, getErrorEventGroup 3,
  recordClientError 10, addErrorEventNote 5,
  listErrorEventNotes 4, addErrorEventSupportLink 5,
  listErrorEventSupportLinks 4, assignErrorEvent 5,
  listErrorEventAssignments 4, listErrorEventAuditLog 6,
  moduleFromRoute 6, computeFingerprint 5, normalizeMessage 4).

## Commit

- Core: `52880f8` — `GOAL-100 merkezi backend hata yakalama core`
- Core 103: `9dc3d3f` — `GOAL-103 superadmin hata merkezi core`
- Core 104: `de876ee` — `GOAL-104 core: hata atama, çözüm notu, destek bağlantısı ve birleşik audit log`
- Docs: (bu commit) — `docs(error-events): GOAL-100/101/102/103/104 doküman ve i18n tamamla`
