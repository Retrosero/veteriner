# @vetniva/security-test (GOAL-123, FAZ-12)

OWASP ASVS L1-L3 temelli güvenlik testi paketi. 9 kategoride
14 kontrolün PASS/FAIL/SKIP durumunu, severity dağılımını,
ASVS-severity tutarlılığını ve remediation planlarını üretir.
Tenant izolasyonu, PII mask ve audit kurallarına uyar.

## Kontrol Kategorileri (9)

| Kategori           | ASVS | Örnek Kontrol                         | Severity    |
| ------------------ | ---- | ------------------------------------- | ----------- |
| `auth`             | L2   | Brute-force koruması, expired token   | high        |
| `authz`            | L1   | Rol escalation (STAFF → VETERINARIAN) | critical    |
| `idor`             | L1   | Cross-tenant patient/owner            | critical    |
| `xss`              | L1   | Input sanitization + output encoding  | high/low    |
| `csrf`             | L2   | State-changing token kontrolü         | medium      |
| `sql_injection`    | L1   | Search query injection                | critical    |
| `file_upload`      | L2   | MIME + size validation                | high/medium |
| `rate_limit`       | L2   | Per-user token bucket                 | medium      |
| `tenant_isolation` | L1   | List endpoint tenant scoping          | critical    |

Toplam **14 kontrol**. Detay: `src/config.ts`.

## Bileşenler

| Dosya                            | Açıklama                                                       |
| -------------------------------- | -------------------------------------------------------------- |
| `src/config.ts`                  | 9 kategoride 14 kontrol kataloğu                               |
| `src/types.ts`                   | SecurityCheck, SecurityResult, SecurityRunReport               |
| `src/runner.ts`                  | `runSecurityChecks`; mock'lanabilir `fetchFn`                  |
| `src/report.ts`                  | `reportToMarkdown` + `reportToJson` + `describeResult`         |
| `src/severity.ts`                | OWASP ASVS L1/L2/L3 esleme + severity tutarlılık değerlendirme |
| `src/cli-run.ts`                 | Pilot ortamda gerçek koşum (POST/GET + JSON/MD rapor)          |
| `src/cli-report.ts`              | Mevcut JSON raporunu Markdown'a dönüştür                       |
| `src/cli-validate.ts`            | Katalog tutarlılık doğrulama (key unique, kategori coverage)   |
| `src/k6-shared.js`               | k6 ortak helper (authHeaders, PII mask, tenant boundary)       |
| `tests/config.test.ts`           | 11 katalog doğrulama testi                                     |
| `tests/runner.test.ts`           | 8 runner davranış testi                                        |
| `tests/report.test.ts`           | 7 rapor üretici testi                                          |
| `tests/smoke.test.ts`            | 1 uçtan uca smoke testi                                        |
| `tests/severity.test.ts`         | 12 OWASP ASVS severity eşleme testi                            |
| `tests/auth-roles.test.ts`       | 7 auth + authz senaryosu                                       |
| `tests/tenant-isolation.test.ts` | 8 cross-tenant IDOR + tenant_isolation                         |
| `tests/xss-csrf.test.ts`         | 8 XSS + CSRF senaryoları                                       |
| `tests/sql-injection.test.ts`    | 7 SQL injection senaryoları                                    |
| `tests/file-upload.test.ts`      | 7 file upload (MIME + size)                                    |
| `tests/rate-limit.test.ts`       | 4 rate limit (429) senaryoları                                 |

## Kurulum

```bash
# Tip kontrolü
pnpm --filter @vetniva/security-test type-check

# Lint
pnpm --filter @vetniva/security-test lint

# Birim testleri (toplam ~70 test)
pnpm --filter @vetniva/security-test test

# Katalog doğrulama (key unique, kategori coverage, ASVS seviyesi)
pnpm --filter @vetniva/security-test validate
```

## Çalıştırma

```bash
# Pilot ortamda gerçek koşum
pnpm --filter @vetniva/security-test run -- \
  --base-url=https://staging.vetniva.local \
  --token=$PILOT_TOKEN \
  --tenant=tnt-pilot-kadikoy \
  --branch=brc-pilot-merkez \
  --cross-tenant=tnt-pilot-besiktas \
  --out-json=./security-report.json \
  --out-md=./security-report.md

# Yalnızca tek kontrol (ör. CSRF)
pnpm --filter @vetniva/security-test run -- --only=csrf_state_changing_token --include-skipped

# Mevcut JSON raporunu Markdown'a dönüştür
pnpm --filter @vetniva/security-test report -- \
  --in=./security-report.json \
  --out-md=./security-report.md
```

## Çıktılar

- `security-report.json` — yapısal rapor (`SecurityRunReport`)
  - `passCount`, `failCount`, `skipCount`
  - `bySeverity` (critical/high/medium/low/info)
  - `severityReport` (ASVS-severity tutarlılık özeti)
- `security-report.md` — insan-okur rapor:
  - PASS/FAIL/SKIP tablosu
  - Severity dağılımı
  - ASVS + severity tutarlılık özeti
  - Her FAIL için remediation planı
  - SKIP kontrolleri listesi

## Severity Mapping (OWASP ASVS L1/L2/L3)

`severity.ts` modülü her kontrol için:

1. **ASVS referansları** — kategori bazında ASVS V# linki
   (ör. `auth` → V2.1, V2.2, V2.5, V2.7).
2. **Minimum ASVS seviyesi** — her kategorinin asgari
   ASVS seviyesi (IDOR/tenant_isolation L1, auth/CSRF L2).
3. **Severity SLA** — critical=1, high=7, medium=30,
   low=90, info=365 gün.
4. **Tutarlılık değerlendirmesi** — ASVS seviyesi ile
   severity uyumu (ör. IDOR + L1 + low → inconsistent).

## Ortam Değişkenleri (k6 ortak helper)

| Değişken          | Açıklama                           |
| ----------------- | ---------------------------------- |
| `BASE_URL`        | API kök URL                        |
| `TENANT_ID`       | Pilot tenant A (ana auth)          |
| `BRANCH_ID`       | Pilot branch                       |
| `AUTH_TOKEN`      | Bearer token                       |
| `USER_ID`         | Aktör user ID                      |
| `CROSS_TENANT_ID` | Cross-tenant test tenant B kimliği |

## CI Entegrasyonu

- **PR gate:** type-check + lint + ~70 test
- **Pre-release:** validate (katalog doğrulama)
- **Production gate:** `run` + manual review (24 saat SLA
  critical bulgular için)

## Severity SLA

| Seviye       | SLA     |
| ------------ | ------- |
| **critical** | 24 saat |
| **high**     | 7 gün   |
| **medium**   | 30 gün  |
| **low**      | 90 gün  |
| **info**     | Backlog |

Detay: `docs/security/SECURITY_REPORT.md` ve
`docs/security/SECURITY_TEST.md`.

## Bilinen Sınırlamalar

- DAST (OWASP ZAP), SAST (Snyk Code), WAF, external pentest
  → FAZ-12+ ve FAZ-13+
- Bearer-only auth modunda CSRF kontrolü skipByDefault; cookie
  auth fallback etkinleştirildiğinde zorunlu kılınmalı
- IDOR + tenant_isolation kontrolleri cross-tenant auth
  gerektirir; CLI'ya `--cross-tenant=<OTHER_TENANT_ID>`
  verilmediğinde SKIP döner
