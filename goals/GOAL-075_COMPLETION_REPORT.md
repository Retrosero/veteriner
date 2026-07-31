# GOAL-075 — Müşteri Borç ve Alacak Görünümü (Completion Report)

## Faz
FAZ-7 (Finans)

## Özet
Müşteri (owner) bazlı borç/alacak görünümü: net bakiye +
transaction listesi. Atomic sorgu (cache'lenmez); Faz 7
tahsilat + ters kayıt + petshop refund credit + manuel
hareketler dahil.

## Çıktılar

### Core (GOAL-075 core commit `903870b`)
- `apps/api/src/modules/customer-balances/customer-balances.controller.ts`
  — 2 endpoint (GET owner balance, GET owner transactions).
- `apps/api/src/modules/customer-balances/customer-balances.service.ts`
  — atomic hesaplama.
- `apps/api/src/common/customer-balances/customer-balance.types.ts`
  — ortak tipler.
- `packages/contracts/src/customer-balance.ts` — Zod şemaları.

### Endpoint'ler (2)

| # | Method | Path | Yetki |
|---|--------|------|-------|
| 1 | GET | `/api/v1/customer-balances/owners/{ownerId}` | `clinic:payment:read` |
| 2 | GET | `/api/v1/customer-balances/owners/{ownerId}/transactions` | `clinic:payment:read` |

### Döküman (bu commit)
- 2 API doc.
- `docs/ai/AI_CHUNKS.yaml` — yeni `flow-customer-balance`
  chunk v1.0.0.

## İş Kuralları
- **Hesaplama:** atomic, sorgu anında; cache'lenmez.
- **`totalDebit`:** tahsil edilmemiş sale toplamı
  (clinic_sale + petshop_sale - payment - reversal).
- **`totalCredit`:** refund 'credit' + manuel alacaklar.
- **`netBalance`** = `totalDebit - totalCredit` (negatif =
  kredi bakiye).
- **Transaction source:** `clinic_sale` | `petshop_sale` |
  `return_credit` | `payment` | `payment_reversal` |
  `manual_adjustment`.

## Audit
- Yok (salt okunur hesaplama).

## Tenant İzolasyonu
- Cross-tenant ownerId → 404. SUPERADMIN bypass'lı.

## Yapılmayanlar / Bilinçli Atlamalar
- **Manuel düzeltme (manual_adjustment endpoint)** → Faz 7+
  genişletme.
- **Borçlu müşteriler dashboard widget** → Faz 8 React.
- **SMS/email hatırlatma** → Faz 7+ notification.

## Döküman Uyum
- `pnpm docs:check` → pre-existing hatalar. **GOAL-075 özgü
  hata yok.**

## Testler
- `customer-balances.service.spec.ts` → unit testler (core).

## Sonraki Adımlar
- GOAL-076 (temel finans raporları) docs.
- GOAL-077 (e-SMM adapter) docs.
- FAZ-7 kapanışı.

## Commit
- Core: `903870b` — `GOAL-075 müşteri borç/alacak görünümü
  core (partial)`
- Docs/i18n: (bu commit) — `docs(customer-balances): GOAL-075
  müşteri borç/alacak doküman ve i18n tamamla`
