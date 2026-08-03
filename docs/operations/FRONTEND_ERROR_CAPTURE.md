# Frontend Hata Yakalama Operasyon Kılavuzu (FAZ-10 / GOAL-101)

> Bu doküman Next.js 14 uygulamasının (`apps/web`) merkezi hata
> yakalama altyapısını anlatır. Reporter, instrumentation hook,
> rate limit, retry stratejisi, PII sanitizasyon ve backend iletişim
> kurallarını kapsar.

## 1. Bileşenler

```
┌──────────────────────────────────────────────────────────────┐
│ Browser (Next.js runtime)                                     │
│                                                               │
│  ┌─────────────────────┐  ┌────────────────────────────┐    │
│  │ instrumentation.ts  │  │ apps/web/app/[locale]/     │    │
│  │ - window.onerror    │  │   error.tsx (route boundary)│   │
│  │ - unhandledrejection│  │   global-error.tsx (root)   │   │
│  │ - process.on        │  └─────────────┬──────────────┘    │
│  └──────────┬──────────┘                │                   │
│             │                            │                   │
│             ▼                            ▼                   │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ src/lib/error-reporter.ts (ErrorReporter singleton)  │    │
│  │  - PII sanitize (email/TCKN/phone/CC/IBAN)           │    │
│  │  - dedup window (1 sn)                               │    │
│  │  - rate limit (per-user token bucket, default 10/s)  │    │
│  │  - queue (max 50) + flush interval (2 sn)            │    │
│  │  - exponential backoff (1s → 30s tavan)              │    │
│  │  - max retry (default 3) → drop                      │    │
│  │  - sendBeacon (sayfa unload'ında sync flush)         │    │
│  │  - no-throw guarantee                                │    │
│  └────────────────────────┬─────────────────────────────┘    │
│                           │                                   │
│  ┌────────────────────────▼─────────────────────────────┐    │
│  │ src/lib/api-error-integration.ts                      │    │
│  │  - apiRequest 5xx otomatik captureError                │    │
│  │  - X-Request-Id korelasyon                             │    │
│  └──────────────────────────────────────────────────────┘    │
└───────────────────────────┬──────────────────────────────────┘
                            │ POST /api/v1/system/error-events
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ Backend (apps/api)                                            │
│  SystemErrorEventsController                                  │
│  → ErrorEventsService.recordClientError (actor bağlamından   │
│    tenant/branch/userId türetir)                              │
│  → ErrorEventsRepository + Prisma persistSnapshot             │
└──────────────────────────────────────────────────────────────┘
```

## 2. Severity Mapping

| HTTP Durumu | Reporter severity | Backend aksiyonu              |
| ----------- | ----------------- | ----------------------------- |
| 5xx         | `error`           | AllExceptionsFilter yolu      |
| 4xx         | `warning`         | api-error-integration warning |
| Bilinmiyor  | `info`            | severity threshold ile elenir |

## 3. PII Sanitizasyon

- **Anahtar bazlı**: PII_KEYS sözlüğünde (email, password, phone, vb.)
  yer alan alanlar `[redacted:key]` ile değiştirilir.
- **Değer bazlı**: Email regex, TCKN (11 hane), telefon (10-11 hane),
  IBAN regex, kredi kartı (13-19 hane) maskelenir.
- **İç içe nesneler/array'ler**: Recursive sanitize uygulanır.
- **Savunma derinliği**: Backend ek bir `PiiMasker.maskString` ve
  `PiiMasker.mask(context)` çağrısı uygular.

## 4. Token-Bucket Rate Limit (per user)

- **Kapasite**: 10 olay (1 doluşta en fazla 10).
- **Refill**: 1 saniyede 1 token.
- **Per-user**: `userIdProvider` verilirse kullanıcıya özel bucket;
  verilmezse tüm kullanıcılar "anonymous" bucket'ını paylaşır.
- **Bucket dolu ise**: Olay reddedilir (kullanıcı deneyimini
  etkilemez; sessizce yutulur).

## 5. Retry / Backoff Stratejisi

- 5xx + ağ hataları için geri deneme uygulanır.
- **Exponential backoff**: 1s → 2s → 4s → 8s (max 30s tavan).
- **Maks deneme**: 3 (üç başarısız denemeden sonra kuyruktan düşer).
- **4xx hataları**: Retry uygulanmaz (client hatası; anlamlı).

## 6. Queue + Flush

- **Maks kuyruk**: 50 olay. Kuyruk doluysa en eski düşürülür.
- **Flush interval**: 2 sn (periyodik).
- **sendBeacon**: Sayfa unload'ında (beforeunload event) kuyruk
  sync olarak backend'e gönderilir; sync sonuç dönmediği için
  best-effort yapılır.

## 7. Test Coverage

| Dosya                                  | Test sayısı | Konu                          |
| -------------------------------------- | ----------- | ----------------------------- |
| `error-reporter.test.ts`               | 24 + 7 = 31 | PII, queue, rate limit, retry |
| `api-error-integration.test.ts`        | 9           | API hata entegrasyonu         |
| `app/[locale]/error.test.tsx`          | 4           | Route error boundary          |
| `app/[locale]/global-error.test.tsx`   | 4           | Global error boundary         |
| `global-error-listener.test.tsx`       | 3           | Hook bağlama                  |
| `superadmin/error-event-list.test.tsx` | 1           | Liste render                  |
| **Toplam (core + next-tick)**          | **52+**     |                               |

Yeni eklenenler (GOAL-101 next-tick):

- Token-bucket rate limit (4 senaryo: anonymous paylaşım, per-user
  izolasyon, refill, reset)
- Max retry attempts (3 senaryo: default 3, custom 1, exponential
  backoff)
- `instrumentation.ts` (server + client handler bağlama)

## 8. Operasyonel Kontrol Listesi

- [ ] `instrumentation.ts` Next.js tarafından otomatik yüklenir
      (dosya adı + konumu değiştirilmemelidir).
- [ ] Hata olayları `POST /api/v1/system/error-events` üzerinden
      gider; 4xx raporlar otomatik reddedilir.
- [ ] Token bucket kullanıcı başına izoledir; çok yoğun tarayıcılarda
      olay atlanır.
- [ ] Reporter hiçbir koşulda throw etmez; hata console'a yazılmaz
      (kullanıcı deneyimi korunur).
- [ ] Sayfa kapatılırken kuyruktaki olaylar `sendBeacon` ile
      gönderilir; sayfa yüklendiğinde kuyruk boştur.
