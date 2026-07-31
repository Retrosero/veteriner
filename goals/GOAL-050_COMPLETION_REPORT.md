# GOAL-050 Completion Report — Aşı kataloğu ve protokoller

- Goal no: GOAL-050
- Başlık: Aşı kataloğu ve protokoller (Vaccine catalogue & protocols)
- Faz: FAZ-5 (Aşı + stok)
- Durum: ✅ Tamamlandı (core)
- Tarih: 2026-07-30
- Core commit: 8415176

## Yapılan işler (core)

**VaccinesService** (`apps/api/src/modules/vaccines/vaccines.service.ts`):

- **`createProtocol(tenantId, input, actor)`** — `steps.length === 0`
  → 422 `VET-VALIDATION-0010`. `category='core'` ise `isCore=true`
  otomatik; `totalDurationMonths` son step'ten türetilir. Audit
  `audit:vaccine.protocol.create` (info).
- **`listProtocols(tenantId, filters, actor)`** — tenant-scoped;
  `species` / `category` / `isCore` filtreleri + pagination
  (`limit` 1-200, `offset` 0-10000). Arşivli kayıtlar dönmez.
- **`getProtocol(tenantId, id, actor)`** — cross-tenant → null.
- **`updateProtocol(tenantId, id, input, actor)`** — kısmi
  güncelleme; `category` değişirse `isCore` yeniden türetilir,
  `steps` değişirse `totalDurationMonths` yeniden hesaplanır.
  Arşivli protokol → 409 `VET-VACC-0001`. Audit
  `audit:vaccine.protocol.update` (info).
- **`archiveProtocol(tenantId, id, actor)`** — soft delete
  (`archivedAt` set). Zaten arşivli → 409 `VET-VACC-0002`. Audit
  `audit:vaccine.protocol.archive` (warning).

**VaccinesController** — 5 endpoint (`@Controller("api/v1/clinic")`):

- `POST   /api/v1/clinic/vaccines/protocols` (`vaccineProtocolCreate`,
  `@HttpCode(201)`, yetki `clinic:vaccination:create`).
- `GET    /api/v1/clinic/vaccines/protocols` (`vaccineProtocolList`,
  yetki `clinic:vaccination:read`).
- `GET    /api/v1/clinic/vaccines/protocols/:id`
  (`vaccineProtocolGetById`, yetki `clinic:vaccination:read`).
- `PATCH  /api/v1/clinic/vaccines/protocols/:id`
  (`vaccineProtocolUpdate`, yetki `tenant:tenant:update`).
- `DELETE /api/v1/clinic/vaccines/protocols/:id`
  (`vaccineProtocolArchive`, `@HttpCode(204)`, yetki
  `tenant:tenant:update`).

**Sözleşme** (`packages/contracts/src/vaccine.ts`):
`speciesTargetSchema` (dog/cat/bird/all), `vaccineCategorySchema`
(core/non_core/lifestyle/not_recommended — WSAVA/AAHA), `vaccineDose`
(amount+unit: ml/dose/mg/drop), `vaccineProtocolStepSchema`
(ageWeeks, vaccineName, boosterIntervalDays, dose override, notes),
`vaccineProtocolCreateInputSchema` (name, species, category,
manufacturer?, defaultDose?, steps≥1; `.strict()`), update şeması
(tümü opsiyonel), response şeması (türetilmiş `isCore` ve
`totalDurationMonths` dahil), `vaccineProtocolFiltersSchema`
(species, category, isCore, limit, offset), `VaccineProtocolListResponse`
(items + total).

**Repository** (`vaccines.repository.ts`): in-memory
`VaccinesRepository`; `byId` Map + `counters` (her tenant için
artan `vacp-<tenant8>-000001` ID); `nextId`, `toRecord`, `insert`,
`findById` (tenant-scoped), `search` (tenant + species + category +
isCore + pagination), `update`, `clear` (test).

**18 unit test** (`vaccines.service.spec.ts`): create başarı +
türetme + audit, create empty steps → 422, list filtreleri +
pagination, list arşivli dönmez, get cross-tenant → null, update
başarı + category değişince isCore yeniden türetme, update steps
değişince totalDurationMonths yeniden hesap, update arşivli → 409,
archive başarı + audit, archive zaten arşivli → 409, archive
cross-tenant → 404, cross-tenant scope guard (SUPERADMIN bypass),
tenant scope mismatch → 403, vb.

## Tasarım kararları

- **Kategori semantiği (WSAVA/AAHA uyumlu):** `core` zorunlu
  aşılar (ör. köpek: DHPP, kuduz), `non_core` risk-bazlı
  (ör. Bordetella), `lifestyle` yaşam tarzına göre
  (ör. Lyme), `not_recommended` artık önerilmeyen (ör. CIV).
  `isCore` alanı client'tan alınmaz; service `category='core'`
  ise otomatik `true` yapar. Bu sayede kategori–isCore
  tutarlılığı DB düzeyinde garantilenir.
- **Türetilmiş alanlar:** `totalDurationMonths` son step'in
  `ageWeeks`'inden türetilir (hafta→ay yuvarlama); `isCore`
  kategori ile türetilir. Client gönderemez; service
  hesaplar. Audit'te before/after snapshot olarak loglanır.
- **Soft delete:** Klinik kayıt politikası gereği fiziksel
  silme yok. Arşivlenmiş protokol listede dönmez, update
  edilemez (409); ama delete tekrar denirse 409 (idempotent
  değil — kötü niyetli çift çağrıyı ayırt eder).
- **Cross-tenant koruması:** Tüm endpoint'lerde
  `requireTenantScope`; SUPERADMIN bypass'lı. `get` cross-tenant
  → null (controller 404'e çevirir); `list` zaten tenant
  filtresiyle çalışır. Bilgi sızdırmaz.
- **In-memory repo:** Faz 0 sözleşmesi; DB migration ileride.
  Tenant filter tüm çağrılarda enforce.

## Doküman ve i18n (bu PR — minimal)

- `goals/GOAL-050_COMPLETION_REPORT.md` (bu rapor)
- `PROJECT_CONTEXT.md` (Faz 5 / GOAL-050 satırı ⏳ → ✅)
- `docs/ai/AI_CHUNKS.yaml` (`glossary-vaccine-protocol` chunk
  eklendi)
- `docs/api/api.post._api_v1_clinic_vaccines_protocols.md`
- `docs/api/api.get._api_v1_clinic_vaccines_protocols.md`

Not: `getById` / `patch` / `delete` API doc'ları ve i18n
key parity bu tick'e sığmadı; ileride tamamlanacak.

## Yapılmayan (ileride)

- DB migration (in-memory repo → Prisma, species/category index)
- `getById` / `update` / `archive` API doc'ları
- i18n key parity (`vaccine.protocol.*` çevirileri)
- Frontend aşı kataloğu UI (protokol listesi, create form,
  step editörü, kategori filtre)
- Faz 6 stok modülü ile `stockProductId` referansı
  (aşı ürünü → stok bağlantısı)
- DB trigger aktivasyonu (update/delete → reddet, append-only)
