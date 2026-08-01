# GOAL-047 Completion Report — Klinik kayıt PDF ve paylaşım

- Goal no: GOAL-047
- Başlık: Klinik kayıt PDF ve paylaşım
- Faz: FAZ-4 (Klinik muayene/aşı/reçete)
- Durum: ✅ Tamamlandı
- Tarih: 2026-07-30
- Core commit: 6dd4704
- **Bu PR ile FAZ-4 kapanmıştır.**

## Yapılan işler (core)

**ClinicalRecordsService** (`apps/api/src/modules/clinical-records/clinical-records.service.ts`):

- **`generatePdf(tenantId, examinationId, actor)`** — Examination
  aynı tenant'ta mı (cross-tenant → 404 `VET-CLINIC-0001`). Alt
  kayıtlar `Promise.all` ile paralel (SOAP + Vitals + Diagnoses +
  Prescriptions + Orders + Followups). FAZ-0'da `text/plain`
  placeholder buffer döner; gerçek PDF (header/footer/logo + imza +
  watermark) FAZ-10+'da `pdfkit`/`puppeteer`. Audit
  `audit:clinical-record.generate` (info) — examinationId, patientId,
  veterinarianId, format, sizeBytes, sections.
- **`shareWithPatient(tenantId, examinationId, channels, actor)`** —
  PDF render → `FileService.upload` (FAZ-0 in-memory stub,
  `category: "lab_report"`, `mimeType: "application/pdf"`,
  `visibility: "portal"`) → `getSignedUrl` 1 saat (FAZ-0 stub) →
  kanallardan `NotificationService.send` (email/sms/in_app,
  idempotencyKey=`crshare:<pdfId>:<channel>`) → 7 gün geçerli share
  kaydı. Kanal bazında hata olursa diğer kanallar devam eder
  (kısmi başarı). `channels` en az 1 öğe (boş → 422
  `VET-VALIDATION-0010`). Audit `audit:clinical-record.share` (info).
- **`listShares(tenantId, examinationId, actor)`** — Examination
  aynı tenant'ta mı, repo `findByExamination` ile createdAt desc.
  Audit üretmez (okuma).
- **`revokeShare(tenantId, shareId, actor)`** — Soft delete
  (`revokedAt` set). **İdempotent** (zaten iptal no-op). Audit
  `audit:clinical-record.revoke` (warning).

**Sözleşme** (`packages/contracts/src/clinical-record-share.ts`):
`shareChannelSchema` (email|sms|portal),
`clinicalRecordShareRequestSchema` (`channels` min 1, Zod `.strict()`),
`clinicalRecordShareSchema`, `clinicalRecordShareListSchema`,
`clinicalRecordPdfResponseSchema`. Kanal → bildirim eşlemesi TypeScript
exhaustiveness guard ile korunur.

**ClinicalRecordsController** — 4 endpoint (`@Controller("api/v1/clinic")`):

- `GET    /api/v1/clinic/examinations/{id}/pdf` (`pdf`, yetki
  `clinic:examination:read`, FAZ-0 `text/plain` + `Content-Disposition:
attachment`).
- `POST   /api/v1/clinic/examinations/{id}/share` (`share`, yetki
  `clinic:report:export`, `@HttpCode(200)`).
- `GET    /api/v1/clinic/examinations/{id}/shares` (`listShares`, yetki
  `clinic:examination:read`).
- `DELETE /api/v1/clinic/shares/{shareId}` (`revoke`, yetki
  `clinic:report:export`, `@HttpCode(204)`, idempotent).

**10 unit test** (`clinical-records.service.spec.ts`):
generatePdf başarı + alt kayıt section sayıları + audit, cross-tenant
→ 404; shareWithPatient başarı + 7 gün expiresAt + sentChannels +
audit, boş channels → 422, kanal bazında hata kısmi başarı; listShares
sıralama + cross-tenant → 404; revokeShare normal + idempotent
(zaten revoked) + cross-tenant → 404; audit başına 1 kez event
çağrı sayacı.

## Tasarım kararları

- **FAZ-0 placeholder PDF:** Gerçek `pdfkit`/`puppeteer` entegrasyonu
  FAZ-10+'da. Şu an `text/plain` buffer döner; HTTP semantiği
  (Content-Disposition, attachment) korunur, sözleşme aynı.
- **7 gün TTL:** `expiresAt = now + 7 * 24 * 3600 saniye`. UI
  geri sayım için kullanır; gerçek signed URL mekanizması
  FAZ-10+'da devreye girer.
- **3 farklı kanal:** email/sms/portal. Portal kanalı in-app
  bildirime eşlenir; type-safe mapping TypeScript exhaustiveness
  guard ile korunur.
- **Kısmi başarı:** Bir kanalda `NotificationService` hata verirse
  diğer kanallara devam edilir, hata loglanır. `sentChannels`
  yalnızca başarıyla gönderilenleri içerir; `channels` (istek) ve
  `sentChannels` (gerçek) ayrımı UI için bilgi taşır.
- **Idempotent revoke:** Zaten `revokedAt !== null` olan kayıt için
  no-op (ek audit yazılmaz). KVKK uyumu için revoke aksiyonu
  görünür warning severity ile loglanır.
- **Cross-tenant koruması:** Examination/share `findById(tenantId, id, actor)`
  cross-tenant → null → 404 `VET-CLINIC-0001` (bilgi sızdırmaz). Tüm
  aksiyonlar `requireTenantScope` ile tenant-scoped.
- **Audit severity:** generate/share `info` (read/create);
  revoke `warning` (KVKK uyumu için görünür).
- **FileService/NotificationService stub:** FAZ-0'da in-memory
  çalışır; gerçek S3/object storage + SMTP/Twilio FAZ-10+'da.
  Mime whitelist (`application/pdf`) ve visibility (`portal`)
  semantiği korunur.
- **Append-only politika:** Share kaydı fiziksel silinmez;
  `revokedAt` ile soft delete. İlişkili dosya silinmez
  (`visibility: "portal"` arşivde kalır).
- **In-memory repo:** Faz 0 sözleşmesi; DB migration ileride
  (`clinicalRecordShare` tablosu, tenant_id + examinationId index,
  revokedAt partial index).

## Doküman ve i18n (bu PR)

- `docs/api/api.get._api_v1_clinic_examinations__id_pdf.md`
- `docs/api/api.post._api_v1_clinic_examinations__id_share.md`
- `docs/api/api.get._api_v1_clinic_examinations__id_shares.md`
- `docs/api/api.delete._api_v1_clinic_shares__shareId.md`
- `docs/ai/AI_CHUNKS.yaml` (`clinical-record-share` chunk'ı eklendi)
- `docs/errors/AUDIT_EVENTS.yaml` (`clinical_record` bloğu + 3 event:
  `audit:clinical-record.generate` / `share` / `revoke`)
- `goals/GOAL-047_COMPLETION_REPORT.md` (bu rapor)
- `PROJECT_CONTEXT.md` (Faz 4 ✅ + GOAL-047 ✅ + Faz 5 ⏳ sırada)

Hata kataloğu: yeni hata kodu eklenmedi (mevcut `VET-CLINIC-0001`,
`VET-VALIDATION-0010`, `VET-AUTHZ-0001`, `VET-TENANT-0001`,
`VET-AUTH-0001` kullanıldı). i18n: yeni anahtar eklenmedi (mevcut
`error.VET-CLINIC-0001` / `error.VET-VALIDATION-0010` vb. yeterli).

## Yapılmayan (ileride)

- DB migration (in-memory repo → Prisma, `clinicalRecordShare`
  tablosu, `tenantId` + `examinationId` index, `revokedAt` partial
  index).
- Gerçek PDF render (`pdfkit`/`puppeteer` + tenant header/footer/logo
  - veteriner imza alanı + `confidential` watermark + çok sayfalı
    yapı). FAZ-10+.
- Gerçek signed URL mekanizması (S3/object storage presigned
  veya app-issued HMAC token + revocation). FAZ-10+.
- `NotificationService` gerçek kanal adapter'ları (SMTP/Twilio/FCM
  - portal in-app). FAZ-10+.
- Frontend paylaşım CTA (muayene detayında "Paylaş" butonu + kanal
  seçici + sent/pending durum göstergesi + geri sayım).
- Paylaşım listesi UI (aktif/iptal badge + sentChannels durumu).
- Şifreli e-posta gövdesi (klinik kayıt inline değil, link ile).
