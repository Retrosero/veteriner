/**
 * @file SMS adapter arayüzü.
 * @module apps/api/common/integrations/sms/sms.adapter
 *
 * @description GOAL-131 (FAZ-13) SMS sağlayıcı adapter
 * sözleşmesi. Pluggable provider mimarisi: NetGSM,
 * Twilio, MessageBird, İleti Merkezi vb. aynı interface'i
 * implemente eder.
 *
 * Provider seçimi `SMS_PROVIDER` env'inden
 * (`netgsm` | `twilio` | `messagebird` | `iletimerkezi`
 * | `noop`).
 *
 * @security PII (telefon numarası) mask'lı log'lanır.
 *   Gönderim sonucu audit olayı üretir.
 *
 * @since GOAL-131 (FAZ-13) SMS sağlayıcı entegrasyonu
 */

/** SMS sağlayıcı türü. */
export type SmsProvider =
  "netgsm" | "twilio" | "messagebird" | "iletimerkezi" | "noop";

/** SMS gönderim girdisi. */
export interface SmsSendInput {
  /** Hedef telefon (E.164). */
  to: string;
  /** Mesaj içeriği (1-1600 karakter). */
  body: string;
  /** Gönderen ID (opsiyonel; provider default'u kullanılır). */
  senderId?: string | undefined;
  /** Tenant ID (audit + billing). */
  tenantId: string;
  /** İlgili domain (audit). Ör. `appointment_reminder`. */
  context: string;
}

/** SMS gönderim sonucu. */
export interface SmsSendResult {
  /** Sağlayıcı message ID (tracking için). */
  messageId: string;
  /** Sağlayıcı adı. */
  provider: SmsProvider;
  /** Durum. */
  status: "queued" | "sent" | "delivered" | "failed";
  /** Gönderim zaman damgası. */
  sentAt: string;
  /** Hata mesajı (başarısız ise). */
  errorMessage?: string;
}

/** SMS sağlayıcı adapter sözleşmesi. */
export interface SmsAdapter {
  readonly name: SmsProvider;
  /**
   * Tek bir SMS gönderir. Adapter async çalışır; başarısızlık
   * durumunda hata fırlatır (caller retry eder).
   */
  send(input: SmsSendInput): Promise<SmsSendResult>;
  /**
   * Delivery status sorgular (opsiyonel; default no-op).
   * Webhook tercih edilir; bu metod polling için.
   */
  queryStatus(messageId: string): Promise<SmsSendResult["status"]>;
}

/** DI token. */
export const SMS_ADAPTER = Symbol("SMS_ADAPTER");

/**
 * No-op adapter. Geliştirme + test ortamı için. SMS
 * göndermez; yalnızca log'lar + audit üretir.
 */
export const NOOP_SMS_ADAPTER_NAME: SmsProvider = "noop";
