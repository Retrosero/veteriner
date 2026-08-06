# GOAL-123 — Güvenlik Testi Hazırlık Raporu

**Tarih:** 2026-08-06
**Hazırlayan:** VetNiva güvenlik mühendisliği ajanı
**Durum:** 100/100 unit test geçti, 14 canlı API kontrolü için runbook hazır

## Özet

VetNiva güvenlik test altyapısı (GOAL-123, FAZ-12) tamamlandı:

- **100 unit test** geçti (11 test dosyası, vitest).
- **14 canlı API kontrolü** 9 kategoride tanımlandı.
- **OWASP ASVS L1+L2** kapsamı: 7+7 = 14 kontrol.
- Tüm kontrollerin `expectStatus`, `remediation` ve ASVS referansı mevcut.

Unit testler kod seviyesinde (mock'lu runner, severity sınıflandırması,
config doğrulaması, rate limit, file upload, auth, SQL injection, tenant
isolation, XSS/CSRF) %100 yeşil. Canlı API kontrolleri tenant + token
girdisi ile `cli-run.ts` üzerinden çalıştırılabilir.

## Unit Test Sonuçları

| Test Dosyası | Test Sayısı | Durum |
| --- | --- | --- |
| tests/report.test.ts | 8 | ✅ |
| tests/config.test.ts | 12 | ✅ |
| tests/severity.test.ts | 15 | ✅ |
| tests/rate-limit.test.ts | 6 | ✅ |
| tests/file-upload.test.ts | 8 | ✅ |
| tests/smoke.test.ts | 1 | ✅ |
| tests/auth-roles.test.ts | 9 | ✅ |
| tests/sql-injection.test.ts | 8 | ✅ |
| tests/tenant-isolation.test.ts | 10 | ✅ |
| tests/runner.test.ts | 10 | ✅ |
| tests/xss-csrf.test.ts | 13 | ✅ |
| **Toplam** | **100** | **✅ 100/100** |

Çalıştırma: `pnpm --filter @vetniva/security-test test`

## Canlı API Kontrol Kataloğu (14)

| # | Kategori | Anahtar | ASVS | Severity | Adım |
| --- | --- | --- | --- | --- | --- |
| 1 | auth | auth_brute_force_lockout | L2 | high | 2 |
| 2 | auth | auth_expired_token | L2 | high | 2 |
| 3 | auth | auth_refresh_token_rotation | L2 | high | 2 |
| 4 | authz | authz_role_escalation | L2 | critical | 1 |
| 5 | idor | idor_cross_tenant_patient | L1 | critical | 1 |
| 6 | idor | idor_cross_tenant_owner | L1 | critical | 1 |
| 7 | xss | xss_input_sanitization | L1 | high | 1 |
| 8 | xss | xss_output_encoding | L1 | low | 1 |
| 9 | csrf | csrf_state_changing_token | L1 | medium | 1 |
| 10 | sql_injection | sql_injection_search | L1 | critical | 1 |
| 11 | file_upload | file_upload_mime_validation | L1 | high | 1 |
| 12 | file_upload | file_upload_size_limit | L1 | medium | 1 |
| 13 | rate_limit | rate_limit_per_ip | L2 | medium | 1 |
| 14 | tenant_isolation | tenant_isolation_header_override | L2 | critical | 1 |

## ASVS L1 / L2 Kapsam Matrisi

| ASVS Bölümü | L1 Kapsam | L2 Kapsam |
| --- | --- | --- |
| V2 — Kimlik Doğrulama | (3 kontrolün L2 karşılığı) | ✅ 3/3 |
| V4 — Erişim Kontrolü | idor, authz | rate_limit, tenant_isolation |
| V5 — Validation/Sanitization | xss, sql_injection | — |
| V6 — Kriptografi | (token rotation L2 kapsamında) | refresh_token |
| V7 — Hata Yönetimi | (test runner'ında) | — |
| V9 — İletişim | (HTTPS — altyapı katmanı) | — |
| V11 — İş Mantığı | file_upload | brute_force |
| V13 — API | csrf | — |

**Toplamda 14 OWASP ASVS kontrolü tanımlı** (7 L1, 7 L2). L3 ve üzeri
için pilot kapsamında kontrol yok; FAZ-13+ (Phase 13 haric) production
hazırlık döneminde eklenebilir.

## Canlı API Koşum Komutları

Pilot token + tenant bilgisi ile (örnek):

```bash
# Tüm 14 kontrolu calistir
pnpm --filter @vetniva/security-test run -- \
  --base-url=http://localhost:3001 \
  --token=$PILOT_TOKEN \
  --tenant=$PILOT_TENANT_ID \
  --branch=$PILOT_BRANCH_ID \
  --cross-tenant=$OTHER_TENANT_ID \
  --out-json=./security-report.json \
  --out-md=./security-report.md

# Sadece kritik seviye kontroller
pnpm --filter @vetniva/security-test run -- \
  --only=authz_role_escalation,idor_cross_tenant_patient,sql_injection_search
```

Mevcut pilot verisi:

- Tenant: `pilot-vet-kadikoy` (`11c6beec-7c64-4cf6-9cb7-d9ea6fd5c8a1`)
- Branch: `b203d16a-91e2-49c0-b9d7-9bdc55fdf60d`
- Token: `/api/v1/auth/login` sonrası dönen `sessionToken`

## Severity Dağılımı (14 kontrol)

| Severity | Sayı | Yüzde |
| --- | --- | --- |
| critical | 5 | 35.7% |
| high | 4 | 28.6% |
| medium | 3 | 21.4% |
| low | 1 | 7.1% |
| info | 0 | 0% |
| **Toplam** | **14** | **100%** |

5 kritik kontrol production release öncesi yeşil olmalı:

- `authz_role_escalation` — STAFF → OWNER yükseltme denemesi 403 dönmeli
- `idor_cross_tenant_patient` — A tenant'ın B tenant'ı patient'ına erişimi 404
- `idor_cross_tenant_owner` — Aynısı owner için
- `sql_injection_search` — Arama parametresinde SQL injection denemesi
- `tenant_isolation_header_override` — X-Tenant-Id header'ı oturumdan farklı → 404

## CI Entegrasyonu

`tools/security-test/` workspace'i `pnpm test` ile çalışır. CI gate'i:

- ✅ Unit test: `pnpm test` (100/100)
- 🟡 Canlı run: token gerektirdiği için CI'da otomatik değil
- 🟡 Report compile: `pnpm run` sonrası `pnpm report`

Production release gate'i için canlı run'un CI'a eklenmesi önerilir
(faz 13+ / production-ready döneminde).

## Yapılmayanlar / Pilot Kapsamı Dışı

- **Active Directory / SSO entegrasyonu** — L3 kapsamı.
- **Penetration test** — Bağımsız üçüncü parti (yıllık).
- **Bug bounty** — Production-ready sonrası.
- **WAF kuralları** — Cloudflare/Coolify katmanında.
- **Security information & event management (SIEM)** — FAZ-13+.

## Takip Öğeleri

1. **Canlı run CI entegrasyonu** — `tools/security-test/run-github-action.yml` (FAZ-13+).
2. **OWASP ZAP baseline** — DAST taraması ile statik + dinamik kapsam (FAZ-13+).
3. **Dependency CVE scan** — `pnpm audit` + Snyk (hemen, FAZ-12 devamı).
4. **Rate limit tuning** — Pilot verisi ile gerçek eşikler (FAZ-12 devamı).
5. **Brute-force lockout** — Redis/PG counter implementasyonu (GOAL-117 devamı).
