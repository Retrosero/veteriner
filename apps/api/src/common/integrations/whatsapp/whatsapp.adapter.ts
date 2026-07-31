/**
 * @file WhatsApp Business API adapter arayüzü.
 * @module apps/api/common/integrations/whatsapp/whatsapp.adapter
 *
 * @description GOAL-132 (FAZ-13) WhatsApp Business API
 * provider sözleşmesi. Meta WhatsApp Business Cloud API
 * üzerinden template mesaj + serbest metin + medya gönderimi.
 *
 * Provider: Meta Cloud API (`graph.facebook.com/v18.0`).
 * Türkiye'de WhatsApp Business API kullanımı Meta
 * onayına tabi; production'da business verification +
 * 42624 display name onayı gerekir.
 *
 * @security PII (telefon) mask'lı log'lanır.
 *
 * @since GOAL-132 (FAZ-13) WhatsApp entegrasyonu
 */

/** WhatsApp mesaj türü. */
export type WhatsAppMessageType = "text" | "template" | "image" | "document";

/** Template mesaj içeriği. */
export interface WhatsAppTemplateMessage {
  type: "template";
  /** Template adı (Meta onaylı). */
  templateName: string;
  /** Dil kodu (ör. `tr`). */
  languageCode: string;
  /** Template parametreleri (sıralı). */
  parameters: string[];
}

/** Serbest metin mesajı. */
export interface WhatsAppTextMessage {
  type: "text";
  body: string;
}

/** Medya mesajı (image veya document). */
export interface WhatsAppMediaMessage {
  type: "image" | "document";
  /** Medya URL (Meta'nın erişebileceği public HTTPS URL). */
  url: string;
  caption?: string;
  /** Document filename. */
  filename?: string;
}

/** WhatsApp gönderim girdisi. */
export interface WhatsAppSendInput {
  to: string;
  message: WhatsAppTemplateMessage | WhatsAppTextMessage | WhatsAppMediaMessage;
  tenantId: string;
  context: string;
}

/** WhatsApp gönderim sonucu. */
export interface WhatsAppSendResult {
  messageId: string;
  status: "queued" | "sent" | "delivered" | "read" | "failed";
  sentAt: string;
  errorMessage?: string;
}

/** WhatsApp adapter sözleşmesi. */
export interface WhatsAppAdapter {
  readonly name: "whatsapp";
  send(input: WhatsAppSendInput): Promise<WhatsAppSendResult>;
  /** Template'i Meta'ya onay için yükler. */
  submitTemplate(
    name: string,
    language: string,
    category: "marketing" | "utility" | "authentication",
  ): Promise<{ templateId: string; status: "pending" | "approved" | "rejected" }>;
}

/** DI token. */
export const WHATSAPP_ADAPTER = Symbol("WHATSAPP_ADAPTER");
