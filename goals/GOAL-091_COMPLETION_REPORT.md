# GOAL-091 — Laboratuvar İsteği ve Numune (Completion Report)

## Faz

FAZ-9 (Laboratuvar)

## Özet

Lab order (LabOrder) yönetimi. State: ordered →
sample_collected → in_progress → completed/cancelled.
3 öncelik (routine/urgent/stat). Cihaz adapter (GOAL-094)
ile iş emri gönderimi (Faz 14).

## Çıktılar

### Core (GOAL-091 core commit `f473836`)

- `apps/api/src/modules/lab-orders/lab-orders.controller.ts` — 7
  endpoint.
- `apps/api/src/modules/lab-orders/lab-orders.service.ts` — state
  machine.
- `apps/api/src/modules/lab-orders/lab-orders.repository.ts` —
  tenant-scoped CRUD.
- `packages/contracts/src/lab-order.ts` — Zod şemaları.

### Endpoint'ler (7)

| #   | Method | Path                                      | Yetki                       |
| --- | ------ | ----------------------------------------- | --------------------------- |
| 1   | POST   | `/api/v1/clinic/lab-orders`               | `clinic:lab:order`          |
| 2   | GET    | `/api/v1/clinic/lab-orders`               | `clinic:lab:read`           |
| 3   | GET    | `/api/v1/clinic/lab-orders/{id}`          | `clinic:lab:read`           |
| 4   | POST   | `/api/v1/clinic/lab-orders/{id}/collect`  | `clinic:lab:collect_sample` |
| 5   | POST   | `/api/v1/clinic/lab-orders/{id}/start`    | `clinic:lab:order`          |
| 6   | POST   | `/api/v1/clinic/lab-orders/{id}/complete` | `clinic:lab:enter_result`   |
| 7   | POST   | `/api/v1/clinic/lab-orders/{id}/cancel`   | `clinic:lab:order`          |

### Döküman (bu commit)

- 7 API doc.
- `docs/ai/AI_CHUNKS.yaml` — yeni `flow-lab-order` chunk
  v1.0.0.

## İş Kuralları

- **State machine:** ordered → sample_collected →
  in_progress → completed | cancelled.
- **Priority:** routine (default) | urgent | stat.
- **Collect:** specimenId + volumeMl opsiyonel.
- **Start:** deviceId set edilirse cihaz adapter üzerinden
  iş emri (Faz 14).
- **Complete:** results[] opsiyonel (GOAL-092 LabResult).
- **Cancel:** reason zorunlu; numune alındıysa ek not.

## Audit

- `audit:lab_order.{create,collect,start,complete,cancel}`
  (info/warning).

## Tenant İzolasyonu

- Tüm CRUD tenant-scoped; SUPERADMIN bypass'lı.

## Yapılmayanlar / Bilinçli Atlamalar

- **Cihaz adapter gerçek entegrasyon** → Faz 14 GOAL-094.
- **Sonuç auto-fill (cihazdan)** → Faz 14+.
- **Barkod okuyucu (mobile)** → Faz 9+ UI.

## Döküman Uyum

- `pnpm docs:check` → pre-existing hatalar. **GOAL-091 özgü
  hata yok.**

## Testler

- `lab-orders.service.spec.ts` → unit testler (core).

## Sonraki Adımlar

- GOAL-092 (lab sonuçlar) docs.
- GOAL-093 (görüntüleme) docs.
- GOAL-094 (cihaz adapter) docs.

## Commit

- Core: `f473836` — `GOAL-091 laboratuvar isteği ve numune core`
- Docs/i18n: (bu commit) — `docs(lab-orders): GOAL-091 lab
istek/numune doküman ve i18n tamamla`
