# GET /api/v1/clinic/patients/:patientId/alerts

Bir hayvana ait klinik uyarıları listeler. Tenant-scoped; cross-tenant
erişim yok (bilgi sızdırmaz). Sonuç `createdAt` (ISO string) alanına
göre azalan sırada döner.

- **Modül:** clinic (alerts)
- **Yetki:** `clinic:patient:read` (STAFF, VETERINARIAN, OWNER
  portal `self_only`)
- **Audit:** Yok (read-only). KVKK kapsamında listeleme audit
  gerektirmez.
- **Idempotency:** N/A (GET).
- **Yan etki:** Yok.

## Request

**Path params:**

- `patientId` (UUID, zorunlu) — hasta ID. Tenant-scoped.

**Query (`AlertListQuery`):**

- `severity` (enum, opsiyonel) — `info | warning | critical`.
  Belirtilirse yalnızca o seviyedeki uyarılar döner.
- `activeOnly` (`"true" | "false"`, opsiyonel) — `true` ise
  `archivedAt=null` VE (`expiresAt=null` VEYA `expiresAt>now`).
  UI muayene/reçete sırasında bu parametreyi `true` olarak gönderir.

## Response

**200 OK (`AlertListResponse`):**

```json
{
  "items": [
    {
      "id": "alt-tnt-1234-ab12cd34",
      "tenantId": "tnt-uuid",
      "patientId": "pat-uuid",
      "category": "allergy",
      "severity": "critical",
      "title": "Anafilaksi",
      "description": "Arı sokması → anafilaktik şok.",
      "createdAt": "2026-07-30T10:00:00.000Z",
      "createdBy": "usr-vet-uuid",
      "expiresAt": null,
      "archivedAt": null
    },
    {
      "id": "alt-tnt-1234-ef56gh78",
      "tenantId": "tnt-uuid",
      "patientId": "pat-uuid",
      "category": "chronic_condition",
      "severity": "warning",
      "title": "Böbrek yetmezliği",
      "description": "NSAID kullanımı kontrendike.",
      "createdAt": "2026-06-12T08:30:00.000Z",
      "createdBy": "usr-vet-uuid",
      "expiresAt": null,
      "archivedAt": null
    }
  ],
  "total": 2
}
```

Sıralama: `createdAt` ISO string locale-compare azalan. Backend'in
yardımcı metodu `getActiveAlertsForPatient` ayrıca severity
ağırlığına göre de sıralar (`critical > warning > info`); ancak bu
endpoint `createdAt` sırası kullanır (UI tarafında severity
gruplanması önerilir).

## Hata kodları

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok veya tenant uyumsuz.
- `VET-TENANT-0001` (400) — Tenant bağlamı zorunlu.
- `VET-VALIDATION-0001` (400) — Query şema doğrulaması başarısız
  (severity enum veya activeOnly boolean string).

## Kullanım senaryoları

- Hayvanın klinik kartı açıldığında uyarı banner'larını yükleme
  (`activeOnly=true`).
- Reçete formunda ilaç yazılırken tüm uyarıları gösterme.
- Davranış notlarını listeleme (`severity=info`, kategorisiz).

## Dikkat edilecek noktalar

- **Aktif filtre:** `activeOnly=true` geçmiş `expiresAt` ve
  arşivlenen kayıtları otomatik dışlar. Süreli uyarılar için UI
  ayrıca "Süresi dolmuş" pasif bölümü gösterebilir.
- **Tenant izolasyonu:** `byId` Map üzerinde tüm kayıtlar
  `tenantId` filtresinden geçer; başka tenant uyarıları asla
  dönmez.
- **PII:** Yanıt hasta sahibi PII'si içermez; yalnızca uyarı
  içeriği (title, description). Audit gerektiğinde sahibin
  uyarı ekleme geçmişi için `audit:alert.create` event'ine
  başvurulur.
- **Performans:** In-memory Map (pilot). Production geçişinde
  Prisma `PatientAlert` tablosu + `tenantId/patientId/archivedAt`
  index önerilir.

## İlgili dokümanlar

- API sözleşmesi: `packages/contracts/src/alert.ts`
  (`alertListQuerySchema`, `alertListResponseSchema`)
- Akış: `docs/ai/AI_CHUNKS.yaml` → `flow-allergy-warning`
- Modül: `apps/api/src/modules/alerts/alerts.service.ts`
- İlaç çakışma: `medication-conflict-check` (chunk)
- Hasta: `api.get._api_v1_clinic_patients__id.md`
