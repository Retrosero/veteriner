# GOAL-073 — Tahsilat İptal ve Ters Kayıt (Completion Report)

## Faz

FAZ-7 (Finans)

## Özet

Tahsilat ters kayıt akışı (PaymentReversal) tamamlandı. 5
`reasonCode` (refund/customer_request/error/duplicate/other);
çoklu ters kayıt destekli (kısmi düzeltme). Kasa etkisi
`out` (Faz 7 kasa ile entegre).

## Çıktılar

### Core (GOAL-073 core commit `d18d45a`)

- `apps/api/src/modules/payments/payments.controller.ts` —
  3 reversal endpoint (GET reversals list, GET reversals
  :id, GET :id/reversals/summary).
- `apps/api/src/modules/payments/payments.service.ts` —
  reversal iş kuralları (mevcut method'lara ek).
- `apps/api/src/modules/payments/payment-reversals.repository.ts`
  — tenant-scoped CRUD.
- `packages/contracts/src/payment.ts` — Zod şemaları:
  `PaymentReversal` + `PaymentReversalCreateInput` +
  `PaymentReversalFilters` + `PaymentReversalSummary`.

### Endpoint'ler (3)

| #   | Method | Path                                      | Yetki                 |
| --- | ------ | ----------------------------------------- | --------------------- |
| 1   | GET    | `/api/v1/payments/reversals`              | `clinic:payment:read` |
| 2   | GET    | `/api/v1/payments/reversals/{reversalId}` | `clinic:payment:read` |
| 3   | GET    | `/api/v1/payments/{id}/reversals/summary` | `clinic:payment:read` |

(Ters kayıt oluşturma: `POST /api/v1/payments/{id}/reverse`
GOAL-072 kapsamında.)

### Döküman (bu commit)

- 3 API doc.
- `docs/ai/AI_CHUNKS.yaml` — yeni `flow-payment-reversal`
  chunk v1.0.0; çoklu ters kayıt + kasa etkisi + Faz 7
  entegrasyonu.

## İş Kuralları

- **Reason code:** 5 enum.
- **Çoklu ters kayıt:** bir payment'a birden fazla reversal;
  toplam `totalReversed <= paymentAmount` (özet endpoint).
- **Kasa etkisi:** `cashRegisterEffect='out'` (ters kayıt
  kasa bakiyesinden düşer; Faz 7 kasa).
- **Audit:** `audit:payment.reverse` (warning); `reason` +
  `reasonCode` + `cashRegisterEffect` payload.

## Tenant İzolasyonu

- Tüm sorgular tenant-scoped; SUPERADMIN bypass'lı.

## Yapılmayanlar / Bilinçli Atlamalar

- **Müşteri bakiyesi (credit refund)** → Faz 7+ GOAL-075.
- **Kısmi ters kayıt + yeniden tahsilat** → Faz 7+ policy.
- **Reversal approval (OWNER onayı)** → mevcut tek aşamalı.

## Döküman Uyum

- `pnpm docs:check` → pre-existing hatalar. **GOAL-073 özgü
  hata yok.**

## Testler

- `payments.service.spec.ts` → unit testler (mevcut + yeni
  reversal testleri).

## Sonraki Adımlar

- GOAL-074 (kasa/gün sonu) docs.
- GOAL-075 (müşteri borç/alacak) docs.

## Commit

- Core: `d18d45a` — `GOAL-074 + GOAL-083 core (partial): kasa/
gün sonu + operasyon notu` (GOAL-073 + GOAL-074 aynı
  commit'te core'landı; bu docs commit yalnız GOAL-073
  reversal endpoint'lerini kapsar).
- Docs/i18n: (bu commit) — `docs(payments): GOAL-073
tahsilat iptal doküman ve i18n tamamla`
