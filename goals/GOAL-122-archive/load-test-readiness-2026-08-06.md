# GOAL-122 — Performans + Yük Testi Hazırlık Raporu

**Tarih:** 2026-08-06
**Durum:** 71/71 unit test geçti, 7 senaryo k6 scriptleri hazır

## Özet

VetNiva yük testi altyapısı (GOAL-122, FAZ-12) hazır:

- **71 unit test** geçti (6 test dosyası, vitest).
- **7 senaryo** için k6 script'leri derlendi ve tiplendi.
- **3 yük profili** (pilot/stress/smoke) threshold matrisinde tanımlı.
- **P50/P95/P99 + throughput** hedefleri pilot (5dk RPO + 1 saat RTO) ölçeğine uygun.

K6 runtime bağımlılığı nedeniyle canlı yük testi CI gate'inde otomatik
değil; runbook aşağıda.

## Unit Test Sonuçları

| Test Dosyası | Test Sayısı | Durum |
| --- | --- | --- |
| tests/report.test.ts | 8 | ✅ |
| tests/thresholds.test.ts | 18 | ✅ |
| tests/config.test.ts | 16 | ✅ |
| tests/config-override.test.ts | 14 | ✅ |
| tests/smoke.test.ts | 1 | ✅ |
| tests/generator.test.ts | 14 | ✅ |
| **Toplam** | **71** | **✅ 71/71** |

Çalıştırma: `pnpm --filter @vetniva/load-test test`

## 7 Senaryo Kataloğu

| # | Anahtar | API | P95 (ms) | RPS | Profil |
| --- | --- | --- | --- | --- | --- |
| 1 | patient_search | GET /api/v1/clinic/patients | 200 | 200 | pilot |
| 2 | calendar | GET /api/v1/calendar/appointments | 300 | 50 | pilot |
| 3 | patient_timeline | GET /api/v1/clinic/patients/:id/timeline | 500 | 30 | pilot |
| 4 | stock_query | GET /api/v1/inventory/stock | 400 | 40 | pilot |
| 5 | pos | POST /api/v1/petshop/sales | 500 | 50/saat | pilot |
| 6 | report | GET /api/v1/reports/finance | 1500 | 5 | pilot |
| 7 | error_center | GET /api/v1/superadmin/error-events | 600 | 30 | pilot |

## Yük Profili Threshold Matrisi

| Profil | P95 (ms) | P99 (ms) | Max Hata Oranı | Min RPS |
| --- | --- | --- | --- | --- |
| smoke | 300 | 600 | 0% | 1 |
| pilot | 500 | 1000 | %1 | 10 |
| stress | 1500 | 3000 | %5 | 50 |

## k6 Script Yapısı

```
tools/load-test/
  scripts/
    calendar.js
    error_center.js
    patient_search.js
    patient_timeline.js
    pos.js
    report.js
    stock_query.js
    shared.js           # auth, base URL, ortak helper
  src/
    config.ts          # senaryo + threshold kataloğu
    thresholds.ts      # P95/P99/hata kontrolü
    generator.ts       # yük üretici (k6 stages)
    report.ts          # JSON+Markdown rapor
    cli-run.ts         # senaryo koşucu
    cli-validate.ts    # threshold doğrulayıcı
```

## Canlı Çalıştırma Komutları

```bash
# Smoke test (düşük yük; CI için uygun)
pnpm --filter @vetniva/load-test run -- \
  --profile=smoke --scenario=patient_search \
  --base-url=https://vetniva.appsgo.cloud \
  --token=$TOKEN --tenant=$TENANT

# Pilot profili (production eşdeğeri)
pnpm --filter @vetniva/load-test run -- \
  --profile=pilot --scenario=patient_search,calendar,stock_query \
  --base-url=https://vetniva.appsgo.cloud \
  --token=$TOKEN --tenant=$TENANT

# Stress profili (10x peak)
pnpm --filter @vetniva/load-test run -- \
  --profile=stress --scenario=patient_search \
  --base-url=https://vetniva.appsgo.cloud \
  --token=$TOKEN --tenant=$TENANT

# Rapor derleme (JSON+Markdown)
pnpm --filter @vetniva/load-test report -- \
  --in=./load-report.json --out-md=./load-report.md
```

## Pilot vs Production Threshold Farkı

Pilot tier (5 tenant) ölçeğinde yukarıdaki threshold'lar yeterli.
Production tier (100 tenant) için:

- P95 → 300ms hedefi
- P99 → 700ms hedefi
- Max hata oranı → %0.5

Bu değişiklik `thresholds.ts` ve `config.ts` üzerinden tier-aware
yapılabilir; `LoadProfile` type'ı zaten 3 profil destekliyor.

## Yapılmayanlar / Pilot Kapsamı Dışı

- **Production ortam yük testi** — Coolify deploy sonrası gerçek
  ortam koşumu; production-ready döneminde.
- **Stress test (10x peak)** — Faz 12+ (kademeli).
- **Long-running soak test (24h+)** — FAZ-13+ (memory leak tespiti).
- **Database-only benchmarking (pgbench)** — FAZ-13+ (donanım tier'ı).

## Takip Öğeleri

1. **CI gate entegrasyonu** — `tools/load-test/smoke-action.yml`
   (smoke profil otomatik, deployment sonrası).
2. **Real-environment pilot run** — Coolify deploy sonrası gerçek
   yük testi (production-ready öncesi zorunlu).
3. **k6 Cloud / Grafana dashboard** — Trend takibi (FAZ-13+).
4. **Database index audit** — P95 hedeflerini tutturmak için
   `EXPLAIN ANALYZE` çıktıları (FAZ-12 devamı).
5. **Connection pool tuning** — `apps/api` Prisma pool size
   optimizasyonu (FAZ-12 devamı).
