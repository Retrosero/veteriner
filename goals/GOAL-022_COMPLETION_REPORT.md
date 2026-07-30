# GOAL-022 Completion Report — Sahiplik devri

- Goal no: GOAL-022
- Başlık: Hayvan sahiplik devri (kimlik seviyesi)
- Faz: FAZ-2 (Klinik domain)
- Durum: ✅ Tamamlandı
- Tarih: 2026-07-30
- Core commit: f6750c2

## Yapılan işler

**PatientsService.transferOwnership** (`apps/api/src/modules/patients/patients.service.ts`):
`patientId` + `newOwnerId` + `reason` alır; `requireTenantScope` ile
tenant bağlamı doğrulanır. (1) Hasta var mı + aynı tenant'ta mı
(cross-tenant → 404 `VET-CLINIC-0001`). (2) Arşivli hasta → 422
`VET-CLINIC-0005`. (3) Yeni owner aynı tenant'ta mı (cross-tenant →
404 `VET-AUTHZ-0002`). (4) Aynı owner'a transfer → 422
`VET-CLINIC-0007` (no-op). (5) Snapshot: `previousOwnerId` update
öncesi kopyalanır. (6) Eski owner snapshot'ı audit before için
çekilir. (7) `repo.updateOwner` ile kimlik seviyesi update.
(8) Audit `audit:patient.transfer` (warning) — before/after
`ownerId/ownerName/ownerEmail/ownerPhone`; PII alanları
`AuditService PiiMasker` ile mask'lenir. (9) In-memory
`transferAudit` map'e `txf-<tenant8>-<uuid8>` anahtarla kayıt.

**PatientsController** — yeni `POST :id/transfer` endpoint'i
(`apps/api/src/modules/patients/patients.controller.ts`):
`@RequirePermissions("clinic:patient:transfer")` (STAFF,
VETERINARIAN), `ZodValidationPipe` ile input doğrulama,
`@HttpCode(200)`. Swagger: `operationId: "patientTransferOwnership"`.

**Sözleşme** (`packages/contracts/src/patient.ts`):
`patientOwnershipTransferInputSchema` (Zod) — `newOwnerId` (UUID) +
`reason` (1-500 karakter). `ownershipTransferInputSchema` re-export
edilir (`packages/contracts/src/ownership.ts`).

**8 yeni test** (`ownership-transfer.spec.ts`): başarı, PII
before/after, cross-tenant hasta 404, cross-tenant new owner 404,
arşivli hasta 422, aynı kişi 422, audit event (warning +
correlationId + before/after), in-memory transfer audit map (id +
tenant scope).

## Tasarım kararları

- **Kimlik seviyesi devir:** Bu goal yalnızca `Patient.ownerId`
  alanını günceller. Tam tarihsel `PatientOwnership` tablosu + aktif/
  arşiv ilişki yönetimi `OwnershipHistoryService` (FAZ-2 ileri) ile
  gelecek; burada `noop` mock'lanır.
- **Cross-tenant güvenlik:** Hem patient hem yeni owner
  `findById(tenantId, ...)` ile çağrılır; herhangi biri farklı
  tenant'taysa 404 (bilgi sızdırmaz).
- **Aynı kişi reddi:** 422 `VET-CLINIC-0007` no-op işlemi; audit
  yazılmaz, transfer audit map'e kayıt düşmez.
- **Audit before/after:** PII alanları (firstName, lastName, email,
  phone) audit payload'ında mask'lenir. KVKK uyumu için
  `PiiMasker` zorunlu.
- **In-memory transfer audit map:** Tenant-scoped Map; test +
  ileride admin görünümü için. DB persistence `PatientTransfer`
  tablosuyla FAZ-3+'da.

## Değişen dosyalar

**Core (f6750c2):** `apps/api/src/modules/patients/patients.service.ts`
(+transferOwnership + transferAudit map), `patients.controller.ts`
(+POST :id/transfer), `ownership-transfer.spec.ts` (8 test),
`packages/contracts/src/patient.ts` (Zod şeması),
`ownership.ts` (yeni dosya).

**Docs & i18n (bu commit):** bu rapor + `PROJECT_CONTEXT.md` ⏳ → ✅ +
1 API doc + `AI_CHUNKS.yaml` (1 yeni chunk + flow-ownership-transfer
related_api güncelleme) + `ERROR_CATALOG.md` (+VET-CLINIC-0007) +
`tr-TR.json` + `en-GB.json` (+VET-CLINIC-0007).

## Veritabanı

Yok. `repo.updateOwner` in-memory `PatientsRepository` üzerinde.
`PatientTransfer` / `PatientOwnershipHistory` tabloları
`OwnershipHistoryService` (FAZ-2 ileri) ile gelecek.

## API

| Method | Path | Yetki | Kod |
| --- | --- | --- | --- |
| POST   | /api/v1/clinic/patients/:id/transfer | clinic:patient:transfer | 200 |

Hatalar: 404 `VET-CLINIC-0001` (patient yok/cross-tenant), 404
`VET-AUTHZ-0002` (new owner yok/cross-tenant), 422 `VET-CLINIC-0005`
(arşivli hasta), 422 `VET-CLINIC-0007` (aynı owner), 403
`VET-AUTHZ-0001` (tenant uyumsuz), 401 `VET-AUTH-0001`.

## Test

8 yeni unit test. Cross-tenant guard, arşiv koruması, aynı kişi
reddi, audit before/after + PII alan hazırlığı, in-memory transfer
audit map. Başarısız: 0.

## Bilinen riskler

- In-memory repo + transferAudit map (pilot); DB persistence
  FAZ-3+'da.
- `OwnershipHistoryService` bağımlılığı `noop` mock'lanmış; tam
  tarihsel ownership akışı ileride bağlanacak.
- Sahiplik devri öncesi yasal onay (KVKK / sözleşme) UI tarafında
  alınmalı; backend yalnızca `reason` metnini saklar.

## Sıradaki

GOAL-023 (alerji, kronik durum ve klinik uyarılar).
