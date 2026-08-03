# @vetniva/load-test (GOAL-122, FAZ-12)

Performans ve yük testi altyapısı. Pilot klinik ve ilk 100 tenant
ölçeği için 7 kritik senaryoda k6 tabanlı yük testi çalıştırır;
toplanan metrikleri threshold spec ile karşılaştırır; Markdown
ve JSON rapor üretir. Tenant izolasyonu, PII maskeleme ve audit
kurallarına uyar.

## Senaryolar (7)

| Anahtar            | Başlık                    | Profil                      |
| ------------------ | ------------------------- | --------------------------- |
| `patient_search`   | Hasta arama               | smoke/pilot/first100/stress |
| `calendar`         | Klinik takvimi            | smoke/pilot/first100/stress |
| `patient_timeline` | Hayvan zaman çizelgesi    | pilot/first100/stress       |
| `stock_query`      | Stok sorgusu              | pilot/first100/stress       |
| `pos`              | Petshop POS               | pilot/first100              |
| `report`           | Temel finans raporu       | pilot/first100              |
| `error_center`     | Hata merkezi (superadmin) | pilot/first100/stress       |

## Yük Profilleri

| Profil      | VU  | Süre | Açıklama              |
| ----------- | --- | ---- | --------------------- |
| `smoke`     | 1   | 30s  | Sağlık kontrolü       |
| `pilot`     | 10  | 2m   | Pilot doğrulama       |
| `first_100` | 50  | 5m   | İlk 100 tenant hedefi |
| `stress`    | 200 | 5m   | Darboğaz tespiti      |

## Komutlar

```bash
# 1) Tip kontrolü
pnpm --filter @vetniva/load-test type-check

# 2) Birim testleri
pnpm --filter @vetniva/load-test test

# 3) k6 scriptlerini üret (src/k6/ veya out/)
pnpm --filter @vetniva/load-test validate
pnpm --filter @vetniva/load-test validate -- --profile=stress --out=./dist/k6

# 4) k6 çalıştır (k6 binary gerekli)
# Katalog kimlikleri pilot seed veya UAT çıktısından alınır.
BASE_URL=http://localhost:3001 \
AUTH_TOKEN=... TENANT_ID=... BRANCH_ID=... \
PATIENT_ID=... OWNER_ID=... PRODUCT_ID=... \
VETERINARIAN_ID=... CALENDAR_DATE=2026-08-02 \
REPORT_DATE=2026-08-02 \
k6 run --summary-export=summary.json src/k6/patient_search.js
# veya profil belirterek
k6 run --vus 10 --duration 2m --summary-export=summary.json src/k6/calendar.js

# 5) Rapor üret (k6 summary JSON -> MD/JSON)
pnpm --filter @vetniva/load-test report -- \
  --summary=./summary.json \
  --profile=pilot \
  --base-url=http://localhost:3001 \
  --duration-ms=120000 \
  --out-json=./load-test-report.json \
  --out-md=./load-test-report.md
```

## Çıktılar

- `src/k6/*.js` — k6 tarafından çalıştırılabilen 7 senaryo +
  `shared.js` ortak helper.
- `load-test-report.json` — yapılandırılmış rapor
  (`ScenarioResult[]` + `allPassed`).
- `load-test-report.md` — insan-okur rapor (PASS/FAIL tablosu
  - ihlal detayları).

## Threshold Mantığı

Her senaryo kendi `ThresholdSpec`'ini taşır:

- `p95Ms` — p95 latency üst sınırı (ms)
- `p99Ms` — p99 latency üst sınırı (ms); `null` = kontrol yok
- `maxErrorRate` — HTTP hata oranı üst sınırı (0-1)
- `minRps` — minimum saniyedeki istek; `null` = kontrol yok

Profil bazında varsayılan threshold'lar `config.ts` içindeki
`thresholdsForProfile()` ile seçilir:

- `smoke` — `p95<300, p99<600, errRate<0, minRps>=1`
- `pilot`/`first_100` — `p95<500, p99<1000, errRate<1%, minRps>=10`
- `stress` — `p95<1500, p99<3000, errRate<5%, minRps>=50`

Senaryo bazında override (ör. `pos` `p95<700`, `report`
`p95<1500`).

### Threshold Env Override

Profil ve senaryo bazında eşikler ortam değişkenleri ile
override edilebilir. Öncelik (en yüksek → en düşük):

1. `LOAD_TEST_<SCENARIO>_<PROFILE>_<METRIC>`
2. `LOAD_TEST_<PROFILE>_<METRIC>`
3. Profil varsayılanı

```bash
# Tum pilot senaryolari icin p95'i 800ms'ye yukselt
export LOAD_TEST_PILOT_P95_MS=800

# Yalniz patient_search + pilot icin p99 kontrolunu kapat
export LOAD_TEST_PATIENT_SEARCH_PILOT_P99_MS=null

# Stres icin izin verilen hata oranini %2 yap
export LOAD_TEST_STRESS_MAX_ERROR_RATE=2
```

Geçersiz (NaN/Infinity/negatif) env değerleri sessizce yok
sayılır; profil varsayılanı korunur.

## Warm-Up / Cool-Down

Profiller `PROFILE_SHAPES` üzerinden varsayılan
`defaultWarmup` + `defaultCooldown` taşır:

| Profil      | VU  | Süre | Default warm-up | Default cool-down |
| ----------- | --- | ---- | --------------- | ----------------- |
| `smoke`     | 1   | 30s  | 5s              | 5s                |
| `pilot`     | 10  | 2m   | 15s             | 15s               |
| `first_100` | 50  | 5m   | 30s             | 30s               |
| `stress`    | 200 | 5m   | 30s             | 30s               |

k6 options `stages` blogu olarak üretilir:

```js
export const options = {
  stages: [
    { duration: "15s", target: 10 }, // warm-up
    { duration: "2m", target: 10 }, // sustained
    { duration: "15s", target: 0 }, // cool-down
  ],
  thresholds: {/* ... */},
  tags: { suite: "vetniva-load-test" },
};
```

JIT ve cache ısınmasının neden olduğu false-positive
latency pikleri "warm-up" evresinde kalır; threshold
değerlendirmesi yalnızca "steady-state" + cool-down
kombinasyonundan hesaplanır. Senaryo kendi
`warmupSec` / `cooldownSec`'ini tanımlarsa profil
varsayılanı override edilir.

## Tenant İzolasyonu

`shared.js` her istekte `X-Tenant-Id` header'ı gönderir; k6
tarafında gelen yanıtın `X-Tenant-Id` header'ı eşleşmiyorsa
fail atar (`assertTenantBoundary`). Bu sayede test sırasında
tenant boundary breach tespit edilir.

## PII Maskeleme

k6 tarafında `maskString()` helper'ı yanıt gövdesinde email,
TCKN, telefon gibi PII örüntülerini maskeler. Asıl maskeleme
API tarafında `PiiMasker` (FAZ-10) tarafından yapılır; bu
yalnızca test istemcisinde loga PII düşmesini engeller.

Ayrıca her `check()` çağrısında `no_pii_leak` regex kontrolü
yapılır.

## K6 Kurulumu

Bu paket k6 scriptlerini **üretir** ve raporlar. Gerçek yük
testi çalıştırmak için sistemde `k6` binary gerekli:

```bash
# Windows (winget ile)
winget install k6 --source winget

# macOS
brew install k6

# Linux (Debian/Ubuntu)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

## Testler

`pnpm --filter @vetniva/load-test test` komutu:

- 7 senaryo katalog doğrulaması (16 test)
- threshold motoru + metric extraction (18 test)
- env override + warm-up/cool-down (14 test)
- rapor üretici (8 test)
- k6 script üreticisi + shared.js şablonu (14 test)
- uçtan uca smoke testi (1 test)

**Toplam: 71 test.**

## Sınırlamalar / Sonraki Adımlar

- k6 scriptleri env (`__ENV`) üzerinden konfigüre olur; üretim
  CI/CD'de `BASE_URL`, `AUTH_TOKEN`, `TENANT_ID`, `BRANCH_ID` ve
  senaryoda kullanılan `PATIENT_ID`, `OWNER_ID`, `PRODUCT_ID`,
  `VETERINARIAN_ID`, `CALENDAR_DATE`, `REPORT_DATE` set edilmelidir.
  Eksik katalog kimliği, ölçümü yanlış endpoint'e yönlendirmek yerine
  koşumu açık hata ile durdurur.
- Bu core tick altyapı + senaryo + threshold + rapor +
  env override + warm-up/cool-down içerir. Sonraki
  tick'lerde:
  - Pilot ortamında gerçek k6 run + rapor ekleme
  - Çoklu-tenant seed ile paralel test (FAZ-14+)
  - Rate limit senaryosu (FAZ-13+, security-test paketi)
