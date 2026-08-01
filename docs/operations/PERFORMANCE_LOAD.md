# Performans ve Yük Testi (GOAL-122)

## Faz

FAZ-12 (Pilot, güvenlik, üretime hazırlık)

## Amaç

Pilot ve ilk 100 tenant ölçeği için performans testleri.
Kritik senaryolar ölçülür; hedefler ve darboğazlar raporlanır.

## Kritik Senaryolar (7)

### 1. Hasta arama

- **Endpoint:** `GET /api/v1/patient/patients?search=...&limit=20`
- **Yük:** 100 tenant × 10.000 hasta = 1M hasta.
- **Hedefler:**
  - P50 < 50 ms
  - P95 < 200 ms
  - P99 < 500 ms
  - Throughput: 200 req/s

### 2. Takvim

- **Endpoint:** `GET /api/v1/calendar/appointments?from=...&to=...&veterinarianId=...`
- **Yük:** 1 tenant × 50 veteriner × 200 randevu/gün × 30 gün.
- **Hedefler:**
  - P50 < 100 ms
  - P95 < 300 ms
  - P99 < 800 ms
  - Throughput: 50 req/s

### 3. Hayvan zaman çizelgesi

- **Endpoint:** `GET /api/v1/patient/patients/{id}/timeline`
- **Yük:** 1 hasta için 5 yıllık tıbbi geçmiş
  (muayene + aşı + reçete + lab = 200+ kayıt).
- **Hedefler:**
  - P50 < 200 ms
  - P95 < 500 ms
  - P99 < 1 s
  - Throughput: 30 req/s

### 4. Stok sorgusu

- **Endpoint:** `GET /api/v1/inventory/stock-movements?productId=...&from=...&to=...`
- **Yük:** 1 tenant × 500 ürün × 1000 lot × 10 hareket/ay.
- **Hedefler:**
  - P50 < 100 ms
  - P95 < 400 ms
  - P99 < 1 s
  - Throughput: 40 req/s

### 5. POS

- **Endpoint:** `POST /api/v1/petshop/sales`
- **Yük:** 1 tenant × 100 satış/saat × 10 ürün/satış.
- **Hedefler:**
  - P50 < 200 ms
  - P95 < 500 ms
  - P99 < 1 s
  - Throughput: 50 satış/saat (burst: 10 satış/dakika)

### 6. Rapor

- **Endpoint:** `GET /api/v1/reports/daily-sales?date=...`
- **Yük:** 1 tenant × 1000 satış/gün × 12 ay aggregate.
- **Hedefler:**
  - P50 < 500 ms
  - P95 < 1.5 s
  - P99 < 3 s
  - Throughput: 5 req/s

### 7. Hata merkezi

- **Endpoint:** `GET /api/v1/superadmin/error-events?from=...&to=...&limit=50`
- **Yük:** 100 tenant × 1000 olay/gün = 100K olay.
- **Hedefler:**
  - P50 < 200 ms
  - P95 < 600 ms
  - P99 < 1.5 s
  - Throughput: 30 req/s

## Yük Testi Altyapısı

### k6 (önerilen)

```js
// scripts/load/patient-search.js
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "1m", target: 50 }, // ramp up
    { duration: "5m", target: 200 }, // sustained
    { duration: "1m", target: 0 }, // ramp down
  ],
  thresholds: {
    http_req_duration: ["p(95)<200"], // P95 < 200ms
    http_req_failed: ["rate<0.01"], // < 1% error
  },
};

export default function () {
  const res = http.get(
    `${__ENV.API_URL}/api/v1/patient/patients?search=test&limit=20`,
    {
      headers: { Authorization: `Bearer ${__ENV.TEST_TOKEN}` },
    },
  );
  check(res, { "status 200": (r) => r.status === 200 });
  sleep(1);
}
```

### Çalıştırma

```bash
# 1. k6 kur (https://k6.io/docs/getting-started/installation/)
brew install k6  # macOS
choco install k6  # Windows

# 2. Test ortamı hazırla (staging)
export API_URL=https://staging.vetniva.local
export TEST_TOKEN=...

# 3. Test çalıştır
k6 run scripts/load/patient-search.js
```

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

## Yapılmayanlar / Bilinçli Atlamalar

- **Production ortam yük testi** → Faz 12+ (canlıya
  alınmadan önce).
- **Stress test (10x peak)** → Faz 12+ (kademeli).
- **Chaos engineering** → Faz 12+ (GameDay exercises).
- **APM (Application Performance Monitoring)** → Faz 12+
  (Datadog integration).

## Commit

- Docs: (bu commit) — `docs(operations): GOAL-122 performans + yük testi dokümanı`
