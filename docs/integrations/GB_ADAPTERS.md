# İngiltere Ödeme + İletişim Adapterleri (GOAL-146)

## Faz
FAZ-14 (İngiltere ülke paketi)

## Amaç
İngiltere pilotu için ödeme ve iletişim sağlayıcıları.

## Ödeme (GB)

### Stripe (önerilen)
- **Provider:** Stripe Ltd.
- **Maliyet:** %2.9 + 0.30₺ (GBP).
- **Özellik:** 3D Secure, Apple Pay, Google Pay,
  recurring payments, refunds, disputes.
- **Webhook:** HMAC-SHA256 imza.
- **PCI-DSS:** SAQ A (en basit; kart bilgisi bizim
  sistemimize gelmez).

### Worldpay
- **Provider:** Worldpay Ltd.
- **Maliyet:** özelleştirilebilir.
- **Avantaj:** UK'da güçlü yerel destek.

### Adyen
- **Provider:** Adyen N.V.
- **Maliyet:** özelleştirilebilir.
- **Avantaj:** multi-currency (GBP, EUR, USD).

### Pilot için: **Stripe** (kolay entegrasyon, global destek).

### Konfigürasyon
```env
PAYMENT_PROVIDER=stripe
STRIPE_PUBLISHABLE_KEY=pk_live_xxx
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

## İletişim (GB)

### SMS
- **Twilio** (global; öncelikli).
- **MessageBird** (Almanya merkezli; UK desteği).

### Email
- **Resend** (modern, geliştirici dostu).
- **Postmark** (transactional email; UK dostu).
- **SendGrid** (global).

### WhatsApp
- **Meta WhatsApp Business Cloud API** (GOAL-132).

## Adapter İmplementasyon Planı

### `PaymentAdapter` (FAZ-13)
- `StripeAdapter implements PaymentAdapter`.
- `ManualAdapter` (havale, nakit — FAZ-7 zaten var).

### `SmsAdapter` (FAZ-13)
- `TwilioAdapter implements SmsAdapter`.

### `WhatsAppAdapter` (FAZ-13)
- `MetaWhatsAppAdapter implements WhatsAppAdapter`.

### `EmailAdapter` (yeni)
```typescript
interface EmailAdapter {
  readonly name: EmailProvider;
  send(input: EmailSendInput): Promise<EmailSendResult>;
}

interface EmailSendInput {
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  templateId?: string;
  templateData?: Record<string, unknown>;
  tenantId: string;
  context: string;
}

interface EmailSendResult {
  messageId: string;
  status: "queued" | "sent" | "delivered" | "bounced" | "failed";
  sentAt: string;
}
```

## Uyum

### FCA (Financial Conduct Authority)
- Stripe UK Ltd. FCA kayıtlı (reference: 900561).
- **Customer funds:** segregated account.
- **Safeguarding:** günlük reconciliation.

### ICO (Information Commissioner's Office)
- Privacy notice + cookie banner (FAZ-145).
- Marketing consent (PECR).

### BTK
- Yok (TR dışı sağlayıcı).

## Testler
- **Stripe test mode** (sandbox).
- **Webhook imza doğrulama** (`stripe.webhooks.
  constructEvent`).
- **Idempotency** (`Idempotency-Key` header).

## Yapılmayanlar / Bilinçli Atlamalar
- **Real provider implementasyonu** → Faz 15+ (Stripe +
  Twilio + Resend).
- **Open Banking (UK)** → Faz 15+ (rekürren ödemeler
  için).
- **Apple Pay / Google Pay UI** → Faz 15+ (Stripe
  Elements ile kolay).

## Commit
- Docs: (bu commit) — `docs(integrations): GOAL-146 GB adapter seçim dokümanı`
- Code: Faz 15+ (sağlayıcı implementasyonu).
