# GOAL-125 — Tenant Veri Dışa Aktarma Hazırlık Raporu

**Tarih:** 2026-08-06
**Durum:** 21/21 unit test geçti, demo data dry-run başarılı, canlı
Prisma runbook hazır.

## Özet

VetNiva tenant veri dışa aktarma (GOAL-125, FAZ-12) hazır:

- **21/21 unit test** geçti (`pii-masker.test.ts` + `export.test.ts`).
- **Demo data dry-run** başarıyla çalıştı (1 owner + 1 patient +
  1 examination; 4 PII alan mask'lendi).
- **3 data source modu** destekleniyor: empty / demo / Prisma.
- **Audit event** her export'ta üretilir
  (`audit:tenant.export.created`).
- **PII masker** strict modda çalışıyor (4 PII alan tespit +
  mask).

## Unit Test Sonuçları

| Test Dosyası                     | Test Sayısı | Durum                      |
| -------------------------------- | ----------- | -------------------------- |
| tests/pii-masker.test.ts         | 9           | ✅                         |
| tests/export.test.ts             | 12          | ✅                         |
| tests/prisma-data-source.test.ts | 10          | 🟡 DB gerekli (port 55432) |
| **Toplam (DB olmadan)**          | **21**      | **✅ 21/21**               |

Çalıştırma: `pnpm --filter @vetniva/tenant-export exec vitest run --exclude='**/prisma-data-source.test.ts'`

## Demo Data Dry-Run Sonuçları

**Komut:**

```bash
pnpm --filter @vetniva/tenant-export exec node --import tsx src/cli-export.ts \
  --tenant=pilot-vet-kadikoy \
  --exported-by=usr-admin \
  --datasets=owners,patients,examinations,vaccinations,prescriptions,sales,payments \
  --format=json \
  --pii=strict \
  --with-demo-data \
  --out=./tenant-export-demo.json
```

**Sonuç:**

```json
{
  "exportId": "exp-cdc8bcbd-cfdb-4ac5-abef-9ffe5ef30deb",
  "tenantId": "pilot-vet-kadikoy",
  "exportedAt": "2026-08-06T10:01:52.140Z",
  "totalRows": 3,
  "rowsPerDataset": {
    "owners": 1,
    "patients": 1,
    "examinations": 1,
    "vaccinations": 0,
    "prescriptions": 0,
    "sales": 0,
    "payments": 0
  },
  "piiCheck": "strict",
  "piiFieldsDetected": 4,
  "piiMasked": true,
  "auditEvent": {
    "eventName": "audit:tenant.export.created",
    "tenantId": "pilot-vet-kadikoy",
    "actorId": "usr-admin"
  }
}
```

**Maskelenen PII alanları (örnek):**

| Orijinal                      | Maskelenmiş                                      |
| ----------------------------- | ------------------------------------------------ |
| `firstName: "Demo"`           | `De******mo`                                     |
| `lastName: "Owner"`           | `Ow******er`                                     |
| `email: "demo@vetniva.local"` | `de******************************************al` |
| `phone: "+905550000000"`      | `+9***************************00`                |

## 3 Data Source Modu

| Mod                | Açıklama                | Kullanım                    |
| ------------------ | ----------------------- | --------------------------- |
| Empty (default)    | Boş dataset             | Schema validation + dry-run |
| `--with-demo-data` | Sentetik kimliksiz veri | CI/CD smoke test            |
| `--with-prisma`    | Gerçek DB bağlantısı    | Production export           |

## Canlı Prisma Runbook

Pilot tenant için canlı export:

```bash
# 1. Coolify veya local'da .env'de DATABASE_URL tanımlı olmalı
# 2. Prisma schema migrate edilmiş olmalı
pnpm db:generate

# 3. Export komutu
pnpm --filter @vetniva/tenant-export exec node --import tsx src/cli-export.ts \
  --tenant=11c6beec-7c64-4cf6-9cb7-d9ea6fd5c8a1 \
  --exported-by=usr-admin \
  --tenant-slug=pilot-vet-kadikoy \
  --datasets=owners,patients,examinations,vaccinations,prescriptions,sales,payments,lab_results,imaging_orders,files \
  --format=json \
  --pii=strict \
  --country=TR \
  --with-prisma \
  --out=./goals/GOAL-125-archive/pilot-tenant-2026-08-06.json
```

Bu komut pilot verisini 10 dataset'te export eder; PII mask'lenir;
audit event üretilir.

## PII Mask Standartları

`StandardPiiMasker` (`pii-masker.ts`) şu pattern'leri tanır:

- **E-posta:** `xxx@yyy.zzz` → ilk 2 + `*` × N + `@` + domain
- **Telefon:** `+90xxxxxxxxxx` → `+9` + `*` × N + son 2
- **TCKN/VKN:** 11/10 haneli numerik → ilk 2 + `*` × N + son 2
- **İsim:** 4+ karakterli string → ilk 2 + `*` × N + son 2
- **Adres:** Serbest metin, PII tespit edilemezse olduğu gibi bırakılır

Strict mod tüm PII alanlarını mask'ler; permissive mod yalnızca
teyitli PII'yi mask'ler (e-posta/TCKN/telefon).

## Tenant Export vs KVKK Export Farkı

| Özellik     | Tenant Export (GOAL-125)      | KVKK Export (GOAL-126)        |
| ----------- | ----------------------------- | ----------------------------- |
| Amaç        | Tenant'ın verisini taşıma     | Veri sahibinin talebi         |
| PII mask    | ✅ Strict (default)           | ❌ Yok (veri sahibine)        |
| Format      | JSON / CSV                    | JSON                          |
| Kapsam      | 10 dataset                    | 7 dataset                     |
| Audit event | `audit:tenant.export.created` | `audit:kvkk.export.applied`   |
| Tetikleyen  | SUPERADMIN, OWNER             | Veri sahibi (portal) veya DPO |

## Yapılmayanlar / Pilot Kapsamı Dışı

- **CSV format** — Tip tanımı mevcut, üretim çıktısı FAZ-12+.
- **Streaming export (büyük dataset)** — 100+ tenant için FAZ-13+.
- **Scheduled export (cron)** — Aylık KVKK rapor için FAZ-13+.
- **Encryption at-rest** — S3/Azure bağlantısı ile FAZ-12+.

## Takip Öğeleri

1. **Pilot canlı export** — Coolify terminal'de `--with-prisma` ile
   (production-ready öncesi zorunlu).
2. **Prisma data source test izolasyonu** — port 55432 isolated PG
   (FAZ-12 devamı, pnpm docker:up).
3. **CSV format implementasyonu** — Tip mevcut, üretici eksik.
4. **Streaming için chunked export** — 100K+ row tenant'lar için.
5. **DORA compliance export** — EU finansal düzenleme (FAZ-14+).
