/**
 * @file Klinik kayıt paylaşım API sözleşmesi.
 * @module @vetniva/contracts/clinical-record-share
 *
 * @description GOAL-047 klinik kayıt PDF ve paylaşım API sözleşmesi.
 * Muayene için oluşturulan klinik kayıt PDF'inin kanallar (e-posta,
 * SMS, portal) üzerinden paylaşımı. Backend ve frontend aynı Zod
 * şemasını tüketir.
 *
 * @security Kanallar enum ile sınırlandı; süre expiration bilgisi
 *   paylaşım response'unda açıkça döner (UI'da geri sayım için).
 * @since GOAL-047 (FAZ-4) klinik kayıt PDF ve paylaşım core
 */

import { z } from "zod";

/** Paylaşım kanalı. Sıralama UI ile aynı tutulur. */
export const shareChannelSchema = z.enum(["email", "sms", "portal"]);
export type ShareChannel = z.infer<typeof shareChannelSchema>;

/**
 * Yeni paylaşım isteği. `channels` en az 1 öğe içermelidir (boş
 * → 422 VET-VALIDATION-0010).
 */
export const clinicalRecordShareRequestSchema = z.object({
  channels: z
    .array(shareChannelSchema)
    .min(1, "En az bir paylaşım kanalı seçilmelidir"),
});
export type ClinicalRecordShareRequest = z.infer<
  typeof clinicalRecordShareRequestSchema
>;

/**
 * Paylaşım response şeması. `sentChannels` yalnızca başarıyla
 * gönderilenleri içerir; `expiresAt` 7 günlük geçerlilik süresi
 * sonunu belirtir. `revokedAt` null ise paylaşım aktif.
 */
export const clinicalRecordShareSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  examinationId: z.string(),
  fileId: z.string().uuid(),
  channels: z.array(shareChannelSchema),
  sentChannels: z.array(shareChannelSchema),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
  expiresAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable(),
  signedUrl: z.string().nullable(),
});
export type ClinicalRecordShare = z.infer<typeof clinicalRecordShareSchema>;

/** Paylaşım listesi response. */
export const clinicalRecordShareListSchema = z.object({
  items: z.array(clinicalRecordShareSchema),
});
export type ClinicalRecordShareList = z.infer<
  typeof clinicalRecordShareListSchema
>;

/** Klinik kayıt PDF render response. */
export const clinicalRecordPdfResponseSchema = z.object({
  id: z.string(),
  examinationId: z.string(),
  generatedAt: z.string().datetime(),
  sizeBytes: z.number().int().nonnegative(),
});
export type ClinicalRecordPdfResponse = z.infer<
  typeof clinicalRecordPdfResponseSchema
>;
