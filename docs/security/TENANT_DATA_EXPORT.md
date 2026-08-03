# Tenant Veri Dışa Aktarma (GOAL-125)

## Faz

FAZ-12 (Pilot, güvenlik, üretime hazırlık)

## Amaç

Yetkili tenant yöneticisinin müşteri, hayvan, klinik
kayıt, finans ve dosya verilerini güvenli dışa
aktarabilmesi. Asenkron çalışır + süreli indirme
bağlantısı sunar + audit üretir.

## Endpoint'ler (planlanan)

| #   | Method | Path                                   | Yetki                  |
| --- | ------ | -------------------------------------- | ---------------------- |
| 1   | POST   | `/api/v1/tenant/{tenantId}/exports`    | `tenant:export:create` |
| 2   | GET    | `/api/v1/tenant/exports`               | `tenant:export:read`   |
| 3   | GET    | `/api/v1/tenant/exports/{id}`          | `tenant:export:read`   |
| 4   | GET    | `/api/v1/tenant/exports/{id}/download` | `tenant:export:read`   |
| 5   | DELETE | `/api/v1/tenant/exports/{id}`          | `tenant:export:delete` |

## İş Kuralları

### Export Oluşturma

1. **Yetki kontrolü:** `tenant:export:create` permission'ı
   - aktör `actor.tenantId` ile aynı tenant.
2. **Asenkron job:** BullMQ queue'ya eklenir; status
   `pending → running → completed | failed`.
3. **Veri setleri:** owners, patients, examinations,
   vaccinations, prescriptions, sales, payments,
   lab_results, imaging_orders, files.
4. **Format:** JSON (NDJSON streaming); CSV opsiyonel
   (FAZ-13+).
5. **Compression:** gzip.
6. **Encryption:** tenant public key ile encrypt
   (FAZ-12+); client-side decrypt.
7. **Audit:** `audit:tenant.export.created` (info).

### Job Lifecycle

```
pending → running → completed (download URL)
              ↘ failed (retry 3x → dead_letter)
```

### Download URL

- **Signed URL:** 24 saat geçerli.
- **S3 pre-signed URL** veya internal JWT token.
- **One-time:** indirildikten sonra audit event'i
  üretilir; URL re-use edilemez (opsiyonel).
- **Audit:** `audit:tenant.export.downloaded` (warning).

### Retention

- Export dosyası 30 gün saklanır; sonra otomatik silinir
  (KVKK minimum retention).
- Export metadata (id, tenantId, createdAt, status)
  audit tablosunda 7 yıl tutulur.

## Core Export Aracı (tools/tenant-export)

`tools/tenant-export` paketi tenant veri dışa aktarma
mantığını içerir. 10 dataset + JSON/CSV format + PII
kontrol modu + audit event üretimi sağlar.

### Çalıştırma

```bash
pnpm --filter @vetniva/tenant-export type-check
pnpm --filter @vetniva/tenant-export test   # 21 test
pnpm --filter @vetniva/tenant-export validate

# Demo data ile dry-run
pnpm --filter @vetniva/tenant-export export -- \
  --tenant=tnt-pilot-kadikoy --exported-by=usr-admin \
  --datasets=owners,patients,examinations \
  --format=json --pii=strict \
  --out=./temp/tenant-export.json \
  --with-demo-data --dry-run
```

> **PowerShell notu:** `--datasets=owners,patients`
> tırnak içinde verilmelidir.

### PII Kontrol Modları

| Mod          | Davranış                                                              |
| ------------ | --------------------------------------------------------------------- |
| `strict`     | PII alanları mask'lenir (`De***mo`); export PII içermez               |
| `permissive` | PII alanları olduğu gibi (veri sahibinin kendi verisi); audit warning |

### Production Entegrasyonu

CLI `InMemoryTenantDataSource` ile çalışır (test/demo).
Production'da `PrismaTenantDataSource` adapter'ı yazılır:

```typescript
class PrismaTenantDataSource implements TenantDataSource {
  constructor(private prisma: PrismaClient) {}
  async listForTenant(tenantId, dataset) {
    // dataset -> Prisma model mapping
    // WHERE tenantId = ${tenantId} (zorunlu filtre)
  }
}
```

Adapter'lar `apps/api/src/common/adapters/` altında
Prisma'ya bağlanır; `exportTenantData` core mantığı
değişmez.

### Audit Event

Her export `audit:tenant.export.created` event'i üretir
(`tenantId` + `actorId` + `actorType` + `format` +
`datasets` + `totalRows` + `piiMasked` + `occurredAt` +
`correlationId` alanlarıyla).

```json
{
  "exportId": "exp-uuid",
  "tenantId": "tnt-uuid",
  "tenantSlug": "pilot-vet-kadikoy",
  "exportedAt": "2026-07-31T10:00:00.000Z",
  "exportedBy": "usr-uuid",
  "format": "json",
  "version": "1.0.0",
  "data": {
    "owners": [
      { "id": "own-uuid", "firstName": "...", "lastName": "...",
        "phone": "...", "email": "...", "createdAt": "..." }
    ],
    "patients": [
      { "id": "pat-uuid", "name": "Karabaş", "species": "dog",
        "microchip": "...", "ownerId": "own-uuid", "createdAt": "..." }
    ],
    "examinations": [
      { "id": "exm-uuid", "patientId": "pat-uuid", "kind": "general",
        "startedAt": "...", "completedAt": "...", "soap": {...} }
    ],
    "vaccinations": [
      { "id": "vac-uuid", "patientId": "pat-uuid", "vaccineId": "...",
        "appliedAt": "...", "nextDueAt": "..." }
    ],
    "prescriptions": [],
    "sales": [],
    "payments": [],
    "lab_results": [],
    "imaging_orders": [],
    "files": [
      { "id": "file-uuid", "name": "xray.pdf", "size": 12345,
        "url": "https://...", "category": "lab_report" }
    ]
  },
  "retentionNotice": {
    "message": "Tıbbi kayıtlar KVKK Madde 7 uyarınca 7 yıl saklanır.",
    "legalBasis": "KVKK_MADDE_7",
    "retentionYears": 7
  }
}
```

## Güvenlik

- **PII:** PII alanları mask'lenmeden döner (veri
  sahibinin kendi verisi). Üçüncü kişilere aktarım
  YOK.
- **Encryption at-rest:** S3 SSE-S3 + client-side
  encryption (tenant public key).
- **Encryption in-transit:** TLS 1.3+ zorunlu.
- **Rate limit:** 1 export/gün/tenant (default); SUPERADMIN
  override.
- **Audit:** tüm aksiyonlar `audit:tenant.export.*`
  event'i üretir.

## UI Akışı

1. `/settings/export` → "Veriyi Dışa Aktar" butonu.
2. Modal: format seç (JSON / CSV), include options
   (clinical / financial / files).
3. "Oluştur" → POST → redirect to /exports.
4. /exports sayfası: job listesi, status, download butonu.
5. "İndir" → signed URL ile S3'ten dosya indir.

## Yapılmayanlar / Bilinçli Atlamalar

- **CSV / Excel export** → Faz 13+ (FAZ-12 yalnızca JSON).
- **Scheduled exports (haftalık otomatik)** → Faz 13+.
- **S3 Glacier long-term storage** → Faz 13+ (KVKK
  retention 7 yıl).
- **Tenant cross-region export** → Faz 13+ (multi-region
  disaster için).
- **Client-side encryption UI** → Faz 12+ (web crypto
  API + key management).

## Commit

- Docs: (bu commit) — `docs(security): GOAL-125 tenant veri dışa aktarma dokümanı`
