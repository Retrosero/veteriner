/**
 * @file Patient (hayvan) API sözleşmesi.
 * @module @vetniva/contracts/patient
 *
 * @description Patient (hayvan) API sözleşmesi. Zod şemaları + tipler.
 * Backend (request/response doğrulama) ve frontend (form/typing)
 * aynı kaynaktan tüketir.
 *
 * @security PII bu sözleşmede YOK; yalnızca şema/tip.
 *
 * @since GOAL-021 (FAZ-2) hayvan kayıt core
 */

import { z } from "zod";

/** Tür. */
export const speciesSchema = z.enum(["dog", "cat", "bird", "other"]);
/** Cinsiyet. */
export const genderSchema = z.enum(["male", "female", "unknown"]);

/** Yeni hasta kaydı oluşturma isteği. */
export const patientCreateInputSchema = z.object({
  ownerId: z.string().uuid(),
  name: z.string().min(1).max(100),
  species: speciesSchema,
  breed: z.string().max(100).optional(),
  /** ISO `YYYY-MM-DD`. */
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Doğum tarihi YYYY-MM-DD formatında olmalı")
    .optional(),
  gender: genderSchema,
  /** 15 haneli mikroçip (ISO 11784/11785). */
  microchip: z
    .string()
    .regex(/^\d{15}$/, "Mikroçip 15 haneli olmalı")
    .optional(),
  color: z.string().max(100).optional(),
  neutered: z.boolean(),
  notes: z.string().max(2000).optional(),
});
export type PatientCreateInput = z.infer<typeof patientCreateInputSchema>;

/** API response şeması. */
export const patientSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  ownerId: z.string().uuid(),
  name: z.string(),
  species: speciesSchema,
  breed: z.string().nullable(),
  birthDate: z.string().nullable(),
  gender: genderSchema,
  microchip: z.string().nullable(),
  color: z.string().nullable(),
  neutered: z.boolean(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  archivedAt: z.string().datetime().nullable(),
});
export type Patient = z.infer<typeof patientSchema>;

/** Arama sorgu parametreleri. */
export const patientSearchQuerySchema = z.object({
  ownerId: z.string().uuid().optional(),
  species: speciesSchema.optional(),
  search: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type PatientSearchQuery = z.infer<typeof patientSearchQuerySchema>;

/** Liste response şeması. */
export const patientListResponseSchema = z.object({
  items: z.array(patientSchema),
  total: z.number().int().nonnegative(),
});
export type PatientListResponse = z.infer<typeof patientListResponseSchema>;

/**
 * Hasta sahiplik devri (kimlik seviyesi) istek şeması.
 *
 * `OwnershipHistoryService.transfer`'dan farklıdır: burada yalnızca
 * `Patient.ownerId` güncellenir ve `audit:patient.transfer` event'i
 * yayınlanır. Tarihsel ownership kaydı (audit, append-only) bu akışa
 * dahil değildir; FAZ-0 in-memory Map kullanılır.
 *
 * Klinik/finansal kayıtlar (muayene, aşı vb.) değişmez; yalnızca
 * patient kimliğindeki ownerId alanı güncellenir.
 *
 * @since GOAL-022 (FAZ-2) hayvan sahiplik devri core
 */
export const patientOwnershipTransferInputSchema = z.object({
  /** Yeni sahip (owner) ID. */
  newOwnerId: z.string().uuid(),
  /**
   * Serbest neden. Log/audit metadata'da saklanır; zorunlu
   * ama sınırsız (max 500). `OwnershipHistoryService.transfer`'daki
   * enum `OwnershipReason`'dan farklıdır — buradaki alan
   * klinik-dışı/serbest metin kabul eder.
   */
  reason: z.string().min(1).max(500),
});
export type PatientOwnershipTransferInput = z.infer<
  typeof patientOwnershipTransferInputSchema
>;
