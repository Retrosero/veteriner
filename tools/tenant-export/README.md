# @vetniva/tenant-export (GOAL-125, FAZ-12)

Tenant veri dışa aktarma paketi. Yetkili tenant yöneticisinin
müşteri, hayvan, klinik kayıt, finans ve dosya verilerini
güvenli dışa aktarabilmesi için:

- 10 dataset (owners, patients, examinations, vaccinations,
  prescriptions, sales, payments, lab_results, imaging_orders,
  files)
- 2 format (JSON pretty-print, CSV flat)
- PII kontrol modu (strict/permissive)
- `audit:tenant.export.created` event üretimi
- Tenant-scoped data source interface (production'da Prisma
  repository'ye bağlanır)

Tenant izolasyonu, PII mask ve audit kurallarına uyar.

## Kurulum

```bash
pnpm --filter @vetniva/tenant-export type-check
pnpm --filter @vetniva/tenant-export test   # 21 test
pnpm --filter @vetniva/tenant-export validate
```

## Çalıştırma

```bash
# Demo veri ile dry-run
pnpm --filter @vetniva/tenant-export export -- \
  --tenant=tnt-pilot-kadikoy --exported-by=usr-admin \
  --datasets=owners,patients,examinations \
  --format=json --pii=strict \
  --out=./temp/tenant-export.json --with-demo-data --dry-run

# Gerçek dosyaya yazma
pnpm --filter @vetniva/tenant-export export -- \
  --tenant=tnt-pilot-kadikoy --exported-by=usr-admin \
  --datasets=owners,patients \
  --format=json --pii=strict \
  --out=./temp/tenant-export.json --with-demo-data
```

> **PowerShell notu:** `--datasets=owners,patients` virgülü
> array separator olarak yorumlanır. Tırnak içinde verin:
> `"--datasets=owners,patients"`.

## PII Kontrol Modları

| Mod          | Davranış                                                                    | Audit   |
| ------------ | --------------------------------------------------------------------------- | ------- |
| `strict`     | PII alanları mask'lenir (`De***mo`); export dosyası PII içermez             | info    |
| `permissive` | PII alanları olduğu gibi kalır (veri sahibinin kendi verisi); audit warning | warning |

Tespit edilen PII alanları: `firstName`, `lastName`, `fullName`,
`email`, `phone`, `taxId`, `iban`, `passportNo`, `idCardNo`,
`address`, `vetLicenseNo`, `birthDate`, `password`, `token`,
`refreshToken`, `apiKey`, `secret`, `authorization`, `cookie`.

## Çıktı Şeması (JSON)

```json
{
  "exportId": "exp-uuid",
  "tenantId": "tnt-uuid",
  "tenantSlug": "pilot-vet-kadikoy",
  "exportedAt": "2026-08-03T...",
  "exportedBy": "usr-uuid",
  "format": "json",
  "version": "1.0.0",
  "piiCheck": "strict",
  "piiFieldsDetected": 4,
  "data": {
    "owners": [{ "id": "...", "firstName": "De***mo", ... }],
    "patients": [...]
  },
  "retentionNotice": {
    "message": "Tibbi kayitlar KVKK Madde 7 uyarinca 7 yil saklanir.",
    "legalBasis": "KVKK_MADDE_7",
    "retentionYears": 7
  }
}
```

## Audit Event

Her export `audit:tenant.export.created` event'i üretir:

```json
{
  "eventName": "audit:tenant.export.created",
  "tenantId": "tnt-uuid",
  "actorId": "usr-admin",
  "actorType": "user",
  "format": "json",
  "datasets": ["owners", "patients"],
  "totalRows": 5,
  "piiMasked": true,
  "occurredAt": "2026-08-03T...",
  "correlationId": "req-uuid",
  "country": "TR",
  "release": "0.1.0"
}
```

## Production Entegrasyonu

CLI `InMemoryTenantDataSource` ile çalışır (test/demo).
Production'da Prisma repository'yi inject eden
`PrismaTenantDataSource` adapter'ı yazılır:

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
değişmez (sadece data source inject edilir).

## Sınırlamalar

- **CSV format** yalnızca flat row formatını destekler;
  nested objeler JSON-stringified (FAZ-13+ iyileştirme)
- **S3 upload** henüz yok; export dosyası local FS'e yazılır
  (FAZ-13+ S3 adapter)
- **Client-side encryption** FAZ-12+ planlanmıştır
- **Scheduled exports** FAZ-13+ (haftalık otomatik)
- **Rate limit** default 1 export/gün/tenant (production'da
  backend tarafında uygulanır)

## Bilinen Sınırlamalar

- CSV'de nested objeler JSON-stringified olarak yazılır
- In-memory data source production'da kullanılmaz
- `WithDemoData` flag sadece CLI test/dryRun içindir
- Production'da gerçek audit logger (apps/api
  AuditService) ile entegre çalışmalıdır
