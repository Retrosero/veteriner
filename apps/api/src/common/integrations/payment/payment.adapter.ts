/**
 * @file Ödeme sağlayıcı adapter arayüzü.
 * @module apps/api/common/integrations/payment/payment.adapter
 *
 * @description GOAL-133 (FAZ-13) ödeme sağlayıcı
 * sözleşmesi. iyzico, PayTR, Stripe aynı interface'i
 * implemente eder. TR için default iyzico (PCI-DSS + BDDK
 * lisanslı).
 *
 * **Önemli:** Provider seçimi tenant konfigürasyonundan
 * gelir (farklı tenant'lar farklı provider kullanabilir).
 * PCI-DSS kapsamı: kart bilgisi **asla** bizim sistemimize
 * gelmez; provider'ın hosted form'u kullanılır.
 *
 * @since GOAL-133 (FAZ-13) ödeme entegrasyonu
 */

/** Ödeme sağlayıcı. */
export type PaymentProvider = "iyzico" | "paytr" | "stripe" | "manual" | "noop";

/** Ödeme yöntemi. */
export type PaymentMethod =
  "card" | "bank_transfer" | "wallet" | "cash" | "other";

/** Ödeme init girdisi. */
export interface PaymentInitInput {
  tenantId: string;
  amount: number; // kuruş cinsinden
  currency: "TRY" | "GBP" | "USD" | "EUR";
  method: PaymentMethod;
  /** Müşteri email (provider için). */
  customerEmail: string;
  /** Müşteri telefon (provider için, doğrulama). */
  customerPhone: string;
  /** Sipariş ID (idempotency için). */
  orderId: string;
  /** Başarılı ödeme sonrası yönlendirme. */
  successUrl: string;
  /** Hatalı ödeme sonrası yönlendirme. */
  failureUrl: string;
  /** Tenant bazlı metadata. */
  metadata: Record<string, string>;
}

/** Ödeme init sonucu. */
export interface PaymentInitResult {
  paymentId: string;
  provider: PaymentProvider;
  /** Provider hosted form URL (3D Secure). */
  redirectUrl: string;
  /** Geçerlilik süresi (Unix timestamp). */
  expiresAt: number;
  /** Token (webhook doğrulama). */
  token: string;
}

/** Ödeme doğrulama sonucu. */
export interface PaymentVerifyResult {
  paymentId: string;
  status: "success" | "failure" | "pending";
  amount: number;
  currency: string;
  providerTransactionId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  paidAt: string | null;
}

/** Webhook payload. */
export interface PaymentWebhookPayload {
  provider: PaymentProvider;
  paymentId: string;
  status: "success" | "failure";
  providerTransactionId: string;
  rawPayload: unknown;
  /** İmza (HMAC-SHA256) — caller doğrular. */
  signature: string;
}

/** Ödeme sağlayıcı adapter sözleşmesi. */
export interface PaymentAdapter {
  readonly name: PaymentProvider;
  /** Ödeme başlatır; 3D Secure hosted form URL'i döner. */
  initPayment(input: PaymentInitInput): Promise<PaymentInitResult>;
  /** Ödeme doğrulama (poll). */
  verifyPayment(paymentId: string): Promise<PaymentVerifyResult>;
  /** İade (refund). */
  refund(
    paymentId: string,
    amount: number,
    reason: string,
  ): Promise<{ refundId: string; status: "pending" | "completed" | "failed" }>;
  /** Webhook imza doğrulama. */
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
}

/** DI token. */
export const PAYMENT_ADAPTER = Symbol("PAYMENT_ADAPTER");
