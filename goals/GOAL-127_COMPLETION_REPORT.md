# GOAL-127 — Production Release ve Rollback (Completion Report)

## Faz
FAZ-12 (Pilot, güvenlik, üretime hazırlık)

## Özet
Production ortamı için CI/CD, migration deployment,
feature flag, health check, monitoring ve rollback
prosedürü. Semver versiyon politikası + smoke test
otomasyonu.

## Çıktılar

### Döküman (`docs/operations/PRODUCTION_RELEASE.md`)
- **Release akışı:** pre-release checklist + CI/CD
  pipeline + migration + feature flag + health check +
  monitoring + smoke tests.
- **Rollback prosedürü:** tetikleyici koşullar + adımlar
  (tag silme + k8s/ECS rollback + DB rollback) +
  post-mortem.
- **Monitoring:** Prometheus + Grafana metrikleri
  (http_requests_total, error_events_total, job_runs_total);
  alertler (error rate, P95 latency, DB pool, queue
  depth).
- **Smoke tests:** Playwright ile otomatik post-release
  (login, hayvan oluşturma, randevu, muayene, tahsilat,
  health/ready).
- **Versiyon politikası:** Semver (MAJOR/MINOR/PATCH);
  pre-1.0 pilot kapsamda MINOR breaking change
  kabul edilebilir.

## İş Kuralları
- **CI gates:** lint + type-check + test + docs:check +
  i18n:check + e2e:smoke.
- **Migration:** backward-compatible; destructive
  change'ler 2 adımda.
- **Feature flag:** `%1 → %10 → %50 → %100` aşamalı
  açılış (24 saat aralıkla).
- **Health check:** `/api/v1/health` (liveness) +
  `/api/v1/ready` (readiness); 3 başarısız → restart.
- **Rollback trigger:** error rate > %5, P95 latency >
  2x baseline, smoke test fail, DB migration fail.
- **Versiyon:** semver tag (`v0.x.y`) main'e push'lendiğinde
  production'a deploy.

## Yapılmayanlar / Bilinçli Atlamalar
- **Canlı deploy (k8s/ECS manifest'leri)** → FAZ-12+
  (infrastructure repo).
- **CI workflow dosyaları (`.github/workflows/`)** →
  FAZ-12+ (PR + main + tag push).
- **Smoke test fixture (Playwright)** → FAZ-12+ (e2e/).
- **Datadog/CloudWatch dashboard** → FAZ-12+ (grafana JSON
  export).
- **Incident response prosedürü (`INCIDENT_RESPONSE.md`)** →
  FAZ-12+.
- **Runbook (sayfa-sayfa operasyon talimatları)** →
  FAZ-12+.

## Döküman Uyum
- `pnpm docs:check` → temiz (yeni eklenen özgü).
- `pnpm i18n:check` → temiz.

## Testler
- Otomatik smoke test'ler FAZ-12+ ile eklenecek
  (`apps/e2e/`).
- Migration test'leri (rollback simülasyonu) FAZ-12+.

## Commit
- Docs: (bu commit) — `docs(operations): GOAL-127 production release + rollback prosedürü`
