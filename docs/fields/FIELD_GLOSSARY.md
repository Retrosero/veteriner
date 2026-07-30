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

## User alanları (GOAL-011)

> Şema: `apps/api/prisma/schema.prisma` (`model User`).
> Sözleşme: `packages/contracts/src/auth.ts` (`userStatusSchema`,
> `userEmailSchema`, `userDisplayNameSchema`, `passwordPolicySchema`).

### id (UUID, zorunlu)

- **Tip:** UUID v4
- **Kaynak:** DB üretir (`gen_random_uuid()`)
- **PII:** hayır
- **Açıklama:** Kullanıcı benzersiz tanımlayıcısı. UserTenantMembership
  ve UserSession için FK.

### email (string, zorunlu, unique)

- **Tip:** String, 5-200 karakter
- **Format:** E-posta regex
- **PII:** evet (KVKK / UK GDPR)
- **Mask'leme:** Audit log'da `email` alanı mask'lenir; orijinal değer
  loglanmaz. UI'da SUPERADMIN görebilir, tenant kullanıcıları kendi
  email'lerini görür.
- **Açıklama:** Sistem genelinde unique (cross-tenant davet için
  aynı email kullanılabilir; tenant bazlı değil).

### passwordHash (string, zorunlu)

- **Tip:** String, max 200 karakter (bcrypt formatı)
- **PII:** kritik (parola türevi)
- **Mask'leme:** ASLA dönülmez. Service katmanı yalnızca `verifyPassword`
  için kullanır. Loglanmaz, audit payload'ına dahil edilmez, response'a
  yansımaz. DB'de bile okuma sonrası memory'de minimum süre tutulur.
- **Açıklama:** bcrypt cost 12 ile hash'lenmiş parola. Format:
  `$2a$12$...`. Plain parola yalnızca hash üretimi + doğrulama sırasında
  bellekte bulunur.

### status (enum, zorunlu)

- **Tip:** `user_status`: `active` | `suspended` | `disabled`
- **Varsayılan:** `active`
- **PII:** hayır
- **Açıklama:** Hesap durumu. `suspended` admin tarafından geçici devre
  dışı; `disabled` yumuşak silme (audit trail korunur). Login yalnızca
  `active` için başarılı olur.

### displayName (string, zorunlu)

- **Tip:** String, 2-200 karakter
- **PII:** evet (kişi tanımlayıcı)
- **Mask'leme:** Audit log'da `displayName` mask'lenir.

### locale (string, varsayılan tr-TR)

- **Tip:** String, max 10 karakter
- **Varsayılan:** `tr-TR`
- **PII:** hayır
- **Açıklama:** Kullanıcının tercih ettiği locale. UI ve i18n için.

### passwordChangedAt (timestamptz, opsiyonel)

- **Tip:** TIMESTAMPTZ
- **PII:** hayır
- **Açıklama:** Parolanın son değişiklik zamanı. Parola expiration
  policy (GOAL-012+) tarafından kontrol edilir.

### failedLoginCount (integer, varsayılan 0)

- **Tip:** Integer, >= 0
- **PII:** hayır
- **Açıklama:** Üst üste başarısız login sayacı. `MAX_FAILED_LOGIN_COUNT`
  (5) aşıldığında hesap `lockedUntil` ile kilitlenir.

### lockedUntil (timestamptz, opsiyonel)

- **Tip:** TIMESTAMPTZ
- **PII:** hayır
- **Açıklama:** Hesap kilit bitiş zamanı. Bu tarihe kadar login
  denemeleri VET-AUTH-0003 ile reddedilir. Başarılı login'de null olur.

### lastLoginAt (timestamptz, opsiyonel)

- **Tip:** TIMESTAMPTZ
- **PII:** hayır
- **Açıklama:** Son başarılı login zamanı.

### createdAt / updatedAt (timestamptz, zorunlu)

- **Tip:** TIMESTAMPTZ
- **PII:** hayır
- **Açıklama:** `updatedAt` `touch_updated_at` trigger ile otomatik
  güncellenir.

### archivedAt (timestamptz, opsiyonel)

- **Tip:** TIMESTAMPTZ
- **PII:** hayır
- **Açıklama:** Soft delete zamanı. `status=disabled` ile birlikte set
  edilir. Veri korunur (append-only audit ile).

### isSuperadmin (boolean, zorunlu, default: false) — GOAL-012

- **Tip:** BOOLEAN (default `false`)
- **PII:** hayır
- **Açıklama:** SUPERADMIN bypass bayrağı. `true` ise kullanıcı
  tüm permission'lara sahiptir (tenant üyeliği olmadan çalışır;
  cross-tenant görünüm). Yalnızca DB seeder/admin tarafından set
  edilir; normal API'den değiştirilemez (audit iziyle birlikte
  GOAL-016 superadmin paneli yönetir). AuthGuard her istekte
  bu bayrağı `ActorContext.isSuperadmin`'e yazar; RbacService
  bypass kontrolünde kullanır.

---

## UserSession alanları (GOAL-011)

> Şema: `apps/api/prisma/schema.prisma` (`model UserSession`).
> Sözleşme: `packages/contracts/src/auth.ts` (`sessionListItemSchema`).

### id (UUID, zorunlu)

- **Tip:** UUID v4
- **PII:** hayır

### userId (UUID, zorunlu, FK → users.id)

- **Tip:** UUID
- **PII:** hayır (ancak session üzerinden user'a erişim sağladığı için
  audit'te loglanır)
- **Açıklama:** Ait olduğu kullanıcı. `ON DELETE CASCADE`.

### tokenHash (string, zorunlu, unique)

- **Tip:** String, 64 hex karakter (SHA-256)
- **PII:** kritik (oturum türevi)
- **Mask'leme:** ASLA dönülmez. Login/reset response'unda plain token
  döner; DB'ye plain yazılmaz.
- **Açıklama:** Plain bearer token'ın SHA-256 hash'i. Doğrulama
  `hashToken(plain) === tokenHash` ile yapılır.

### expiresAt (timestamptz, zorunlu)

- **Tip:** TIMESTAMPTZ
- **PII:** hayır
- **Açıklama:** Oturum son kullanma zamanı. Default 30 gün
  (`SESSION_TTL_SECONDS`).

### lastUsedAt (timestamptz, varsayılan NOW)

- **Tip:** TIMESTAMPTZ
- **PII:** hayır
- **Açıklama:** Son kullanım zamanı. Idle timeout (24 saat) aşılırsa
  session `revokedReason=idle_timeout` ile iptal edilir.

### ipAddress (string, opsiyonel)

- **Tip:** String, max 50 karakter
- **PII:** kısmi (IP adresi)
- **Mask'leme:** Son oktet `***` yapılır (örn. `192.168.1.***`).
- **Açıklama:** Session'ı oluşturan / son kullanan mask'li IP.

### userAgentHash (string, opsiyonel)

- **Tip:** String, max 64 karakter (hex)
- **PII:** kısmi
- **Mask'leme:** SHA-256 hash, plain user-agent saklanmaz.
- **Açıklama:** User agent kısa hash'i (16 hex).

### replacedById (UUID, opsiyonel)

- **Tip:** UUID
- **PII:** hayır
- **Açıklama:** Token rotation sırasında eski session'ın yerini alan
  yeni session ID. Audit trail için.

### revokedAt (timestamptz, opsiyonel)

- **Tip:** TIMESTAMPTZ
- **PII:** hayır
- **Açıklama:** Session iptal zamanı. Set edilmişse session geçersizdir.

### activeBranchId (UUID, opsiyonel, FK → branches.id) — GOAL-012

- **Tip:** UUID
- **PII:** hayır
- **Açıklama:** Oturumun aktif branch bağlamı (multi-branch tenant).
  Login sırasında tenant'ın ilk aktif branch'ı atanır
  (`prisma.branch.findFirst({ status: 'active' })`). Kullanıcı
  `POST /api/v1/auth/switch-branch/:branchId` ile branch'ı
  değiştirir. `branch_scope: required` permission'lar için
  AuthGuard bu alanı `ActorContext.branchId` olarak taşır.
  Branch silinirse `ON DELETE SET NULL` ile null yapılır;
  session açık kalır ama branch context'i kaybolur.

### revokedReason (string, opsiyonel)

- **Tip:** String, max 50 karakter
- **PII:** hayır
- **Değerler:** `logout` | `rotated` | `user_revoked` | `password_reset` | `logout_all` | `idle_timeout`
- **Açıklama:** İptal sebebi. Audit log + UI'da gösterilebilir.

---

## UserInvitation alanları (GOAL-011)

> Şema: `apps/api/prisma/schema.prisma` (`model UserInvitation`).
> Sözleşme: `packages/contracts/src/auth.ts` (`inviteUserRequestSchema`).

### id (UUID, zorunlu)

- **Tip:** UUID v4

### tenantId (UUID, zorunlu, FK → tenants.id)

- **Tip:** UUID
- **PII:** hayır
- **Açıklama:** Davet edilen tenant. `ON DELETE CASCADE`.

### email (string, zorunlu)

- **Tip:** String, max 200 karakter
- **PII:** evet
- **Mask'leme:** Audit log'da mask'lenir.

### role (string, zorunlu)

- **Tip:** String, 32 karakter
- **Değerler:** `OWNER` | `VETERINARIAN` | `STAFF`
- **Açıklama:** Davet sonrası atanacak tenant rolü. SUPERADMIN
  davet üzerinden atanamaz (sistem genelinde).

### tokenHash (string, zorunlu, unique)

- **Tip:** String, 64 hex (SHA-256)
- **PII:** kritik
- **Açıklama:** Davet token SHA-256 hash. Plain token davet
  e-postasında gönderilir.

### invitedBy (UUID, opsiyonel)

- **Tip:** UUID
- **PII:** hayır
- **Açıklama:** Davet gönderen kullanıcı (admin). Audit trail için.

### status (enum, varsayılan pending)

- **Tip:** `invitation_status`: `pending` | `accepted` | `expired` | `cancelled`
- **Açıklama:** Davet durumu.

### expiresAt (timestamptz, zorunlu)

- **Tip:** TIMESTAMPTZ
- **Açıklama:** Davet son kullanma zamanı. 7 gün.

### acceptedAt (timestamptz, opsiyonel)

- **Tip:** TIMESTAMPTZ
- **Açıklama:** Kabul zamanı.

---

## PasswordResetToken alanları (GOAL-011)

### id (UUID, zorunlu)

### userId (UUID, zorunlu, FK → users.id)

- **Açıklama:** Token talep eden kullanıcı. `ON DELETE CASCADE`.

### tokenHash (string, zorunlu, unique)

- **Açıklama:** SHA-256 hash. Plain token e-posta ile gönderilir.

### expiresAt (timestamptz, zorunlu)

- **Açıklama:** 1 saat geçerli.

### usedAt (timestamptz, opsiyonel)

- **Açıklama:** Kullanım zamanı. Rotation'da eski token'lar
  `usedAt=now()` ile iptal edilir.

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

---

## Owner (Hasta sahibi) alanları (GOAL-020)

> Şema: `apps/api/src/common/owners/owner.types.ts`.
> Sözleşme: `packages/contracts/src/owner.ts`
> (`ownerCreateInputSchema`, `ownerSearchQuerySchema`).

### id (string, zorunlu)

- **Tip:** String, `own-` prefix + UUID v4
- **PII:** hayır
- **Açıklama:** Owner benzersiz tanımlayıcısı. Service
  `OwnersRepository.nextId(tenantId)` ile üretir.

### tenantId (UUID, zorunlu)

- **Tip:** UUID
- **PII:** hayır
- **Açıklama:** Ait olduğu tenant. Tüm sorgularda tenant
  izolasyonu zorunlu; service `requireTenantScope` ile
  `actor.tenantId`'yi doğrular.

### firstName (string, zorunlu)

- **Tip:** String, 2-100 karakter
- **PII:** evet (kişi tanımlayıcı)
- **Mask'leme:** Audit log'da `***` ile mask'lenir.

### lastName (string, zorunlu)

- **Tip:** String, 2-100 karakter
- **PII:** evet

### phone (string, zorunlu, normalize E.164)

- **Tip:** String, E.164 (`+90XXXXXXXXXX`)
- **Format:** Service `normalizeTrPhone` ile normalize edilir.
  Giriş varyasyonları: `05321234567`, `5321234567`,
  `+905321234567`. `5XX` ile başlamalı (TR mobil).
- **PII:** evet (PII_MASKING telefon alanı; audit'te mask'li)
- **Unique:** `(tenantId, phone)` composite unique

### email (string, opsiyonel)

- **Tip:** String, RFC 5322 (5-200 karakter)
- **PII:** evet
- **Mask'leme:** Audit log'da mask'li (bkz. pii-email-mask chunk).

### taxId (string, opsiyonel, normalize)

- **Tip:** String, 10 hane (VKN) veya 11 hane (TCKN)
- **Format:** Service `validateAndNormalizeTaxId` ile ülke
  adaptörü (`CountryAdapter.validateTaxId`) üzerinden
  algoritmik doğrulanır (TCKN mod 11, VKN mod 10).
- **PII:** evet (PII_MASKING vergi kimlik; mask format
  `123***90`)

### address (JSON, opsiyonel)

- **Tip:** JSONB `{ city, district, fullAddress? }`
- **PII:** kısmi (adres PII; mask'leme uygulanır)

### consents (object, zorunlu)

- **Şema:**
  ```ts
  {
    kvkk: boolean;       // zorunlu true; false → 422
    marketing: boolean;  // opsiyonel; default false
  }
  ```
- **PII:** hayır
- **Açıklama:** `kvkk=false` → 422 `VET-VALIDATION-0002`.
  Audit'te `audit:owner.create` payload'ında flag kayıt altına
  alınır.

### createdAt (timestamptz, otomatik)

- **Tip:** ISO 8601 string (service) / TIMESTAMPTZ (DB)

### archivedAt (timestamptz, opsiyonel)

- **Tip:** ISO 8601 string / TIMESTAMPTZ (nullable)
- **PII:** hayır
- **Açıklama:** Soft delete zamanı. `DELETE` endpoint'i
  set eder; PII ve audit trail korunur. Default arama
  sonuçlarında DÖNMEZ.

### OwnerSearchQuery filtreleri

| Ad | Tip | Açıklama |
| --- | --- | --- |
| `search` | string | Ad/soyad/telefon/email/taxId case-insensitive substring |
| `phone` | string | Telefon substring (ham veya E.164) |
| `city` | string | Şehir filtresi |
| `limit` | int | Default 20, max 100 |
| `offset` | int | Default 0 |
