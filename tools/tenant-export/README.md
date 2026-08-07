# @vetniva/tenant-export (GOAL-125, FAZ-12)

Tenant veri dışa aktarma paketi. Owner/patient/examination/vaccination/
prescription/sale/payment/lab/imaging/file dataset'leri için JSON/CSV
export, PII kontrolü, audit log üretimi. Tenant izolasyonu, PII
maskeleme ve KVKK/UK GDPR uyumlu retention kurallarına uyar.

## Hızlı başlangıç

```bash
# 1) In-memory dry-run (DB bağlantısı yok, demo verisi)
pnpm --filter @vetniva/tenant-export export -- \
  --tenant=tnt-pilot --exported-by=usr-admin \
  --datasets=owners,patients,examinations \
  --format=json --pii=strict \
  --out=./tenant-export.json --dry-run

# 2) Gerçek Prisma veri kaynağı (production/pilot)
pnpm --filter @vetniva/tenant-export export -- \
  --tenant=<uuid> --exported-by=<user-id> \
  --datasets=owners,patients,examinations \
  --format=json --pii=strict \
  --out=./temp/tenant-export.json --with-prisma

# 3) Katalog doğrulama
pnpm --filter @vetniva/tenant-export validate
```

## Ortam değişkenleri

| Değişken          | Zorunlu         | Açıklama                                             |
| ----------------- | --------------- | ---------------------------------------------------- |
| `DATABASE_URL`    | `--with-prisma` | Prisma bağlantı URL'si (Coolify `vetniva` şeması)    |
| `PII_HASH_SECRET` | hayır           | PII maskeleme için SHA-256 salt (production zorunlu) |

## CLI bayrakları

| Bayrak          | Zorunlu | Açıklama                                                 |
| --------------- | ------- | -------------------------------------------------------- |
| `--tenant`      | evet    | Tenant UUID veya slug                                    |
| `--exported-by` | evet    | Export işlemini başlatan kullanıcı ID                    |
| `--datasets`    | hayır   | Virgülle ayrılmış dataset listesi (default: tümü)        |
| `--format`      | hayır   | `json` veya `csv` (default: `json`)                      |
| `--pii`         | hayır   | `strict` (PII mask) veya `none` (raw export, KVKK risk)  |
| `--country`     | hayır   | `TR` veya `GB` (KVKK/UK GDPR retention farkları)         |
| `--release`     | hayır   | Uygulama release tag (audit log metadata)                |
| `--out`         | hayır   | Çıktı dosya yolu (default: stdout)                       |
| `--dry-run`     | hayır   | Dry-run modu (in-memory data source, gerçek DB dokunmaz) |
| `--with-prisma` | hayır   | `PrismaTenantDataSource` kullan (production/pilot)       |

## Bileşenler

| Dosya                              | Açıklama                                                     |
| ---------------------------------- | ------------------------------------------------------------ |
| `src/index.ts`                     | Public API: `exportTenantData`, `ALL_DATASETS`, tip export   |
| `src/types.ts`                     | `ExportDataset`, `PiiCheckLevel`, `ExportOptions` tanımları  |
| `src/export.ts`                    | `exportTenantData` orkestratörü + dataset dispatch           |
| `src/pii-masker.ts`                | `StandardPiiMasker`: e-posta, telefon, TCKN maskeleme        |
| `src/prisma-data-source.ts`        | `PrismaTenantDataSource`: gerçek DB bağlantısı, tenant scope |
| `src/cli-export.ts`                | CLI entry: argüman parse + orchestrate + çıktı yaz           |
| `src/cli-validate.ts`              | Katalog tutarlılık doğrulama                                 |
| `tests/export.test.ts`             | Export orkestrasyon testleri                                 |
| `tests/pii-masker.test.ts`         | PII maskeleme doğruluk testleri                              |
| `tests/prisma-data-source.test.ts` | Prisma data source + tenant scope testleri                   |
| `tests/types.test.ts`              | Tip güvenliği + dataset coverage                             |

## Veri kaynakları

### InMemoryTenantDataSource (default, CI/dry-run)

Demo verisi ile çalışır. DB bağlantısı gerektirmez. `--dry-run` veya
`PrismaTenantDataSource` inject edilmediğinde otomatik seçilir.

```ts
import {
  exportTenantData,
  InMemoryTenantDataSource,
} from "@vetniva/tenant-export";

await exportTenantData({
  tenantId: "tnt-pilot",
  exportedBy: "usr-admin",
  datasets: ["owners", "patients"],
  piiCheck: "strict",
  dataSource: new InMemoryTenantDataSource(),
});
```

### PrismaTenantDataSource (production/pilot)

`@prisma/client` ile gerçek DB bağlantısı. `--with-prisma` veya
`PrismaTenantDataSource` inject edildiğinde seçilir.

```ts
import { PrismaClient } from "@prisma/client";
import {
  exportTenantData,
  PrismaTenantDataSource,
} from "@vetniva/tenant-export";

const prisma = new PrismaClient();
await exportTenantData({
  tenantId: "<uuid>",
  exportedBy: "<user-id>",
  datasets: ["owners", "patients", "examinations"],
  piiCheck: "strict",
  dataSource: new PrismaTenantDataSource(prisma),
});
```

## PII maskeleme (KVKK/UK GDPR)

`--pii=strict` (default) ile aşağıdaki alanlar maskelenir:

- `email` → `m***@example.com`
- `phone` → `+90*****1234`
- `tckn` (TC Kimlik No) → `***********`
- `microchip` → `***********` (pilot operatörün görebileceği son 2 hane)
- `address` → şehir/ilçe seviyesine indirgenir, sokak/cadde maskelenir

`--pii=none` yalnızca development ortamında kullanılmalıdır; **production
export'larında `--pii=strict` zorunlu** (CI gate: `cli-validate`).

## Audit log

Her export işlemi `export_audit_log` tablosuna kaydedilir:

- `tenant_id`, `exported_by`, `exported_at`
- `datasets` (virgülle ayrılmış)
- `pii_check` (`strict` veya `none`)
- `record_count` (her dataset için)
- `release` (uygulama versiyonu)

## Test

```bash
# Unit + integration
pnpm --filter @vetniva/tenant-export test

# Tip kontrolü
pnpm --filter @vetniva/tenant-export type-check

# Build
pnpm --filter @vetniva/tenant-export build
```

21 test (export + PII mask + Prisma data source + types), hepsi
`--with-prisma` modunda `InMemoryTenantDataSource` ile çalışır; gerçek
Prisma bağlantısı sadece `prisma-data-source.test.ts` integration test'inde
zorunlu.

## İlgili dokümanlar

- [`goals/GOAL-125-archive/tenant-export-readiness-2026-08-06.md`](../../goals/GOAL-125-archive/tenant-export-readiness-2026-08-06.md)
- [`docs/security/KVKK_DATA_LIFECYCLE.md`](../../docs/security/KVKK_DATA_LIFECYCLE.md)
- [`packages/contracts/src/kvkk.ts`](../../packages/contracts/src/kvkk.ts) (KVKK tip tanımları)
