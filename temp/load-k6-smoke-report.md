# Performans ve Yuk Testi Raporu

- **Calistirilma zamani:** 2026-08-03T07:32:58.326Z
- **Profil:** smoke
- **Base URL:** http://localhost:3001
- **Sonuc:** FAIL (0/7 senaryo gecti)

## Senaryo Sonuclari

| Senaryo | Profil | p95 (ms) | p99 (ms) | Hata % | RPS | Sonuc |
|---|---|---|---|---|---|---|
| patient_search | smoke | - | - | 0.00 | - | FAIL |
| calendar | smoke | - | - | 0.00 | - | FAIL |
| patient_timeline | smoke | - | - | 0.00 | - | FAIL |
| stock_query | smoke | - | - | 0.00 | - | FAIL |
| pos | smoke | - | - | 0.00 | - | FAIL |
| report | smoke | - | - | 0.00 | - | FAIL |
| error_center | smoke | - | - | 0.00 | - | FAIL |

## Ihlal Detaylari

### patient_search (Hasta arama)
- **p95**: beklenen `<= 500 ms`, olculen `-` — p95 metrik degeri okunamadi (summary bos / format hatali)
- **p99**: beklenen `<= 1000 ms`, olculen `-` — p99 metrik degeri okunamadi
- **rps**: beklenen `>= 10 rps`, olculen `0` — RPS 10 altinda

### calendar (Klinik takvimi)
- **p95**: beklenen `<= 500 ms`, olculen `-` — p95 metrik degeri okunamadi (summary bos / format hatali)
- **p99**: beklenen `<= 1000 ms`, olculen `-` — p99 metrik degeri okunamadi
- **rps**: beklenen `>= 10 rps`, olculen `0` — RPS 10 altinda

### patient_timeline (Hayvan zaman cizelgesi)
- **p95**: beklenen `<= 600 ms`, olculen `-` — p95 metrik degeri okunamadi (summary bos / format hatali)
- **p99**: beklenen `<= 1000 ms`, olculen `-` — p99 metrik degeri okunamadi
- **rps**: beklenen `>= 10 rps`, olculen `0` — RPS 10 altinda

### stock_query (Stok sorgusu)
- **p95**: beklenen `<= 500 ms`, olculen `-` — p95 metrik degeri okunamadi (summary bos / format hatali)
- **p99**: beklenen `<= 1000 ms`, olculen `-` — p99 metrik degeri okunamadi
- **rps**: beklenen `>= 10 rps`, olculen `0` — RPS 10 altinda

### pos (Petshop POS)
- **p95**: beklenen `<= 700 ms`, olculen `-` — p95 metrik degeri okunamadi (summary bos / format hatali)
- **p99**: beklenen `<= 1000 ms`, olculen `-` — p99 metrik degeri okunamadi
- **rps**: beklenen `>= 10 rps`, olculen `0` — RPS 10 altinda

### report (Temel finans raporu)
- **p95**: beklenen `<= 1500 ms`, olculen `-` — p95 metrik degeri okunamadi (summary bos / format hatali)
- **p99**: beklenen `<= 3000 ms`, olculen `-` — p99 metrik degeri okunamadi
- **rps**: beklenen `>= 1 rps`, olculen `0` — RPS 1 altinda

### error_center (Hata merkezi (superadmin))
- **p95**: beklenen `<= 500 ms`, olculen `-` — p95 metrik degeri okunamadi (summary bos / format hatali)
- **p99**: beklenen `<= 1000 ms`, olculen `-` — p99 metrik degeri okunamadi
- **rps**: beklenen `>= 10 rps`, olculen `0` — RPS 10 altinda
