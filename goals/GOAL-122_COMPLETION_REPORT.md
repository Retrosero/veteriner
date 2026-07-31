# GOAL-122 — Performans + Yük Testi (Completion Report)

## Faz
FAZ-12 (Pilot, güvenlik, üretime hazırlık)

## Özet
Pilot ve ilk 100 tenant ölçeği için performans testleri
planlandı. 7 kritik senaryo; her biri için P50/P95/P99
latency + throughput hedefleri tanımlandı.

## Çıktılar

### Döküman (bu commit)
- `docs/operations/PERFORMANCE_LOAD.md` — 7 senaryo +
  k6 yük testi script altyapısı + darboğaz analizi.

### Senaryolar (7)
1. Hasta arama (P95 < 200ms, 200 req/s)
2. Takvim (P95 < 300ms, 50 req/s)
3. Hayvan zaman çizelgesi (P95 < 500ms, 30 req/s)
4. Stok sorgusu (P95 < 400ms, 40 req/s)
5. POS (P95 < 500ms, 50 satış/saat)
6. Rapor (P95 < 1.5s, 5 req/s)
7. Hata merkezi (P95 < 600ms, 30 req/s)

### k6 Yük Testi Altyapısı
- `scripts/load/patient-search.js` (örnek).
- Stages: ramp-up + sustained + ramp-down.
- Thresholds: P95 < 200ms, hata oranı < 1%.

## Yapılmayanlar / Bilinçli Atlamalar
- **Production ortam yük testi** → Faz 12+ (canlıya
  alınmadan önce).
- **Stress test (10x peak)** → Faz 12+ (kademeli).
- **Chaos engineering** → Faz 12+ (GameDay exercises).
- **APM (Application Performance Monitoring)** → Faz 12+
  (Datadog integration).
- **Otomatik CI integration** → Faz 12+ (PR'larda hızlı
  smoke test).

## Döküman Uyum
- `pnpm docs:check` → temiz (yeni eklenen özgü).
- `pnpm i18n:check` → temiz.

## Testler
- k6 script'leri (FAZ-12+) — staging ortamında çalıştırılır.
- Synthetic monitoring (Datadog) FAZ-12+.

## Commit
- Docs: (bu commit) — `docs(operations): GOAL-122 performans + yük testi dokümanı`
