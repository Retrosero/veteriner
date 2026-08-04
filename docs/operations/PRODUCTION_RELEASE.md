# Production Release ve Rollback Prosedürü (GOAL-127)

## Faz

FAZ-12 (Pilot, güvenlik, üretime hazırlık)

## Genel Bakış

VetNiva production release'i için CI/CD, migration, feature
flag, monitoring ve rollback prosedürü.

## Release Akışı

### 1. Pre-release Checklist

- [ ] Tüm `pnpm test` yeşil (unit + integration).
- [ ] `pnpm type-check` yeşil.
- [ ] `pnpm docs:check` FAZ-12+ özgü temiz.
- [ ] `pnpm i18n:check` temiz.
- [ ] `pnpm e2e:smoke` yeşil.
- [ ] Migration'lar test DB'de uygulandı.
- [ ] Feature flag'ler production'da kapatıldı
      (kademeli açılış için).
- [ ] Release tag'i (`v0.x.y`) oluşturuldu.

### 2. CI/CD Pipeline (`.github/workflows/`)

- **PR Check:** her PR'da lint + type-check + test.
- **Main Push:** main branch'e push'lenen her commit
  staging'e deploy edilir.
- **Tag Push:** semver tag (`v0.x.y`) main'e push'lendiğinde
  production'a deploy tetiklenir.

### 3. Migration Deployment

- `pnpm db:generate` → Prisma client üret.
- `pnpm db:migrate` → migration'ları uygula.
- **Backward-compatible:** Her migration geri
  alınabilir olmalı (down migration); destructive
  change'ler 2 adımda (1. yeni kolon ekle + eski kolondan
  populate; 2. eski kolonu kaldır).

### 4. Feature Flag Stratejisi

- Yeni modüller `feature_flag:module:<name>` ile
  kapatılır.
- Aşamalı açılış: %1 → %10 → %50 → %100 (24 saat aralıkla).
- SUPERADMIN panelden (`audit:log:read` permission'ı ile)
  tenant bazında override edilebilir.

### 5. Health Check

- `GET /api/v1/health` (liveness): süreç durumu.
- `GET /api/v1/ready` (readiness): DB + cache + queue
  bağlantıları.
- Container orchestrator (k8s/ECS) her 30 saniyede
  kontrol eder; 3 başarısız → restart.

### 6. Monitoring

- **Loglar:** structured JSON, stdout'a yazılır; CloudWatch
  - Datadog toplar.
- **Metrics:** Prometheus + Grafana:
  - `http_requests_total{method, route, status}`
  - `http_request_duration_seconds{method, route}`
  - `error_events_total{module, severity}`
  - `job_runs_total{queue, status}`
  - `active_sessions` (gauge).
- **Alertler:**
  - Error rate > %1 (5 dakika penceresi).
  - P95 latency > 500 ms.
  - DB connection pool > %80.
  - Queue depth > 1000.

### 7. Smoke Tests (post-release)

- Production deploy sonrası `pnpm e2e:smoke` otomatik
  çalışır (Playwright):
  - Login akışı.
  - Hayvan sahibi + hayvan oluşturma.
  - Randevu oluşturma.
  - Muayene başlatma.
  - Tahsilat.
  - Health + readiness check.

## Rollback Prosedürü

### Tetikleyici koşullar

- Error rate > %5 (5 dakika).
- P95 latency > 2x baseline.
- Smoke test fail.
- DB migration fail.
- SUPERADMIN kararı.

### Adımlar

1. **Hemen:**

   ```bash
   # Tag'i bir önceki versiyona geri al
   git tag -d v0.x.y
   git push --delete origin v0.x.y
   ```

2. **Deployment rollback:**

   ```bash
   # k8s:
   kubectl rollout undo deployment/vetniva-api
   # veya ECS:
   aws ecs update-service --service vetniva-prod-api \
     --task-definition vetniva-api:v0.x.(y-1)
   ```

3. **Veritabanı geri alma (migration uygulandıysa):**

   Prisma migration altyapısında otomatik `--rollback` / down migration
   komutu yoktur. Bu nedenle yayın migration'ları forward-compatible
   olmalı; uygulama sürümü geri alınırken şema değişikliği yerinde kalır.
   Veri düzeltmesi gerekirse önce onaylı yedekten geri dönüş prosedürü
   (`BACKUP_RESTORE.md`) uygulanır, ardından ayrı ve denetlenebilir bir
   düzeltme migration'ı hazırlanır. Canlı veritabanında migration tablosu
   elle değiştirilmez.

4. **İzleme:**
   - 15 dakika boyunca metrikleri izle.
   - Error rate < %1'e dönmeli.
   - P95 latency baseline'a dönmeli.

5. **Post-mortem:**
   - Rollback nedenini dokümante et.
   - Önleyici aksiyonlar listele.
   - 1 hafta içinde takip review.

## Versiyon Politikası (Semver)

- **MAJOR (0.x.y → x.0.0):** breaking API change'ler.
- **MINOR (0.x.y → 0.(x+1).0):** geriye dönük uyumlu yeni
  özellikler.
- **PATCH (0.x.y → 0.x.(y+1)):** bug fix'ler, internal
  refactoring.

Pre-1.0 (0.x.y): MINOR breaking change olabilir; pilot
kapsamda kabul edilebilir.

## İlgili dokümanlar

- `docs/operations/INCIDENT_RESPONSE.md` (FAZ-12+)
- `docs/operations/RUNBOOK.md` (FAZ-12+)
- `docs/operations/BACKUP_RESTORE.md` (GOAL-124)
- `.github/workflows/ci.yml`
- `docs/security/KVKK_DATA_LIFECYCLE.md` (GOAL-126)

## Commit

- Docs: (bu commit) — `docs(operations): GOAL-127 production release + rollback prosedürü`
