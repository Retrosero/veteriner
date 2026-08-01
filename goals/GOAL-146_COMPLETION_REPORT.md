# GOAL-146 — İngiltere Ödeme + İletişim Adapterleri (Completion Report)

## Faz

FAZ-14 (İngiltere ülke paketi)

## Özet

İngiltere pilotu için ödeme (Stripe), SMS (Twilio), email
(Resend), WhatsApp (Meta) adapterleri.

## Çıktılar

### Döküman (bu commit)

- `docs/integrations/GB_ADAPTERS.md` — sağlayıcı
  seçimleri (Stripe, Worldpay, Adyen, Twilio, MessageBird,
  Resend, Postmark, SendGrid, Meta WhatsApp), konfigürasyon,
  uyum (FCA, ICO, BTK), adapter implementasyon planı,
  test stratejisi.

### Sağlayıcı Seçimi

- **Ödeme:** Stripe (FCA kayıtlı, 900561; SAQ A).
- **SMS:** Twilio (global).
- **Email:** Resend (modern, dev-friendly).
- **WhatsApp:** Meta Cloud API (GOAL-132).

### Yeni Adapter Sözleşmesi (FAZ-14+)

```typescript
interface EmailAdapter {
  readonly name: EmailProvider;
  send(input: EmailSendInput): Promise<EmailSendResult>;
}
```

## İş Kuralları

- **Idempotency:** `Idempotency-Key` header (Stripe).
- **Webhook imza:** HMAC-SHA256 (Stripe + Twilio).
- **Multi-currency:** GBP (primary), EUR, USD (Stripe
  multi-currency).
- **Open Banking:** Faz 15+ (recurring payments için).

## Yapılmayanlar / Bilinçli Atlamalar

- **Real provider implementasyonu** → Faz 15+.
- **Open Banking (UK)** → Faz 15+.
- **Apple Pay / Google Pay UI** → Faz 15+ (Stripe
  Elements).

## Döküman Uyum

- `pnpm docs:check` → temiz.

## Commit

- Docs: (bu commit) — `docs(integrations): GOAL-146 GB adapter seçim dokümanı`
- Code: Faz 15+ (sağlayıcı implementasyonu).
