# GOAL-024 Completion Report — Hayvan zaman çizelgesi

- Goal no: GOAL-024
- Başlık: Hayvan zaman çizelgesi (timeline)
- Faz: FAZ-2 (Klinik domain)
- Durum: ✅ Tamamlandı
- Tarih: 2026-07-30
- Core commit: 90d667a

## Yapılan işler

**TimelineService** (`apps/api/src/modules/timeline/timeline.service.ts`):
Tek public metot `listForPatient(tenantId, patientId, query, actor)`.
Tüm aktif `TimelineEventSource` örneklerinden paralel veri çeker
(`Promise.all`), sonuçları `occurredAt` ISO string locale-compare
azalan (stable) sırada birleştirir; `from`/`to`/`types` filtreleri
uygulandıktan sonra `limit`/`offset` ile sayfalar. Cross-tenant
patient → 404 `VET-AUTHZ-0001` (bilgi sızdırmaz). Event source
kayıtları (3 adet): `AlertTimelineSource` (GOAL-023 aktif uyarılar),
`OwnershipTimelineSource` (GOAL-022 transfer + initial), `FileTimelineSource`
(GOAL-014 `relatedEntityType=patient` dosyalar). Diğer tipler
(appointment, examination, vaccination, prescription, surgery,
hospitalization, lab, imaging, sale) için event source
placeholder; FAZ-3+ modülleri hazır olduğunda DI token'ı
(`TIMELINE_EVENT_SOURCES`) üzerinden otomatik olarak eklenir.

**TimelineController** — 1 yeni endpoint
(`apps/api/src/modules/timeline/timeline.controller.ts`):
- `GET /api/v1/clinic/patients/:patientId/timeline?from=&to=&types=&limit=&offset=`
  — `clinic:patient:read`, 200. `limit` 1-200 (default 20),
  `offset` 0-10000 (default 0). `types` virgülle ayrılmış string
  olarak gelir, controller Zod `safeParse` ile enum'a karşı
  doğrular. Audit **yayınlamaz** (gürültü kontrolü; hayvan detayı
  her açıldığında audit log şişer). Swagger `operationId:
  patientTimeline`.

**Sözleşme** (`packages/contracts/src/timeline.ts`): 12 event
tipi enum (`appointment | examination | vaccination | prescription
| surgery | hospitalization | lab | imaging | sale | file | alert
| transfer`), `timelineEventSchema` (id, type, occurredAt ISO,
title, summary, relatedEntityType, relatedEntityId, actorName),
`timelineListQuerySchema` (from/to ISO 8601, types raw string,
limit, offset), `timelineListResponseSchema` (items, total).

**6 yeni test** (`timeline.service.spec.ts`): (1) alert+transfer
birleşik `occurredAt` desc sıralı; (2) `from` filtresi
`< from` olanları dışlar; (3) `to` filtresi `> to` olanları dışlar;
(4) `types` filtresi yalnızca belirtilen tipleri döner; (5)
cross-tenant patient → 404; (6) pagination `limit/offset` birleşik
set üzerinde uygulanır.

## Tasarım kararları

- **Event source registry (DI token):** `TIMELINE_EVENT_SOURCES`
  token'ı altında her modül kendi source'unu çoklu provider olarak
  sağlar. TimelineService `ModuleRef.get(TIMELINE_EVENT_SOURCES,
  { strict: false })` ile toplar. Yeni modül (examination vb.)
  hazır olduğunda `provide: TIMELINE_EVENT_SOURCES, useClass:
  XTimelineSource, multi: true` satırı eklemesi yeterlidir; core
  değişmez.
- **Sıralama:** `occurredAt` ISO string locale-compare azalan.
  Ties (aynı timestamp) için `id` artan stabil sıralama; UI
  "yeniden eskiye" görünümünde kayma olmaz.
- **Cross-tenant 404:** Hasta başka tenant'a aitse 404
  `VET-AUTHZ-0001`; mevcut olmayan hasta ile aynı yanıt (bilgi
  sızdırmaz). `requireTenantScope` + repository `findByIdAndTenant`
  pattern'i.
- **Audit yok:** Hayvan detay sayfası çok sık açılır; audit
  üretimi log kirliliği + storage şişmesi yaratır. Tenant
  bağlamı + kimlik bilgisi yeterli güvenlik izi; gerekirse
  flag ile opsiyonel audit açılabilir.
- **Tip filtresi parsing:** Schema generic uyumu için
  `ZodValidationPipe` ham string kabul eder; controller `,`-split
  + `safeParse` ile enum'a karşı doğrular. Geçersiz tip
  sessizce atlanır (boş liste = tüm tipler); "Bilinmeyen
  kaynak" semantiği UI için unexpected değil.
- **PII:** `actorName` maskelenmiş görünen addır; plain PII
  (TCKN/email/telefon) içermez. `summary` klinik içerik
  özetidir.

## Değişen dosyalar

**Core (90d667a):** `apps/api/src/modules/timeline/` (modül +
controller + service + sources + spec), `apps/api/src/common/timeline/timeline.types.ts`,
`apps/api/src/modules/files/files.service.ts` (relatedEntityType
support), `packages/contracts/src/timeline.ts` (yeni),
`packages/contracts/src/index.ts`.

**Docs & i18n (bu commit):** bu rapor + `PROJECT_CONTEXT.md`
⏳ → ✅ + 1 API doc + `AI_CHUNKS.yaml` (+`timeline-overview`).

## Veritabanı

Yok. In-memory `byId` Map (alert/ownership/file) + event source
fetch (her source kendi deposundan okur). Production'a geçişte
ek tablo gerekmez; her modül kendi tablosundan okumaya devam
eder. Yalnızca view+index optimizasyonu (`(tenant_id, patient_id,
occurred_at DESC)`) FAZ-3+'da değerlendirilir.

## API

| Method | Path                                              | Yetki                  | Kod |
| ------ | ------------------------------------------------- | ---------------------- | --- |
| GET    | /api/v1/clinic/patients/:patientId/timeline       | clinic:patient:read    | 200 |

Hatalar: 404 `VET-AUTHZ-0001` (patient cross-tenant), 400
`VET-TENANT-0001`, 401 `VET-AUTH-0001`, 400 `VET-VALIDATION-0001`.

## Test

6 yeni unit test. Birleşik sıralama (occurredAt desc + stable),
`from`/`to`/`types` filtreleri, cross-tenant 404, pagination
limit/offset. Başarısız: 0.

## Bilinen riskler

- Event source'lar in-memory store kullanıyor (pilot); gerçek
  modüller (examination, prescription vb.) Prisma'ya
  geçtiğinde source adaptasyonu gerekecek.
- 3 aktif kaynak: alert + transfer + file. Diğer 9 tip
  şimdilik boş döner; UI "Yakında" placeholder göstermeli.
- `from`/`to` string karşılaştırması ISO formatına bağlı;
  tarih-saat timezone kayması UI tarafında normalize edilmeli
  (TRT için Europe/Istanbul).
- `actorName` maskelenmiş; ancak summary klinik içerik
  özeti PII içerebilir (ad-soyad). Frontend bu alanı
  PII_MASKING.md kurallarına göre ele almalı.

## Sıradaki

GOAL-025 (portal erişim daveti).
