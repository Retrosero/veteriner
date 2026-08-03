# @vetniva/security-test (GOAL-123, FAZ-12)

OWASP ASVS L1-L3 temelli güvenlik testi paketi. 9 kategoride
14 kontrolün PASS/FAIL/SKIP durumunu, severity dağılımını ve
remediation planlarını üretir. Tenant izolasyonu, PII mask ve
audit kurallarına uyar.

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

## Kurulum

```bash
# Tip kontrolü
pnpm --filter @vetniva/security-test type-check

# Birim testleri (31 test)
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
- `security-report.md` — insan-okur rapor:
  - Özet tablo (PASS/FAIL/SKIP)
  - Severity dağılımı
  - Her FAIL için remediation planı
  - SKIP kontrolleri listesi

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

- **PR gate:** type-check + 31 test
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
