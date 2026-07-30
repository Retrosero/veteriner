# Alan Sözlüğü — Tenant ve Branch

> **Şema:** [`FIELD_SCHEMA.md`](./FIELD_SCHEMA.md)
> **Veri modeli:** [`DOMAIN_GLOSSARY.md`](../domain/DOMAIN_GLOSSARY.md)

Bu doküman GOAL-010 kapsamında eklenen tenant ve branch alanlarını
tanımlar. Tüm alanlar Prisma şemasında (apps/api/prisma/schema.prisma)
ve Zod sözleşmelerinde (packages/contracts/src/tenant.ts,
branch.ts) tanımlıdır.

---

## Tenant alanları

### id (UUID, zorunlu)

- **Tip:** UUID v4
- **Kaynak:** DB üretir (`gen_random_uuid()`)
- **PII:** hayır
- **Açıklama:** Tenant benzersiz tanımlayıcısı. Diğer tüm tablolarda
  `tenant_id` olarak FK taşınır.

### slug (string, zorunlu, unique)

- **Tip:** String, 2-64 karakter
- **Format:** `^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$`
- **Örnek:** `pilot-vet-kadikoy`
- **PII:** hayır
- **Açıklama:** URL-dostu benzersiz tenant tanımlayıcısı.
  Değiştirilemez; yeni tenant için yeni slug gerekir.

### name (string, zorunlu)

- **Tip:** String, 2-200 karakter
- **PII:** hayır
- **Açıklama:** Görünen işletme adı. UI'da gösterilir; audit ve
  raporlarda referans alınır.

### country (string, zorunlu)

- **Tip:** Char(2), ISO 3166-1 alpha-2
- **Değerler:** `TR` | `GB`
- **PII:** hayır
- **Açıklama:** Tenant ülkesi. Oluşturulduktan sonra değiştirilemez
  (ülke adaptörü seçimi bu alana göre yapılır).
- **DB constraint:** `chk_tenants_country IN ('TR', 'GB')`

### defaultLocale (string, varsayılan `tr-TR`)

- **Tip:** String, max 10 karakter
- **Değerler:** `tr-TR` | `en-GB`
- **PII:** hayır
- **Açıklama:** Tenant varsayılan dili. UI açılışında seçilir.

### timezone (string, varsayılan `Europe/Istanbul`)

- **Tip:** String, max 64 karakter
- **Format:** IANA timezone (örn. `Europe/Istanbul`, `Europe/London`)
- **PII:** hayır
- **Açıklama:** Tenant'ın operasyonel saat dilimi.

### status (enum, varsayılan `active`)

- **Değerler:** `active` | `suspended` | `closed`
- **PII:** hayır
- **Açıklama:** Tenant durumu. `closed` olan tenant yeni işlem kabul
  etmez; audit kayıtları korunur.

### taxId (string, opsiyonel)

- **Tip:** String, 10-20 karakter
- **PII:** evet (Vergi Kimlik Numarası, mask'lenmiş log)
- **Açıklama:** VKN veya TCKN. VKN 10 hane, TCKN 11 hane.
  Doğrulama `CountryAdapter.validateTaxId` ile yapılır.

### taxIdType (string, opsiyonel)

- **Değerler:** `company` | `personal`
- **PII:** hayır
- **Açıklama:** `taxId` alanıyla birlikte; VKN mi TCKN mi olduğunu
  belirtir.

### contactEmail (string, opsiyonel)

- **Tip:** E-posta (RFC 5322)
- **PII:** evet
- **Açıklama:** Tenant düzeyinde iletişim e-postası. Süperadmin
  tarafından yönetilir; tenant kullanıcısı için PII mask'leme
  uygulanır.

### createdAt (timestamp, otomatik)

- **Tip:** `TIMESTAMPTZ`
- **PII:** hayır
- **Açıklama:** Tenant oluşturulma zamanı. DB tarafından atanır.

### updatedAt (timestamp, otomatik)

- **Tip:** `TIMESTAMPTZ`
- **PII:** hayır
- **Açıklama:** Son güncelleme zamanı. `touch_updated_at` trigger'ı
  ile otomatik güncellenir.

### archivedAt (timestamp, opsiyonel)

- **Tip:** `TIMESTAMPTZ` (nullable)
- **PII:** hayır
- **Açıklama:** Tenant kapatılma (soft delete) zamanı. NULL ise
  aktif; set edilmişse kapalı.

### archivedReason (string, opsiyonel)

- **Tip:** String, max 500 karakter
- **PII:** hayır
- **Açıklama:** Kapatma sebebi. Operasyonel not olarak audit
  event'ine de yazılır.

---

## Branch alanları

### id (UUID, zorunlu)

- **Tip:** UUID v4
- **Kaynak:** DB üretir
- **PII:** hayır

### tenantId (UUID, zorunlu)

- **Tip:** UUID, FK → tenants.id
- **PII:** hayır
- **Açıklama:** Ait olduğu tenant. `ON DELETE RESTRICT` (tenant
  silinirse branch'ler korunur; fiziksel silme zaten yok).

### code (string, zorunlu, tenant içinde unique)

- **Tip:** String, 2-64 karakter
- **Format:** `^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$`
- **Örnek:** `kadikoy`, `merkez`
- **PII:** hayır
- **Unique:** `(tenantId, code)` composite unique index

### name (string, zorunlu)

- **Tip:** String, 2-200 karakter
- **PII:** hayır

### city (string, opsiyonel)

- **Tip:** String, max 100 karakter
- **PII:** hayır
- **Açıklama:** Şehir adı. Operasyonel raporlamada kullanılır.

### addressJson (JSON, opsiyonel)

- **Tip:** JSONB
- **PII:** kısmi (adres PII; mask'leme uygulanır)
- **Şema:**
  ```ts
  {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;  // ISO 3166-1 alpha-2
  }
  ```
- **Açıklama:** Ülke adaptörü `formatAddress` ile string'e
  dönüştürür.

### phone (string, opsiyonel)

- **Tip:** String, 5-32 karakter
- **Format:** E.164 (`+90...`)
- **PII:** evet (PII_MASKING telefon alanı olarak mask'ler)

### status (enum, varsayılan `active`)

- **Değerler:** `active` | `inactive` | `closed`
- **PII:** hayır

### createdAt, updatedAt, archivedAt

- Tenant ile aynı semantik.
