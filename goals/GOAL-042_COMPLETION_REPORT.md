# GOAL-042 Completion Report — Vital bulgular

- Goal no: GOAL-042
- Başlık: Vital bulgular (vücut sıcaklığı, nabız, solunum, ağırlık, BCS, kan basıncı, CRT, mukoza rengi)
- Faz: FAZ-4 (Klinik muayene/aşı/reçete)
- Durum: ✅ Tamamlandı
- Tarih: 2026-07-30
- Core commit: 9540cd6

## Yapılan işler

**VitalsService** (`apps/api/src/modules/vitals/vitals.service.ts`):

- **`record(tenantId, examinationId, input, actor)`** — Examination
  `ExaminationsService.findById(tenantId, id, actor)` ile aynı tenant'ta
  mı doğrulanır (cross-tenant → 404 `VET-CLINIC-0001`). Vital alanları
  Zod şeması tarafından range validation'dan geçer (temperatureC
  35-42, heartRateBpm 30-300 int, respiratoryRateBpm 8-100 int,
  weightKg 0-200, bodyConditionScore 1-9 int, bloodPressureSystolic
  60-250 int, bloodPressureDiastolic 40-150 int,
  capillaryRefillTime 0-5). `vitalSigns` en az bir ölçüm alanı
  dolu olmalı (`notes` tek başına yetmez) → aksi 422
  `VET-VALIDATION-0010` (mevcut kod yeniden kullanımı; anlam
  "geçersiz tutar" ama vital seti boş için service tarafından
  tetiklenir). `takenAt` opsiyonel; default `new Date().toISOString()`.
  `patientId` + `veterinarianId` muayeneden türetilir; request
  body'den güvenilmez. `id = vitals-<tenant8>-000001` (artan
  sayaç). Audit `audit:vitals.record` (info) — examinationId,
  patientId, veterinarianId, takenAt, fields.
- **`findByExamination(tenantId, examinationId, actor)`** —
  tenant-scoped, `takenAt` desc. Cross-tenant examinationId için
  boş dizi (bilgi sızdırmaz; okuma endpoint'i, 404 ayrıca
  üretmez).
- **`latestForPatient(tenantId, patientId, actor)`** — Patient
  `PatientsService.findById(tenantId, id, actor)` ile doğrulanır
  (cross-tenant → 404 `VET-CLINIC-0001`); ardından tenant-scoped
  tüm vital kayıtları arasında en yeni `takenAt` döner. Hiç
  kayıt yoksa `null`.

**VitalsController** — 3 endpoint (`@Controller("api/v1/clinic")`):

- `POST /api/v1/clinic/examinations/{id}/vitals` (`vitalsRecord`,
  `@HttpCode(201)`, yetki `clinic:examination:create`).
- `GET  /api/v1/clinic/examinations/{id}/vitals`
  (`vitalsListByExamination`, yetki `clinic:examination:read`).
- `GET  /api/v1/clinic/patients/{id}/vitals/latest`
  (`vitalsLatestForPatient`, yetki `clinic:patient:read`).

**Sözleşme** (`packages/contracts/src/vitals.ts`): `temperatureMethodSchema`
(rectal | ear | axillary), `mucousMembraneColorSchema` (pink | pale
| cyanotic | icteric | congested), `vitalSignsSchema` (tüm alanlar
opsiyonel, `.strict()`, range validation), `vitalSignsCreateInputSchema`
(vitalSigns zorunlu + takenAt opsiyonel ISO 8601 datetime),
`vitalsRecordSchema` (response).

**Repository** (`vitals.repository.ts`): in-memory `VitalsRepository`;
`byId` Map + `counters` (her tenant için artan ID); `nextId`,
`insert`, `findById`, `findByExamination` (takenAt desc),
`latestForPatient`, `clear` (test). `toVitalsRecord` yardımcısı.

**9 unit test** (`vitals.service.spec.ts`): record başarı + audit,
record cross-tenant → 404, record boş vitalSigns → 422,
findByExamination 3 kayıt takenAt desc, findByExamination
cross-tenant → boş liste, latestForPatient en yeni, latestForPatient
hiç kayıt → null, latestForPatient cross-tenant patient → 404,
audit her record için tek event (2 call).

## Tasarım kararları

- **Append-only politika:** Vital kaydı muayeneye bağlıdır; mevcut
  kayıt üzerinde UPDATE/DELETE yok. Yanlış ölçüm düzeltmesi yeni
  vital kaydı yazımı ile yapılır (önceki kayıt korunur; muayene
  zaman çizelgesinde tüm ölçümler görünür kalır). Production
  migration'da DB trigger (`update`/`delete` → reddet) FAZ-0'da
  no-op flag.
- **Range validation Zod'da:** Tüm fizyolojik aralıklar (sıcaklık
  35-42°C, nabız 30-300 BPM, vb.) Zod şemasında `.min().max()` ile
  enforce edilir. Geçersiz aralık → 422 `VET-VALIDATION-0001` (Zod
  parse hatası). Goal notundaki "geçersiz aralık uyarı versin
  veteriner onayıyla kaydedilebilsin" gereksinimi FAZ-0 kapsamı
  dışında (override flow / confirm modal ileride).
- **patientId + veterinarianId muayeneden türetilir:** Client
  gönderemez; service `examinations.findById()` sonrası
  `exam.patientId` + `exam.veterinarianId` kullanır. Bu sayede
  vital kaydı tutarlı şekilde muayeneye bağlı kalır; "farklı
  hayvana ölçüm" veya "farklı veterinere atıf" imkansız.
- **Boş vital seti koruması:** `vitalSigns` tüm alanları opsiyonel
  olsa da (UI esnekliği için) service `hasAnyMeasurement()` ile en
  az bir ölçüm alanı zorunlu kılar. `notes` tek başına yetmez
  (klinik değer taşımaz). 422 `VET-VALIDATION-0010` — mevcut
  kod yeniden kullanımı; yeni hata kodu eklenmedi.
- **Tenant scope koruması:** `record` ve `latestForPatient`
  muayene/patient varlık kontrolü yapar (cross-tenant → 404
  `VET-CLINIC-0001`, bilgi sızdırmaz). `findByExamination` ayrıca
  examination varlık kontrolü yapmaz (tenant-scoped sorgu zaten
  boş döner; okuma endpoint'i, semantik olarak "o muayenenin vital
  listesi" demek).
- **In-memory repo:** Faz 0 sözleşmesi; DB migration ileride.
  Tenant filter tüm çağrılarda enforce edilir; `byId` Map
  tenant filtresi service katmanında sağlanır.
- **Audit severity:** `vitals.record` → **info** (ölçüm kaydı
  denetim izi; hassas klinik olay). `vitals.find*` okuma
  işlemleri audit üretmez (listeleme standardı).

## Doküman ve i18n (bu PR)

- `docs/api/api.post._api_v1_clinic_examinations__id_vitals.md`
- `docs/api/api.get._api_v1_clinic_examinations__id_vitals.md`
- `docs/api/api.get._api_v1_clinic_patients__id_vitals_latest.md`
- `docs/ai/AI_CHUNKS.yaml` (`flow-vitals` chunk eklendi)
- `goals/GOAL-042_COMPLETION_REPORT.md` (bu rapor)
- `PROJECT_CONTEXT.md` (Faz 4 / GOAL-042 satırı ✅)
- `docs/errors/ERROR_CATALOG.md` — yeni hata kodu yok
  (`VET-VALIDATION-0010` mevcut "Geçersiz tutar" → boş vital
  seti için service yeniden kullanımı, semantik not bu raporda)
- `packages/i18n/src/locales/{tr-TR,en-GB}.json` — yeni anahtar
  yok (mevcut `VET-VALIDATION-0010` anahtarı yeterli)

## Yapılmayan (ileride)

- DB migration (in-memory repo → Prisma, range index)
- Frontend vital form (sıcaklık, nabız, solunum, ağırlık, BCS,
  kan basıncı, CRT, mukoza rengi alanları + range aşımı uyarı/
  onay akışı)
- DB trigger aktivasyonu (update/delete → reddet)
- Tür bazlı alan genişletme (kedi/köpek/kuş) — goal notundaki
  özel talimat için ayrı plan
- Grafik/trend görselleştirme (zaman serisi vital kayıtları)
- Otomatik vital import (cihaz adapter — GOAL-094 kapsamında)
