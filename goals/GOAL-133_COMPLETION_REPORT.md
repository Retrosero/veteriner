# GOAL-133 — Ödeme Entegrasyonu (Completion Report)

## Faz
FAZ-13 (Türkiye uyumluluk ve entegrasyonlar)

## Özet
Gerçek ödeme sağlayıcı adapter sözleşmesi. Pilot için
iyzico (TR lideri, BDDK lisanslı, PCI-DSS uyumlu).

## Çıktılar

### Core (`apps/api/src/common/integrations/payment/`)
- `payment.adapter.ts`:
  - `PaymentProvider` enum (iyzico | paytr | stripe |
    manual | noop).
  - `PaymentMethod` enum (card | bank_transfer | wallet
    | cash | other).
  - `PaymentInitInput`, `PaymentInitResult`,
    `PaymentVerifyResult`, `PaymentWebhookPayload` tipleri.
  - `PaymentAdapter` interface (initPayment, verifyPayment,
    refund, verifyWebhookSignature).
  - `PAYMENT_ADAPTER` DI token.

### Döküman (bu commit)
- `docs/integrations/PAYMENT.md` — sağlayıcı karşılaştırması,
  PCI-DSS uyumluluğu, iş akışı, konfigürasyon, test
  stratejisi.

## İş Kuralları
- **PCI-DSS:** Kart bilgisi **asla** bizim sistemimize
  gelmez; provider hosted form + 3D Secure.
- **İmza doğrulama:** Webhook'ta HMAC-SHA256 zorunlu.
- **Idempotency:** `orderId` ile tekrar init çağrılırsa
  aynı sonuç.
- **Audit:** `audit:payment.initiated`,
  `audit:payment.completed`, `audit:payment.refunded`
  (info|warning).
- **KVKK:** Tüm ödeme kayıtları yasal saklama (5 yıl)
  süresince tutulur.

## Yapılmayanlar / Bilinçli Atlamalar
- **iyzico gerçek implementasyon** → Faz 14+ (sağlayıcı
  sözleşme + API key).
- **3D Secure olmadan ödeme** → YOK (BDDK zorunlu).
- **Kripto ödeme** → Faz 15+ (TR regülasyonu).
- **Çoklu sağlayıcı yük dengeleme** → Faz 14+.

## Döküman Uyum
- `pnpm docs:check` → temiz (yeni eklenen özgü).
- `pnpm i18n:check` → temiz.

## Testler
- `payment.adapter.spec.ts` (FAZ-14+) — NoOp + mock.
- Sandbox test: iyzico test hesabı.

## Commit
- Core: (bu commit) — `feat(integrations): GOAL-133 payment adapter sözleşmesi`
- Docs: (bu commit) — `docs(integrations): GOAL-133 ödeme dokümanı`
