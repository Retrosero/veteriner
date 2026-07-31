# GOAL-054 — Aşı Amendment ve Düzeltme (Completion Report)

## Faz
FAZ-5 (Aşı + stok)

## Özet
Hatalı aşı uygulama kayıtlarının geçmişi silinmeden düzeltilmesini
sağlayan amendment akışı tamamlandı. Eski kayıt korunur (status
`active` → `amended`); düzeltilebilir alanlar `dose`,
`nextDueDate`, `notes`, `lot`. Lot değişiminde atomik ters kayıt
+ yeni düşüm hareketi oluşturulur. Audit denetim için
`amendReason` zorunlu.

## Çıktılar

### Core (GOAL-054 core commit `a7c42ba`)
- `apps/api/src/modules/vaccines/vaccine-applications.service.ts`
  — `amendApplication` metodu (mevcut controller/service'a
  eklendi).
- `apps/api/src/modules/vaccines/vaccine-applications.controller.ts`
  — `PATCH /api/v1/clinic/vaccines/applications/:id` endpoint'i
  (yeni eklenen amendment route).
- `apps/api/src/modules/vaccines/vaccine-applications.repository.ts`
  — `isSameLot` yardımcısı + amendment state.
- `apps/api/src/modules/vaccines/vaccine-applications.service.spec.ts`
  — 5 yeni test (mevcut suite'e eklendi).
- `packages/contracts/src/vaccine-application.ts` — Zod
  şemaları: `VaccineApplicationAmendInput` + `amendReason`
  zorunlu alan.

### Endpoint (1)

| # | Method | Path | Yetki |
|---|--------|------|-------|
| 1 | PATCH | `/api/v1/clinic/vaccines/applications/{id}` | `clinic:vaccination:amend` |

### Döküman (bu commit)
- `docs/api/api.patch._api_v1_clinic_vaccines_applications__id_.md`
- `docs/ai/AI_CHUNKS.yaml` — yeni `flow-vaccine-application-amend`
  chunk v1.0.0; lot değişimi atomik ters kayıt + yeni düşüm
  sıralamasını, status `amended` korumasını, audit before
  snapshot + lotChange before/after payload'ını özetler.

## İş Kuralları
- **Status kontrolü:** yalnız `status='active'` düzeltilebilir.
  İptal edilmiş veya daha önce düzeltilmiş kayıtlar
  amend edilemez → 409 `VET-VACC-0007`.
- **Düzeltilebilir alanlar:** `dose`, `nextDueDate`, `notes`,
  `lot` (lotNumber, expiryDate, manufacturer). `patientId`,
  `protocolId`, `veterinarianId` değiştirilemez.
- **`amendReason` zorunlu** (string, 1-500) — denetim/sorumluluk
  için.
- **Append-only:** eski kayıt `status='amended'` olur, **fiziksel
  silme YOK**. Tıbbi kayıtların geçmişi korunur.
- **Lot değişimi atomik:**
  1. Yeni lot SKT kontrolü → geçmişse 422 `VET-VACC-0010`.
  2. Yeni lot yeterli stok kontrolü → yetersizse 422
     `VET-VACC-0009`.
  3. Eski lot'a `VaccineStockLedger` reversal kaydı.
  4. Yeni lot'a düşüm kaydı.
  5. Application kaydının `lot` alanı güncellenir.
  Bu sıralama, hata senaryolarında eski lot'u güvenli tutar.
- **Audit detayı:** `before` snapshot (dose, nextDueDate, notes,
  lot) + `lotChange` before/after + `newMovementIds` payload'a
  eklenir.

## Audit
- `audit:vaccine.application.amend` (warning) — denetim izi.
  `amendReason` her zaman kayıt altında.

## Tenant İzolasyonu
- `actor.tenantId` zorunlu; service `requireTenantScope` ile
  tenant doğrular.
- Cross-tenant `id` → 404 `VET-CLINIC-0001` (bilgi sızdırmaz).
- SUPERADMIN bypass'lı.

## Append-Only / Stok Etkisi
- `VaccineStockLedger` reversal kayıtları append-only ledger
  yapısına eklenir; mevcut bakiye bozulmaz (ters kayıt + yeni
  düşüm atomik).
- Stok hareketleri audit: `audit:stock_movement.{usage,reversal}`
  (mevcut event isimleri).

## Reminder Hook Entegrasyonu
- Amendment sonrası `VaccineRemindersService.rescheduleForApplication`
  hook'u tetiklenir; `nextDueAt` değişmişse delta hesabıyla
  `scheduledFor` kaydırılır, yeni zaman geçmişte ise
  `cancelled` yapılır.
- Bu, hatırlatmanın yeni tarihe göre otomatik güncellenmesini
  sağlar.

## Yapılmayanlar / Bilinçli Atlamalar
- **Çoklu amend zinciri (parentId → amendmentChainId)** →
  service alanı şimdiden ekliyor; ancak controller'da ikinci
  amend için `parentId` parametresi sonraya (şu an tek amend
  kabul, sonraki amend için yeni PATCH + aynı zincir).
- **`amendedBy` dışında "onaylayan" ek rolü** → owner/vet
  farkı şu an actor tabanlı; sonraki refactor.
- **Frontend formu** → sadece backend; UI ayrı iş.

## Döküman Uyum
- `pnpm docs:check` → mevcut pre-existing hatalar (FAZ-6 +
  `VET-VACC-0005/0006/0007/0009/0010` zaten katalogda veya
  controller'da tanımlı; bu commit ek hata kodu eklemiyor).

## Testler
- `vaccine-applications.service.spec.ts` → 5 yeni test (core
  commit'te): lot değişimi başarı, ters kayıt + yeni düşüm
  atomik, SKT geçmiş → hata, yetersiz stok → hata, status
  kontrolü.

## Sonraki Adımlar
- **FAZ-5 kapanış:** tüm dökümanlar tamam (GOAL-050 → 054).
- GOAL-060+ (FAZ-6 stok): product, warehouse, supplier, stock
  movement, petshop sale.

## Commit
- Core: `a7c42ba` — `GOAL-054: aşı amendment ve düzeltme core`
- Docs/i18n: (bu commit) — `docs(vaccines): GOAL-054 aşı
  amendment doküman ve i18n tamamla`
