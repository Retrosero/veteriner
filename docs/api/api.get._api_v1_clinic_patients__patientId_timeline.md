# GET /api/v1/clinic/patients/:patientId/timeline

Bir hayvana ait tüm klinik, petshop, dosya, uyarı ve sahiplik
olaylarını birleşik timeline olarak döner. Tenant-scoped;
cross-tenant erişim yok (bilgi sızdırmaz). Sonuç `occurredAt`
(ISO 8601) alanına göre azalan, stabil sırada döner (aynı
timestamp için `id` artan).

- **Modül:** clinic (timeline)
- **Yetki:** `clinic:patient:read` (STAFF, VETERINARIAN, OWNER
  portal `self_only`)
- **Audit:** Yok (gürültü kontrolü; hayvan detayı her açıldığında
  audit üretilmesi log kirliliği yaratır).
- **Idempotency:** N/A (GET).
- **Yan etki:** Yok.

## Request

**Path params:**

- `patientId` (UUID, zorunlu) — hasta ID. Tenant-scoped.

**Query (`TimelineListQuery`):**

- `from` (ISO 8601 datetime, opsiyonel) — bu tarihten sonraki
  olaylar (dahil).
- `to` (ISO 8601 datetime, opsiyonel) — bu tarihten önceki
  olaylar (dahil).
- `types` (virgülle ayrılmış string, opsiyonel) — yalnızca
  belirtilen tiplerdeki event'ler. Geçerli değerler:
  `appointment, examination, vaccination, prescription,
surgery, hospitalization, lab, imaging, sale, file, alert,
transfer`. Geçersiz tip sessizce atlanır.
- `limit` (int 1-200, default 20).
- `offset` (int 0-10000, default 0).

## Response

**200 OK (`TimelineListResponse`):**

```json
{
  "items": [
    {
      "id": "alt-tnt-1234-ab12cd34",
      "type": "alert",
      "occurredAt": "2026-07-30T10:00:00.000Z",
      "title": "Anafilaksi",
      "summary": "Arı sokması → anafilaktik şok.",
      "relatedEntityType": "alert",
      "relatedEntityId": "alt-tnt-1234-ab12cd34",
      "actorName": "Dr. Yılmaz"
    },
    {
      "id": "trf-tnt-1234-ef56gh78",
      "type": "transfer",
      "occurredAt": "2026-07-12T14:22:00.000Z",
      "title": "Sahiplik devri",
      "summary": "Ali Kara → Ayşe Demir (2026-07-12).",
      "relatedEntityType": "ownership",
      "relatedEntityId": "trf-...",
      "actorName": "Staf Kullanıcı"
    }
  ],
  "total": 2
}
```

Sıralama: `occurredAt` ISO string locale-compare azalan; aynı
timestamp için `id` artan (stable). Tüm aktif event source'lar
paralel çekilir (`Promise.all`), sonra birleşik set üzerinde
`from`/`to`/`types` filtresi ve `limit`/`offset` sayfalama
uygulanır.

## Event tipleri

| Tip               | Kaynak modül              | Durum                |
| ----------------- | ------------------------- | -------------------- |
| `alert`           | GOAL-023 AlertsService    | Aktif                |
| `transfer`        | GOAL-022 OwnershipHistory | Aktif                |
| `file`            | GOAL-014 FilesService     | Aktif                |
| `appointment`     | GOAL-031                  | FAZ-3+ (placeholder) |
| `examination`     | GOAL-041                  | FAZ-3+ (placeholder) |
| `vaccination`     | GOAL-051                  | FAZ-3+ (placeholder) |
| `prescription`    | GOAL-045                  | FAZ-3+ (placeholder) |
| `surgery`         | GOAL-080                  | FAZ-3+ (placeholder) |
| `hospitalization` | GOAL-084                  | FAZ-3+ (placeholder) |
| `lab`             | GOAL-090                  | FAZ-3+ (placeholder) |
| `imaging`         | GOAL-093                  | FAZ-3+ (placeholder) |
| `sale`            | GOAL-064                  | FAZ-3+ (placeholder) |

Yeni modüller `provide: TIMELINE_EVENT_SOURCES, useClass:
XTimelineSource, multi: true` ile eklenir; core değişmez.

## Hata kodları

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (404) — Hasta bulunamadı veya başka
  tenant'a ait (bilgi sızdırmaz).
- `VET-TENANT-0001` (400) — Tenant bağlamı zorunlu.
- `VET-VALIDATION-0001` (400) — Query şema doğrulaması
  başarısız (limit/offset aralık dışı, vb.).

## Kullanım senaryoları

- Hayvanın klinik kartı açıldığında birleşik olay listesi
  yükleme.
- Belirli tarih aralığında ne olduğunu inceleme (ör. son 30
  gün: `from=...&to=...`).
- Sadece dosya yükleme olaylarını gösterme
  (`types=file`).
- Hasta sahibi portal: kendi hayvanının timeline'ı
  (`self_only` filtresi `clinic:patient:read` üzerinden).

## Dikkat edilecek noktalar

- **Filtre sırası:** Önce tarih (`from`/`to`), sonra tip
  (`types`), sonra sayfalama (`limit`/`offset`). UI
  "sonsuz kaydırma" kullanırken `offset` artırılır;
  `total` toplam filtre sonrası sayıdır.
- **Tenant izolasyonu:** Her event source kendi tenant
  filtresini uygular; `TimelineService` yeniden kontrol
  etmez. `requireTenantScope` + source içi tenant scope
  birlikte çalışır.
- **PII:** `actorName` maskelenmiş görünen ad; plain PII
  içermez. `summary` klinik içerik özetidir (ad-soyad
  içerebilir); frontend `PII_MASKING.md` kurallarına
  göre ele almalı.
- **Audit yok:** Bu endpoint KVKK kapsamında audit
  gerektirmez (salt okunur + tenant-scoped); audit
  üretimi gürültü yaratır.
- **Performans:** 3 in-memory kaynak + paralel `Promise.all`
  pilot için yeterli. Production'da her source kendi
  Prisma sorgusundan okur; `occurredAt DESC` index
  önerilir.

## İlgili dokümanlar

- API sözleşmesi: `packages/contracts/src/timeline.ts`
  (`timelineListQuerySchema`, `timelineListResponseSchema`,
  `timelineEventTypeSchema`)
- Akış: `docs/ai/AI_CHUNKS.yaml` → `timeline-overview`
- Modül: `apps/api/src/modules/timeline/timeline.service.ts`
- Event tipleri: `timelineEventTypeSchema`
- Hasta: `api.get._api_v1_clinic_patients__id.md`
- Uyarılar: `api.get._api_v1_clinic_patients__patientId_alerts.md`
