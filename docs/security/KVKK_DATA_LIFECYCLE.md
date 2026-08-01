# KVKK ve Veri Yaşam Döngüsü (GOAL-126)

## Faz

FAZ-12 (Pilot, güvenlik, üretime hazırlık)

## Genel Bakış

KVKK (Türkiye) ve UK GDPR (İngiltere) uyumlu veri yaşam
döngüsü. Tenant verisinin:

1. **Erişim** (audit)
2. **Düzeltme** (amendment, append-only)
3. **Dışa aktarma** (export)
4. **Silme** (erasure / anonimleştirme)
5. **Arşivleme** (retention policy)
6. **Saklama** (legal hold)

politikaları.

## Yasal Dayanak

### Türkiye — KVKK (6698 sayılı Kanun)

- **Madde 6:** Özel nitelikli kişisel veriler (sağlık, cinsel
  hayat vb.) için açık rıza + ek tedbir.
- **Madde 7:** Sağlık verileri: yalnızca anonimleştirilmiş
  halde işlenebilir; açık rıza olmadan üçüncü kişilere
  aktarılamaz.
- **Madde 11:** Veri sorumlusunun yükümlülükleri.
  İlgili kişinin hakları: erişim, düzeltme, silme,
  işlenmenin kısıtlanması, itiraz.

### İngiltere — UK GDPR

- **Article 6:** Yasal dayanak (sözleşme, meşru menfaat,
  yasal yükümlülük).
- **Article 9:** Özel nitelikli veriler (sağlık).
- **Article 15-22:** Veri sahibinin hakları.
- **Article 25:** Veri koruma tasarımıyla (privacy by
  design).

## Yaşam Döngüsü

### 1. Erişim (Audit)

- Tüm okuma + yazma aksiyonları `audit:*` event'i
  üretir (`audit_log` tablosu).
- Audit log'lar en az 3 yıl saklanır
  (`LEGAL_RETENTION_YEARS.audit`).
- Hasta sahibi (`PET_OWNER_PORTAL`) yalnızca kendi
  hayvanlarına ait verileri görebilir (`self_only` flag).

### 2. Düzeltme (Amendment)

- Tıbbi kayıtlar (muayene, SOAP, vital, teşhis, order,
  reçete, aşı) **append-only**.
- Düzeltme yeni bir amendment versiyonu ile yapılır
  (`supersededAt` set edilir).
- Finansal kayıtlar (satış, tahsilat, iptal) **ters kayıt**
  ile düzeltilir (`PaymentReversal`, `SaleReversal`).

### 3. Dışa Aktarma (Export)

- `GET /api/v1/kvkk/export` (FAZ-12+ endpoint'i ile)
  tenant verisinin tamamını JSON formatında dışa aktarır.
- PII alanları mask'lenmeden dışa aktarılır
  (veri sahibinin kendi verisi).
- Export audit olayı: `audit:kvkk.export.applied`.

### 4. Silme (Erasure)

- **PII alanları:** firstName, lastName, email, phone,
  taxId, address → `kvkk-erased-<hash>` ile
  anonimleştirilir.
- **Tıbbi kayıtlar:** yasal saklama süresince (7 yıl)
  tutulur; hasta sahibinin talebi üzerine **PII
  alanları** anonimleştirilir, **tıbbi içerik** korunur.
- Erasure audit olayı: `audit:kvkk.erasure.applied` +
  `audit:kvkk.erasure.completed`.
- 30 gün içinde tamamlanır (KVKK Madde 12).

### 5. Arşivleme (Retention)

- Tenant bazlı override → global override → default
  sırasıyla çözülür (bkz. `docs/errors/LOG_RETENTION.md`).
- Default retention matrisi:
  - `audit_log`: 3 yıl
  - `medical_record`: 7 yıl
  - `financial_record`: 5 yıl
  - `error_event`: 1 yıl
  - `security_event`: 7 yıl (KVKK/UK GDPR uyumlu)
- Sweep otomatik: `archiveAfterDays` → cold storage;
  retention süresi sonrası → sil.

### 6. Yasal Saklama (Legal Hold)

- Dava/devlet talebi durumunda `legalHold: true` set
  edilir; retention süresi dolsa bile kayıt silinmez.
- SUPERADMIN tarafından yönetilir
  (`audit:log:read` permission'ı).

## API Endpoints (planlanan)

| #   | Method | Path                                       | Yetki                  |
| --- | ------ | ------------------------------------------ | ---------------------- |
| 1   | POST   | `/api/v1/kvkk/erasure-requests`            | `clinic:owner:read`    |
| 2   | GET    | `/api/v1/kvkk/erasure-requests`            | SUPERADMIN             |
| 3   | POST   | `/api/v1/kvkk/erasure-requests/{id}/apply` | SUPERADMIN             |
| 4   | GET    | `/api/v1/kvkk/export`                      | `clinic:tenant:export` |

## Hasta Sahibi (Portal) Hakları

- **Erişim:** `/portal/data` sayfasında tüm verileri
  görüntüleyebilir.
- **Düzeltme:** `/portal/data/correct` ile PII alanlarını
  düzeltebilir.
- **Dışa aktarma:** `/portal/data/export` ile JSON
  indirebilir.
- **Silme:** `/portal/data/erase` ile erasure talebi
  oluşturabilir (KVKK Madde 11).

## Anonimleştirme Standardı

PII alanları `kvkk-erased-<sha256(userId + field).slice(0, 8)>`
formatında değiştirilir. Hash userId'ye bağlıdır; aynı
kullanıcının farklı alanları farklı hash alır, ancak
çapraz-tenant eşleşme yapılamaz.

Örnek:

- `firstName: "Mehmet"` → `firstName: "kvkk-erased-a3b8c2d1"`
- `email: "m@example.com"` → `email: "kvkk-erased-7f9e1a4b"`
- `taxId: "12345678901"` → `taxId: "kvkk-erased-2c5d8e6f"`

## Testler

- `apps/api/src/common/kvkk/kvkk.service.spec.ts` (FAZ-12+)
  - PII alanları doğru hash'lenir.
  - Erasure talebi oluşturma + uygulama.
  - Tenant export → JSON doğrulama.
  - Yasal saklama kontrolü.

## Yapılmayanlar / Bilinçli Atlamalar

- **Gerçek Prisma migration (parolalar + PII şifreleme)**
  → Faz 12+ (FAZ-10+ DB katmanı).
- **OpenAPI extension (x-kvkk-redacted alanları)** →
  Faz 12+ (OpenAPI sözleşme).
- **3rd party DPO (Data Protection Officer) atama** →
  Faz 12+ (resmi atama + iletişim bilgisi UI'da).
- **ICO (UK Information Commissioner's Office)
  kaydı** → Faz 14+ (en-GB lokalizasyonu ile birlikte).
- **KVKK Kurulu kaydı (VERBİS)** → Faz 12+ (yıllık
  kayıt yenileme).

## İlgili dokümanlar

- `docs/security/PII_MASKING.md` (FAZ-0)
- `docs/errors/LOG_RETENTION.md` (GOAL-106)
- `docs/operations/PRODUCTION_RELEASE.md` (GOAL-127)
- `KVKK Resmi Site:` https://www.kvkk.gov.tr/

## Commit

- Core: (bu commit) — `feat(kvkk): GOAL-126 erasure + export service iskeleti`
- Docs: (bu commit) — `docs(security): GOAL-126 KVKK veri yaşam döngüsü dokümanı`
