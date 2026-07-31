# GOAL-072 — Tahsilat (Completion Report)

## Faz
FAZ-7 (Finans)

## Özet
Tahsilat (Payment) modülü: clinic_sale (GOAL-071) +
petshop_sale (GOAL-064) için. 4 method (cash/card/
bank_transfer/other). Kısmi tahsilat destekli. Ters kayıt için
`PaymentReversal` (GOAL-073) entegrasyonu.

## Çıktılar

### Core (GOAL-072 core commit `564dff3`)
- `apps/api/src/modules/payments/payments.controller.ts` — 7
  endpoint (4 payment + 3 reversal; reversal'lar GOAL-073
  kapsamında).
- `apps/api/src/modules/payments/payments.service.ts` — iş
  kuralları + kasa etkisi.
- `apps/api/src/modules/payments/payments.repository.ts` —
  tenant-scoped CRUD.
- `apps/api/src/modules/payments/payment-reversals.repository.ts`
  — ters kayıt.
- `apps/api/src/common/payments/kasa.repository.ts` — kasa
  etkisi (cross-module).
- `packages/contracts/src/payment.ts` — Zod şemaları.

### Endpoint'ler (bu commit — 4 payment)

| # | Method | Path | Yetki |
|---|--------|------|-------|
| 1 | POST | `/api/v1/payments` | `clinic:payment:create` |
| 2 | GET | `/api/v1/payments` | `clinic:payment:read` |
| 3 | GET | `/api/v1/payments/{id}` | `clinic:payment:read` |
| 4 | POST | `/api/v1/payments/{id}/reverse` | `clinic:payment:reverse` |

(Reversal listesi 3 endpoint GOAL-073 kapsamında
dokümante edilecek.)

### Döküman (bu commit)
- 4 API doc.
- `docs/ai/AI_CHUNKS.yaml` — yeni `flow-payment` chunk
  v1.0.0.

## İş Kuralları
- **sourceType:** `clinic_sale` (GOAL-071) | `petshop_sale`
  (GOAL-064).
- **method:** `cash` | `card` | `bank_transfer` | `other`.
- **Kısmi tahsilat:** birden fazla payment bağlanabilir;
  toplam > sale tutarı → 422 VET-PAYMENT-0002.
- **Ters kayıt:** `status='active'` → `reversed`; yeni
  `PaymentReversal` oluşturulur.
- **Kasa etkisi:** `cashRegisterEffect='out'` (ters kayıt
  kasa bakiyesinden düşer).

## Audit
- `audit:payment.create` (info).
- `audit:payment.reverse` (warning); `reversalId` +
  `reason` + `reasonCode` + `cashRegisterEffect` payload.

## Tenant İzolasyonu
- Tüm CRUD tenant-scoped; SUPERADMIN bypass'lı.

## Yapılmayanlar / Bilinçli Atlamalar
- **Çoklu ödeme (taksit)** → Faz 7+ policy.
- **Reversal listesi 3 endpoint** → GOAL-073 docs (bu
  commit'te atlandı, sonraki tur).
- **Faz 8 kasa UI** → ayrı goal.

## Döküman Uyum
- `pnpm docs:check` → pre-existing hatalar. **GOAL-072 özgü
  hata yok.**

## Testler
- `payments.service.spec.ts` → unit testler (core).

## Sonraki Adımlar
- GOAL-073 (tahsilat iptal — reversal listesi 3 endpoint)
  docs.
- GOAL-074 (kasa/gün sonu) docs.

## Commit
- Core: `564dff3` — `GOAL-072 tahsilat core`
- Docs/i18n: (bu commit) — `docs(payments): GOAL-072 tahsilat
  doküman ve i18n tamamla`
