# @vetniva/worker

VetNiva arka plan iş süreci (background job) çalıştırıcısı. BullMQ +
Redis tabanlı bir Node.js sürecidir; hatırlatma, rapor, entegrasyon
ve diğer zaman-yoğun işleri API sürecinden bağımsız olarak işler.

## Rol

- Faz 0 (GOAL-000) kapsamında sadece **iskelet** kurulur.
- `health` adlı örnek bir queue + worker vardır; gerçek domain
  job'ları sonraki GOAL'larda (örn. GOAL-053 aşı hatırlatma,
  GOAL-067 düşük stok uyarısı) eklenir.
- API süreci (`apps/api`) bu paketin queue'larına job ekler; worker
  onları tüketir.

## Mimari

```
apps/api ──► Redis (BullMQ) ──► apps/worker ──► job processor
                │                    │
                └── attempts: 3  ◄───┘
                └── backoff: exponential
                └── removeOnComplete: 100
                └── removeOnFail: 500
```

## Çalıştırma

### Geliştirme

```powershell
# Bağımlılıkları kur (monorepo kökünde, bir kere)
pnpm install

# Worker'ı izleme modunda başlat
pnpm --filter @vetniva/worker dev
```

### Production

```powershell
pnpm --filter @vetniva/worker build
pnpm --filter @vetniva/worker start
```

### Docker

```bash
docker build -t vetniva-worker -f apps/worker/Dockerfile .
docker run --env-file .env vetniva-worker
```

## Ortam değişkenleri

| Değişken      | Zorunlu | Açıklama                                    |
| ------------- | ------- | ------------------------------------------- |
| `NODE_ENV`    | evet    | `development` / `test` / `production`       |
| `REDIS_URL`   | evet    | BullMQ bağlantı URI'si                      |
| `DATABASE_URL` | evet | Yalnız NOBYPASSRLS runtime rolüne ait PostgreSQL URI'si; JobRun kayıtları için kullanılır |
| `LOG_LEVEL`   | hayır   | Pino seviyesi (default: `info`)             |
| `APP_VERSION` | evet    | Log ve tag için sürüm bilgisi               |
| `PORT_WORKER` | hayır   | Rezerve; worker HTTP endpoint'i yok (queue) |

## Queue'lar

### `health`

Sağlık kontrolü için örnek queue. API süreci veya operatör
tarafından tetiklenebilir; payload Zod şeması ile doğrulanır.

Payload:

```ts
{ check: 'db' | 'redis' | 'all', requestId: string }
```

## Test

```powershell
pnpm --filter @vetniva/worker test          # bir kerelik
pnpm --filter @vetniva/worker test:watch    # izleme
```

Testler Vitest ile çalışır. Redis bağlantısı gerektiren testler
henüz eklenmemiştir; GOAL-000 kapsamında sadece processor ve
payload şeması test edilir. Gerçek Redis bağımlı testler ileride
`@testcontainers/redis` veya mock ioredis ile eklenecektir.

## Gözlemlenebilirlik

- Tüm loglar `pino` üzerinden JSON yazılır (production) veya
  pretty-print (development).
- Her job'da `correlationId` (jobId) loglanır; tenant_id henüz
  desteklenmiyor (GOAL-010 sonrası).
- Hatalar `failedReason` ile birlikte `error` seviyesinde loglanır.

## Tenant güvenliği

Bu worker doğrudan tenant verisine erişmez. GOAL-010 ile birlikte
job payload'larına `tenantId` eklenecek; tüm processor'lar
`TenantContext` zorunlu kılınarak çalışacaktır.
