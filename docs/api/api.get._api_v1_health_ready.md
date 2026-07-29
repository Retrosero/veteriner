# GET /api/v1/health/ready

Bağımlılık readiness kontrolü. Veritabanı bağlantısını doğrular ve
latency raporlar. Container healthcheck, k8s readinessProbe ve dış
monitoring sistemleri için tasarlanmıştır.

## Bilgi

- **HTTP method:** GET
- **Path:** `/api/v1/health/ready`
- **Yetki:** Public
- **Idempotent:** Evet
- **Tenant bağlamı:** Yok (sistem akışı)

## Yanıt (200)

```json
{
  "status": "ok",
  "timestamp": "2026-07-29T19:30:00.000Z",
  "version": {
    "name": "vetniva-api",
    "version": "0.1.0",
    "build_sha": "devlocal",
    "build_time": "2026-07-29T19:00:00.000Z"
  },
  "components": {
    "db": {
      "status": "ok",
      "latency_ms": 12
    }
  }
}
```

`status`:

- `ok` — Tüm bağımlılıklar yanıt veriyor
- `degraded` — Yavaş ama çalışıyor
- `down` — Bir veya daha fazla kritik bağımlılık erişilemez (DB)

`status: down` durumunda HTTP 503 döner; yük dengeleyici trafiği
keser.

## Hata senaryoları

| Kod              | Senaryo                 | HTTP             |
| ---------------- | ----------------------- | ---------------- |
| `TR_COMMON_0001` | DB bağlantısı başarısız | 503              |
| —                | DB latency çok yüksek   | 200 (`degraded`) |

## Yan etkiler

- `X-Request-Id` header'ı response'a eklenir.
- DB bağlantı hatası `ERROR` loglanır; `correlation_id` içerir.

## İlgili sayfa

- `docs/pages/web.app.locale.health.yaml`
