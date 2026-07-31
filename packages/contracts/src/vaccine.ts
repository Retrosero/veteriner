/**
 * @file Vaccine (aşı) API sözleşmesi.
 * @module @vetniva/contracts/vaccine
 *
 * @description GOAL-050 aşı kataloğu ve protokoller API sözleşmesi.
 * Zod şemaları + tipler. Backend (request/response doğrulama) ve
 * frontend (form/typing) aynı kaynaktan tüketir.
 *
 * Aşı protokolü: bir türün (species) aşı takvimini tanımlar.
 * Kategori (`core` / `non_core` / `lifestyle` / `not_recommended`)
 * WSAVA / AAHA kılavuzlarına göre klinisyene filtre imkânı verir.
 * `isCore` alanı `core` kategoriden türetilir; service katmanında
 * hesaplanır (client gönderemez).
 *
 * Steps: yaşa (hafta) göre uygulanacak aşı adımları. En az 1 step
 * zorunlu (boş → 422). `totalDurationMonths` son step'ten türetilir.
 *
 * @security PII bu sözleşmede YOK; yalnızca şema/tip.
 * @since GOAL-050 (FAZ-5) aşı kataloğu ve protokoller core
 */

import { z } from "zod";

/** Hedef tür. */
export const speciesTargetSchema = z.enum(["dog", "cat", "bird", "all"]);
export type SpeciesTarget = z.infer<typeof speciesTargetSchema>;

/** Aşı kategorisi. */
export const vaccineCategorySchema = z.enum([
  "core",
  "non_core",
  "lifestyle",
  "not_recommended",
]);
export type VaccineCategory = z.infer<typeof vaccineCategorySchema>;

/**
 * Varsayılan aşı dozu. `amount` >= 0 (0 = üreticinin kılavuzuna göre
 * değişken; klinik kendi dozunu step'te override eder). `unit` pilav
 * listesinden seçilir: `ml` (sıvı), `dose` (tek doz), `mg` (kuru),
 * `drop` (damla). Doz birimi DB'de saklanır; doz hesabı client tarafında
 * yapılır (clinic policy).
 */
export const vaccineDoseUnitSchema = z.enum(["ml", "dose", "mg", "drop"]);
export type VaccineDoseUnit = z.infer<typeof vaccineDoseUnitSchema>;

export const vaccineDoseSchema = z.object({
  amount: z.number().min(0).max(1000),
  unit: vaccineDoseUnitSchema,
});
export type VaccineDose = z.infer<typeof vaccineDoseSchema>;

/**
 * Protokol adımı. `ageWeeks` pozitif tam sayı; `vaccineName` zorunlu.
 * `boosterIntervalDays` sonraki booster'a kadar geçen gün sayısı
 * (örn. 21 = 3 hafta sonra, 365 = yıllık rapel). `dose` opsiyonel
 * override (yoksa protokolün `defaultDose`'u kullanılır). `notes`
 * opsiyonel serbest metin (örn. "yavru", "rapel dozu").
 */
export const vaccineProtocolStepSchema = z.object({
  ageWeeks: z.number().int().min(0).max(2080),
  vaccineName: z.string().min(1).max(200),
  boosterIntervalDays: z.number().int().min(0).max(3650).optional(),
  dose: vaccineDoseSchema.optional(),
  notes: z.string().max(500).optional(),
});
export type VaccineProtocolStep = z.infer<typeof vaccineProtocolStepSchema>;

/**
 * Yeni aşı protokolü oluşturma isteği.
 * - `name` zorunlu, max 200.
 * - `steps` en az 1 (boş → 422 VET-VALIDATION-0010).
 * - `manufacturer` opsiyonel.
 * - `defaultDose` opsiyonel; step'te override edilmezse kullanılır.
 * - `isCore` client'tan kabul edilmez; `category='core'` ise
 *   service katmanı otomatik `true` yapar.
 */
export const vaccineProtocolCreateInputSchema = z.object({
  name: z.string().min(1).max(200),
  species: speciesTargetSchema,
  category: vaccineCategorySchema,
  manufacturer: z.string().max(200).optional(),
  defaultDose: vaccineDoseSchema.optional(),
  steps: z.array(vaccineProtocolStepSchema).min(1),
});
export type VaccineProtocolCreateInput = z.infer<
  typeof vaccineProtocolCreateInputSchema
>;

/**
 * Aşı protokolü güncelleme isteği. Tüm alanlar opsiyonel; yalnızca
 * gönderilen alanlar güncellenir. `isCore` yine client'tan alınmaz.
 */
export const vaccineProtocolUpdateInputSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  category: vaccineCategorySchema.optional(),
  manufacturer: z.string().max(200).optional(),
  defaultDose: vaccineDoseSchema.optional(),
  steps: z.array(vaccineProtocolStepSchema).min(1).optional(),
});
export type VaccineProtocolUpdateInput = z.infer<
  typeof vaccineProtocolUpdateInputSchema
>;

/** API response şeması. */
export const vaccineProtocolSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  name: z.string(),
  species: speciesTargetSchema,
  category: vaccineCategorySchema,
  manufacturer: z.string().nullable(),
  /** Protokolün varsayılan dozu; step'te override edilmezse kullanılır. */
  defaultDose: vaccineDoseSchema.nullable(),
  steps: z.array(vaccineProtocolStepSchema),
  /** Son step'ten hesaplanan toplam süre (ay). */
  totalDurationMonths: z.number().int().nonnegative(),
  /** `category='core'` ise true (service katmanı türetir). */
  isCore: z.boolean(),
  createdAt: z.string().datetime(),
  createdBy: z.string().nullable(),
  updatedAt: z.string().datetime(),
  archivedAt: z.string().datetime().nullable(),
});
export type VaccineProtocol = z.infer<typeof vaccineProtocolSchema>;

/** Liste filtreleri. */
export const vaccineProtocolFiltersSchema = z.object({
  species: speciesTargetSchema.optional(),
  category: vaccineCategorySchema.optional(),
  isCore: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type VaccineProtocolFilters = z.infer<
  typeof vaccineProtocolFiltersSchema
>;

/** Liste response şeması. */
export const vaccineProtocolListResponseSchema = z.object({
  items: z.array(vaccineProtocolSchema),
  total: z.number().int().nonnegative(),
});
export type VaccineProtocolListResponse = z.infer<
  typeof vaccineProtocolListResponseSchema
>;
