# GOAL-066 — Klinik Tüketimden Otomatik Stok Düşümü (Completion Report)

## Faz
FAZ-6 (Klinik + petshop ortak stok/petshop)

## Özet
Klinik tüketim (muayene/aşı/ameliyat/yatış) için atomik stok
düşümü. `ClinicalUsage` kaydı ile Faz 6 `StockMovement` atomik
üretilir. Pilot kapsamda 4 `sourceType`; Faz 8'de reaktif
hook'lar ile otomatik tetikleme planı.

## Çıktılar

### Core (GOAL-066 core commit `de6b6df`)
- `apps/api/src/modules/clinical-usages/clinical-usages.controller.ts`
  — 3 endpoint (POST, GET list, GET :id).
- `apps/api/src/modules/clinical-usages/clinical-usages.service.ts`
  — atomik StockMovement entegrasyonu.
- `apps/api/src/modules/clinical-usages/clinical-usages.repository.ts`
  — tenant-scoped CRUD.
- `apps/api/src/common/clinical-usages/clinical-usage.types.ts`
  — ortak tipler.
- `packages/contracts/src/clinical-usage.ts` — Zod şemaları.

### Endpoint'ler (3)

| # | Method | Path | Yetki |
|---|--------|------|-------|
| 1 | POST | `/api/v1/clinic/usages` | `clinic:stock:decrement` |
| 2 | GET | `/api/v1/clinic/usages` | `clinic:stock:read` |
| 3 | GET | `/api/v1/clinic/usages/{id}` | `clinic:stock:read` |

### Döküman (bu commit)
- 3 API doc.
- `docs/ai/AI_CHUNKS.yaml` — yeni `flow-clinical-usage`
  chunk v1.0.0.

## İş Kuralları
- **`sourceType`:** `examination` | `vaccine_application`
  | `surgery` | `hospitalization`.
- **Stok hareketi:** `vaccine_application` →
  `type='vaccination'`, diğerleri → `type='clinical_use'`.
  `direction='out'` (tüketim).
- **Yetersiz stok:** 422 VET-STOCK-0007.
- **`stockMovementId`:** bağlantı Faz 6 ledger'ına.
- **Pilot kapsam:** şu an manuel POST; Faz 8'de reaktif
  hook'lar ile muayene/aşı/ameliyat/yatış kaydı
  oluşturulduğunda otomatik.

## Audit
- `audit:clinical_usage.create` (info).

## Tenant İzolasyonu
- Tüm CRUD tenant-scoped; SUPERADMIN bypass'lı.

## Yapılmayanlar / Bilinçli Atlamalar
- **Reaktif hook (otomatik tetikleme)** → Faz 8'de.
- **İade/correction flow** → sonraki refactor; şu an
  manuel StockMovement `type='reversal'`.
- **Çoklu ürün tüketimi (line items)** → Faz 7+ policy.

## Döküman Uyum
- `pnpm docs:check` → pre-existing hatalar. **GOAL-066 özgü
  hata yok.**

## Testler
- `clinical-usages.service.spec.ts` → unit testler (core).

## Sonraki Adımlar
- GOAL-067 (stock-alerts) docs.
- FAZ-6 kapanış.

## Commit
- Core: `de6b6df` — `GOAL-066 core: klinik tüketimden otomatik
  stok düşümü`
- Docs/i18n: (bu commit) — `docs(clinical-usages): GOAL-066
  klinik tüketim doküman ve i18n tamamla`
