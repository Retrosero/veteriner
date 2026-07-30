/**
 * @file Vital signs (vital bulgular) API sözleşmesi.
 * @module @vetniva/contracts/vitals
 *
 * @description GOAL-042 vital bulgular (vücut sıcaklığı, nabız,
 * solunum, ağırlık, BCS, kan basıncı, CRT, mukoza rengi) için
 * API sözleşmesi. Zod şemaları + tipler. Backend (request/response
 * doğrulama) ve frontend (form/typing) aynı kaynaktan tüketir.
 *
 * Vital kaydı bir muayeneye (examination) bağlıdır; tenant scope
 * actor.tenantId'den alınır (cross-tenant IDOR koruması).
 *
 * @security Sözleşme PII içermez; yalnızca alan isimleri ve tipleri.
 * @since GOAL-042 (FAZ-4) vital bulgular core
 */

import { z } from "zod";

/** Ateş ölçüm yöntemi. */
export const temperatureMethodSchema = z.enum(["rectal", "ear", "axillary"]);
export type TemperatureMethod = z.infer<typeof temperatureMethodSchema>;

/** Mukoza rengi. */
export const mucousMembraneColorSchema = z.enum([
  "pink",
  "pale",
  "cyanotic",
  "icteric",
  "congested",
]);
export type MucousMembraneColor = z.infer<typeof mucousMembraneColorSchema>;

/**
 * Ölçülen vital bulgular seti. Tüm alanlar opsiyoneldir; en az
 * bir ölçüm alanı service katmanı tarafından zorunlu kılınır.
 */
export const vitalSignsSchema = z
  .object({
    /** Vücut sıcaklığı °C. Genel aralık 35-42. */
    temperatureC: z.number().min(35).max(42).optional(),
    /** Nabız BPM. Genel aralık 30-300. */
    heartRateBpm: z.number().int().min(30).max(300).optional(),
    /** Solunum hızı BPM. Genel aralık 8-100. */
    respiratoryRateBpm: z.number().int().min(8).max(100).optional(),
    /** Ağırlık kg. Genel aralık 0-200. */
    weightKg: z.number().min(0).max(200).optional(),
    /** Vücut kondüsyon skoru (1-9). */
    bodyConditionScore: z.number().int().min(1).max(9).optional(),
    /** Ateş ölçüm yöntemi. */
    temperatureMethod: temperatureMethodSchema.optional(),
    /** Sistolik kan basıncı mmHg. Genel aralık 60-250. */
    bloodPressureSystolic: z.number().int().min(60).max(250).optional(),
    /** Diyastolik kan basıncı mmHg. Genel aralık 40-150. */
    bloodPressureDiastolic: z.number().int().min(40).max(150).optional(),
    /** Kapiller dolum süresi saniye. Genel aralık 0-5. */
    capillaryRefillTime: z.number().min(0).max(5).optional(),
    /** Mukoza rengi. */
    mucousMembraneColor: mucousMembraneColorSchema.optional(),
    /** Serbest klinik not. Maks 2000 karakter. */
    notes: z.string().max(2000).optional(),
  })
  .strict();
export type VitalSigns = z.infer<typeof vitalSignsSchema>;

/**
 * Yeni vital kaydı oluşturma isteği.
 * - `vitalSigns` zorunlu; service en az bir ölçüm alanı
 *   doldurulmuş olmalı kontrolü yapar.
 * - `takenAt` opsiyonel; default = now (UTC ISO 8601).
 */
export const vitalSignsCreateInputSchema = z.object({
  vitalSigns: vitalSignsSchema,
  /** ISO 8601 datetime (UTC). Boşsa service now set eder. */
  takenAt: z.string().datetime().optional(),
});
export type VitalSignsCreateInput = z.infer<
  typeof vitalSignsCreateInputSchema
>;

/** API response şeması. */
export const vitalsRecordSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  examinationId: z.string(),
  patientId: z.string(),
  veterinarianId: z.string(),
  vitalSigns: vitalSignsSchema,
  /** ISO 8601 datetime — ölçüm zamanı. */
  takenAt: z.string().datetime(),
  /** Kaydı oluşturan kullanıcı ID. */
  recordedBy: z.string(),
});
export type VitalsRecord = z.infer<typeof vitalsRecordSchema>;
