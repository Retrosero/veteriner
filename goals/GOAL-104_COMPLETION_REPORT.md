# GOAL-104 — Hata Atama ve Zaman Notları (Completion Report)

## Faz

FAZ-10 (Hata merkezi)

## Özet

SUPERADMIN hata merkezi için: geliştirici/sorumlu ataması,
çözüm notu (append-only), destek kaydı bağlantısı (JIRA/
Linear/Zendesk/GitHub) ve birleşik audit log. 7 yeni endpoint
ile birlikte toplam 16 superadmin endpoint.

## Çıktılar

### Core (GOAL-104 core commit `de876ee`)

- `packages/contracts/src/error-event.ts`:
  - `errorEventNoteSchema` + `errorEventNoteCreateInputSchema`
    (visibility: internal | shared).
  - `errorEventSupportLinkSchema` + `errorEventSupportLinkInputSchema`
    (system: jira | linear | zendesk | github | other).
  - `errorEventAssignmentSchema` + `errorEventAssignmentInputSchema`
    (assigneeId veya unassign=true).
  - `errorEventAuditLogSchema` (birleşik timeline; action
    discriminator).
- `apps/api/src/common/error-events/error-event.types.ts`:
  - `ErrorEventNoteRecord`, `ErrorEventSupportLinkRecord`,
    `ErrorEventAssignmentRecord` + to* dönüşümleri.
- `apps/api/src/modules/error-events/error-events.repository.ts`:
  - `notesByFingerprint`, `supportLinksByFingerprint`,
    `assignmentsByFingerprint` Map'leri.
- `apps/api/src/modules/error-events/error-events.service.ts`:
  - `addErrorEventNote` / `listErrorEventNotes` (PII mask'lı body).
  - `addErrorEventSupportLink` / `listErrorEventSupportLinks`
    (en az bir alan zorunlu).
  - `assignErrorEvent` / `listErrorEventAssignments`
    (assigneeId veya unassign=true; append-only).
  - `listErrorEventAuditLog` (tüm aksiyonları occurredAt
    artan sırada birleşik timeline).
- `apps/api/src/modules/error-events/error-events.controller.ts`:
  - 7 yeni endpoint: `GET/POST /:id/notes`,
    `GET/POST /:id/support-links`, `PATCH /:id/assignment`,
    `GET /:id/assignments`, `GET /:id/audit-log`.

### Döküman (bu commit)

- 7 yeni API doc (notes, support-links, assignment, assignments,
  audit-log).
- `docs/ai/AI_CHUNKS.yaml` — yeni `flow-error-assignment`
  chunk'ı v1.0.0.

## İş Kuralları

- **Çözüm notu (append-only):** Silinemez veya düzeltilemez;
  düzeltme yeni not ile yapılır. `body` PII mask'lı.
- **Visibility:** `internal` (yalnızca SUPERADMIN) | `shared`
  (FAZ-12+'da tenant yöneticileriyle paylaşım için rezerve).
- **Destek bağlantısı:** system, externalId, url, title
  alanlarından en az biri zorunlu.
- **Atama:** `assigneeId` ile atama; `unassign=true` ile
  atama kaldırma. Status değiştirmez; salt atama aksiyonu
  izlenir.
- **Birleşik audit log:** Tüm aksiyonlar (status transition
  - not + destek bağlantısı + atama + occurrence_recorded)
    occurredAt artan sırada; UI `action` discriminator'ı ile
    render eder.
- **Audit:**
  `audit:error_event.note_added` (info),
  `audit:error_event.support_link_added` (info),
  `audit:error_event.assignment_change` (info).

## Yapılmayanlar / Bilinçli Atlamalar

- **Tenant yöneticileriyle paylaşım** (`visibility=shared`)
  → Faz 12+ (GOAL-125 tenant export kapsamında).
- **Email/Slack bildirimleri (assignment_change)** → Faz 10+
  alarm.
- **Atama SLA (örn. 24 saat sonra otomatik hatırlatma)** →
  Faz 10+ ops.

## Döküman Uyum

- `pnpm docs:check` → temiz.
- `pnpm i18n:check` → temiz.

## Testler

- `error-events.service.spec.ts` → 32 yeni test
  (addErrorEventNote 5, listErrorEventNotes 4,
  addErrorEventSupportLink 5, listErrorEventSupportLinks 4,
  assignErrorEvent 5, listErrorEventAssignments 4,
  listErrorEventAuditLog 6, PII mask doğrulamaları).
- Toplam error-events: 50 → 82 test.
- Full api regresyon: 1346 → 1378 yeşil, 9 skipped, 0 hata.

## Commit

- Core: `de876ee` — `GOAL-104 core: hata atama, çözüm notu, destek bağlantısı ve birleşik audit log`
- Docs: (bu commit) — `docs(error-events): GOAL-100/101/102/103/104 doküman ve i18n tamamla`
