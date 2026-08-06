# GOAL-127 — Production Release Hazırlık Raporu

**Tarih:** 2026-08-06
**Pilot ortamı:** Hostinger KVM 4 (Coolify v4, Traefik, vetniva.appsgo.cloud)
**Production planı:** Hetzner Cloud CCX13 (Faz 12+)
**Durum:** Pilot deploy + smoke test başarılı, production checklist
%90 yeşil.

## Genel Durum

| Kategori                          | Durum              | Not                                                        |
| --------------------------------- | ------------------ | ---------------------------------------------------------- |
| Coolify deploy                    | ✅ Tamamlandı      | api, web, worker 3/3 healthy                               |
| Custom domain                     | ✅ Tamamlandı      | `vetniva.appsgo.cloud` (DNS tunnel)                        |
| Pilot veri seed                   | ✅ Tamamlandı      | 4 users, 2 owners, 2 patients                              |
| Auth/login                        | ✅ Doğrulandı      | sessionToken, role-based                                   |
| Tenant API endpoints              | ✅ Doğrulandı      | patients, owners, notifications                            |
| CI gates (lint, type, i18n, docs) | ✅ 4/4 yeşil       | (bkz. aşağıda)                                             |
| Unit test                         | ✅ 100+ test yeşil | security 100, load 71, backup 8, kvkk 16, tenant-export 21 |
| Backup dry-run                    | ✅ Tamamlandı      | tier matrix allOk:true                                     |
| Tenant export dry-run             | ✅ Tamamlandı      | 3 row, 4 PII mask'lendi                                    |
| KVKK unit test                    | ✅ Tamamlandı      | 16/16                                                      |
| Security readiness report         | ✅ Tamamlandı      | 14 ASVS kontrolü                                           |
| Load test readiness report        | ✅ Tamamlandı      | 7 senaryo + 71 unit                                        |
| RLS regression test               | 🟡 Planlanmış      | pilot veri ile coverage eklenecek                          |
| FAZ-13 entegrasyonları            | ❌ Pilot dışı      | SMS, payment, e-SMM                                        |

## CI Gates (5 Ağustos 2026 itibarıyla)

| Gate        | Komut             | Sonuç                                                              |
| ----------- | ----------------- | ------------------------------------------------------------------ |
| Lint        | `pnpm lint`       | ✅ 0 error / 0 warning (15 paket)                                  |
| Type-check  | `pnpm type-check` | ✅ 18/18 paket                                                     |
| i18n parity | `pnpm i18n:check` | ✅ tr-TR / en-GB eşit                                              |
| docs:check  | `pnpm docs:check` | ✅ 0 hata (1638 uyarı — orphan alanlar, FAZ-13+)                   |
| Unit test   | `pnpm test`       | 🟡 1 pre-existing fail (prisma-data-source: port 55432 DB gerekli) |

## Production Release Akışı

Pilot zaten Coolify'a deploy edildi. Production'a geçiş için:

### Adım 1: Hetzner Cloud CCX13 Provisioning

```bash
# Hetzner Cloud Console
# CCX13: 8 vCPU, 16 GB RAM, 200 GB NVMe
# OS: Ubuntu 24.04 LTS
# Firewall: 22 (SSH), 80 (HTTP), 443 (HTTPS)
```

### Adım 2: Coolify Self-Hosted Install

```bash
# Coolify v4 kurulumu (bkz. https://coolify.io/docs)
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
# Admin UI: http://<server-ip>:8000
```

### Adım 3: DNS + Domain

- `vetniva.com.tr` (klinik domaini) A record → CCX13 IP
- Coolify built-in Traefik otomatik Let's Encrypt

### Adım 4: Environment Variables

`apps/api/.env` ve `apps/web/.env` için:

```bash
# Database
DATABASE_URL=postgresql://vetniva:$DB_PASSWORD@postgres:5432/vetniva

# Auth
AUTH_JWT_SECRET=$(openssl rand -base64 48)
AUTH_JWT_EXPIRES_IN=15m
AUTH_REFRESH_EXPIRES_IN=7d

# Object Storage (Hetzner)
S3_ENDPOINT=https://fsn1.your-objectstorage.com
S3_REGION=fsn1
S3_BUCKET=vetniva-prod
S3_ACCESS_KEY=$HETZNER_ACCESS_KEY
S3_SECRET_KEY=$HETZNER_SECRET_KEY

# SMTP (Mailgun EU)
SMTP_HOST=smtp.eu.mailgun.org
SMTP_PORT=587
SMTP_USER=$MAILGUN_SMTP_USER
SMTP_PASSWORD=$MAILGUN_SMTP_PASSWORD

# Multi-tenant + KVKK
TENANT_ISOLATION_MODE=strict
KVKK_ENABLED=true
KVKK_DEFAULT_COUNTRY=TR
```

### Adım 5: Coolify App Provisioning

Coolify UI'da 5 uygulama oluştur:

| App              | Image                 | Port      | Domain             |
| ---------------- | --------------------- | --------- | ------------------ |
| vetniva-postgres | postgres:16-alpine    | 5432      | (internal)         |
| vetniva-redis    | redis:7-alpine        | 6379      | (internal)         |
| vetniva-api      | vetniva/api:latest    | 3001      | api.vetniva.com.tr |
| vetniva-web      | vetniva/web:latest    | 3000      | vetniva.com.tr     |
| vetniva-worker   | vetniva/worker:latest | (no port) | (internal)         |

### Adım 6: Migration + Smoke

```bash
# Coolify terminal: api container
pnpm db:generate
pnpm db:migrate deploy
pnpm db:seed:pilot  # sadece pilot'ta

# Coolify terminal: her container
pnpm --filter @vetniva/<app> health:check
```

### Adım 7: Smoke Test (Playwright)

```bash
# Coolify API container
pnpm e2e:smoke --base-url=https://vetniva.com.tr
```

Kontrol edilecek akışlar:

- [ ] Login → 200 + sessionToken
- [ ] Owner dashboard → 200
- [ ] Patient create → 201
- [ ] Patient search → 200 (PII mask'li)
- [ ] Examination create → 201
- [ ] Prescription create → 201
- [ ] Stock düşümü (muayene → reçete → stok) → 200
- [ ] Tahsilat → 201
- [ ] Health/ready → 200

## Rollback Prosedürü

### Tetikleyici Koşullar

- Error rate > %5 (5 dakika penceresi)
- P95 latency > 2× baseline
- Smoke test fail
- DB migration fail
- Critical security alert (KVKK/UK GDPR breach)

### Adımlar (5 dakika içinde)

1. **Coolify UI:** İlgili uygulama → "Rollback" → önceki tag seç.
2. **DB rollback:** (gerekirse) `pnpm db:migrate --rollback <adım>`.
3. **Feature flag kapat:** SUPERADMIN panelden sorunlu modül.
4. **Communication:** Status sayfası + müşteri bilgilendirme.
5. **Post-mortem:** 24 saat içinde `INCIDENT_RESPONSE.md` şablonu ile.

## Monitoring + Alertler

### Prometheus Metrics

```yaml
# apps/api/src/common/metrics/prometheus.ts
- http_requests_total{method, route, status}
- http_request_duration_seconds{method, route}
- error_events_total{module, severity}
- job_runs_total{queue, status}
- active_sessions (gauge)
- db_connection_pool_used (gauge)
```

### Alert Kuralları

```yaml
# alerts/prometheus.yml
- alert: HighErrorRate
  expr: rate(error_events_total[5m]) > 0.01
  for: 5m
  severity: critical
- alert: HighP95Latency
  expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 0.5
  for: 5m
- alert: DbPoolExhausted
  expr: db_connection_pool_used / db_connection_pool_size > 0.8
  for: 2m
- alert: QueueBacklog
  expr: queue_depth > 1000
  for: 10m
```

## Yapılmayanlar / Pilot Kapsamı Dışı

- **k8s manifest'leri** — Coolify ile başlangıç; k8s FAZ-13+.
- **CI workflow (`.github/workflows/release.yml`)** — main'e
  tag push ile production deploy (Hetzner hedefli).
- **Datadog/CloudWatch dashboard** — şu an stdout + Coolify log.
- **Incident response (runbook)** — `docs/operations/INCIDENT_RESPONSE.md`
  eksik; FAZ-12+ devamı.
- **Disaster recovery test** — Hetzner + coolify backup
  geri yükleme testi production-ready öncesi.

## Takip Öğeleri (production-ready öncesi)

1. **Hetzner CCX13 provision + Coolify install** — owner task.
2. **Custom domain DNS + SSL** — Let's Encrypt auto.
3. **S3 bucket oluşturma** — Hetzner Object Storage.
4. **Mailgun EU account** — production API key.
5. **`AUTH_JWT_SECRET` rotate** — yeni secret üret.
6. **Postgres password güçlendirme** — `openssl rand -base64 32`.
7. **Smoke test CI gate** — Playwright e2e/ entegrasyonu.
8. **Load test real run** — pilot veri ile k6 smoke.
9. **Backup test real run** — gerçek pg_dump + restore.
10. **RLS regression test** — pilot veri ile 50+ senaryo.

## Öncelik Sırası (production release gate)

1. **Hetzner VPS + Coolify** kurulumu → 1 gün
2. **Domain + SSL + env** setup → 0.5 gün
3. **DB migration + seed** → 0.5 gün
4. **CI gate'lerinin production'da da yeşil olduğunun doğrulanması** → 0.5 gün
5. **Smoke test + load test (k6 smoke)** → 1 gün
6. **Monitoring + alert kural** → 1 gün
7. **Backup gerçek run + restore testi** → 1 gün
8. **Post-mortem şablonu + incident response** → 0.5 gün
9. **Kullanıcı kabul + rollout** → 1 gün

**Toplam:** ~7 iş günü (1 kişi, FAZ-12+ sprint).
