/**
 * @file Owner (hasta sahibi) sözleşmesi.
 * @module @vetniva/contracts/owner
 *
 * @description Owner API sözleşmesi. Zod şemaları + tipler.
 * Backend (request/response doğrulama) ve frontend (form/typing)
 * aynı kaynaktan tüketir.
 *
 * @security PII (ad, telefon, email, TCKN) bu sözleşmede YOK;
 *   yalnızca şema/tip. Log/maskeleme backend katmanında yapılır.
 *
 * @since GOAL-020 (FAZ-2) hasta sahibi core
 */

import { z } from "zod";

/** Owner adresi (ülke-bağımsız minimum yapı). */
export const ownerAddressSchema = z.object({
  city: z.string().min(1).max(100),
  district: z.string().min(1).max(100),
  fullAddress: z.string().max(500).optional(),
});
export type OwnerAddress = z.infer<typeof ownerAddressSchema>;

/** KVKK / pazarlama onayları. */
export const ownerConsentsSchema = z.object({
  kvkk: z.boolean(),
  marketing: z.boolean(),
});
export type OwnerConsents = z.infer<typeof ownerConsentsSchema>;

/** Yeni owner oluşturma isteği. Telefon ham; service normalize eder. */
export const ownerCreateInputSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z
    .string()
    .min(7)
    .max(32)
    .regex(
      /^[0-9+\s\-()]+$/,
      "Telefon yalnızca rakam, +, boşluk, - içerebilir",
    ),
  email: z.string().email().max(200).optional(),
  taxId: z
    .string()
    .min(10)
    .max(11)
    .regex(/^\d+$/, "TCKN/VKN yalnızca rakam içerebilir")
    .optional(),
  address: ownerAddressSchema.optional(),
  consentKvkk: z.boolean(),
  consentMarketing: z.boolean(),
});
export type OwnerCreateInput = z.infer<typeof ownerCreateInputSchema>;

/** API response şeması. */
export const ownerSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  firstName: z.string(),
  lastName: z.string(),
  /** E.164 normalize telefon. */
  phone: z.string().regex(/^\+[1-9]\d{6,14}$/),
  email: z.string().email().nullable(),
  taxId: z.string().nullable(),
  address: ownerAddressSchema.nullable(),
  consents: ownerConsentsSchema,
  createdAt: z.string().datetime(),
  archivedAt: z.string().datetime().nullable(),
});
export type Owner = z.infer<typeof ownerSchema>;

/** Arama sorgu parametreleri. */
export const ownerSearchQuerySchema = z.object({
  search: z.string().min(1).max(200).optional(),
  phone: z.string().min(3).max(32).optional(),
  city: z.string().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type OwnerSearchQuery = z.infer<typeof ownerSearchQuerySchema>;

/** Liste response şeması. */
export const ownerListResponseSchema = z.object({
  items: z.array(ownerSchema),
  total: z.number().int().nonnegative(),
});
export type OwnerListResponse = z.infer<typeof ownerListResponseSchema>;
