# Performans ve Yük Testi (GOAL-122)

## Faz

FAZ-12 (Pilot, güvenlik, üretime hazırlık)

## Amaç

Pilot ve ilk 100 tenant ölçeği için performans testleri.
Kritik senaryolar ölçülür; hedefler ve darboğazlar raporlanır.

## Kritik Senaryolar (7)

Senaryo kataloğu (`tools/load-test/src/config.ts`) aşağıdaki
işlemleri kapsar. Her senaryo kendi `ThresholdSpec`'ini taşır;
profil (`smoke`/`pilot`/`first_100`/`stress`) override edilir.

| Anahtar            | Başlık                    | Profil                       | p95 hedef (ms) |
| ------------------ | ------------------------- | ---------------------------- | -------------- |
| `patient_search`   | Hasta arama               | smoke/pilot/first_100/stress | 500            |
| `calendar`         | Klinik takvimi            | smoke/pilot/first_100/stress | 500            |
| `patient_timeline` | Hayvan zaman çizelgesi    | pilot/first_100/stress       | 600            |
| `stock_query`      | Stok sorgusu              | pilot/first_100/stress       | 500            |
| `pos`              | Petshop POS               | pilot/first_100              | 700            |
| `report`           | Temel finans raporu       | pilot/first_100              | 1500           |
| `error_center`     | Hata merkezi (superadmin) | pilot/first_100/stress       | 500            |

### 1. Hasta arama

- **Endpoint:** `GET /api/v1/clinic/owners?search=...&limit=20`
  - `GET /api/v1/clinic/patients?search=...&limit=20`
- **Yük:** 100 tenant × 10.000 hasta = 1M hasta.
- **Hedefler:** P50 < 50 ms, P95 < 500 ms, P99 < 1 s, RPS ≥ 10.

### 2. Takvim

- **Endpoint:** `GET /api/v1/calendar/days/{calendarDate}` (opsiyonel
  `veterinarianId` filtresi).
- **Yük:** 1 tenant × 50 veteriner × 200 randevu/gün × 30 gün.
- **Hedefler:** P50 < 100 ms, P95 < 500 ms, P99 < 1 s, RPS ≥ 10.

### 3. Hayvan zaman çizelgesi

- **Endpoint:** `GET /api/v1/clinic/patients/{patientId}/timeline?limit=50`.
- **Yük:** 1 hasta için 5 yıllık tıbbi geçmiş
  (muayene + aşı + reçete + lab = 200+ kayıt).
- **Hedefler:** P50 < 200 ms, P95 < 600 ms, P99 < 1.2 s, RPS ≥ 10.

### 4. Stok sorgusu

- **Endpoint:**
  - `GET /api/v1/catalog/products?limit=50`
  - `GET /api/v1/inventory/stock-movements/balances?limit=50`
- **Yük:** 1 tenant × 500 ürün × 1000 lot × 10 hareket/ay.
- **Hedefler:** P50 < 100 ms, P95 < 500 ms, P99 < 1 s, RPS ≥ 10.

### 5. POS

- **Endpoint:** `POST /api/v1/petshop/sales` (taslak + tahsilat).
- **Yük:** 1 tenant × 100 satış/saat × 10 ürün/satış.
- **Hedefler:** P50 < 200 ms, P95 < 700 ms, P99 < 1.5 s, RPS ≥ 5.

### 6. Rapor

- **Endpoint:** `GET /api/v1/reports/daily-sales?from=...&to=...`.
- **Yük:** 1 tenant × 1000 satış/gün × 12 ay aggregate.
- **Hedefler:** P50 < 500 ms, P95 < 1.5 s, P99 < 3 s, RPS ≥ 1.

### 7. Hata merkezi

- **Endpoint:**
  - `GET /api/v1/superadmin/error-events?limit=50`
  - `GET /api/v1/superadmin/security-events?limit=50`
- **Yük:** 100 tenant × 1000 olay/gün = 100K olay.
- **Hedefler:** P50 < 200 ms, P95 < 500 ms, P99 < 1 s, RPS ≥ 10.

## Yük Profilleri

| Profil      | VU  | Süre | Default warm-up | Default cool-down | Açıklama              |
| ----------- | --- | ---- | --------------- | ----------------- | --------------------- |
| `smoke`     | 1   | 30s  | 5s              | 5s                | Sağlık kontrolü       |
| `pilot`     | 10  | 2m   | 15s             | 15s               | Pilot doğrulama       |
| `first_100` | 50  | 5m   | 30s             | 30s               | İlk 100 tenant hedefi |
| `stress`    | 200 | 5m   | 30s             | 30s               | Darboğaz tespiti      |

Warm-up/cool-down k6 `stages` blogu olarak üretilir. JIT ve
cache ısınmasının neden olduğu false-positive latency
pikleri threshold hesabına katılmaz; ölçüm yalnızca
"steady-state" evresinden alınır.

## Yük Testi Altyapısı

### k6 Kurulumu

Bu paket k6 scriptlerini **üretir** ve raporlar. Gerçek
yük testi çalıştırmak için sistemde `k6` binary gerekli:

```powershell
# Windows (winget)
winget install k6 --source winget

# veya Chocolatey
choco install k6

# macOS
brew install k6

# Linux (Debian/Ubuntu)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

Doğrulama:

```bash
k6 version
# k6 v0.50.0 (commit/...)
```

### Ortam Değişkenleri

k6 scriptleri `__ENV` üzerinden konfigüre olur. Zorunlu
alanlar çalışma anında `resolvePath` ile doğrulanır; eksik
placeholder senaryoyu açık hata ile durdurur.

| Değişken          | Zorunlu | Açıklama                                         |
| ----------------- | ------- | ------------------------------------------------ |
| `BASE_URL`        | hayır   | API kök URL (varsayılan `http://localhost:3001`) |
| `TENANT_ID`       | hayır   | Pilot tenant (varsayılan `tnt-pilot-kadikoy`)    |
| `BRANCH_ID`       | hayır   | Pilot branch (varsayılan `brc-pilot-merkez`)     |
| `AUTH_TOKEN`      | hayır   | Bearer token; boşsa `X-User-Id` ile çalışır      |
| `USER_ID`         | hayır   | Aktör user ID (varsayılan `usr-pilot-vet`)       |
| `PATIENT_ID`      | evet    | `patient_timeline` senaryosu için                |
| `OWNER_ID`        | evet    | `pos` senaryosu için                             |
| `PRODUCT_ID`      | evet    | `pos` senaryosu için                             |
| `VETERINARIAN_ID` | evet    | `calendar` senaryosu için                        |
| `CALENDAR_DATE`   | evet    | `calendar` senaryosu için (`YYYY-MM-DD`)         |
| `REPORT_DATE`     | evet    | `report` senaryosu için (`YYYY-MM-DD`)           |

### Threshold Override (env)

Profil + senaryo bazında threshold değerleri
ortam değişkenleri ile override edilebilir. Öncelik sırası
(en yüksek → en düşük):

1. `LOAD_TEST_<SCENARIO>_<PROFILE>_<METRIC>` — senaryo + profil adına özel
2. `LOAD_TEST_<PROFILE>_<METRIC>` — yalnız profil adına
3. Profil varsayılanı (`config.ts`)

Senaryo adı büyük harfle ve underscore ile yazılır
(`PATIENT_SEARCH`, `CALENDAR`, `PATIENT_TIMELINE`,
`STOCK_QUERY`, `POS`, `REPORT`, `ERROR_CENTER`).
Profil adı büyük harfle (`PILOT`, `FIRST_100`, `STRESS`,
`SMOKE`). Metric anahtarları:

| Anahtar          | Açıklama                   | Kabul edilen format                           |
| ---------------- | -------------------------- | --------------------------------------------- |
| `P95_MS`         | p95 latency üst sınırı     | ms (sayı, ≥ 0)                                |
| `P99_MS`         | p99 latency üst sınırı     | ms (sayı, ≥ 0) **veya** `null` (kontrol dışı) |
| `MAX_ERROR_RATE` | HTTP hata oranı üst sınırı | 0-1 oranı **veya** 1-100 yüzdelik             |
| `MIN_RPS`        | Minimum RPS                | sayı (≥ 0) **veya** `null` (kontrol dışı)     |

Örnekler:

```bash
# Tum pilot senaryolari icin p95'i 800ms'ye yukselt
export LOAD_TEST_PILOT_P95_MS=800

# Yalniz patient_search + pilot icin p99 kontrolunu kapat
export LOAD_TEST_PATIENT_SEARCH_PILOT_P99_MS=null

# Stres icin izin verilen hata oranini %2 yap
export LOAD_TEST_STRESS_MAX_ERROR_RATE=2

# Rapor senaryosu (first_100 profili) icin minimum RPS kontrolu
export LOAD_TEST_REPORT_FIRST_100_MIN_RPS=2
```

Geçersiz (NaN/Infinity/negatif) env değerleri sessizce
yok sayılır; profil varsayılanı korunur. Bu sayede operatör
hatalı env değeri ile sessiz sansür üretmez.

### Çalıştırma

```bash
# 1) Tip kontrolü
pnpm --filter @vetniva/load-test type-check

# 2) Birim testleri (71 test)
pnpm --filter @vetniva/load-test test

# 3) k6 scriptlerini üret (src/k6/ veya out/)
pnpm --filter @vetniva/load-test validate
pnpm --filter @vetniva/load-test validate -- --profile=stress --out=./dist/k6

# 4) Test ortamı hazırla (staging)
export BASE_URL=https://staging.vetniva.local
export AUTH_TOKEN=...
export TENANT_ID=... BRANCH_ID=... USER_ID=...
export PATIENT_ID=... OWNER_ID=... PRODUCT_ID=...
export VETERINARIAN_ID=... CALENDAR_DATE=2026-08-02 REPORT_DATE=2026-08-02

# 5) k6 çalıştır
k6 run --summary-export=summary.json src/k6/patient_search.js
# veya profil/options elle
k6 run --vus 10 --duration 2m --summary-export=summary.json src/k6/calendar.js

# 6) Rapor üret (k6 summary JSON -> MD/JSON)
pnpm --filter @vetniva/load-test report -- \
  --summary=./summary.json \
  --profile=pilot \
  --base-url=http://localhost:3001 \
  --duration-ms=120000 \
  --out-json=./load-test-report.json \
  --out-md=./load-test-report.md
```

> **Not:** `pnpm` filtresi paketin `cwd`'sinde çalışır;
> `--summary` ve `--out-*` yolları pakete göre relative'dir.
> Kök dizinden çalıştırmak için `tools/load-test/` altında
> çalıştırın veya mutlak yol kullanın.

## Runbook

### Senaryo: Smoke test kaldı (baseline > eşik)

1. **Önce smoke profili ile yeniden çalıştır** — tek VU,
   30s, tüm senaryolar. Hata tekrarlanıyorsa deploy veya DB
   değişikliği olabilir.
2. **Pilot profili** ile yeniden çalıştır. Hata devam
   ediyorsa `BASE_URL` ve API log'larını kontrol et
   (`vetniva_errors` custom metrik + backend
   `error-events` listesi).
3. **DB pool ve cache** doygunluğunu kontrol et
   (`vetniva_pg_pool_*` metrikleri staging'de mevcutsa).
4. **Tenant boundary breach** oluştuysa k6 tarafında
   `vetniva_tenant_boundary_ok` oranını %100 altında
   raporlar; pilot tenant seed'inin `TENANT_ID` ile eşleştiğini
   doğrula.

### Senaryo: Threshold ihlali (first_100)

1. **Hangi senaryo + metrik** ihlal etti? `load-test-report.md`
   tablosunda `FAIL` satırına bak; `failures[]` listesi
   `metric` + `expected` + `actual` + `reason` verir.
2. **Darboğaz türüne** göre aksiyon:
   - `p95` veya `p99` → veritabanı sorgu planı (`EXPLAIN`),
     ek index, N+1 tespiti
   - `error_rate` → backend log + error-events
     (`GOAL-105 security_events`), 4xx/5xx oranı
   - `rps` → CPU/IO doygunluğu, connection pool artışı
3. **Stress profili** ile doğrula: aynı senaryo
   darboğaz noktasını bulmaya yardımcı olur.
4. **Remediation commit** + aynı profille yeniden çalıştır.

### Senaryo: k6 binary yok

CI runner'da `k6` binary yoksa load testi başlamaz.
Yerel geliştirmede test/syntax doğrulaması yine
çalışır; production CI'da:

```yaml
# GitHub Actions örneği
- name: Install k6
  run: |
    curl -L https://github.com/grafana/k6/releases/download/v0.50.0/k6-v0.50.0-linux-amd64.tar.gz | tar xz
    sudo mv k6-v0.50.0-linux-amd64/k6 /usr/local/bin/
- name: Run load test
  run: pnpm --filter @vetniva/load-test report -- --summary=./summary.json --profile=pilot --base-url=${{ env.STAGING_URL }}
```

### Senaryo: Rate limit tetiklendi

Pilot ortamında rate-limit 401/429 üretebilir; bu
durumda `MAX_ERROR_RATE` eşiği aşılır. Aksiyon:

1. Pilot auth token'ının geçerli olduğunu doğrula.
2. `tools/load-test/src/k6-shared.ts` içindeki
   `jitterSleep(50, 200)` çağrılarını artır
   (rate limit penceresine göre 200-500ms).
3. Tekrarlayan sorun için staging rate limit
   konfigürasyonunu yükselt.

## Darboğaz Analizi

### Bilinen potansiyel darboğazlar

- **N+1 sorgu:** Hasta zaman çizelgesi için gerekirse
  Prisma `include` ile tek sorguda çekilebilir.
- **Vector store (FAZ-11 in-memory):** Hata merkezi
  retrieval; production'da Qdrant/pgvector gerekir.
- **Cold storage arşivleme:** Sweep job FAZ-12+ async
  (BullMQ); yoğun saatlerde DB yükünü azaltır.
- **Audit log yazma:** Tüm aksiyon audit üretir; bulk
  insert + batch (FAZ-12+).
- **Tenant boundary check:** k6 tarafında her istekte
  response `X-Tenant-Id` header doğrulanır. Bu ek yük
  kabul edilebilir; backend'in kendi tenant filter
  güvencesine ek savunma.

## RAG Chunk Üretimi

Performans senaryolarının açıklamaları `tools/rag-chunk-producer`
ile otomatik olarak `docs/ai/AI_CHUNKS.yaml` dosyasına
eklenir. Producer Markdown başlıklarını (Senaryo, Profil,
Hedef) chunk olarak indeksler; RAG retrieval pilot
asistan tarafından bu chunk'ları kullanır.

Üretim:

```bash
pnpm --filter @vetniva/rag-chunk-producer build
pnpm --filter @vetniva/rag-chunk-producer produce
# veya sadece operations:
pnpm --filter @vetniva/rag-chunk-producer produce:operations
```

## Yapılmayanlar / Bilinçli Atlamalar

- **Production ortam yük testi** → Faz 12+ (canlıya
  alınmadan önce).
- **Stress test (10x peak)** → Faz 12+ (kademeli).
- **Chaos engineering** → Faz 12+ (GameDay exercises).
- **APM (Application Performance Monitoring)** → Faz 12+
  (Datadog integration).
- **Çoklu-tenant seed ile paralel test** → FAZ-14+
  (cross-tenant stress).
- **Rate limit senaryosu** (load test kapsamında) →
  FAZ-13+ (security-test paketinde yarı-kapsam dahil).

## Commit

- Docs: (bu commit) — `docs(operations): GOAL-122 performans + yük testi dokümanı zenginleştirme (env override, runbook, RAG)`
- Core: `feat(load-test): GOAL-122 threshold env override + warm-up/cool-down`
