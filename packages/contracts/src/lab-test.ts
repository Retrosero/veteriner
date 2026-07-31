/**
 * @file Laboratuvar test kataloğu (lab test) API sözleşmesi.
 * @module @vetniva/contracts/lab-test
 *
 * @description GOAL-090 (FAZ-9) tenant bazlı laboratuvar test
 * kataloğu. Klinik tarafından sipariş edilebilecek testlerin
 * master data'sı: ad, kod, numune türü, birim, referans aralığı,
 * tür/cinsiyet/yaş bazlı geleceğe dönük koşullu aralıklar (JSON
 * blob), fiyat, aktiflik.
 *
 * Append-only + arşiv: silme yok; `active=false` ile arşivlenir.
 * `code` tenant-scoped unique.
 *
 * @security PII bu sözleşmede YOK. Tenant bilgisi sözleşmede
 *   taşınmaz; backend actor.tenantId'den alınır.
 * @since GOAL-090 (FAZ-9) laboratuvar test kataloğu core
 */

import { z } from "zod";

/* --------------------------------------------------------------------------
 * Enum'lar
 * --------------------------------------------------------------------------
 */

/** Numune türü. */
export const labSampleTypeSchema = z.enum([
  "blood",
  "urine",
  "stool",
  "swab",
  "tissue",
  "saliva",
  "csf",
  "other",
]);
export type LabSampleType = z.infer<typeof labSampleTypeSchema>;

/** Tür/cinsiyet/yaş bazlı koşullu aralık türü (geleceğe dönük). */
export const labConditionAxisSchema = z.enum([
  "species",
  "sex",
  "age",
  "breed",
  "other",
]);
export type LabConditionAxis = z.infer<typeof labConditionAxisSchema>;

/* --------------------------------------------------------------------------
 * Yeni lab test
 * --------------------------------------------------------------------------
 */

/**
 * Yeni lab test.
 * - `code` zorunlu (tenant-scoped unique; ör. "CBC", "BUN").
 * - `name` zorunlu.
 * - `sampleType` zorunlu.
 * - `unit` zorunlu (örn. "mg/dL", "%", "10^3/µL").
 * - `referenceRange` opsiyonel (serbest metin; ör. "4.0-11.0").
 * - `conditionalRanges` opsiyonel (JSON string; serbest
 *   yapı — MVP'de düz metin).
 * - `price` zorunlu (decimal string, 4 ondalık; TRY).
 * - `active` opsiyonel (default true).
 * - `notes` opsiyonel.
 */
export const labTestCreateInputSchema = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  sampleType: labSampleTypeSchema,
  unit: z.string().min(1).max(32),
  referenceRange: z.string().max(200).optional(),
  conditionalRanges: z.string().max(8000).optional(),
  price: z.string().regex(/^\d+(\.\d{1,4})?$/, {
    message: "price decimal string olmalı (4 ondalık)",
  }),
  active: z.boolean().optional().default(true),
  notes: z.string().max(2000).optional(),
});
export type LabTestCreateInput = z.infer<typeof labTestCreateInputSchema>;

/** Lab test kısmi güncelleme. */
export const labTestUpdateInputSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    unit: z.string().min(1).max(32).optional(),
    referenceRange: z.string().max(200).nullable().optional(),
    conditionalRanges: z.string().max(8000).nullable().optional(),
    price: z
      .string()
      .regex(/^\d+(\.\d{1,4})?$/)
      .optional(),
    active: z.boolean().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "En az bir alan gönderilmelidir",
  });
export type LabTestUpdateInput = z.infer<typeof labTestUpdateInputSchema>;

/** Lab test response. */
export const labTestSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  sampleType: labSampleTypeSchema,
  unit: z.string(),
  referenceRange: z.string().nullable(),
  conditionalRanges: z.string().nullable(),
  price: z.string(),
  active: z.boolean(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  createdBy: z.string(),
  updatedAt: z.string().datetime(),
});
export type LabTest = z.infer<typeof labTestSchema>;

/* --------------------------------------------------------------------------
 * List & filter
 * --------------------------------------------------------------------------
 */

export const labTestFiltersSchema = z.object({
  sampleType: labSampleTypeSchema.optional(),
  active: z.coerce.boolean().optional(),
  search: z.string().max(200).optional(),
  sort: z.enum(["asc", "desc"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type LabTestFilters = z.infer<typeof labTestFiltersSchema>;

export const labTestListResponseSchema = z.object({
  items: z.array(labTestSchema),
  total: z.number().int().nonnegative(),
});
export type LabTestListResponse = z.infer<typeof labTestListResponseSchema>;
