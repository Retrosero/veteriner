/**
 * @file Vaccine card (aşı kartı) API sözleşmesi.
 * @module @vetniva/contracts/vaccine-card
 *
 * @description GOAL-052 aşı kartı API sözleşmesi. Zod şemaları +
 * tipler. Backend (request/response doğrulama) ve frontend
 * (kart görünümü) aynı kaynaktan tüketir.
 *
 * Aşı kartı, bir hastanın (patient) tüm aşı takvimini
 * özetleyen derlenmiş bir görünümdür. Her protokol (ör.
 * "Karma aşısı") için ayrı bir `VaccineCardEntry` üretilir.
 * Entry üzerinde:
 * - Aşı geçmişi (uygulama kayıtları listesi).
 * - Son uygulama + uygulayan veteriner + lot.
 * - Bir sonraki planlanan tarih (nextDueDate).
 * - Durum (`completed` / `upcoming` / `overdue` / `not_started`).
 * - Protokolün tüm adımları (steps) + tamamlanan adım sayısı.
 *
 * `overdue` hesabı: en son uygulamanın `nextDueDate`'i bugünden
 * önce ise VEYA son step uygulanmış ve sonraki booster geçmiş
 * ise. `upcoming`: 30 gün içinde. `completed`: tüm steps
 * uygulanmış ve ek doz gerekmiyor. `not_started`: hiç
 * uygulama yok.
 *
 * Portal görünürlüğü: tenant ayarına (`portalVaccineCardEnabled`)
 * bağlıdır. Ayar kapalıysa portal endpoint'i 403 VET-AUTHZ-0002
 * ile reddeder.
 *
 * @security PII bu sözleşmede YOK; yalnızca şema/tip. Tenant
 *   bilgisi sözleşmede taşınmaz; backend actor.tenantId'den
 *   alınır.
 * @since GOAL-052 (FAZ-5) aşı kartı core
 */

import { z } from "zod";

import { speciesSchema } from "./patient.js";
import { vaccineApplicationSchema } from "./vaccine-application.js";
import { vaccineProtocolSchema } from "./vaccine.js";

/** ISO `YYYY-MM-DD` formatı. */
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Aşı kartı girdi durumu. `completed` — tüm steps uygulandı,
 * ek doz yok. `upcoming` — sıradaki adım/tarih 30 gün içinde.
 * `overdue` — sıradaki tarih geçti. `not_started` — hiç
 * uygulama yok.
 */
export const vaccineCardEntryStatusSchema = z.enum([
  "completed",
  "upcoming",
  "overdue",
  "not_started",
]);
export type VaccineCardEntryStatus = z.infer<
  typeof vaccineCardEntryStatusSchema
>;

/**
 * Bir aşı kartı girdisi. Bir hastanın tek bir protokol için
 * aşı takvim özeti.
 */
export const vaccineCardEntrySchema = z.object({
  /** Protokol. */
  protocol: vaccineProtocolSchema,
  /** Tüm uygulama kayıtları (iptal dahil), en yeniden eskiye. */
  applications: z.array(vaccineApplicationSchema),
  /** Tamamlanan step sayısı (status='active' veya 'amended' olan). */
  completedStepsCount: z.number().int().nonnegative(),
  /** Toplam step sayısı. */
  totalStepsCount: z.number().int().nonnegative(),
  /** Son uygulamanın tarihi (ISO datetime); yoksa null. */
  lastApplicationDate: z.string().datetime().nullable(),
  /** Son uygulamayı yapan kişi ID; yoksa null. */
  lastApplicationBy: z.string().nullable(),
  /** Son uygulamanın lot bilgisi; yoksa null. */
  lastLot: z
    .object({
      lot: z.string(),
      expiryDate: z.string(),
      stockProductId: z.string(),
    })
    .nullable(),
  /** Bir sonraki planlanan uygulama tarihi (ISO date); yoksa null. */
  nextDueDate: z.string().nullable(),
  /** nextDueDate - bugün (gün); negatif = gecikmiş. */
  daysUntilDue: z.number().int().nullable(),
  /** Girdi durumu. */
  status: vaccineCardEntryStatusSchema,
});
export type VaccineCardEntry = z.infer<typeof vaccineCardEntrySchema>;

/**
 * Bir hastanın tüm aşı kartı. Personel paneli ve portal için
 * tek kaynak; tenant ayarına göre portal görünürlüğü kapatılır.
 */
export const vaccineCardSchema = z.object({
  patientId: z.string(),
  tenantId: z.string().uuid(),
  species: speciesSchema,
  /** Hesaplama referans tarihi (UTC ISO); client cache için. */
  computedAt: z.string().datetime(),
  /** Portal görünür mü? Tenant ayarına bağlı. */
  portalVisible: z.boolean(),
  /** Karttaki tüm protokol entry'leri (uygulanabilir türe göre). */
  entries: z.array(vaccineCardEntrySchema),
  /** Özet: overdue / upcoming / completed sayıları. */
  summary: z.object({
    overdue: z.number().int().nonnegative(),
    upcoming: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    notStarted: z.number().int().nonnegative(),
  }),
});
export type VaccineCard = z.infer<typeof vaccineCardSchema>;

/**
 * Tenant portal ayar güncelleme isteği (sadece `vaccineCard`
 * alanı bu sözleşmede; diğer ayarlar tenant-settings modülü ile
 * genişletilecek).
 */
export const tenantVaccineCardPortalSettingInputSchema = z.object({
  /** Portal'da aşı kartı görünsün mü? */
  portalVaccineCardEnabled: z.boolean(),
});
export type TenantVaccineCardPortalSettingInput = z.infer<
  typeof tenantVaccineCardPortalSettingInputSchema
>;

/**
 * Tenant portal ayarı response şeması. `vaccineCard` alanı
 * portalın aşı kartı görünürlüğünü yansıtır.
 */
export const tenantVaccineCardPortalSettingSchema = z.object({
  tenantId: z.string().uuid(),
  portalVaccineCardEnabled: z.boolean(),
  updatedAt: z.string().datetime(),
});
export type TenantVaccineCardPortalSetting = z.infer<
  typeof tenantVaccineCardPortalSettingSchema
>;

/**
 * Kart hesaplamasında kullanılan "yaklaşan aşı" eşik değeri
 * (gün). Varsayılan 30 gün; `getVaccineCard` options üzerinden
 * override edilebilir.
 */
export const VACCINE_CARD_UPCOMING_WINDOW_DAYS = 30;

/** Aşı kartı hesaplama opsiyonları (internal). */
export const vaccineCardOptionsSchema = z.object({
  /** Yaklaşan aşı penceresi (gün); default 30. */
  upcomingWindowDays: z.number().int().min(1).max(365).optional(),
  /** Hesaplama referans tarihi (UTC ISO); default now. */
  referenceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    .optional(),
});
export type VaccineCardOptions = z.infer<typeof vaccineCardOptionsSchema>;

/** ISO date yardımcı tipi (re-export). */
export type VaccineCardIsoDate = string;

/** Re-export ISO date regex. */
export const VACCINE_CARD_ISO_DATE_REGEX = ISO_DATE_REGEX;
