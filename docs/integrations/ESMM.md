# e-SMM Gerçek Entegrasyonu (GOAL-130)

## Faz
FAZ-13 (Türkiye uyumluluk ve entegrasyonlar)

## Amaç
FAZ-7'deki mock e-SMM adapter'ı (GOAL-077) gerçek bir Türk
e-Fatura/e-Arşiv sağlayıcısı ile değiştirme. e-SMM (e-Serbest
Meslek Makbuzu) zorunlu olduğu için pilot kapsamda gerçek
entegrasyon gerekir.

## Sağlayıcı Seçenekleri

### 1. Logo İşbaşı (önerilen pilot için)
- **API:** REST.
- **Webhook:** evet (belge durumu).
- **Entegrasyon süresi:** 2-3 hafta.
- **Maliyet:** düşük-orta.

### 2. Paraşüt
- **API:** REST.
- **Webhook:** evet.
- **Avantaj:** kolay UI, küçük işletme odaklı.

### 3. eFatura.gov.tr (GİB)
- **API:** SOAP + REST.
- **Avantaj:** resmi altyapı; dezavantaj: bürokrasi.

## Adapter Sözleşmesi

`apps/api/src/common/esmm/esmm.types.ts`'teki
`EsmmAdapter` interface'i FAZ-7'de tanımlı. Gerçek
entegrasyon için `LogoIsbasıAdapter` (veya seçilen
sağlayıcı) implementasyonu eklenir.

## İş Akışı

1. **Belge oluşturma (draft):** FAZ-7'deki
   `EsmmDocumentsService.createDocument` ile aynı.
2. **Submit:** Provider'ın API'sine XML/JSON payload
   gönderilir; `accepted | rejected` durum response'tan
   alınır.
3. **Polling:** Provider response vermediyse 1 saat
   sonra tekrar `queryDocumentStatus` çağrılır.
4. **Webhook:** Provider durumu değişince webhook
   `POST /api/v1/system/esmm/webhook` endpoint'ine
   gönderir; HMAC imza doğrulaması yapılır.
5. **Retry:** `failed` durumda 3x exponential backoff
   (5m, 15m, 1h). Sonrasında dead_letter.

## Provider Konfigürasyonu

```env
ESMM_PROVIDER=logo-isbası
ESMM_LOGO_API_KEY=xxx
ESMM_LOGO_API_SECRET=xxx
ESMM_LOGO_COMPANY_ID=xxx
ESMM_WEBHOOK_SECRET=xxx
```

## Gİb Uyumluluğu
- Belge formatı: UBL-TR.
- XAdES imza: provider tarafında.
- e-SMM UUID: provider tarafında atanır; local'de
  `externalId` ile eşlenir.
- Saklama: 5 yıl (Vergi Usul Kanunu).

## Testler
- **Mock provider (FAZ-7):** development + test ortamı.
- **Sandbox provider (FAZ-13+):** staging ortamı.
- **Production provider:** pilot onayından sonra.

## Yapılmayanlar / Bilinçli Atlamalar
- **e-Fatura** (e-SMM'den ayrı) → Faz 14+ (e-Fatura
  gereken klinikler için).
- **e-Arşiv** → Faz 14+ (e-Arşiv portal entegrasyonu).
- **e-İrsaliye** → Faz 14+ (e-SMM ile aynı provider).
- **Gİb e-Fatura özel entegrasyon** → Faz 14+
  (Gİb API'si ayrı).

## Commit
- Core: (FAZ-7) — `apps/api/src/modules/esmm/` mock.
- Real: (bu commit) — adapter iskeleti (FAZ-7 sözleşmesi).

## İlgili dokümanlar
- `goals/GOAL-077_COMPLETION_REPORT.md` (FAZ-7 mock).
- `apps/api/src/common/esmm/esmm.types.ts` (sözleşme).
- `docs/errors/ERROR_CATALOG.md` (VET-ESMM-* hatalar).
