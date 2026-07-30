/**
 * @file Portal pet (hayvan) API sözleşmesi.
 * @module @vetniva/contracts/portal-pet
 *
 * @description GOAL-034 hasta sahibi portal — sahip olduğu
 * hayvanların listesi ve detayı için Zod şemaları + tipler.
 * Backend (response doğrulama) ve frontend (typing) aynı
 * kaynaktan tüketir.
 *
 * @security Sözleşme PII içermez; yalnızca alan isimleri/tipleri.
 *   Photo URL FAZ-0'da opsiyonel; FileService entegrasyonu
 *   sonrası dolar.
 *
 * @since GOAL-034 (FAZ-3) portal hayvan listesi ve detayı
 */

import { z } from "zod";

import { genderSchema, speciesSchema } from "./patient.js";

/**
 * Portal hayvan listesi öğesi. Yalnızca aktif (archivedAt=null)
 * hastalar döner; son completed appointment `lastVisitAt` ile
 * opsiyonel olarak eklenir.
 */
export const portalPetSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  species: speciesSchema,
  breed: z.string().nullable(),
  birthDate: z.string().nullable(),
  photoUrl: z.string().url().optional(),
  lastVisitAt: z.string().datetime().optional(),
});
export type PortalPetSummary = z.infer<typeof portalPetSummarySchema>;

/** Portal hayvan listesi yanıtı. */
export const portalPetListResponseSchema = z.object({
  items: z.array(portalPetSummarySchema),
  total: z.number().int().nonnegative(),
});
export type PortalPetListResponse = z.infer<typeof portalPetListResponseSchema>;

/**
 * Portal hayvan detayı. Owner ve kliniğin gördüğü alanlardan
 * farklı olarak PII (klinik notlar, fatura) içermez; yalnızca
 * temel kimlik + aktif uyarı sayısı + sıradaki aşı tarihi.
 */
export const portalPetDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  species: speciesSchema,
  breed: z.string().nullable(),
  birthDate: z.string().nullable(),
  gender: genderSchema,
  microchip: z.string().nullable(),
  color: z.string().nullable(),
  neutered: z.boolean(),
  notes: z.string().nullable(),
  ownerId: z.string().uuid(),
  alertsCount: z.number().int().nonnegative(),
  nextVaccinationDate: z.string().datetime().optional(),
});
export type PortalPetDetail = z.infer<typeof portalPetDetailSchema>;
