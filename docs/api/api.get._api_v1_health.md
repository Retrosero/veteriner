# GET /api/v1/health

Süreç liveness kontrolü. Yalnızca API sürecinin ayakta olduğunu doğrular;
bağımlılıkları kontrol etmez. Sistem izleme, container healthcheck ve
k8s livenessProbe için tasarlanmıştır.

## Bilgi

- **HTTP method:** GET
- **Path:** `/api/v1/health`
- **Yetki:** Public (kimlik doğrulama gerekmez)
- **Idempotent:** Evet
- **Tenant bağlamı:** Yok (sistem akışı)

## Yanıt (200)

```json
{
  "status": "ok",
  "timestamp": "2026-07-29T19:30:00.000Z"
}
```

`status` her zaman `ok` döner; aksi durumda süreç zaten yanıt veremez.

## Hata senaryoları

- **Süreç kapalı:** Bağlantı reddedilir (network error). Status code dönmez.
- **Yetki:** Gerekmez; herkese açık.

## Yan etkiler

- Response header'ına `X-Request-Id` eklenir.

## İlgili sayfa

- `docs/pages/web.app.locale.health.yaml`
