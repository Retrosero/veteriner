# GOAL-086 — Gözlem ve Taburcu Özeti (Completion Report)

## Faz

FAZ-8 (Klinik operasyonlar)

## Özet

Yatış gözlemleri (4 kategori) + taburcu özeti
(DischargeSummary). State: draft → finalized → amended
(append-only). Portal paylaşım (sınırlı süreli token).
Yatış (GOAL-084) entegre.

## Çıktılar

### Core (GOAL-086 core commit `fe2f1c6`)

- `apps/api/src/modules/discharge-summaries/discharge-summaries.controller.ts` — 8
  endpoint.
- `apps/api/src/modules/discharge-summaries/discharge-summaries.service.ts`
  — observation + discharge summary state machine.
- `apps/api/src/modules/discharge-summaries/discharge-summaries.repository.ts`
  — tenant-scoped CRUD.
- `packages/contracts/src/discharge-summary.ts` — Zod şemaları.

### Endpoint'ler (8)

| #   | Method | Path                                                                                 | Yetki                              |
| --- | ------ | ------------------------------------------------------------------------------------ | ---------------------------------- |
| 1   | POST   | `/api/v1/clinic/hospitalizations/{hospitalizationId}/observations`                   | `clinic:hospitalization:add_note`  |
| 2   | GET    | `/api/v1/clinic/hospitalizations/{hospitalizationId}/observations`                   | `clinic:hospitalization:read`      |
| 3   | POST   | `/api/v1/clinic/hospitalizations/{hospitalizationId}/discharge-summary`              | `clinic:hospitalization:discharge` |
| 4   | GET    | `/api/v1/clinic/hospitalizations/{hospitalizationId}/discharge-summary`              | `clinic:hospitalization:read`      |
| 5   | PATCH  | `/api/v1/clinic/hospitalizations/{hospitalizationId}/discharge-summary`              | `clinic:hospitalization:discharge` |
| 6   | POST   | `/api/v1/clinic/hospitalizations/{hospitalizationId}/discharge-summary/finalize`     | `clinic:hospitalization:discharge` |
| 7   | POST   | `/api/v1/clinic/hospitalizations/{hospitalizationId}/discharge-summary/amend`        | `clinic:hospitalization:discharge` |
| 8   | POST   | `/api/v1/clinic/hospitalizations/{hospitalizationId}/discharge-summary/portal-share` | `clinic:hospitalization:discharge` |

### Döküman (bu commit)

- 8 API doc.
- `docs/ai/AI_CHUNKS.yaml` — yeni `flow-discharge-summary`
  chunk v1.0.0.

## İş Kuralları

- **Observation category:** vitals | intake_output |
  behavior | general.
- **DischargeSummary state:** draft → finalized → amended.
- **Finalize sonrası:** değişiklik `amend` ile
  (append-only).
- **Portal share:** sınırlı süreli token (default 30 gün);
  KVKK uyumlu UUID v4 opaque.
- **Audit:** `audit:observation.create` +
  `audit:discharge_summary.*`.

## Tenant İzolasyonu

- Tüm CRUD tenant-scoped; SUPERADMIN bypass'lı.

## Yapılmayanlar / Bilinçli Atlamalar

- **SMS/email provider** → Faz 10 (notification).
- **Portal revoke (share iptali)** → sonraki refactor.
- **Gözlem template (preset kategori)** → Faz 8+ UI.

## Döküman Uyum

- `pnpm docs:check` → pre-existing hatalar. **GOAL-086 özgü
  hata yok.**

## Testler

- `discharge-summaries.service.spec.ts` → unit testler (core).

## Sonraki Adımlar

- **FAZ-8 kapanışı.** Tüm 7 goal (080-086) docs tamam.
- FAZ-9 (Laboratuvar, 090-094) docs sırası.

## Commit

- Core: `fe2f1c6` — `GOAL-086 gözlem ve taburcu özeti core`
- Docs/i18n: (bu commit) — `docs(discharge-summaries):
GOAL-086 gözlem ve taburcu doküman ve i18n tamamla + FAZ-8
kapanışı`
