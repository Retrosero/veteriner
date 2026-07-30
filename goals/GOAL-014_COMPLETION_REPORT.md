# GOAL-014 Completion Report — Dosya ve medya servisi

## Goal

- Goal no: GOAL-014
- Başlık: Dosya ve medya servisi
- Faz: FAZ-2 (Klinik & medya)
- Durum: ✅ Tamamlandı
- Tarih: 2026-07-30

## Yapılan işler (özet)

- **StorageDriver** interface + iki implementasyon: `LocalStorageDriver`
  (process-local `Map<key, Buffer>`) ve `S3StorageDriver` (stub,
  üretimde AWS SDK ile değiştirilecek). Driver seçimi `STORAGE_DRIVER`
  env'inden çözümlenir; API imzaları sabit kalır.
- **Antivirus** interface + `ClamAvScanner` stub. `scan(buffer)`
  `Promise<{ clean: boolean; signature?: string }>` döner; temiz
  değilse yükleme `VET-FILE-0004` (422) ile reddedilir.
- **FilesService**: `upload` / `download` / `getMeta` / `archive` /
  `signedUrl` (S3 stub). MIME whitelist + kategori-bazlı boyut sınırı
  (10 MB) + antivirus pipeline. Tenant izolasyonu `tenantId` üzerinden
  sağlanır; cross-tenant denemeler 404 ile sessizce reddedilir (bilgi
  sızdırmaz).
- **FilesController** (`/api/v1/files`): `POST` upload (multipart),
  `GET /:id` meta, `GET /:id/download` stream, `DELETE /:id` arşiv.
  RBAC: `file:file:upload|read|delete`. Multipart `@nestjs/platform-express`
  `FileInterceptor` ile alınır.
- **Hata kodları** (core commit'inde): `VET-FILE-0001` (413 — boyut),
  `VET-FILE-0002` (415 — MIME), `VET-FILE-0003` (404 — bulunamadı),
  `VET-FILE-0004` (422 — antivirus).
- **14 yeni test** (service.spec.ts): upload happy path, MIME reddi,
  boyut aşımı, antivirus pozitif/negatif, tenant izolasyonu, arşivleme
  sonrası erişim reddi, signedUrl davranışı, storage driver seçimi.

## Değişen dosyalar (core + docs)

**Core (commit 1bd88fc):**

- `apps/api/src/common/files/file.types.ts` — yeni (FileMeta, FileCategory, FileMimeType, FILE_LIMITS).
- `apps/api/src/common/files/storage-driver.interface.ts` — yeni.
- `apps/api/src/common/files/storage/local-storage.driver.ts` — yeni (Map).
- `apps/api/src/common/files/storage/s3-storage.driver.ts` — yeni (stub).
- `apps/api/src/common/files/antivirus/antivirus.interface.ts` — yeni.
- `apps/api/src/common/files/antivirus/clamav.scanner.ts` — yeni (stub).
- `apps/api/src/modules/files/files.service.ts` — yeni.
- `apps/api/src/modules/files/files.service.spec.ts` — yeni (14 test).
- `apps/api/src/modules/files/files.controller.ts` — yeni.
- `apps/api/src/modules/files/files.module.ts` — yeni.
- `apps/api/src/modules/files/index.ts` — yeni.
- `apps/api/src/app.module.ts` — `FilesModule` import.
- `packages/contracts/src/file.ts` + `index.ts` — paylaşılan tipler.

**Doküman & i18n (bu commit):**

- `goals/GOAL-014_COMPLETION_REPORT.md` — yeni (bu dosya).
- `PROJECT_CONTEXT.md` — GOAL-014 ✅ işaretlendi.
- `docs/errors/ERROR_CATALOG.md` — `VET-FILE-0001..0004` bölümü (core commit).
- `packages/i18n/src/locales/tr-TR.json` + `en-GB.json` — `error.VET-FILE-0001..0004` çevirileri.
- `docs/ai/AI_CHUNKS.yaml` — `file-upload-overview` + `file-archive-policy` chunk'ları.
- `docs/api/API_CATALOG.md` — Dosya bölümü.
- `docs/api/api.post._api_v1_files.md` — yeni (POST upload).
- `docs/api/api.get._api_v1_files__id.md` — yeni (GET meta).

## Notlar ve tasarım kararları

- **In-memory storage:** FAZ-2'de `Map` yeterli. Üretimde `S3StorageDriver`
  aktif edilir; aynı `StorageDriver` interface'i korunur. Restart
  sırasında kayıp tolere edilir (henüz DB persistence yok).
- **Antivirus stub:** `ClamAvScanner.scan` her zaman `{ clean: true }`
  döner. Üretim ortamında `clamd` socket'e bağlanan implementasyon
  eklenecek; test'lerde mock kullanılır.
- **Soft-delete / arşivleme:** Fiziksel silme YASAK (KVKK & klinik
  kayıt bütünlüğü). `archive()` meta'yı `archivedAt` set eder;
  storage'da dosya kalır. 90 gün sonra retention job ile purge
  (ileride).
- **MIME whitelist:** 4 tip — `image/jpeg`, `image/png`,
  `application/pdf`, `application/dicom`. Whitelist dışı MIME 415.
- **Boyut limiti:** 10 MB / dosya. Aşılırsa `VET-FILE-0001` (413).
  İleride kategori-bazlı (ör. imaging 50 MB) değiştirilebilir.
- **Tenant izolasyonu:** Tüm sorgularda `tenantId` filtresi. Cross-tenant
  deneme → 404 (bilgi sızdırmaz). SUPERADMIN tüm tenant'ları görebilir.
- **Audit:** `audit:file.upload` (info), `audit:file.download`
  (info), `audit:file.archive` (warning). Metadata'da `category`,
  `mimeType`, `sizeBytes`; PII (orijinal dosya adı) mask'lenir.
- **Idempotency:** Upload için `Idempotency-Key` header desteği
  ileride eklenecek; şu an aynı dosya iki kez yüklenebilir (DB
  persistence sonrası unique constraint).

## Veritabanı değişiklikleri

Yok (in-memory Map). İleride `FileMeta` tablosu (`tenant_id`,
`storage_key`, `category`, `mime_type`, `size_bytes`, `archived_at`,
audit meta) Prisma ile eklenecek; service imzaları korunur.

## API değişiklikleri

- `POST   /api/v1/files`                — Upload (multipart). Body: `file` (binary), `category`, `relatedEntityType?`, `relatedEntityId?`. Auth + `file:file:upload`. 201 → `FileMeta`.
- `GET    /api/v1/files/:id`            — Meta. Auth + `file:file:read`. 200 → `FileMeta`. 404 (`VET-FILE-0003`) cross-tenant dahil.
- `GET    /api/v1/files/:id/download`   — Binary stream. Auth + `file:file:read`.
- `DELETE /api/v1/files/:id`            — Archive. Auth + `file:file:delete`. 204.
- `POST   /api/v1/files/:id/signed-url` — S3 signed URL (S3 driver seçiliyse). Auth + `file:file:read`. Üretim öncesi stub.

## Test sonucu

- Unit: 14 yeni test eklendi. tsc + vitest temiz.
- Tenant isolation: 2 negatif test (cross-tenant read + delete).
- Negative path: MIME reddi (2), boyut aşımı (1), antivirus pozitif
  (1), bulunamadı (2). Negative-only test oranı ≈ %40.
- Başarısız test: 0.

## Log ve audit

- `audit:file.upload` (info) — `metadata: { fileId, category, mimeType, sizeBytes, relatedEntity? }`.
- `audit:file.download` (info) — `metadata: { fileId }` (sık erişim → rate-limited, ileride).
- `audit:file.archive` (warning) — `metadata: { fileId, category, reason? }`.

PII alanları (orijinal dosya adı, relatedEntityId) mask'lenerek
loglanır.
