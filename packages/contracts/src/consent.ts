/**
 * @file Onam formu (consent) API sözleşmesi.
 * @module @vetniva/contracts/consent
 *
 * @description GOAL-081 (FAZ-8) onam formu altyapısı için Zod
 * şemaları + tipler. Ameliyat, anestezi ve seçili işlemler
 * için hasta sahibinin onayı. Dijital imza için adapter alanı
 * ayrılmış (versiyonlu); MVP'de manuel imza + opsiyonel
 * `signatureProvider` alanı.
 *
 * Şablon tipleri:
 * - `surgery`       — ameliyat.
 * - `anesthesia`    — anestezi.
 * - `procedure`     — diğer tıbbi işlemler.
 *
 * Yaşam döngüsü:
 * - `draft`     — oluşturulmuş; imza bekleniyor.
 * - `signed`    — sahip imzaladı; geçerli.
 * - `revoked`   — geri çekildi; geçersiz.
 *
 * @security PII bu sözleşmede YOK. Tenant bilgisi sözleşmede
 *   taşınmaz; backend actor.tenantId'den alınır.
 * @since GOAL-081 (FAZ-8) onam formları core
 */

import { z } from "zod";

/* --------------------------------------------------------------------------
 * Enum'lar
 * -------------------------------------------------------------------------- */

export const consentTemplateTypeSchema = z.enum([
  "surgery",
  "anesthesia",
  "procedure",
]);
export type ConsentTemplateType = z.infer<
  typeof consentTemplateTypeSchema
>;

export const consentStatusSchema = z.enum([
  "draft",
  "signed",
  "revoked",
]);
export type ConsentStatus = z.infer<typeof consentStatusSchema>;

export const consentSignatureMethodSchema = z.enum([
  "manual",
  "electronic",
]);
export type ConsentSignatureMethod = z.infer<
  typeof consentSignatureMethodSchema
>;

/* --------------------------------------------------------------------------
 * Yeni onam formu
 * -------------------------------------------------------------------------- */

/**
 * Yeni onam formu.
 * - `templateType` zorunlu (surgery/anesthesia/procedure).
 * - `templateVersion` zorunlu (serbest; ör. "v1.0.0").
 * - `patientId` zorunlu (Patient.id UUID).
 * - `ownerId` zorunlu (sahip; imzalayan kişi).
 * - `sourceType` opsiyonel (surgery_plan/lab_order/vb.).
 * - `sourceId` opsiyonel.
 * - `notes` opsiyonel.
 * - `locale` opsiyonel (default "tr").
 */
export const consentCreateInputSchema = z.object({
  templateType: consentTemplateTypeSchema,
  templateVersion: z.string().min(1).max(32),
  patientId: z.string().uuid(),
  ownerId: z.string().uuid(),
  sourceType: z.string().min(1).max(64).optional(),
  sourceId: z.string().min(1).max(100).optional(),
  locale: z.string().min(2).max(8).optional().default("tr"),
  notes: z.string().max(4000).optional(),
});
export type ConsentCreateInput = z.infer<typeof consentCreateInputSchema>;

/* --------------------------------------------------------------------------
 * İmza
 * -------------------------------------------------------------------------- */

/**
 * Onam formu imzalama.
 * - `signatureMethod` zorunlu (manual/electronic).
 * - `signatureProvider` opsiyonel (örn. "docusign", "e-imza").
 *   Yalnızca electronic için anlamlı; manual için null.
 * - `signatureReference` opsiyonel (provider'ın verdiği id).
 */
export const consentSignInputSchema = z.object({
  signatureMethod: consentSignatureMethodSchema,
  signatureProvider: z.string().max(64).optional(),
  signatureReference: z.string().max(200).optional(),
});
export type ConsentSignInput = z.infer<typeof consentSignInputSchema>;

/** İptal isteği. */
export const consentRevokeInputSchema = z.object({
  reason: z.string().min(1).max(2000),
});
export type ConsentRevokeInput = z.infer<typeof consentRevokeInputSchema>;

/* --------------------------------------------------------------------------
 * API response şemaları
 * -------------------------------------------------------------------------- */

export const consentSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  templateType: consentTemplateTypeSchema,
  templateVersion: z.string(),
  patientId: z.string().uuid(),
  ownerId: z.string().uuid(),
  sourceType: z.string().nullable(),
  sourceId: z.string().nullable(),
  locale: z.string(),
  status: consentStatusSchema,
  signatureMethod: consentSignatureMethodSchema | null,
  signatureProvider: z.string().nullable(),
  signatureReference: z.string().nullable(),
  signedAt: z.string().datetime().nullable(),
  notes: z.string().nullable(),
  revokedAt: z.string().datetime().nullable(),
  revokedBy: z.string().nullable(),
  revokeReason: z.string().nullable(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
  updatedAt: z.string().datetime(),
});
export type Consent = z.infer<typeof consentSchema>;

/** Liste filtreleri. */
export const consentFiltersSchema = z.object({
  status: consentStatusSchema.optional(),
  templateType: consentTemplateTypeSchema.optional(),
  patientId: z.string().uuid().optional(),
  ownerId: z.string().uuid().optional(),
  sort: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type ConsentFilters = z.infer<typeof consentFiltersSchema>;

/** Liste response şeması. */
export const consentListResponseSchema = z.object({
  items: z.array(consentSchema),
  total: z.number().int().nonnegative(),
});
export type ConsentListResponse = z.infer<typeof consentListResponseSchema>;
