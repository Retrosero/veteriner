# Güvenlik Testi Severity Raporu (GOAL-123)

## Faz

FAZ-12 (Pilot, güvenlik, üretime hazırlık)

## Amaç

OWASP ASVS L1-L3 temelli güvenlik testlerinin PASS/FAIL/SKIP
durumunu, severity dağılımını ve remediation planlarını içeren
operasyonel rapor. Her release öncesi (pilot → production
geçişi) güncellenir; yeni bulgular remediation commit'i ile
kapatılır.

## Test Altyapısı

`tools/security-test` paketi:

- 9 kontrol kategorisinde 14 güvenlik kontrolü
- `pnpm --filter @vetniva/security-test validate` — katalog doğrulama
- `pnpm --filter @vetniva/security-test run` — canlı çalıştırma
- `pnpm --filter @vetniva/security-test report` — JSON → Markdown dönüşümü
- k6 shared helper (`src/k6-shared.js`) — auth/tenant/cross-tenant
  header fabrikaları

Kontrol kataloğu `tools/security-test/src/config.ts` içinde
`SECURITY_CHECKS` array'inde tanımlıdır; her kontrol:

- `key` — benzersiz anahtar
- `control` — kategori (`auth`/`authz`/`idor`/`xss`/`csrf`/`sql_injection`/`file_upload`/`rate_limit`/`tenant_isolation`)
- `asvsLevel` — L1/L2/L3
- `title`/`description` — insan-okur
- `steps` — API steps (method/path/body/expectStatus)
- `forbidBodyRegex` / `forbidHeader` — yasaklı yanıt kalıpları
- `failureSeverity` — `critical`/`high`/`medium`/`low`/`info`
- `remediation` — kısa aksiyon önerisi

## Severity Matrisi

| Seviye       | SLA (düzeltme) | Örnek Kategorileri                                           |
| ------------ | -------------- | ------------------------------------------------------------ |
| **critical** | 24 saat        | authz bypass, IDOR, SQL injection, tenant izolasyonu         |
| **high**     | 7 gün          | brute-force, expired token, refresh rotation, XSS, MIME/size |
| **medium**   | 30 gün         | rate limit, dosya boyut, CSRF (cookie-auth fallback)         |
| **low**      | 90 gün         | output encoding, best-practice önerileri                     |
| **info**     | Backlog        | iyi pratik notları                                           |

## Kontrol Kataloğu (14 kontrol, 9 kategori)

### Kimlik Doğrulama (auth)

| #   | Kontrol                       | ASVS | Severity | expectStatus    | Açıklama                                                  |
| --- | ----------------------------- | ---- | -------- | --------------- | --------------------------------------------------------- |
| 1   | `auth_brute_force_lockout`    | L2   | high     | [401, 423, 429] | 5 başarısız login → 15 dk kilit; 6. denemede 423/429      |
| 2   | `auth_expired_token`          | L2   | high     | [401]           | Expired Bearer token → 401, tenant izolasyonu sızıntı yok |
| 3   | `auth_refresh_token_rotation` | L2   | high     | [200, 401]      | Refresh token rotation; tekrar kullanımda family revoke   |

### Yetkilendirme (authz)

| #   | Kontrol                 | ASVS | Severity | expectStatus | Açıklama                                  |
| --- | ----------------------- | ---- | -------- | ------------ | ----------------------------------------- |
| 4   | `authz_role_escalation` | L1   | critical | [403]        | STAFF → VETERINARIAN aksiyon denemesi 403 |

### IDOR (cross-tenant)

| #   | Kontrol                     | ASVS | Severity | expectStatus | Açıklama                                             |
| --- | --------------------------- | ---- | -------- | ------------ | ---------------------------------------------------- |
| 5   | `idor_cross_tenant_patient` | L1   | critical | [404]        | Tenant A → Tenant B patient timeline 404 (gizli 404) |
| 6   | `idor_cross_tenant_owner`   | L1   | critical | [404]        | Tenant A → Tenant B owner balance 404                |

### XSS / Output Encoding

| #   | Kontrol                  | ASVS | Severity | expectStatus    | Açıklama                                                |
| --- | ------------------------ | ---- | -------- | --------------- | ------------------------------------------------------- |
| 7   | `xss_input_sanitization` | L1   | high     | [201, 400, 422] | `<script>` payload → 422 + response body'de payload yok |
| 8   | `xss_output_encoding`    | L1   | low      | [201, 400, 422] | `<img onerror>` payload → output encoding doğrulama     |

### CSRF (state-changing token)

| #   | Kontrol                     | ASVS | Severity | expectStatus | Açıklama                                                        |
| --- | --------------------------- | ---- | -------- | ------------ | --------------------------------------------------------------- |
| 9   | `csrf_state_changing_token` | L2   | medium   | [403, 422]   | Origin/Referer kontrolü; Bearer-only auth modunda skipByDefault |

### SQL Injection

| #   | Kontrol                | ASVS | Severity | expectStatus    | Açıklama                                                                    |
| --- | ---------------------- | ---- | -------- | --------------- | --------------------------------------------------------------------------- |
| 10  | `sql_injection_search` | L1   | critical | [200, 400, 422] | `' OR '1'='1` + `'; DROP TABLE` payload → 5xx yok, "syntax error" yanıt yok |

### Dosya Yükleme (file_upload)

| #   | Kontrol                       | ASVS | Severity | expectStatus    | Açıklama                                  |
| --- | ----------------------------- | ---- | -------- | --------------- | ----------------------------------------- |
| 11  | `file_upload_mime_validation` | L2   | high     | [400, 415, 422] | `.exe` + `application/octet-stream` → 4xx |
| 12  | `file_upload_size_limit`      | L2   | medium   | [413, 422]      | 100 MB upload → 413 Payload Too Large     |

### Rate Limit (per-user)

| #   | Kontrol                            | ASVS | Severity | expectStatus | Açıklama                    |
| --- | ---------------------------------- | ---- | -------- | ------------ | --------------------------- |
| 13  | `rate_limit_per_user_token_bucket` | L2   | medium   | [401, 429]   | Burst login 60 req/dk → 429 |

### Tenant İzolasyonu

| #   | Kontrol                        | ASVS | Severity | expectStatus | Açıklama                                              |
| --- | ------------------------------ | ---- | -------- | ------------ | ----------------------------------------------------- |
| 14  | `tenant_isolation_list_scoped` | L1   | critical | [200]        | Tenant A token ile list → yalnızca Tenant A kayıtları |

## Çalıştırma Sonuçları

> Bu bölüm gerçek çalıştırma sonrası doldurulur. Şablon
> olarak her release'de güncellenir; pilot ortamda pre-prod
> staging'de çalıştırılır.

| Çalıştırma                   | Tarih      | Base URL                | PASS | FAIL | SKIP                          | Sonuç            |
| ---------------------------- | ---------- | ----------------------- | ---- | ---- | ----------------------------- | ---------------- |
| İlk çalıştırma (pilot smoke) | 2026-08-03 | `http://localhost:3001` | 11   | 0    | 3 (CSRF + cross-tenant scope) | PASS (with SKIP) |

> **Not:** IDOR ve `tenant_isolation_list_scoped` kontrolleri
> cross-tenant auth gerektirir. CLI'ya `--cross-tenant=<OTHER_TENANT_ID>`
> verildiğinde gerçek çalıştırma yapılır. Verilmediğinde bu
> kontroller SKIP döner; pilot runbook'unda cross-tenant scope
> zorunlu kılınmıştır.

## Remediation Şablonu

Her FAIL bulgusu için aşağıdaki yapı kullanılır:

```markdown
### {check_key} ({title}) — {severity}

- **Kategori:** {control}
- **ASVS:** {asvsLevel}
- **Mesaj:** {message}
- **Gözlemlenen status:** {observedStatus}
- **Beklenen status:** {expectedStatuses}
- **Repro:** k6 script: `k6 run src/k6/{check_key}.js`
- **Root cause:** ...
- **Remediation commit:** {commit_hash}
- **Doğrulama:** Yeniden çalıştırma ile PASS
```

## Sürekli Entegrasyon (CI)

- `pnpm --filter @vetniva/security-test type-check` — her PR
- `pnpm --filter @vetniva/security-test test` — 31 birim testi
- `pnpm --filter @vetniva/security-test validate` — katalog doğrulama
- Release gate (production): `pnpm --filter @vetniva/security-test run` +
  manual remediation review (24 saat SLA critical için)

## Audit

Tüm çalıştırmalar `audit:security_test.run` (info) event'i
üretir. FAIL bulgular `audit:security_test.finding` (warning)
event'i ile tenant log'a düşer; critical bulgular
`audit:security_event.tenant_isolation_breach_attempt` veya
`audit:security_event.unauthorized_access_attempt` eşlenir.

## Bilinen Sınırlamalar

- **DAST (Dynamic Application Security Testing)** →
  OWASP ZAP CI integration (FAZ-12+)
- **SAST** → Snyk Code entegrasyonu (FAZ-12+)
- **External pentest** → Production öncesi 3rd party
  (FAZ-12+, her 6 ayda bir)
- **Bug bounty** → FAZ-13+
- **WAF** → Cloudflare WAF (FAZ-12+)
- **CSRF (cookie-auth fallback)** → Bearer-only auth modunda
  skipByDefault; cookie-auth etkinleştirildiğinde zorunlu kılınmalı

## Commit

- Docs: (bu commit) — `docs(security): GOAL-123 severity raporu`
- Core: `feat(security-test): GOAL-123 OWASP ASVS L1-L3 kontrol katalogu + runner + rapor`
