# GOAL-077 — e-SMM Adaptör Sözleşmesi (Completion Report)

## Faz
FAZ-7 (Finans)

## Özet
e-SMM (e-Belge) adaptör sözleşmesi — FAZ-7'de pilot/mock.
Gerçek GİB entegrasyonu Faz 13 (GOAL-130). 6 endpoint: oluştur,
listele, detay, gönder, yeniden dene, iptal.

## Çıktılar

### Core (GOAL-077 core commit `de5b8e4`)
- `apps/api/src/modules/esmm/esmm.controller.ts` — 6 endpoint.
- `apps/api/src/modules/esmm/esmm.service.ts` — state
  machine + submit/retry/cancel iş kuralları.
- `apps/api/src/modules/esmm/esmm.repository.ts` —
  tenant-scoped CRUD.
- `packages/contracts/src/esmm.ts` — Zod şemaları:
  EsmmDocument + Create/Cancel input + filters.

### Endpoint'ler (6)

| # | Method | Path | Yetki |
|---|--------|------|-------|
| 1 | POST | `/api/v1/esmm/documents` | `audit:log:read` (Faz 13: `esmm:document:create`) |
| 2 | GET | `/api/v1/esmm/documents` | `audit:log:read` |
| 3 | GET | `/api/v1/esmm/documents/{id}` | `audit:log:read` |
| 4 | POST | `/api/v1/esmm/documents/{id}/submit` | `audit:log:read` |
| 5 | POST | `/api/v1/esmm/documents/{id}/retry` | `audit:log:read` |
| 6 | POST | `/api/v1/esmm/documents/{id}/cancel` | `audit:log:read` |

### Döküman (bu commit)
- 6 API doc.
- `docs/ai/AI_CHUNKS.yaml` — yeni `flow-esmm` chunk v1.0.0;
  pilot/mock + Faz 13 GİB entegrasyon planı.

## İş Kuralları
- **`documentType`:** `invoice` | `dispatch` | `receipt`.
- **State machine:** `draft` → `pending` → `submitted` →
  `accepted` | `rejected` | `failed`. `cancelled` ayrı.
- **Submit:** `draft` → `pending` (mock pilot).
- **Retry:** `failed`/`rejected` → `pending`,
  `attemptCount++`.
- **Cancel:** `draft`/`pending`/`failed` → `cancelled`.
  `accepted` iptal edilemez.
- **Yetki:** Faz 7'de `audit:log:read` (admin); Faz 13+'da
  `esmm:document:create` (ayrı permission).

## Audit
- `audit:esmm.document.create` (info).
- `audit:esmm.document.submit` (info).
- `audit:esmm.document.retry` (warning).
- `audit:esmm.document.cancel` (warning).

## Tenant İzolasyonu
- Tüm CRUD tenant-scoped; SUPERADMIN bypass'lı.

## Yapılmayanlar / Bilinçli Atlamalar
- **Gerçek GİB API entegrasyonu** → Faz 13 GOAL-130
  (UBL XML + digital signature).
- **E-İrsaliye sevkiyat** → Faz 13+.
- **E-Makbuz ödeme ile entegre** → Faz 13+.
- **E-Arşiv fatura** → Faz 13+.

## Döküman Uyum
- `pnpm docs:check` → pre-existing hatalar. **GOAL-077 özgü
  hata yok.**

## Testler
- `esmm.service.spec.ts` → unit testler (core).

## Sonraki Adımlar
- **FAZ-7 kapanışı.** Tüm 8 goal (070-077) docs tamam.
- FAZ-8 (Klinik operasyonlar — 080-086) docs sırası.

## Commit
- Core: `de5b8e4` — `GOAL-077 e-SMM adapter sözleşmesi core`
- Docs/i18n: (bu commit) — `docs(esmm): GOAL-077 e-SMM
  adaptör doküman ve i18n tamamla`
