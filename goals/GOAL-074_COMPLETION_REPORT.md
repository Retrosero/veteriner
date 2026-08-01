# GOAL-074 — Kasa ve Gün Sonu (Completion Report)

## Faz

FAZ-7 (Finans)

## Özet

Kasa session yönetimi: açma/kapatma/yeniden açma + hareketler
(tahsilat, ters kayıt, manuel) + özet. Tenant başına tek aktif
session. Faz 7 tahsilat (GOAL-072) + ters kayıt (GOAL-073)
otomatik hareket yaratır.

## Çıktılar

### Core (GOAL-074 core commit `d18d45a`)

- `apps/api/src/modules/cash-register/cash-register.controller.ts`
  — 8 endpoint.
- `apps/api/src/modules/cash-register/cash-register.service.ts`
  — açma/kapatma/yeniden açma + hareket hesabı.
- `apps/api/src/modules/cash-register/cash-register.repository.ts`
  — tenant-scoped CRUD + hareket ledger.
- `apps/api/src/modules/payments/kasa.repository.ts` — kasa
  etkisi (cross-module).
- `packages/contracts/src/cash-register.ts` — Zod şemaları.

### Endpoint'ler (8)

| #   | Method | Path                                            | Yetki                          |
| --- | ------ | ----------------------------------------------- | ------------------------------ |
| 1   | POST   | `/api/v1/cash-register/sessions`                | `cash_register:session:open`   |
| 2   | GET    | `/api/v1/cash-register/sessions`                | `cash_register:session:read`   |
| 3   | GET    | `/api/v1/cash-register/sessions/current`        | `cash_register:session:read`   |
| 4   | GET    | `/api/v1/cash-register/sessions/{id}`           | `cash_register:session:read`   |
| 5   | POST   | `/api/v1/cash-register/sessions/{id}/close`     | `cash_register:session:close`  |
| 6   | POST   | `/api/v1/cash-register/sessions/{id}/reopen`    | `cash_register:session:reopen` |
| 7   | GET    | `/api/v1/cash-register/sessions/{id}/movements` | `cash_register:movement:read`  |
| 8   | GET    | `/api/v1/cash-register/sessions/{id}/summary`   | `cash_register:session:read`   |

### Döküman (bu commit)

- 8 API doc.
- `docs/ai/AI_CHUNKS.yaml` — yeni `flow-cash-register` chunk
  v1.0.0.

## İş Kuralları

- **Açma:** `openingBalance` (Decimal) + `cashierId` + `currency`;
  aktif session varsa → 409 VET-CASH-0001.
- **Kapatma:** `actualBalance` zorunlu; `expectedBalance`
  otomatik; `difference = actual - expected`. Negatif fark
  için `notes` zorunlu (VET-CASH-0003).
- **Yeniden açma:** yüksek yetki; `reopenedAt` set; başka
  açık session varsa → 409.
- **Hareketler:** `payment` (in) + `payment_reversal` (out)
  - `manual` (in/out). Faz 7 tahsilat + ters kayıt
    otomatik.
- **Özet:** `expectedBalance = openingBalance + totalIn -
totalOut`. `actualBalance` yalnız kapalı session'larda.

## Audit

- `audit:cash_register.session.open` (info).
- `audit:cash_register.session.close` (info);
  `expectedBalance` + `actualBalance` + `difference` +
  `notes` payload.
- `audit:cash_register.session.reopen` (warning);
  `reason` + `previousStatus` payload.

## Tenant İzolasyonu

- Tüm CRUD tenant-scoped; SUPERADMIN bypass'lı.
- Cross-tenant sessionId → 404.

## Yapılmayanlar / Bilinçli Atlamalar

- **Session raporu export (PDF/CSV)** → Faz 8 UI.
- **Manuel giriş/çıkış endpoint'i** → Faz 7+ genişletme
  (mevcut repository + service, controller sonra).
- **Çoklu aktif session (tenant başına birden fazla
  kasa)** → Faz 9+ genişletme.

## Döküman Uyum

- `pnpm docs:check` → pre-existing hatalar. **GOAL-074 özgü
  hata yok.**

## Testler

- `cash-register.service.spec.ts` → unit testler (core).

## Sonraki Adımlar

- GOAL-075 (müşteri borç/alacak) docs.
- GOAL-076 (finans raporları) docs.
- GOAL-077 (e-SMM adapter) docs.

## Commit

- Core: `d18d45a` — `GOAL-074 + GOAL-083 core (partial): kasa/
gün sonu + operasyon notu`
- Docs/i18n: (bu commit) — `docs(cash-register): GOAL-074
kasa ve gün sonu doküman ve i18n tamamla`
