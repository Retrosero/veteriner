# @file Log Standardı.
# @module docs/errors/LOG_STANDARD
#
# @description VetNiva'da sistem, background job,
# entegrasyon ve güvenlik loglarının yapısı, seviyeleri,
# formatı ve PII maskeleme kuralları. Audit log'undan
# ayrı bir kategori (bkz. AUDIT_LOG_STANDARD.md).
#
# @author GOAL-004 (FAZ-0) audit + log + hata standardı
# @since 2026-07-30
# @security Log'lar PII içermez. JSON format. Her
#   satırda correlation_id zorunlu. Production'da
#   level: info; development'ta: debug.
# =============================================================================

# Log Standardı

VetNiva'da **dört farklı log türü** vardır:

1. **Sistem logu** — uygulama davranışı, hata ayıklama.
2. **Background job logu** — BullMQ worker'lar.
3. **Entegrasyon logu** — dış servislerle iletişim
   (e-Smm, SMS, ödeme, lab cihazı).
4. **Güvenlik logu** — auth, yetkilendirme, PII
   erişimi, şüpheli aktivite.

Audit log'undan farklı olarak sistem logları **iş
akışının gözlemlenmesi** içindir; "kim ne yaptı?"
sorusunu cevaplamaz (bunun için audit log'a bakın).

## 1. Log Seviyeleri

NestJS/Pino standart seviyeleri:

| Seviye      | Kullanım                                       | Örnek |
| ----------- | ---------------------------------------------- | ----- |
| `trace`     | Çok detaylı (sadece dev).                      | "Prisma raw SQL" |
| `debug`     | Geliştirme.                                    | "Cache hit" |
| `info`      | Normal iş akışı.                              | "Patient created" |
| `warn`      | Beklenen ama dikkat gereken durum.            | "Retry attempt 2/3" |
| `error`     | Hata (4xx/5xx).                                | "Validation failed" |
| `fatal`     | Kritik hata, process kapatılabilir.            | "DB connection lost" |

**Production'da:** `info` ve üzeri. Development'ta
`debug` ve üzeri.

## 2. JSON Format

Her log satırı **tek satır JSON**:

```json
{
  "timestamp": "2026-07-30T12:34:56.789Z",
  "level": "info",
  "service": "api",
  "logger": "PatientService",
  "message": "Patient created",
  "correlation_id": "req-7c9e6679b7425a8d8c0b8d8e0e0e0e0e",
  "tenant_id": "tnt-abc",
  "branch_id": "br-1",
  "user_id": "usr-123",
  "country": "TR",
  "context": {
    "patient_id": "pat-456",
    "species": "dog"
  },
  "duration_ms": 124,
  "host": "api-pod-1"
}
```

**Yapısal alanlar** (her log'da bulunur):

| Alan            | Zorunlu | Açıklama |
| --------------- | ------- | -------- |
| `timestamp`     | evet    | ISO 8601 UTC. |
| `level`         | evet    | trace/debug/info/warn/error/fatal. |
| `service`       | evet    | `api` / `web` / `worker` / `integration`. |
| `logger`        | evet    | Logger adı (sınıf/modül). |
| `message`       | evet    | İnsan-okunabilir mesaj. |
| `correlation_id`| evet    | `req-...` / `job-...` / `int-...`. |
| `tenant_id`     | hayır   | Tenant context (varsa). |
| `branch_id`     | hayır   | Şube (multi-branch). |
| `user_id`       | hayır   | Aktif kullanıcı. |
| `country`       | hayır   | Tenant ülkesi. |
| `host`          | evet    | Container/pod adı. |
| `pid`           | evet    | Process ID. |
| `context`       | hayır   | Ek bağlam (request-specific). |
| `duration_ms`   | hayır   | İşlem süresi (varsa). |
| `error`         | hayır   | Hata durumunda `{name, message, stack}`. |

## 3. Log Türleri

### 3.1 Sistem logu (api / web)

**Kullanım:** HTTP request/response, servis metotları,
veritabanı sorgu süreleri.

```ts
// apps/api/src/common/logging/logger.service.ts
this.logger.log({
  message: "Patient created",
  context: { patient_id: "pat-456", species: "dog" },
  duration_ms: 124,
});
```

**Otomatik alanlar (interceptor):**

- `correlation_id` (RequestIdInterceptor).
- `tenant_id` / `branch_id` (TenantContext).
- `user_id` (AuthGuard).
- `duration_ms` (HttpLoggingInterceptor).

### 3.2 Background job logu (worker)

**Kullanım:** BullMQ worker'lar, zamanlanmış görevler.

```ts
// apps/worker/src/jobs/vaccination-reminder.job.ts
this.logger.log({
  message: "Vaccination reminders sent",
  job_id: job.id,
  context: { sent: 42, failed: 1 },
  duration_ms: 1820,
});
```

**Ek alanlar:**

- `job_id` — BullMQ job ID.
- `job_name` — `vaccination.reminder`.
- `attempt` — deneme sayısı (1/3, 2/3, ...).
- `bullmq_queue` — queue adı.

### 3.3 Entegrasyon logu

**Kullanım:** Dış API çağrıları (e-Smm, SMS, ödeme, lab).

```ts
// apps/api/src/common/logging/integration-logger.ts
this.logger.log({
  message: "e-Invoice sent",
  integration: "uyumsoft",
  context: {
    invoice_id: "inv-789",
    external_id: "UY-2026-...",
    duration_ms: 850,
    retry_count: 0,
  },
});
```

**Ek alanlar:**

- `integration` — sağlayıcı (`uyumsoft`, `iletimerkezi`,
  `stripe`, `wise`, `idexx`).
- `external_id` — dış servisin döndüğü ID.
- `request_payload_hash` — SHA-256 (PII mask'lendi).
- `response_status` — HTTP / business code.
- `retry_count` — deneme sayısı.

**Özel durum:** Entegrasyon loglarında request/response
gövdesi PII içerebilir. **Asla plain text yazılmaz**.
Yalnızca hash + metadata:

```json
{
  "request_payload_hash": "7c9e6679b7425a8d",
  "request_size": 4096,
  "response_status": 200
}
```

### 3.4 Güvenlik logu

**Kullanım:** Auth olayları, yetkilendirme kararları,
PII erişimi, şüpheli aktivite.

```ts
// apps/api/src/common/logging/security-logger.ts
this.securityLogger.log({
  message: "Permission denied",
  event: "authz.deny",
  actor_id: "usr-123",
  context: {
    permission: "clinic:owner:erase",
    target_id: "own-456",
    reason: "permission_missing",
  },
});
```

**Ek alanlar:**

- `event` — sabit isimlendirme: `auth.login`,
  `auth.logout`, `auth.fail`, `authz.deny`,
  `pii.read`, `pii.export`, `pii.erase`,
  `tenant.cross_attempt` (şüpheli),
  `rate_limit.exceeded`, `session.hijack_suspect`.

**Bu log türü alert tetikler:**

- `auth.fail` ardışık 5 kez → PagerDuty.
- `tenant.cross_attempt` → anlık alert.
- `pii.erase` → günlük rapor + onay maili.
- `rate_limit.exceeded` → IP ban değerlendirmesi.

## 4. Log Seviyelerinin Operasyonel Kullanımı

| Seviye   | Alert? | Retention | Yön |
| -------- | ------ | --------- | --- |
| `trace`  | hayır  | 1 gün     | sadece dosya |
| `debug`  | hayır  | 1 gün     | sadece dosya |
| `info`   | hayır  | 30 gün    | dosya + stdout |
| `warn`   | hayır  | 90 gün    | dosya + stdout |
| `error`  | evet*  | 90 gün    | dosya + stdout + alert |
| `fatal`  | evet   | 1 yıl     | dosya + stdout + PagerDuty |

*Error: Dakikada 10'dan fazla → alert.

## 5. Format Detayları

### 5.1 Logger implementasyonu

`apps/api/src/common/logging/logger.service.ts`:

```ts
import pino from "pino";
import { AsyncLocalStorage } from "node:async_hooks";

const requestContext = new AsyncLocalStorage<{
  requestId: string;
  tenantId?: string;
  branchId?: string;
  userId?: string;
  country?: string;
}>();

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: {
    service: process.env.SERVICE_NAME ?? "api",
    host: process.env.HOSTNAME,
    pid: process.pid,
  },
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  formatters: {
    level: (label) => ({ level: label }),
  },
  mixin() {
    const ctx = requestContext.getStore();
    return ctx ?? {};
  },
  // PII masker:
  redact: {
    paths: [
      "*.first_name", "*.last_name", "*.email", "*.phone",
      "*.tax_id", "*.iban", "*.password", "*.token",
      "*.api_key", "*.secret",
    ],
    censor: "[REDACTED]",
  },
});

export const withContext = requestContext.run.bind(requestContext);
```

### 5.2 AsyncLocalStorage ile bağlam

NestJS interceptor, request başlangıcında context'i
başlatır; tüm log çağrıları bu context'i otomatik alır:

```ts
// request-id.interceptor.ts
withContext({ requestId, tenantId, userId }, () => next.handle());
```

### 5.3 HTTP request/response log (interceptor)

```ts
// apps/api/src/common/interceptors/http-logging.interceptor.ts
const start = Date.now();
return next.handle().pipe(
  tap(() => {
    logger.info({
      message: "HTTP request",
      context: {
        method: request.method,
        url: request.url,
        status: response.statusCode,
        duration_ms: Date.now() - start,
      },
    });
  }),
  catchError((err) => {
    logger.error({
      message: "HTTP request failed",
      context: {
        method: request.method,
        url: request.url,
        status: err.status ?? 500,
        duration_ms: Date.now() - start,
      },
      error: { name: err.name, message: err.message, stack: err.stack },
    });
    return throwError(() => err);
  }),
);
```

## 6. Hassas Alanlar

`redact` ile otomatik mask'lenen alanlar:

- `password`, `token`, `api_key`, `secret`,
  `authorization`, `cookie`, `*.password`,
  `*.current_password`, `*.new_password`.
- PII alanları (`first_name`, `last_name`, `email`,
  `phone`, `tax_id`, `iban`, vb.) — `PiiMasker` ile
  mask'lenir (bkz. PII_MASKING.md).

## 7. Log Yönlendirme (Sink)

| Ortam        | Sink                                        |
| ------------ | ------------------------------------------- |
| Development  | Console (pino-pretty) + dosya               |
| Test         | Console                                     |
| Staging      | Console + Elasticsearch (Loki)              |
| Production   | Console (JSON) + Elasticsearch + S3 archive |

**Yapısal olmayan log kabul edilmez.** `console.log`
ile string log atılamaz; tüm log'lar `logger` üzerinden.

## 8. Retention

| Log türü     | Hot (Elasticsearch) | Cold (S3) | Toplam |
| ------------ | ------------------- | --------- | ------ |
| Sistem       | 30 gün              | 1 yıl     | 1 yıl  |
| Job          | 30 gün              | 1 yıl     | 1 yıl  |
| Entegrasyon  | 90 gün              | 1 yıl     | 1 yıl  |
| Güvenlik     | 90 gün              | 2 yıl     | 2 yıl  |
| Audit (ayrı) | 1 yıl               | 7 yıl     | 7 yıl  |

## 9. CI Doğrulama

`pnpm docs:check` ve `pnpm test` şunları doğrular:

1. `console.log` / `console.error` kullanımı yasak
   (lint kuralı).
2. Her log çağrısı JSON formatında.
3. PII alanları plain text içermez (PiiMasker testi).
4. `correlation_id` her log'da bulunur.
5. Güvenlik event'leri doğru event isimlendirmesini
   kullanır.

## 10. Operasyonel Uyarılar

- **Yüksek hacim:** 100k+ log/saat. Sampling: info
  level %10, warn+ tam.
- **Log budget:** Container başına max 5MB/s log.
- **Alert fatigue:** Error log spike (10x normal)
  → Slack + PagerDuty.

## İlgili dokümanlar

- [`AUDIT_LOG_STANDARD.md`](./AUDIT_LOG_STANDARD.md) —
  audit log (append-only).
- [`PII_MASKING.md`](./PII_MASKING.md) — PII maskeleme.
- [`CORRELATION_ID.md`](./CORRELATION_ID.md) — log
  ilişkilendirme.
- [`ERROR_CODE_STANDARD.md`](./ERROR_CODE_STANDARD.md) —
  hata response formatı.
