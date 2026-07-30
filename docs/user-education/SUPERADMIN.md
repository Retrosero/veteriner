# Süper Admin (SUPERADMIN) — VetNiva Kullanım Kılavuzu

## Hoş geldiniz

Süper admin olarak VetNiva platformunun **multi-tenant** katmanını
yönetirsiniz. Bir SUPERADMIN'in başlıca sorumlulukları:

- Yeni **tenant** (klinik/petshop işletmesi) oluşturmak
- Tenant'ları kapatmak (fiziksel silme yok; soft delete)
- Tenant ülkesine göre **ülke adaptörünü** seçmek (TR/GB)
- Tenant bazlı **audit log**'u görüntülemek
- **Cross-tenant** erişim denemelerini izlemek

Bu rehber GOAL-010 (tenant ve şube altyapısı) kapsamındaki temel
akışları anlatır. Faz 16 ile birlikte SUPERADMIN tenant yönetim
ekranı (UI) gelecek; bu rehber API kullanımını ve süreçleri anlatır.

## Görevler

### Yeni tenant oluşturma (pilot onboarding)

**Amaç:** Yeni bir klinik veya petshop işletmesi için tenant kaydı
oluşturmak.

**Ön koşul:** SUPERADMIN yetkisi; tenant bilgileri (ad, slug, ülke,
vergi no, iletişim e-postası) hazır.

**Adımlar:**

1. **API'ye istek gönder:**
   ```http
   POST /api/v1/tenants
   X-Actor-Id: usr-super-admin
   X-Actor-Role: SUPERADMIN
   Content-Type: application/json
   Idempotency-Key: <benzersiz UUID>

   {
     "slug": "pilot-vet-kadikoy",
     "name": "Pilot Veteriner Kliniği",
     "country": "TR",
     "defaultLocale": "tr-TR",
     "timezone": "Europe/Istanbul",
     "taxId": "1234567890",
     "taxIdType": "company",
     "contactEmail": "info@pilot-vet.com"
   }
   ```

2. **Yanıtı kontrol et:** 201 durum kodu + `TenantResponse` gövdesi.
   `id` alanını saklayın; sonraki adımlarda (şube, kullanıcı) gerekecek.

3. **Audit event'i doğrula:** `audit:tenant.create` (severity: critical)
   audit log'a yazılır. Superadmin panelinden (Faz 16) görüntülenebilir.

   **Beklenen sonuç:**
   - `status: "active"`
   - `id` UUID formatında
   - `slug` URL'de kullanılabilir (`https://app.vetniva.com/pilot-vet-kadikoy`)

   **Hata durumunda:**
   - `VET-AUTHZ-0005` → Header'larda `X-Actor-Role: SUPERADMIN` yok.
     Header'ları kontrol edin.
   - `VET-TENANT-0004` → Slug zaten kayıtlı. Farklı bir slug seçin
     (örn. `-2026` son eki ekleyin).
   - `VET-VALIDATION-0003` → Format hatası. Slug yalnızca küçük harf,
     rakam ve tire içermelidir.

### Tenant kapatma

**Amaç:** Tenant'ı devre dışı bırakmak. Veriler korunur; yeni
işlem alınmaz.

**Adımlar:**

1. **Kapatma sebebini belirleyin** (3-500 karakter). Audit log'a
   yazılır.
2. **API'ye istek gönder:**
   ```http
   POST /api/v1/tenants/{tenantId}/close
   X-Actor-Role: SUPERADMIN
   Content-Type: application/json

   { "reason": "Pilot süreç tamamlandı; veri arşivlendi." }
   ```
3. **Yanıtı kontrol et:** 200 durum kodu + `status: "closed"`,
   `archivedAt` set edilmiş.

   **Beklenen sonuç:** Tenant `status=closed` durumuna geçer. Yeni
   randevu, hasta kaydı vb. kabul edilmez. Mevcut veriler korunur;
   audit log 7 yıl saklanır.

   **Hata durumunda:**
   - `VET-TENANT-0005` → Tenant zaten kapalı. Tekrar kapatılamaz.
   - `VET-TENANT-0001` → Tenant bulunamadı. ID'yi kontrol edin.

### Tenant listeleme

**Amaç:** Tüm tenant'ları görüntülemek.

```http
GET /api/v1/tenants?page=1&pageSize=20&status=active
X-Actor-Role: SUPERADMIN
```

**Sorgu parametreleri:**
- `page` (varsayılan 1)
- `pageSize` (varsayılan 20, max 100)
- `status`: `active` | `suspended` | `closed`
- `country`: `TR` | `GB`
- `search`: ad veya slug içinde arama

**SUPERADMIN tüm PII'yi görür** (taxId, contactEmail mask'siz).
Tenant kullanıcısı yalnızca kendi tenant'ını görür; o roller için
PII alanları mask'lenir.

### Cross-tenant erişim denemesi (güvenlik)

Eğer bir tenant kullanıcısı başka bir tenant'ın verisine erişmeye
çalışırsa:

- **API:** 404 döner (bilgi sızdırmaz). Gerçek sebep (kayıt yok vs
  tenant izolasyonu ihlali) ayırt edilemez.
- **Audit log:** `audit:security.cross_tenant_attempt` (severity:
  critical) — Faz 10+ ile otomatik tetiklenir.
- **Kullanıcıya mesaj:** `VET-TENANT-0001` ("Tenant bulunamadı").

## Tenant şube yönetimi (tenant OWNER ile birlikte)

SUPERADMIN yeni tenant oluşturduktan sonra ilk şubeyi de
ekleyebilir. Pilot tek şube ile başlar; çoklu şube operasyonu Faz
6+ ile birlikte kullanılır.

```http
POST /api/v1/tenants/{tenantId}/branches
X-Actor-Role: SUPERADMIN
Content-Type: application/json

{
  "code": "kadikoy",
  "name": "Kadıköy Şubesi",
  "city": "İstanbul",
  "address": {
    "line1": "Caferağa Mah. Mühürdar Cd.",
    "city": "İstanbul",
    "postalCode": "34710",
    "country": "TR"
  },
  "phone": "+902161234567"
}
```

**Audit:** `audit:branch.create` (info). RLS actor.tenantId üzerinden
filtreyi uygular; SUPERADMIN her tenant için branch oluşturabilir.

## Sık sorulan sorular

**S: Bir tenant'ı yanlışlıkla sildim, geri alabilir miyim?**
C: Tenant silme fiziksel değildir; `status=closed` set edilir. Veri
korunur. Yeni bir `update` isteğiyle `status=active` yapabilirsiniz
(Faz 1'de bu endpoint var; PATCH /api/v1/tenants/:id).

**S: Tenant slug'ını değiştirebilir miyim?**
C: GOAL-010'da slug değiştirilemez (URL kararlılığı için). Yeni
slug için yeni tenant oluşturup veri taşımanız gerekir (Faz 12
GOAL-125 tenant dışa aktarma + yeniden import).

**S: Bir tenant'ın tüm şubelerini nasıl listelerim?**
C: `GET /api/v1/tenants/{tenantId}/branches` (RLS uygulanır;
SUPERADMIN tüm şubeleri görür).

**S: Ülke adaptörü nasıl seçiliyor?**
C: Tenant oluşturulurken `country` alanı (TR/GB) belirlenir. Bu
karar oluşturulduktan sonra değiştirilemez. Para, telefon, vergi
numarası, KDV oranları gibi tüm formatlar ülke adaptörü üzerinden
uygulanır (`docs/i18n/COUNTRY_ADAPTER_CONTRACT.md`).

## Güvenlik ve uyum

- **Audit log:** Tüm SUPERADMIN aksiyonları `audit:tenant.create`,
  `audit:tenant.update`, `audit:tenant.close`, `audit:branch.create`
  event'leri olarak kaydedilir. 7 yıl retention.
- **PII maskeleme:** `taxId`, `contactEmail` gibi PII alanları log
  ve audit'te mask'lenir. API response'unda SUPERADMIN tüm alanları
  görür; tenant kullanıcısı mask'li görür.
- **Cross-tenant:** RLS + service katmanı çift katmanlı kontrol. 404
  ile bilgi sızdırmaz red.
- **KVKK:** Tenant kapatma soft delete; PII silme talepleri
  (GOAL-126 ile) tenant düzeyinde değil hasta sahibi düzeyinde
  uygulanır.

## Destek

- **Hata durumunda:** Yanıttaki `correlation_id` (örn. `req-7c9e...`)
  bilgisini not alın ve destek ekibine iletin.
- **API dokümanı:** [`docs/api/API_CATALOG.md`](../api/API_CATALOG.md)
- **Hata kataloğu:** [`docs/errors/ERROR_CATALOG.md`](../errors/ERROR_CATALOG.md)
- **Audit log standardı:** [`docs/errors/AUDIT_LOG_STANDARD.md`](../errors/AUDIT_LOG_STANDARD.md)
