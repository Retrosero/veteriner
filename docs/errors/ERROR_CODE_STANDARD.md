# @file Hata Kodu Standardı.

# @module docs/errors/ERROR_CODE_STANDARD

#

# @description VetNiva'nın tüm API ve UI hata kodları için

# standart. Format, prefix, domain listesi, severity

# seviyesi, HTTP eşlemesi ve CI doğrulama kuralları.

#

# @author GOAL-004 (FAZ-0) hata kodu standardı

# @since 2026-07-30

# @security Hata kodları bilgi sızdırmaz yapıda olmalı;

# cross-tenant erişim denemeleri 404 ile eşleşir (kod

# detayı verilmez).

# =============================================================================

# Hata Kodu Standardı

VetNiva'daki tüm hata kodları **sabit formatta** ve **benzersizdir**.
Bu standart, hem API yanıtlarında hem UI mesajlarında hem de
log/audit kayıtlarında tutarlılık sağlar.

## 1. Format

```
VET-<MODULE>-<NNN>
```

- **`VET`** — Sabit prefix (VetNiva). Tüm kodlar bu prefix
  ile başlar.
- **`<MODULE>`** — Modül kodu (büyük harf, 2-12 karakter).
- **`<NNN>`** — 4 haneli sıra numarası (0001-9999).

**Örnekler:**

- `VET-COMMON-0001` — Genel sunucu hatası
- `VET-VALIDATION-0001` — Form doğrulaması başarısız
- `VET-AUTH-0001` — Oturum geçersiz
- `VET-CLINIC-0001` — Hayvan bulunamadı
- `VET-VACC-0001` — Aşı kaydı oluşturulamadı
- `VET-AUTHZ-0001` — Yetki reddedildi (RBAC)
- `VET-TENANT-0001` — Tenant bulunamadı
- `VET-COUNTRY-0001` — Desteklenmeyen ülke

## 2. Modül Listesi

Aşağıdaki modüller tanımlıdır. Yeni modül eklemek için bu
listeye eklenmeli ve `pnpm docs:check` güncellenmelidir.

| Modül         | Açıklama                            | Örnek kod              |
| ------------- | ----------------------------------- | ---------------------- |
| `COMMON`      | Genel sunucu/istem hataları         | `VET-COMMON-0001`      |
| `VALIDATION`  | Form/alan doğrulama                 | `VET-VALIDATION-0001`  |
| `AUTH`        | Kimlik doğrulama, oturum, davet     | `VET-AUTH-0001`        |
| `AUTHZ`       | Yetkilendirme (RBAC, tenant)        | `VET-AUTHZ-0001`       |
| `TENANT`      | Tenant yönetimi                     | `VET-TENANT-0001`      |
| `BRANCH`      | Şube yönetimi                       | `VET-BRANCH-0001`      |
| `USER`        | Kullanıcı yönetimi                  | `VET-USER-0001`        |
| `ROLE`        | Rol yönetimi                        | `VET-ROLE-0001`        |
| `COUNTRY`     | Ülke adaptörü                       | `VET-COUNTRY-0001`     |
| `CLINIC`      | Klinik genel (owner, patient)       | `VET-CLINIC-0001`      |
| `APPT`        | Randevu                             | `VET-APPT-0001`        |
| `EXAM`        | Muayene                             | `VET-EXAM-0001`        |
| `SOAP`        | SOAP notu                           | `VET-SOAP-0001`        |
| `VACC`        | Aşı                                 | `VET-VACC-0001`        |
| `PRESC`       | Reçete                              | `VET-PRESC-0001`       |
| `SURG`        | Ameliyat                            | `VET-SURG-0001`        |
| `ANESTH`      | Anestezi                            | `VET-ANESTH-0001`      |
| `HOSP`        | Yatış                               | `VET-HOSP-0001`        |
| `LAB`         | Laboratuvar                         | `VET-LAB-0001`         |
| `IMAG`        | Görüntüleme                         | `VET-IMAG-0001`        |
| `STOCK`       | Stok (klinik)                       | `VET-STOCK-0001`       |
| `PETSHOP`     | Petshop genel                       | `VET-PETSHOP-0001`     |
| `PRODUCT`     | Ürün kataloğu                       | `VET-PRODUCT-0001`     |
| `SALE`        | Satış (POS)                         | `VET-SALE-0001`        |
| `PAYMENT`     | Tahsilat                            | `VET-PAYMENT-0001`     |
| `CASH`        | Kasa                                | `VET-CASH-0001`        |
| `CONSENT`     | Onam                                | `VET-CONSENT-0001`     |
| `KVKK`        | KVKK silme talepleri                | `VET-KVKK-0001`        |
| `REPORT`      | Raporlar                            | `VET-REPORT-0001`      |
| `AUDIT`       | Audit log                           | `VET-AUDIT-0001`       |
| `FILE`        | Dosya servisi                       | `VET-FILE-0001`        |
| `NOTIF`       | Bildirim                            | `VET-NOTIF-0001`       |
| `PORTAL`      | Portal özel                         | `VET-PORTAL-0001`      |
| `INTEGRATION` | Entegrasyon (dış API)               | `VET-INTEGRATION-0001` |
| `JOB`         | Background job (BullMQ)             | `VET-JOB-0001`         |
| `WORKER`      | Worker process                      | `VET-WORKER-0001`      |
| `PRICING`     | Fiyat listeleri ve hizmet ücretleri | `VET-PRICING-0001`     |

## 3. Severity Seviyesi

Her hata kodu için severity seviyesi:

| Seviye     | HTTP    | Anlam                         | Örnek                                        |
| ---------- | ------- | ----------------------------- | -------------------------------------------- |
| `info`     | 200     | Bilgilendirme (nadiren hata)  | `VET-AUTHZ-0002` (cross-tenant deneme, info) |
| `warning`  | 200/400 | Uyarı (beklenen hata)         | `VET-VALIDATION-0001`                        |
| `error`    | 4xx/5xx | Kullanıcı hatası              | `VET-CLINIC-0001` (404)                      |
| `critical` | 5xx     | Sistem hatası (acil müdahale) | `VET-COMMON-0001` (500)                      |

## 4. HTTP Eşlemesi

Hata kodu HTTP status code ile eşleşir:

| HTTP | Kategori          | Anlam                        | Örnek kod                               |
| ---- | ----------------- | ---------------------------- | --------------------------------------- |
| 400  | `VALIDATION`      | Geçersiz istek               | `VET-VALIDATION-0001`                   |
| 401  | `AUTH`            | Kimlik doğrulama gerekli     | `VET-AUTH-0001`                         |
| 403  | `AUTHZ`           | Yetki reddedildi             | `VET-AUTHZ-0001`                        |
| 404  | `*` (modüle göre) | Bulunamadı (bilgi sızdırmaz) | `VET-CLINIC-0001`                       |
| 409  | `*` (modüle göre) | Çakışma                      | `VET-CLINIC-0002` (sahip zaten kayıtlı) |
| 422  | `VALIDATION`      | Doğrulama hatası             | `VET-VALIDATION-0003`                   |
| 429  | `COMMON`          | Rate limit                   | `VET-COMMON-0006`                       |
| 500  | `COMMON`          | Sunucu hatası                | `VET-COMMON-0001`                       |
| 502  | `INTEGRATION`     | Dış servis yanıt vermedi     | `VET-INTEGRATION-0001`                  |
| 503  | `COMMON`          | Bakım modu                   | `VET-COMMON-0005`                       |
| 504  | `COMMON`          | Zaman aşımı                  | `VET-COMMON-0004`                       |

## 5. Yapısal Sözleşme

API hata yanıtı (`ErrorResponse`):

```json
{
  "error_code": "VET-CLINIC-0001",
  "message": "Hayvan bulunamadı.",
  "message_key": "error.VET-CLINIC-0001",
  "source": "server",
  "severity": "error",
  "correlation_id": "req-abc123",
  "timestamp": "2026-07-30T12:34:56.789Z",
  "details": {
    "field": "patient_id",
    "value": "..."
  }
}
```

**Alanlar:**

- `error_code` (zorunlu) — sabit `VET-<MODULE>-<NNN>` formatı.
- `message` (zorunlu) — kullanıcının `locale`'ine göre
  çözümlenmiş mesaj. PII içermez.
- `message_key` (zorunlu) — i18n anahtarı (örn.
  `error.VET-CLINIC-0001`). Frontend bu anahtarı kullanarak
  kendi locale'inde yeniden çözümleyebilir.
- `source` (zorunlu) — `"server"` veya `"client"`. Server
  hataları için server.
- `severity` (zorunlu) — `info` / `warning` / `error` /
  `critical`.
- `correlation_id` (zorunlu) — request ID, log izleme için.
- `timestamp` (zorunlu) — ISO 8601.
- `details` (opsiyonel) — geliştirici debug bilgisi (alan
  adı, beklenen format vb.). Production'da detay
  gösterilmez; sadece server log'unda.
- `action_url` (opsiyonel) — kullanıcının yapabileceği
  sonraki adım (ör. `/login`, `/forgot-password`).

**Bilgi sızdırmaz:** 404 dönen hatalarda gerçek sebep
belirtilmez (ör. "kayıt yok" vs "tenant izolasyonu ihlali"
ayırt edilemez). Bu, enumeration saldırılarına karşı
önemlidir.

## 6. Çeviri Anahtarı Yapısı

`packages/i18n/src/locales/<locale>.json` dosyasında her
hata kodu için çeviri:

```json
{
  "error": {
    "VET-COMMON-0001": "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.",
    "VET-CLINIC-0001": "Hayvan bulunamadı."
  }
}
```

**İsimlendirme:** `error.<VET-...>` formatı. Çeviri anahtarı
kod ile bire bir eşleşir (kısa çizgi yok).

**CI doğrulama:** `pnpm i18n:check` her iki dilde de
anahtar parity'sini kontrol eder.

## 7. Geçiş (Migration) — Eski Formatlar

**Eski formatlar:**

- `TR_<DOMAIN>_<NNN>` (GOAL-000..GOAL-003'te kullanıldı)
  → yeni formata geçirilecek: `VET-<MODULE>-<NNN>`

**Geçiş planı:**

| Eski kod             | Yeni kod                                     |
| -------------------- | -------------------------------------------- |
| `TR_COMMON_0001`     | `VET-COMMON-0001`                            |
| `TR_COMMON_0002`     | `VET-AUTHZ-0002` (erişim reddedildi → AUTHZ) |
| `TR_COMMON_0003`     | `VET-AUTHZ-0001` (yetki yok)                 |
| `TR_COMMON_0004`     | `VET-COMMON-0004` (zaman aşımı)              |
| `TR_COMMON_0005`     | `VET-COMMON-0005` (bakım modu)               |
| `TR_VALIDATION_0001` | `VET-VALIDATION-0001`                        |
| `TR_VALIDATION_0002` | `VET-VALIDATION-0002` (zorunlu alan)         |
| `TR_VALIDATION_0003` | `VET-VALIDATION-0003` (geçersiz format)      |
| `TR_AUTH_0001`       | `VET-AUTH-0001`                              |
| `TR_AUTH_0002`       | `VET-AUTH-0002` (davet kodu)                 |
| `TR_AUTH_0003`       | `VET-TENANT-0003` (tenant bağlamı)           |
| `TR_CLINIC_0001`     | `VET-CLINIC-0001`                            |
| `TR_CLINIC_0002`     | `VET-CLINIC-0002` (sahip çakışma)            |
| `TR_CLINIC_0003`     | `VET-CLINIC-0003` (mikroçip)                 |
| `TR_CLINIC_0004`     | `VET-CLINIC-0004` (tür)                      |
| `TR_CLINIC_0042`     | `VET-CLINIC-0099` (genel)                    |
| `EN_CLINIC_0001`     | `VET-CLINIC-0001` (ülke çeviride)            |
| `TR_VACC_0001`       | `VET-VACC-0001`                              |
| `TR_VACC_0002`       | `VET-VACC-0002` (lot)                        |
| `TR_VACC_0003`       | `VET-VACC-0003` (stok)                       |

**Yeni kodlar (GOAL-001/002/003 referansları):**

- `TR_AUTHZ_0001..0003` → `VET-AUTHZ-0001..0003`
- `TR_TENANT_0001..0002` → `VET-TENANT-0001..0002`
- `TR_COUNTRY_0001` → `VET-COUNTRY-0001`
- `TR_VALIDATION_PHONE_INVALID` → `VET-VALIDATION-0004`
- `TR_VALIDATION_TAX_VKN/TCKN` → `VET-VALIDATION-0005/0006`
- `TR_VALIDATION_POSTAL` → `VET-VALIDATION-0007`
- `TR_VALIDATION_IBAN` → `VET-VALIDATION-0008`

## 8. CI Doğrulama

`pnpm docs:check` aracı şunları doğrular:

1. **Kod formatı:** Tüm `VET-<MODULE>-<NNN>` eşleşmesi.
2. **Modül listesi:** `<MODULE>` bilinen listede olmalı.
3. **Katalog ile senkronizasyon:** Koddaki tüm hata kodları
   `ERROR_CATALOG.md`'de listelenmiş olmalı.
4. **Çeviri parity:** `error.<kod>` her iki dilde de tanımlı
   olmalı.
5. **Benzersizlik:** Aynı kod iki kez kullanılamaz.

## 9. Örnek Kullanım

### Backend (NestJS)

```ts
import { DomainError } from "@/common/errors/domain-error";

throw new DomainError("VET-CLINIC-0001", {
  messageKey: "error.VET-CLINIC-0001",
  httpStatus: 404,
  details: { field: "patient_id" },
});
```

`AllExceptionsFilter` bu hatayı yakalar ve standart
`ErrorResponse` formatında döner.

### Frontend (Next.js)

```ts
const response = await api.get("/patients/123");
if (!response.ok) {
  // response.error.error_code = "VET-CLINIC-0001"
  toast.error(t(`error.${response.error.error_code}`));
}
```

## 10. Genişleme

Yeni modül veya hata kodu eklemek için:

1. Bu dokümana modülü ekle (gerekirse).
2. `ERROR_CATALOG.md`'ye yeni satır ekle.
3. `packages/contracts/src/error.ts` Zod şemasına ekle
   (opsiyonel, runtime doğrulama için).
4. `packages/i18n/src/locales/<locale>.json` çevirisi.
5. `pnpm docs:check` ve `pnpm i18n:check` çalıştır.

## İlgili dokümanlar

- [`AUDIT_LOG_STANDARD.md`](./AUDIT_LOG_STANDARD.md) — audit
  event yapısı.
- [`LOG_STANDARD.md`](./LOG_STANDARD.md) — log türleri
  (sistem, background job, entegrasyon, güvenlik).
- [`PII_MASKING.md`](./PII_MASKING.md) — PII maskeleme
  kuralları.
- [`CORRELATION_ID.md`](./CORRELATION_ID.md) — request ID
  standardı.
- [`AUDIT_EVENTS.yaml`](./AUDIT_EVENTS.yaml) — tüm audit
  event'leri (makinece okunabilir).
- [`ERROR_CATALOG.md`](./ERROR_CATALOG.md) — hata kodu
  kataloğu (yeni formata güncellendi).
