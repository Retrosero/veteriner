# @file Correlation / Request ID Standardı.
# @module docs/errors/CORRELATION_ID
#
# @description VetNiva'da isteklerin uçtan uca izlenebilmesi için
# kullanılan correlation/request ID'nin üretimi, iletimi, log
# ilişkilendirmesi ve UI'da gösterimi. Tüm log, audit ve
# hata kayıtları bu ID ile ilişkilendirilir.
#
# @author GOAL-004 (FAZ-0) audit + log + hata standardı
# @since 2026-07-30
# @security ID formatı tahmin edilemez olmalı (UUID v4).
#   Kullanıcı tarafından değiştirilebilir, fakat uzunluk
#   sınırı uygulanır.
# =============================================================================

# Correlation / Request ID Standardı

VetNiva'da bir HTTP isteği, bir background job veya bir
dış entegrasyon çağrısı **tek bir correlation ID** ile
etiketlenir. Bu ID, tüm log/audit/hata kayıtlarında
bulunur ve uçtan uca izleme sağlar.

## 1. Amaç

Bir kullanıcı "Hayvan kaydı oluştururken 500 hatası aldım"
dediğinde:

- Destek ekibi `correlation_id` ile tüm ilgili log'ları
  bulabilmeli (web → api → db).
- Geliştirici, frontend'den backend'e, background
  job'dan entegrasyona kadar tüm akışı
  yeniden oluşturabilmeli.
- Audit trail (özellikle KVKK/GDPR) için "kim, ne zaman,
  ne yaptı?" sorusu tek noktadan cevaplanabilmeli.

## 2. Format

```
req-<32-hex>
```

- **`req-`** — sabit prefix. Background job'lar için
  `job-<id>`, dış entegrasyonlar için `int-<id>`.
- **32 hex karakter** — UUID v4 (kısa çizgi olmadan,
  128 bit entropi).

**Örnekler:**

- `req-7c9e6679b7425a8d8c0b8d8e0e0e0e0e` (HTTP isteği)
- `job-b6a3c2d4-1234-5678-9abc-def012345678` (BullMQ job)
- `int-9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d` (enteg. call)

**Türler:**

| Tür     | Prefix   | Üretici                | Ömür             |
| ------- | -------- | ---------------------- | ---------------- |
| HTTP    | `req-`   | `RequestIdInterceptor` | Tek HTTP isteği  |
| Job     | `job-`   | BullMQ `jobId`         | Background job   |
| Cron    | `cron-`  | Cron self-reminder     | Bir cron tick'i  |
| Entegr. | `int-`   | Integration adapter    | Tek API call     |

## 3. Üretim Kuralları

### 3.1 HTTP isteği

```ts
// apps/api/src/common/interceptors/request-id.interceptor.ts
import { randomUUID } from "node:crypto";

const incoming = request.header("x-request-id");
const requestId =
  incoming && incoming.length > 0 && incoming.length <= 128
    ? incoming // istemci verdiyse kabul et
    : `req-${randomUUID().replace(/-/g, "")}`;
```

**Kurallar:**

- İstemci `X-Request-Id` başlığı gönderdiyse **kabul et**
  (debug/test kolaylığı). Maks. 128 karakter.
- Aksi halde `req-<uuidv4 hex>` üret.
- Prefix her zaman `req-` olmalı.
- ID tüm response'larda `X-Request-Id` başlığı ile geri
  döner (client tarafı da loglayabilsin).

### 3.2 Background job (BullMQ)

```ts
// apps/worker/src/jobs/example.job.ts
const correlationId = `job-${job.id}`;
this.logger.log({ correlationId, ... });
```

**Kurallar:**

- `job.id` UUID'sini prefix ile.
- Worker'lar job içinde oluşturulan tüm alt-çağrılar
  (DB, external API) bu ID ile loglanır.
- Job retry'larında aynı ID korunur (yeniden üretilmez).

### 3.3 Dış entegrasyon

```ts
// apps/api/src/common/integrations/soap.client.ts
const correlationId = `int-${randomUUID().replace(/-/g, "")}`;
const response = await soap.call({
  headers: { "X-Correlation-Id": correlationId },
});
```

**Kurallar:**

- Dış servise `X-Correlation-Id` başlığı ile iletilir
  (destekleyen servisler için).
- Dış servisin döndüğü ID varsa kabul edilir; yoksa
  kendi ürettiğimiz kullanılır.

## 4. İletim

### 4.1 HTTP header

| Yön         | Header             | Değer örneği                              |
| ----------- | ------------------ | ----------------------------------------- |
| İstemci → API | `X-Request-Id`     | `req-7c9e6679b7425a8d8c0b8d8e0e0e0e0e`    |
| API → DB log | (logger context)   | (NestJS AsyncLocalStorage üzerinden)     |
| API → Job    | (job payload)      | `{ correlationId: "req-..." }`            |
| API → Client | `X-Request-Id`     | (response header'ında yankılanır)         |

### 4.2 AsyncLocalStorage (Node)

NestJS interceptor, ID'yi `als.run()` ile saklar. Logger
ve audit service otomatik olarak bu değeri okur:

```ts
import { AsyncLocalStorage } from "node:async_hooks";

export const requestContext = new AsyncLocalStorage<{
  requestId: string;
  tenantId?: string;
  userId?: string;
}>();

// Interceptor:
requestContext.run({ requestId }, () => next.handle());

// Logger / Audit service:
const ctx = requestContext.getStore();
const log = { ...payload, correlation_id: ctx?.requestId };
```

## 5. Log / Audit / Hata İlişkilendirmesi

Tüm log ve audit kayıtları `correlation_id` alanı içerir:

```json
{
  "timestamp": "2026-07-30T12:34:56.789Z",
  "level": "error",
  "correlation_id": "req-7c9e6679b7425a8d8c0b8d8e0e0e0e0e",
  "tenant_id": "tnt-abc",
  "user_id": "usr-123",
  "message": "Patient not found",
  "context": { "patient_id": "pat-456" }
}
```

**ErrorResponse** yapısında `correlation_id` zorunludur:

```json
{
  "error_code": "VET-CLINIC-0001",
  "message": "Hayvan bulunamadı.",
  "correlation_id": "req-7c9e6679b7425a8d8c0b8d8e0e0e0e0e",
  ...
}
```

## 6. UI Gösterimi

Frontend'de 5xx hataları ve "Beklenmeyen hata" mesajları
şu formatta gösterilir:

```
Beklenmeyen bir hata oluştu.
Referans kodu: req-7c9e6679b7...
Bu kodu destek ekibine iletin.
```

- "Referans kodu" terimi `error.correlation_id` anahtarından
  çevrilir.
- 4xx hatalarında correlation ID gösterilmez
  (bilgi sızdırmaz; sadece 5xx ve "bilinmeyen hata"
  durumlarında gösterilir).
- `error_page.copy_id` butonu panoya kopyalar.

## 7. Koleksiyon ve Arama

- **Log aggregator:** Tüm servis log'ları
  `correlation_id` index'lenmiş şekilde Elasticsearch/Loki
  gibi bir sisteme gönderilir.
- **Arama:** `correlation_id:"req-7c9e..."` ile ilgili tüm
  servislerin log'ları tek sorguda gelir.
- **Audit:** `audit_events` tablosunda
  `correlation_id` alanı; KVKK silme talebinde tüm
  izler bulunabilir.

## 8. Güvenlik

- ID **tahmin edilemez** (UUID v4 → 122 bit entropi). Başka
  tenant'ın ID'si enumerate edilemez.
- Müşteri tarafından değiştirilebilir (debug için), fakat
  uzunluk ve karakter seti sınırı uygulanır (yalnızca
  `[A-Za-z0-9-_]`, 1-128).
- Rate limit / DDoS: Aynı ID ardışık isteklerde tekrar
  kullanılabilir; ancak her istek kendi sayfasında
  işlenir, ID kötüye kullanım için yeterli değildir.

## 9. CI Doğrulama

`pnpm docs:check` ve `pnpm test` şunları doğrular:

1. Her log çağrısı `correlation_id` alanını içerir.
2. Her `ErrorResponse` `correlation_id` alanı içerir.
3. `RequestIdInterceptor` test'leri ID üretim/aktarım
   kurallarını kontrol eder.

## 10. Örnek Akış (E2E)

```
Kullanıcı "Hayvan kaydet" butonuna basar
  └─ Browser: X-Request-Id: req-7c9e... (üretir)
      └─ POST /api/patients
          └─ NestJS RequestIdInterceptor: als.run({requestId})
              └─ Controller:
                  ├─ Logger.info(correlation_id: req-7c9e...)
                  ├─ Service:
                  │   ├─ DB INSERT INTO patients
                  │   └─ Logger.info(correlation_id: req-7c9e...)
                  └─ Response 201
                      └─ X-Request-Id: req-7c9e... (echo)

500 hatası olursa:
  └─ AllExceptionsFilter:
      ├─ Logger.error(correlation_id: req-7c9e..., stack)
      └─ Response 500
          └─ body.correlation_id: req-7c9e...
          └─ body.error_code: VET-COMMON-0001

Kullanıcıya gösterilen: "Referans kodu: req-7c9e..."
Destek ekibi: Elasticsearch'te req-7c9e... arar
  → Tüm servis log'ları + DB log + audit event bulunur
```

## İlgili dokümanlar

- [`ERROR_CODE_STANDARD.md`](./ERROR_CODE_STANDARD.md) —
  hata kodu formatı.
- [`LOG_STANDARD.md`](./LOG_STANDARD.md) — log türleri
  ve formatı.
- [`AUDIT_LOG_STANDARD.md`](./AUDIT_LOG_STANDARD.md) —
  audit event yapısı.
- [`PII_MASKING.md`](./PII_MASKING.md) — PII alanlarının
  log/audit'te maskelenmesi.
