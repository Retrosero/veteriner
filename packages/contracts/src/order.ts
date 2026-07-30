/**
 * @file Order (klinik order) API sözleşmesi.
 * @module @vetniva/contracts/order
 *
 * @description GOAL-044 tedavi planı + klinik order API sözleşmesi.
 * Zod şemaları + tipler. Backend (request/response doğrulama) ve
 * frontend (form/typing) aynı kaynaktan tüketir.
 *
 * Order, bir muayeneye (examination) bağlı klinik iş kalemi
 * (ilaç, uygulama, prosedür, lab, görüntüleme, aşı, kontrol,
 * genel talimat) entity'sidir. Tedavi planı, bir hasta (patient)
 * için tüm order'ların aktif / tamamlanmış ayrımıyla gruplanmış
 * görünümüdür. Bu sözleşme aynı zamanda yatış (hospitalization)
 * gibi gelecekteki order sistemleri için ortak contract köküdür.
 *
 * Plan öğesi tipleri (7 + 1):
 * - `medication`   — İlaç orderı
 * - `application`  — Uygulama (pansuman, enjeksiyon, serum)
 * - `procedure`    — Prosedür / cerrahi müdahale
 * - `lab`          — Laboratuvar testi
 * - `imaging`      — Görüntüleme (röntgen, USG vb.)
 * - `vaccination`  — Aşı (aşı akışı için ayrılmış)
 * - `follow_up`    — Kontrol randevusu (GOAL-046 köprüsü)
 * - `instruction`  — Genel talimat (diyet, egzersiz vb.)
 *
 * Yaşam döngüsü:
 *   `pending` (create) → `in_progress` (start) → `completed`
 *   (complete). `pending` veya `in_progress` durumundan
 *   `cancelled`'a geçiş yapılabilir (iptal/iptal+sebep).
 *
 * @security PII bu sözleşmede YOK; yalnızca şema/tip.
 * @since GOAL-044 (FAZ-4) tedavi planı + klinik order core
 */

import { z } from "zod";

/** Order türü. Klinik pilot kapsamı (7 + 1 tip). */
export const orderTypeSchema = z.enum([
  "medication",
  "application",
  "procedure",
  "lab",
  "imaging",
  "vaccination",
  "follow_up",
  "instruction",
]);
export type OrderType = z.infer<typeof orderTypeSchema>;

/** Order durumu. */
export const orderStatusSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
  "cancelled",
]);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

/**
 * Yeni order oluşturma isteği.
 * - `examinationId` zorunlu: order muayeneye bağlıdır.
 * - Service katmanı examination'ın aynı tenant'ta olduğunu
 *   doğrular (cross-tenant → 404).
 * - patientId examination'dan türetilir.
 */
export const orderCreateInputSchema = z.object({
  examinationId: z.string().min(1),
  type: orderTypeSchema,
  description: z.string().min(1).max(2000),
  notes: z.string().max(2000).optional(),
  /** ISO 8601 datetime — order için son tarih (ör. ilaç bitiş). */
  dueDate: z.string().datetime().optional(),
});
export type OrderCreateInput = z.infer<typeof orderCreateInputSchema>;

/** Order iptal isteği. */
export const orderCancelInputSchema = z.object({
  reason: z.string().min(1).max(2000),
});
export type OrderCancelInput = z.infer<typeof orderCancelInputSchema>;

/** API response şeması. */
export const orderSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  examinationId: z.string(),
  patientId: z.string(),
  type: orderTypeSchema,
  status: orderStatusSchema,
  description: z.string(),
  notes: z.string().nullable(),
  /** ISO 8601 datetime — son tarih; null = belirtilmemiş. */
  dueDate: z.string().datetime().nullable(),
  /** ISO 8601 datetime — oluşturma zamanı. */
  createdAt: z.string().datetime(),
  /** Order'ı oluşturan kullanıcı ID. */
  createdBy: z.string(),
  /** ISO 8601 datetime — tamamlanma zamanı; null = tamamlanmamış. */
  completedAt: z.string().datetime().nullable(),
  /** Tamamlayan kullanıcı ID. */
  completedBy: z.string().nullable(),
  /** ISO 8601 datetime — iptal zamanı; null = iptal edilmemiş. */
  cancelledAt: z.string().datetime().nullable(),
  /** İptal sebebi. */
  cancellationReason: z.string().nullable(),
});
export type Order = z.infer<typeof orderSchema>;

/** Liste filtreleri. */
export const orderFiltersSchema = z.object({
  patientId: z.string().optional(),
  type: orderTypeSchema.optional(),
  status: orderStatusSchema.optional(),
  /** ISO 8601 datetime (UTC). */
  from: z.string().datetime().optional(),
  /** ISO 8601 datetime (UTC). */
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export type OrderFilters = z.infer<typeof orderFiltersSchema>;

/** Liste response şeması. */
export const orderListResponseSchema = z.object({
  items: z.array(orderSchema),
  total: z.number().int().nonnegative(),
});
export type OrderListResponse = z.infer<typeof orderListResponseSchema>;

/** Order-bazlı tedavi planı görünümü: aktif (pending+in_progress) vs tamamlanmış. */
export const orderTreatmentPlanSchema = z.object({
  patientId: z.string(),
  active: z.array(orderSchema),
  completed: z.array(orderSchema),
});
export type OrderTreatmentPlan = z.infer<typeof orderTreatmentPlanSchema>;
