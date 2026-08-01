# POST /api/v1/clinic/patients/:patientId/alerts

Hayvana yeni bir klinik uyarısı (alerji, kronik durum, ilaç çakışması
veya davranış) ekler. Tenant bağlamı `actor.tenantId`'den alınır; cross-
tenant IDOR koruması uygulanır.

- **Modül:** clinic (alerts)
- **Yetki:** `clinic:examination:create` (STAFF, VETERINARIAN)
- **Audit:** Severity `critical` ise `audit:alert.create` (info)
  yayınlanır. `warning` / `info` uyarılarda audit yazılmaz
  (klinik akışta gürültü kontrolü).
- **Idempotency:** Önerilir (`Idempotency-Key` header, FAZ-3+ ile
  zorunlu olacak).
- **Yan etki:** In-memory `byId` Map'e yeni kayıt;
  `id = alt-<tenant8>-<uuid8>` formatında üretilir.

## Request

**Path params:**

- `patientId` (UUID, zorunlu) — hasta ID. Tenant-scoped.

**Body (`AlertCreateInput`):**

```json
{
  "category": "allergy",
  "severity": "warning",
  "title": "Penisilin alerjisi",
  "description": "Penisilin grubu antibiyotiklere karşı bilinen reaksiyon.",
  "expiresAt": "2027-01-01T00:00:00.000Z"
}
```

- `category` (enum, zorunlu) — `allergy | chronic_condition |
medication_conflict | behavior`.
- `severity` (enum, zorunlu) — `info | warning | critical`.
  `critical` UI'da zorunlu dikkat, audit tetikler.
- `title` (string, 1-200, zorunlu) — kısa başlık.
- `description` (string, 1-2000, zorunlu) — detaylı açıklama.
- `expiresAt` (ISO 8601, opsiyonel) — süreli uyarılar için son
  geçerlilik. Geçmiş tarihli uyarılar `activeOnly=true` listesinde
  yer almaz.

## Response

**201 Created (`Alert`):**

```json
{
  "id": "alt-tnt-1234-ab12cd34",
  "tenantId": "tnt-uuid",
  "patientId": "pat-uuid",
  "category": "allergy",
  "severity": "warning",
  "title": "Penisilin alerjisi",
  "description": "Penisilin grubu antibiyotiklere karşı bilinen reaksiyon.",
  "createdAt": "2026-07-30T10:00:00.000Z",
  "createdBy": "usr-staff-uuid",
  "expiresAt": "2027-01-01T00:00:00.000Z",
  "archivedAt": null
}
```

## Hata kodları

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok veya tenant uyumsuz.
- `VET-AUTHZ-0002` (404) — Hasta bulunamadı (cross-tenant dahil).
- `VET-TENANT-0001` (400) — Tenant bağlamı zorunlu.
- `VET-VALIDATION-0001` (400) — Body şema doğrulaması başarısız
  (Zod: enum, min/max, datetime).

## Kullanım senaryoları

- Anamnez sırasında sahibinden öğrenilen alerji/kronik durum kaydı.
- Dış laboratuvar sonucu gelen kronik tanı (`chronic_condition`).
- Reçete oluştururken `medicationConflict` tarzı doğrudan eklenti.
- Davranış notu (agresyon, anksiyete) `behavior` kategorisi.

## Dikkat edilecek noktalar

- **Severity `critical`:** UI'da kırmızı zorunlu dikkat bandı
  olarak gösterilir ve audit `audit:alert.create` (info)
  otomatik yayınlanır. Audit payload: `patientId`, `category`,
  `severity`, `title`.
- **Süreli uyarılar:** `expiresAt` geçmiş tarihli olarak
  kaydedilirse `activeOnly=true` listesinde dönmez; ham
  `listForPatient` çağrısında görünür (arşivlenmemiş).
- **Soft delete:** Uyarı silinmez; `DELETE` endpoint'i
  `archivedAt` set eder.
- **KVKK:** Uyarı `title/description` alanlarına hasta sahibi
  PII'si yazılmamalı; audit yalnızca metadata içerir.

## İlgili dokümanlar

- API sözleşmesi: `packages/contracts/src/alert.ts`
  (`alertCreateInputSchema`, `alertSchema`)
- Akış: `docs/ai/AI_CHUNKS.yaml` → `flow-allergy-warning`
- Modül: `apps/api/src/modules/alerts/alerts.service.ts`
- Hasta: `api.get._api_v1_clinic_patients__id.md`
