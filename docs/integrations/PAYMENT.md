# Ödeme Entegrasyonu (GOAL-133)

## Faz

FAZ-13 (Türkiye uyumluluk ve entegrasyonlar)

## Amaç

FAZ-7'deki manual ödeme akışına ek olarak gerçek ödeme
sağlayıcısı entegrasyonu. Pilot için **iyzico** (TR
lideri, BDDK lisanslı, PCI-DSS uyumlu) önerilir.

## Adapter Sözüşmesi

`apps/api/src/common/integrations/payment/payment.adapter.ts`'te
tanımlı. `PaymentAdapter` interface'i:

```typescript
interface PaymentAdapter {
  readonly name: PaymentProvider; // "iyzico" | "paytr" | "stripe" | ...
  initPayment(input: PaymentInitInput): Promise<PaymentInitResult>;
  verifyPayment(paymentId: string): Promise<PaymentVerifyResult>;
  refund(paymentId, amount, reason): Promise<{...}>;
  verifyWebhookSignature(rawBody, signature): boolean;
}
```

## Sağlayıcı Seçimi

| Sağlayıcı  | TR     | Maliyet       | Özellik                           |
| ---------- | ------ | ------------- | --------------------------------- |
| **iyzico** | ✓      | %1.99 + 0.25₺ | PCI-DSS, 3D Secure, BDDK lisanslı |
| PayTR      | ✓      | %1.99         | Kolay entegrasyon                 |
| Stripe     | global | %2.9 + 0.30₺  | Detaylı dashboard                 |
| Manual     | -      | ücretsiz      | Nakit / havale (FAZ-7)            |

**Pilot için: iyzico.**

## PCI-DSS Uyumluluğu

- Kart bilgisi **asla** bizim sistemimize gelmez.
- Provider'ın hosted form'u (3D Secure) kullanılır.
- `redirectUrl` provider tarafında doldurulur.
- Webhook imza doğrulaması (HMAC-SHA256) zorunlu.
- `audit:payment.*` event'leri immutable.

## İş Akışı

1. **Init:** `POST /api/v1/tenant/payments` → provider
   hosted form URL'i.
2. **User:** Form'da kart bilgisi (provider tarafında).
3. **3D Secure:** OTP doğrulama.
4. **Success/Failure:** Provider yönlendirir
   (`successUrl | failureUrl`).
5. **Webhook:** Provider durumu bildirir → local
   `Payment` kaydı güncellenir.
6. **Idempotency:** `orderId` ile tekrar init
   çağrılırsa aynı sonuç döner.

## Provider Konfigürasyonu

```env
PAYMENT_PROVIDER=iyzico
IYZICO_API_KEY=xxx
IYZICO_SECRET_KEY=xxx
IYZICO_BASE_URL=https://api.iyzipay.com
IYZICO_CALLBACK_URL=https://app.vetniva.local/payment/callback
```

## Testler

- **NoOp adapter:** development + test.
- **Sandbox (iyzico test):** staging.
- **Production:** pilot onayından sonra.

## Yapılmayanlar / Bilinçli Atlamalar

- **3D Secure olmadan ödeme** → yok (BDDK zorunlu).
- **Kripto ödeme** → Faz 15+ (TR regülasyonu).
- **Çoklu sağlayıcı yük dengeleme** → Faz 14+.
- **Otomatik fatura kesimi (e-Fatura)** → Faz 14+.

## Commit

- Core: (bu commit) — `apps/api/src/common/integrations/payment/payment.adapter.ts`
- Real: Faz 14+ (iyzico implementasyonu).
