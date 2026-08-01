/**
 * @file Alert (klinik uyarı) API sözleşmesi.
 * @module @vetniva/contracts/alert
 *
 * @description GOAL-023 alerji, kronik durum, ilaç etkileşimi ve
 * davranış uyarıları için API sözleşmesi. Zod şemaları + tipler.
 * Backend (request/response doğrulama) ve frontend (form/typing)
 * aynı kaynaktan tüketir.
 *
 * İş kuralları:
 * - Severity: `info` < `warning` < `critical`. UI aciliyet
 *   sıralaması için severity weight kullanılır.
 * - Category: `allergy`, `chronic_condition`,
 *   `medication_conflict`, `behavior`. Yeni kategori geriye
 *   dönük uyumlu kabul edilir.
 * - Süreli uyarılar için `expiresAt` opsiyonel ISO 8601. Geçmiş
 *   tarihli uyarılar UI'da pasif gösterilir.
 *
 * @security PII bu sözleşmede YOK; yalnızca şema/tip.
 *
 * @since GOAL-023 (FAZ-2) alerji/kronik uyarılar core
 */

import { z } from "zod";

/** Uyarı ciddiyet seviyesi. */
export const alertSeveritySchema = z.enum(["info", "warning", "critical"]);
export type AlertSeverity = z.infer<typeof alertSeveritySchema>;

/** Uyarı kategorisi. */
export const alertCategorySchema = z.enum([
  "allergy",
  "chronic_condition",
  "medication_conflict",
  "behavior",
]);
export type AlertCategory = z.infer<typeof alertCategorySchema>;

/** Yeni uyarı oluşturma isteği. */
export const alertCreateInputSchema = z.object({
  category: alertCategorySchema,
  severity: alertSeveritySchema,
  /** Kısa başlık (ör. "Penisilin alerjisi"). */
  title: z.string().min(1).max(200),
  /** Detaylı açıklama (serbest metin, max 2000). */
  description: z.string().min(1).max(2000),
  /** Opsiyonel son geçerlilik tarihi (ISO 8601 UTC). */
  expiresAt: z.string().datetime().optional(),
});
export type AlertCreateInput = z.infer<typeof alertCreateInputSchema>;

/** API response şeması. */
export const alertSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  patientId: z.string().uuid(),
  category: alertCategorySchema,
  severity: alertSeveritySchema,
  title: z.string(),
  description: z.string(),
  createdAt: z.string().datetime(),
  createdBy: z.string().nullable(),
  expiresAt: z.string().datetime().nullable(),
  archivedAt: z.string().datetime().nullable(),
});
export type Alert = z.infer<typeof alertSchema>;

/** Liste response şeması. */
export const alertListResponseSchema = z.object({
  items: z.array(alertSchema),
  total: z.number().int().nonnegative(),
});
export type AlertListResponse = z.infer<typeof alertListResponseSchema>;

/** Liste sorgu parametreleri. `activeOnly` string olarak gelir;
 *  controller `value === "true"` ile boolean'a çevirir (ZodEffects
 *  tip uyumsuzluğu nedeniyle transform burada yapılmaz). */
export const alertListQuerySchema = z.object({
  severity: alertSeveritySchema.optional(),
  activeOnly: z.union([z.literal("true"), z.literal("false")]).optional(),
});
export type AlertListQuery = z.infer<typeof alertListQuerySchema>;
