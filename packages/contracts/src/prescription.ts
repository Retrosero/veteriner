/**
 * @file Prescription (reçete) API sözleşmesi.
 * @module @vetniva/contracts/prescription
 *
 * @description GOAL-045 reçete oluşturma ve yaşam döngüsü API
 * sözleşmesi. Zod şemaları + tipler. Backend (request/response
 * doğrulama) ve frontend (form/typing) aynı kaynaktan tüketir.
 *
 * Reçete bir muayeneye (examination) bağlı klinik kayıt entity'sidir.
 * Yaşam döngüsü: `active` → (`dispensed` | `cancelled` | `expired` |
 * `completed`). Reçete üzerinde fiziksel silme YOKTUR; klinik kayıt
 * append-only politikası uygulanır (iptal için `cancelled` durumu).
 * PDF render FAZ-10+'da; FAZ-0'da `pdf()` placeholder buffer döner.
 *
 * @security PII bu sözleşmede YOK; yalnızca şema/tip.
 * @since GOAL-045 (FAZ-4) reçete oluşturma core
 */

import { z } from "zod";

/** Reçete durumu. */
export const prescriptionStatusSchema = z.enum([
  "active",
  "dispensed",
  "cancelled",
  "expired",
  "completed",
]);
export type PrescriptionStatus = z.infer<typeof prescriptionStatusSchema>;

/** Doz sıklığı. */
export const prescriptionFrequencySchema = z.enum([
  "once_daily",
  "twice_daily",
  "three_times_daily",
  "every_8h",
  "every_12h",
  "as_needed",
  "custom",
]);
export type PrescriptionFrequency = z.infer<
  typeof prescriptionFrequencySchema
>;

/** Uygulama yolu. */
export const prescriptionRouteSchema = z.enum([
  "oral",
  "topical",
  "injection_im",
  "injection_iv",
  "injection_sc",
  "inhalation",
  "other",
]);
export type PrescriptionRoute = z.infer<typeof prescriptionRouteSchema>;

/**
 * Reçete kalemi (ilaç/ürün + dozaj). Bir reçetede en az 1 kalem
 * bulunmalıdır (service katmanı 422 ile reddeder).
 */
export const prescriptionItemSchema = z.object({
  drugName: z.string().min(1).max(200),
  /** Dozaj metni; ör. "5 mg", "0.5 ml", "1 tablet". */
  dosage: z.string().min(1).max(100),
  frequency: prescriptionFrequencySchema,
  /** `frequency='custom'` ise zorunlu açıklayıcı metin. */
  customFrequency: z.string().max(200).optional(),
  /** Tedavi süresi (gün); kalem başına 1-365 gün kabul edilir. */
  durationDays: z.number().int().min(1).max(365),
  route: prescriptionRouteSchema,
  instructions: z.string().max(2000).optional(),
});
export type PrescriptionItem = z.infer<typeof prescriptionItemSchema>;

/**
 * Yeni reçete oluşturma isteği.
 * - `examinationId` zorunlu: reçete muayeneye bağlıdır; service
 *   katmanı examination'ın aynı tenant'ta olduğunu doğrular
 *   (cross-tenant → 404).
 * - `items` en az 1 kalem içermelidir (boş → 422).
 * - `durationDays` 1-30 gün arası (FAZ-0 sınırı; aşımı → 422
 *   VET-VALIDATION-0010).
 */
export const prescriptionCreateInputSchema = z.object({
  examinationId: z.string().min(1),
  items: z.array(prescriptionItemSchema).min(1),
  notes: z.string().max(2000).optional(),
  durationDays: z.number().int().min(1).max(30),
});
export type PrescriptionCreateInput = z.infer<
  typeof prescriptionCreateInputSchema
>;

/** Reçete iptal isteği. */
export const prescriptionCancelInputSchema = z.object({
  reason: z.string().min(1).max(2000),
});
export type PrescriptionCancelInput = z.infer<
  typeof prescriptionCancelInputSchema
>;

/** API response şeması. */
export const prescriptionSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  examinationId: z.string(),
  patientId: z.string(),
  veterinarianId: z.string(),
  items: z.array(prescriptionItemSchema),
  notes: z.string().nullable(),
  status: prescriptionStatusSchema,
  /** ISO 8601 datetime — reçete yazılma zamanı. */
  prescribedAt: z.string().datetime(),
  /** ISO 8601 datetime — reçete son kullanma zamanı (now + durationDays). */
  expiresAt: z.string().datetime(),
  /** ISO 8601 datetime — dağıtım zamanı; null = henüz dağıtılmadı. */
  dispensedAt: z.string().datetime().nullable(),
  /** Dağıtımı yapan kullanıcı ID. */
  dispensedBy: z.string().nullable(),
  /** ISO 8601 datetime — kayıt oluşturma zamanı. */
  createdAt: z.string().datetime(),
  /** ISO 8601 datetime — son güncelleme zamanı. */
  updatedAt: z.string().datetime(),
  /** Opsiyonel iptal nedeni. */
  cancelReason: z.string().nullable(),
});
export type Prescription = z.infer<typeof prescriptionSchema>;

/** Liste filtreleri. */
export const prescriptionFiltersSchema = z.object({
  patientId: z.string().optional(),
  status: prescriptionStatusSchema.optional(),
  /** ISO 8601 datetime (UTC). */
  from: z.string().datetime().optional(),
  /** ISO 8601 datetime (UTC). */
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type PrescriptionFilters = z.infer<typeof prescriptionFiltersSchema>;

/** Liste response şeması. */
export const prescriptionListResponseSchema = z.object({
  items: z.array(prescriptionSchema),
  total: z.number().int().nonnegative(),
});
export type PrescriptionListResponse = z.infer<
  typeof prescriptionListResponseSchema
>;
