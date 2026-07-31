# GOAL-103 — Superadmin Hata Merkezi (Completion Report)

## Faz
FAZ-10 (Hata merkezi)

## Özet
SUPERADMIN hata merkezi: status yönetimi (state machine),
fingerprint grupları, status transition log. 4 yeni endpoint
ile birlikte toplam 16 superadmin endpoint.

## Çıktılar

### Core (GOAL-103 core commit `9dc3d3f`)
- `packages/contracts/src/error-event.ts`:
  - `errorEventStatusSchema` enum (new | investigating |
    resolved | reopened).
  - `errorEventStatusTransitionSchema` (append-only audit log).
  - `errorEventFiltersSchema` — yeni `status` ve
    `assignedToUserId` filtreleri.
- `apps/api/src/common/error-events/error-event.types.ts`:
  - `ErrorEventRecord.status`, `firstSeenAt`, `lastSeenAt`,
    `assignedToUserId` alanları.
  - `ErrorEventStatusTransitionRecord` + `toErrorEventStatusTransition`.
- `apps/api/src/modules/error-events/error-events.repository.ts`:
  - `transitionsByFingerprint` Map.
  - `updateStatus()` (state machine guard + append-only).
  - `search()` filtresine `status`, `branchId`, `release`,
    `assignedToUserId` eklendi.
- `apps/api/src/modules/error-events/error-events.service.ts`:
  - `isValidTransition()` (state machine).
  - `updateErrorEventStatus()` (state machine doğrulaması +
    transition log + opsiyonel atama).
  - `listErrorEventTransitions()` (fingerprint bazlı tüm
    geçişler, append-only).
  - `listErrorEventGroups()` / `getErrorEventGroup()`
    (fingerprint grupları; occurrenceCount DESC).
  - Otomatik `resolved → reopened` terfisi.
- `apps/api/src/modules/error-events/error-events.controller.ts`:
  - 4 yeni endpoint: `PATCH /:id/status`,
    `GET /:id/transitions`, `GET /groups`, `GET /groups/:fp`.

### Döküman (bu commit)
- 4 yeni API doc (`api.patch._api_v1_superadmin_error-events__id_status.md`,
  `api.get._api_v1_superadmin_error-events__id_transitions.md`,
  `api.get._api_v1_superadmin_error-events_groups.md`,
  `api.get._api_v1_superadmin_error-events_groups__fingerprint.md`).
- `docs/ai/AI_CHUNKS.yaml` — yeni `flow-error-status` chunk'ı
  v1.0.0.
- `docs/errors/ERROR_CATALOG.md` + `packages/i18n/...json` —
  yeni `VET-ERRSTAT-0001` (geçersiz durum geçişi, 422).

## İş Kuralları
- **State machine:** new → {investigating, resolved};
  investigating → {resolved, new}; resolved → {reopened,
  investigating}; reopened → {investigating, resolved}.
- **Geçersiz geçiş:** 422 `VET-ERRSTAT-0001`.
- **Otomatik terfi:** `resolved` durumdaki kayıt için yeni
  hata oluştuğunda (fingerprint tekrarı) otomatik
  `resolved → reopened` terfisi; `actorId='system'`,
  append-only transition log.
- **Atama:** `assignedToUserId` opsiyonel; `clearAssignment=true`
  ile atama kaldırma.
- **Audit:** `audit:error_event.status_change` (info).

## Yapılmayanlar / Bilinçli Atlamalar
- **Frontend (Next.js SUPERADMIN paneli)** → Faz 10+ polish.
- **Atama + çözüm notu endpoint'leri (GOAL-104)** → ayrı goal.
- **Bildirim/email escalation** → Faz 10+ alarm.

## Döküman Uyum
- `pnpm docs:check` → temiz.
- `pnpm i18n:check` → temiz.

## Testler
- `error-events.service.spec.ts` → 32 → 50 yeni test
  (state machine guard, otomatik terfi, transition log,
  fingerprint grupları, atama).
- Full api regresyon: 1306 → 1346 yeşil, 9 skipped, 0 hata.

## Commit
- Core: `9dc3d3f` — `GOAL-103 superadmin hata merkezi core`
- Docs: (bu commit) — `docs(error-events): GOAL-100/101/102/103/104 doküman ve i18n tamamla`
