# POST /api/v1/clinic/examinations/{id}/share

Muayeneye ait klinik kayıt PDF'ini seçilen kanallar (e-posta, SMS,
portal) üzerinden hasta sahibi ile paylaşır. Akış: PDF render →
`FileService.upload` (FAZ-0 in-memory stub) → kanallardan bildirim
gönderimi (FAZ-0 stub) → 7 gün geçerli share kaydı oluşturma.
Cross-tenant → 404 `VET-CLINIC-0001`.

- **Modül:** clinical-records
- **Yetki:** `clinic:report:export` (STAFF / VETERINARIAN)
- **Audit:** `audit:clinical-record.share` (severity: info) —
  shareId, examinationId, fileId, channels, sentChannels, pdfId,
  expiresAt.

**Path params:**

- `id` (string, zorunlu) — `exam-<tenant8>-<uuid8>`.

**Request body (`ClinicalRecordShareRequest`):**

```json
{
  "channels": ["email", "portal"]
}
```

- `channels` (`ShareChannel[]`, zorunlu, min 1) — Paylaşım
  kanalları. `email` | `sms` | `portal`. Boş liste → 422
  `VET-VALIDATION-0010`. Zod `.strict()` (bilinmeyen alan reddedilir).

**Response 200:**

```json
{
  "shareId": "crshare-7a1b2c3d-000001",
  "expiresAt": "2026-08-06T12:00:00.000Z",
  "sentChannels": ["email", "portal"]
}
```

- `shareId` (string) — `crshare-<tenant8>-<uuid8>` paylaşım kaydı
  kimliği.
- `expiresAt` (ISO 8601 datetime) — Paylaşım linki geçerlilik
  bitişi. `now + 7 gün` (FAZ-0); gerçek signed URL FAZ-10+'da.
- `sentChannels` (`ShareChannel[]`) — Yalnızca başarıyla gönderilen
  kanallar (kanal bazında hata olursa diğerleri devam eder, hata
  loglanır).

**Hata kodları:**

- `VET-AUTH-0001` (401) — Oturum geçersiz.
- `VET-AUTHZ-0001` (403) — Yetki yok.
- `VET-TENANT-0001` (400) — Aktif tenant yok.
- `VET-VALIDATION-0001` (422) — Body parse hatası (enum, `.strict()`).
- `VET-VALIDATION-0010` (422) — `channels` boş veya eksik.
- `VET-CLINIC-0001` (404) — Examination bulunamadı / cross-tenant.

**İş kuralları:**

- `shareWithPatient(tenantId, examinationId, channels, actor)`
  tenant-scoped; cross-tenant → 404 `VET-CLINIC-0001` (bilgi sızdırmaz).
- Zod şema `.strict()` — bilinmeyen alan reddedilir (422
  `VET-VALIDATION-0001`).
- `channels` en az 1 öğe içermelidir; boş → 422
  `VET-VALIDATION-0010`. Yinelenen kanallar Zod tarafından kabul
  edilir, servis her kanala ayrı bildirim gönderir.
- Kanal → bildirim eşlemesi: `email` → `email`, `sms` → `sms`,
  `portal` → `in_app`. Yeni `ShareChannel` eklenirse TypeScript
  exhaustiveness guard'ı compile-time uyarır.
- PDF buffer `generatePdf` üzerinden yeniden üretilir (audit + size
  takibi aynıdır).
- `FileService.upload` — `category: "lab_report"`, `mimeType:
"application/pdf"`, `visibility: "portal"`, `relatedEntityType:
"examination"`, `relatedEntityId: exam.id`. Gerçek S3/object
  storage entegrasyonu FAZ-10+'da.
- `getSignedUrl` 1 saat geçerli URL üretir; FAZ-0 stub hata
  durumunda `null` döner (warn log) — gerçek signed URL FAZ-10+'da.
- `NotificationService.send` her kanal için idempotency key
  `crshare:<pdfId>:<channel>` ile çağrılır; kanal bazında hata
  olursa diğer kanallar devam eder (kısmi başarı).
- 7 günlük `expiresAt` (= `now + 7 * 24 * 3600` saniye) share
  response'unda döner; UI'da geri sayım için kullanılır.
- `NotificationService`/`FileService` FAZ-0'da stub; tenant-scoped
  çalıştıkları için cross-tenant sızıntısı yok.

**Tenant izolasyonu:** Service `requireTenantScope(actor, tenantId)`
ile `actor.tenantId` kapsamı enforce edilir; cross-tenant denemesi →
403 `VET-AUTHZ-0001`.

**İlgili dokümanlar:**

- API sözleşmesi: `packages/contracts/src/clinical-record-share.ts`
- PDF render: `GET /api/v1/clinic/examinations/{id}/pdf`
- Paylaşım listesi: `GET /api/v1/clinic/examinations/{id}/shares`
- Paylaşım iptal: `DELETE /api/v1/clinic/shares/{shareId}`
- AI chunk: `clinical-record-share`
