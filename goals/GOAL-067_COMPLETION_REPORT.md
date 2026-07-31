# GOAL-067 — Düşük Stok ve SKT Uyarıları (Completion Report)

## Faz
FAZ-6 (Klinik + petshop ortak stok/petshop)

## Özet
Düşük stok ve SKT lot uyarıları. 3 severity (warning/critical/
expired). Atomik hesaplama (`StockMovement` ledger + Product
`reorderLevel`/`minStockLevel`). Acknowledge idempotent.

## Çıktılar

### Core (GOAL-067 core commit `d6765df`)
- `apps/api/src/modules/stock-alerts/stock-alerts.controller.ts`
  — 6 endpoint (GET low-stock, GET expiring-lots, POST
  refresh, GET summary, POST low-stock/:id/acknowledge,
  POST expiring-lots/:id/acknowledge).
- `apps/api/src/modules/stock-alerts/stock-alerts.service.ts`
  — severity hesaplama + idempotent ack.
- `apps/api/src/modules/stock-alerts/stock-alert-acks.repository.ts`
  — ack state.
- `packages/contracts/src/stock-alert.ts` — Zod şemaları.

### Endpoint'ler (6)

| # | Method | Path | Yetki |
|---|--------|------|-------|
| 1 | GET | `/api/v1/inventory/stock-alerts/low-stock` | `inventory:stock_alert:read` |
| 2 | GET | `/api/v1/inventory/stock-alerts/expiring-lots` | `inventory:stock_alert:read` |
| 3 | POST | `/api/v1/inventory/stock-alerts/refresh` | `inventory:stock_alert:read` |
| 4 | GET | `/api/v1/inventory/stock-alerts/summary` | `inventory:stock_alert:read` |
| 5 | POST | `/api/v1/inventory/stock-alerts/low-stock/{productId}/acknowledge` | `inventory:stock_alert:acknowledge` |
| 6 | POST | `/api/v1/inventory/stock-alerts/expiring-lots/{lotId}/acknowledge` | `inventory:stock_alert:acknowledge` |

### Döküman (bu commit)
- 6 API doc.
- `docs/ai/AI_CHUNKS.yaml` — yeni `flow-stock-alert` chunk
  v1.0.0.

## İş Kuralları
- **Düşük stok severity:**
  - `warning`: `qty > 0` ve `<= reorderLevel`.
  - `critical`: `qty <= minStockLevel` veya `qty <= 0`.
- **SKT severity:**
  - `warning`: 8-30 gün.
  - `critical`: 1-7 gün.
  - `expired`: `≤ 0` gün.
- **Acknowledge idempotent:** bir ürün/lot için 1 aktif ack;
  mevcut `acknowledgedAt` korunur.
- **Refresh idempotent:** ack durumları korunur.
- **Hesaplama:** `StockMovement` ledger'ından atomik
  bakiye (her sorguda yeniden).

## Audit
- `audit:stock_alert.refresh` (info).
- `audit:stock_alert.low_stock.acknowledge` (info).
- `audit:stock_alert.expiring_lot.acknowledge` (info).

## Tenant İzolasyonu
- Tüm sorgular tenant-scoped; SUPERADMIN bypass'lı.
- Cross-tenant productId/lotId → 404.

## Yapılmayanlar / Bilinçli Atlamalar
- **SMS/email/in-app dispatch** → Faz 7+ notification.
- **Dashboard kartları (reaktif)** → Faz 8 React UI.
- **Otomatik refresh cron** → Faz 10 BullMQ.
- **Çoklu ack (team ack)** → sonraki refactor.

## Döküman Uyum
- `pnpm docs:check` → pre-existing hatalar. **GOAL-067 özgü
  hata yok.**

## Testler
- `stock-alerts.service.spec.ts` → unit testler (core).
- `fix(goal-067): acknowledge idempotent` commit'i mevcut
  acknowledgedAt koruma davranışını pekiştirir.

## Sonraki Adımlar
- **FAZ-6 kapanışı.** Tüm 8 goal (060-067) docs tamam.
- FAZ-7 (Finans — 070-077) docs sırası.

## Commit
- Core: `d6765df` — `feat(goal-067): düşük stok ve SKT
  uyarıları core`
- Fix: `690ba90` — `fix(goal-067): acknowledge idempotent`
- Docs/i18n: (bu commit) — `docs(stock-alerts): GOAL-067
  düşük stok + SKT uyarıları doküman ve i18n tamamla`
