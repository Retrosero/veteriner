# Hata Merkezi Operasyon Kılavuzu (FAZ-10 / GOAL-100/103/104/105)

> Bu doküman `apps/api/src/modules/error-events` modülünün operasyonel
> kullanımını özetler. Geliştirici + süperadmin paneli + tenant yöneticisi
> perspektifinden hata yönetimi, PII maskeleme, severity threshold ve
> tenant izolasyonu kurallarını kapsar.

## 1. Mimari

```
            ┌──────────────────────────────────────────────────────────┐
            │ AllExceptionsFilter (apps/api)                          │
            │  5xx + critical → ErrorEventsService.recordError        │
            └────────────────────────────┬─────────────────────────────┘
                                         │
            ┌────────────────────────────▼─────────────────────────────┐
            │ ErrorEventsService                                       │
            │  - computeFingerprint(errorCode, module, msg)            │
            │  - resolveModule (caller > module > routeFromPath)       │
            │  - maskContext (PiiMasker; email/phone/TCKN/IBAN/CC)     │
            │  - SEVERITY_THRESHOLD filtresi (default: warning)        │
            │  - append-only status transition (resolved → reopened)   │
            └────────────────────────────┬─────────────────────────────┘
                                         │
            ┌────────────────────────────▼─────────────────────────────┐
            │ ErrorEventsRepository (in-memory)                        │
            │  - byId / byFingerprint (tenant × fingerprint scope key) │
            │  - transitionsByFingerprint (append-only)                │
            │  - notesByFingerprint (GOAL-104; PII mask'lı)            │
            │  - supportLinksByFingerprint (JIRA/Linear/Zendesk/GH)    │
            │  - assignmentsByFingerprint (append-only)                │
            │  - persistSnapshot → Prisma (PostgreSQL + RLS)           │
            └──────────────────────────────────────────────────────────┘

            ┌──────────────────────────────────────────────────────────┐
            │ Frontend (apps/web)                                       │
            │  - instrumentation.ts (window.onerror + unhandledrej)    │
            │  - error-reporter (PII sanitize + queue + sendBeacon)     │
            │  - SystemErrorEventsController (POST /api/v1/system/...)  │
            └──────────────────────────────────────────────────────────┘
```

## 2. Severity Threshold (GOAL-100 next-tick)

`ErrorEventsService.recordError(input, derivedModule?, severityThreshold = "warning")`
çağrısı, severity `warning`'in altındaki 4xx olayları otomatik olarak reddeder
(`err-rejected` placeholder event'i döner). Üretimde 5xx + critical her zaman
kabul edilir (aciliyet kuralı); 4xx info/warning olaylarının gürültüsünü azaltır.

Sıralama (düşükten yükseğe): `info < warning < error < critical`.

Caller (örn. `AllExceptionsFilter` veya `recordClientError`) kendi
threshold'unu enjekte edebilir. Şu an kullanılan default `warning`'dir
(prod gürültü azaltma).

## 3. Tenant Filtresi (GOAL-100 next-tick)

`TenantErrorEventsController` (`/api/v1/tenant/error-events`) kendi
tenant'ı içindeki 5xx/critical hata olaylarını salt-okunur görüntülemek
için OWNER rolüne açıktır. Permission: `error:event:tenant:read`.

Cross-tenant IDOR koruması:

- `actor.tenantId` boşsa → `VET-TENANT-0003` (403).
- Filtrede gelen `tenantId` aktör tenant'ından farklıysa →
  `VET-AUTHZ-0003` (403).
- Detay response'unda `tenantId` aktör tenant'ıyla eşleşmezse →
  `VET-AUDIT-0001` (404, bilgi sızdırmaz).
- SUPERADMIN her zaman tüm tenant'ları görebilir.

## 4. Fingerprint ve Gruplama

`computeFingerprint(errorCode, module, normalizeMessage)` SHA-256 tabanlı
16 hex karakter üretir. `normalizeMessage` UUID'leri `<uuid>`, rakamları
`<n>` ile değiştirir; whitespace normalize edilir. Aynı fingerprint'e
sahip ikinci kayıt `occurrenceCount`'i artırır, `firstSeenAt` korunur.

## 5. Durum Yönetimi (GOAL-103)

State machine:

```
new → investigating | resolved
investigating → resolved | new
resolved → reopened (otomatik) | investigating
reopened → investigating | resolved
```

Geçersiz geçişlerde `VET-ERRSTAT-0001` (422). `resolved` bir kayıt tekrar
hata aldığında sistem kaynaklı `reopened` terfisi uygulanır; bu aksiyon
append-only log'a yazılır.

## 6. Atama / Çözüm Notu / Destek Bağlantısı (GOAL-104)

| Aksiyon           | Endpoint                  | Permission                  |
| ----------------- | ------------------------- | --------------------------- |
| Not ekleme        | `POST /:id/notes`         | `error:event:note:write`    |
| Not listesi       | `GET  /:id/notes`         | `error:event:note:write`    |
| Destek bağlantısı | `POST /:id/support-links` | `error:event:support:write` |
| Destek listesi    | `GET  /:id/support-links` | `error:event:support:write` |
| Atama             | `PATCH /:id/assignment`   | `error:event:assign:write`  |
| Atama geçmişi     | `GET  /:id/assignments`   | `error:event:assign:write`  |
| Durum geçişi      | `PATCH /:id/status`       | `error:event:status:write`  |
| Birleşik audit    | `GET  /:id/audit-log`     | `error:event:audit:read`    |

Notlar `PiiMasker.maskString` ile işlenir; PII (email/TCKN/telefon/IBAN)
mask'lanır. Atama, status değiştirmez. `unassign=true` ile `UNASSIGNED`
sentetik assigneeId gönderilir.

## 7. Frontend Hata Yakalama (GOAL-101)

- `apps/web/src/lib/error-reporter.ts` — PII sanitize, kuyruk, dedup
  penceresi, exponential backoff (max 3 deneme, 30 sn tavan), sendBeacon.
- `apps/web/instrumentation.ts` — `window.onerror` + `unhandledrejection`
  global hook'ları reporter'a yönlendirir.
- `apps/web/src/lib/api-error-integration.ts` — `apiRequest` 5xx
  olaylarını otomatik raporlar.
- Backend: `SystemErrorEventsController` (`POST /api/v1/system/error-events`)
  actor bağlamından tenant/branch/userId türetir; istemciye güvenmez.

## 8. Test Coverage

| Modül                                 | Testler | Durum |
| ------------------------------------- | ------- | ----- |
| ErrorEventsService (core + next-tick) | 110+    | ✓     |
| ErrorEventsRepository                 | 10+     | ✓     |
| error-reporter                        | 24      | ✓     |
| error boundary + global-error         | 8       | ✓     |
| api-error-integration                 | 9       | ✓     |

Yeni eklenenler (GOAL-100 next-tick):

- `SEVERITY_RANK` + `isSeverityBelow` (6 test)
- `recordError` severity threshold (7 senaryo)
- `listErrorEventsForTenant` (6 senaryo: OWNER izolasyonu, IDOR, STAFF, SUPERADMIN)
- `getErrorEventDetailForTenant` (5 senaryo: kendi tenant, cross-tenant 404, SUPERADMIN bypass, eksik tenantId, STAFF reddi)

## 9. Operasyonel Kontrol Listesi

Süperadmin panelde hata yönetimi için:

- [ ] Fingerprint grupları occurrenceCount DESC sırasıyla gözden geçirilir.
- [ ] Critical severity olaylar için severity=kayıt kuralı değiştirilmediği doğrulanır.
- [ ] resolved → reopened otomatik terfilerin `actorId=system` olarak işaretlendiği teyit edilir.
- [ ] JIRA/Linear/Zendesk destek bağlantısı eklenmiş olaylarda harici sistemde de durum güncellenir.
- [ ] `audit:log:read` permission'ı ile tüm aksiyonlar görüntülenebilir.

Tenant yöneticisi için:

- [ ] OWNER yalnız kendi tenant'ındaki hataları görebilir (cross-tenant sızıntı test edilir).
- [ ] Atama/not aksiyonları bu görünümde mevcut değildir (SUPERADMIN yetkisi gerekir).
- [ ] Severity threshold kendi tenant'ı için değiştirilemez (prod'da global policy).
