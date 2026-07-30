/**
 * @file Bildirim template servisi.
 * @module apps/api/common/notifications/template.service
 *
 * @description `{{variable}}` sözdizimi ile basit template render.
 * FAZ-0'da in-memory registry kullanır; template'ler
 * `apps/api/src/common/notifications/templates/` altında modül
 * seviyesinde tutulur. Faz 11+ ile DB'ye (NotificationTemplate
 * tablosu) taşınır.
 *
 * @since GOAL-015 (FAZ-2) bildirim altyapısı temeli
 * @updated Faz 11+ DB tabanlı template registry
 */

import { Injectable } from "@nestjs/common";

import type { NotificationLocale } from "@vetniva/contracts";

/** Tek bir template girdisi. Hem tr-TR hem en-GB destekler. */
export interface TemplateEntry {
  key: string;
  subject: string;
  body: string;
}

/** Locale başına template seti. */
type LocaleTemplates = Readonly<Record<NotificationLocale, TemplateEntry>>;

/**
 * In-memory template registry. Object.freeze ile dış müdahaleye
 * kapatılmıştır; değiştirmek için yeni versiyon ile replace
 * edilmelidir (Faz 11+).
 */
const TEMPLATES: Readonly<Record<string, LocaleTemplates>> = Object.freeze({
  appointment_reminder: Object.freeze({
    "tr-TR": {
      key: "appointment_reminder",
      subject: "Randevu Hatırlatması",
      body: "Sayın {{ownerName}}, {{petName}} için {{clinicName}} kliniğinde {{date}} {{time}} saatinde randevunuz bulunmaktadır.",
    },
    "en-GB": {
      key: "appointment_reminder",
      subject: "Appointment Reminder",
      body: "Dear {{ownerName}}, this is a reminder of {{petName}}'s appointment at {{clinicName}} on {{date}} at {{time}}.",
    },
  }),
  vaccination_due: Object.freeze({
    "tr-TR": {
      key: "vaccination_due",
      subject: "Aşı Hatırlatması",
      body: "{{petName}} için {{vaccineName}} aşısının tarihi yaklaşıyor ({{dueDate}}). Lütfen kliniğimizle iletişime geçin.",
    },
    "en-GB": {
      key: "vaccination_due",
      subject: "Vaccination Due",
      body: "{{petName}} is due for the {{vaccineName}} vaccine on {{dueDate}}. Please contact our clinic.",
    },
  }),
  lab_result_ready: Object.freeze({
    "tr-TR": {
      key: "lab_result_ready",
      subject: "Laboratuvar Sonucu Hazır",
      body: "{{petName}} için {{date}} tarihli laboratuvar sonucu hazırdır. Sonucu görmek için lütfen portala giriş yapın.",
    },
    "en-GB": {
      key: "lab_result_ready",
      subject: "Lab Result Ready",
      body: "The lab result for {{petName}} dated {{date}} is now ready. Please log in to the portal to view it.",
    },
  }),
  invoice: Object.freeze({
    "tr-TR": {
      key: "invoice",
      subject: "Fatura / Makbuz",
      body: "Sayın {{ownerName}}, {{invoiceNumber}} numaralı {{amount}} {{currency}} tutarındaki faturanız hazırdır. Detaylar: {{details}}.",
    },
    "en-GB": {
      key: "invoice",
      subject: "Invoice / Receipt",
      body: "Dear {{ownerName}}, your invoice {{invoiceNumber}} for {{amount}} {{currency}} is ready. Details: {{details}}.",
    },
  }),
  portal_invite: Object.freeze({
    "tr-TR": {
      key: "portal_invite",
      subject: "VetNiva Portal Daveti",
      body: "{{clinicName}} sizi VetNiva portalına davet ediyor. Davet linki: {{inviteUrl}}. Bu davet {{expiresAt}} tarihine kadar geçerlidir.",
    },
    "en-GB": {
      key: "portal_invite",
      subject: "VetNiva Portal Invitation",
      body: "{{clinicName}} has invited you to the VetNiva portal. Invitation link: {{inviteUrl}}. This invitation is valid until {{expiresAt}}.",
    },
  }),
});

/** Render sonucu. `subject` opsiyonel (SMS gibi kanallar kullanmaz). */
export interface RenderedTemplate {
  subject?: string;
  body: string;
}

/**
 * Basit `{{variable}}` substitution. Eksik değişkenler boş
 * string olarak render edilir (template'in kendisi bunu handle
 * edebilir). HTML/JS escaping uygulanmaz — düz metin.
 */
@Injectable()
export class TemplateService {
  /**
   * Verilen anahtar + locale için template'i render eder.
   * Bilinmeyen anahtar için boş body döner (loglanır).
   */
  public render(
    templateKey: string,
    locale: NotificationLocale,
    data: Record<string, unknown>,
  ): RenderedTemplate {
    const entry = TEMPLATES[templateKey]?.[locale];
    if (!entry) {
      return { body: "" };
    }
    return {
      subject: this.substitute(entry.subject, data),
      body: this.substitute(entry.body, data),
    };
  }

  /**
   * Bilinmeyen template için fallback: kategoriden tahmin et.
   * Yine de bulunamazsa generic mesaj.
   */
  public renderOrFallback(
    templateKey: string,
    category: string,
    locale: NotificationLocale,
    data: Record<string, unknown>,
  ): RenderedTemplate {
    const direct = this.render(templateKey, locale, data);
    if (direct.body) return direct;
    // Fallback: aynı kategoriden bir template dene.
    const fallback = TEMPLATES[category as keyof typeof TEMPLATES]?.[locale];
    if (fallback) {
      return {
        subject: this.substitute(fallback.subject, data),
        body: this.substitute(fallback.body, data),
      };
    }
    return { body: "" };
  }

  /** Tüm kayıtlı template anahtarları. Test yardımcısı. */
  public listKeys(): string[] {
    return Object.keys(TEMPLATES);
  }

  private substitute(input: string, data: Record<string, unknown>): string {
    return input.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, path: string) => {
      const value = this.resolvePath(data, path);
      if (value === null || value === undefined) return "";
      return String(value);
    });
  }

  private resolvePath(data: Record<string, unknown>, path: string): unknown {
    const parts = path.split(".");
    let current: unknown = data;
    for (const part of parts) {
      if (current === null || typeof current !== "object") return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }
}
