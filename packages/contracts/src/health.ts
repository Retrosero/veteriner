/**
 * @file Sağlık kontrolü (health check) sözleşmesi.
 * @module @vetniva/contracts/health
 *
 * @description API'nin temel sağlık kontrol endpoint'i için request/response
 * şeması. Hem `/api/v1/health` (liveness) hem de `/api/v1/ready` (readiness)
 * için ortak sözleşme. Tenant bağlamı içermez; GOAL-000 kapsamındadır.
 */

import { z } from "zod";

/**
 * API sürüm bilgisi. Sürüm değiştiğinde major bump ile birlikte sözleşme
 * güncellenir.
 */
export const apiVersionSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  build_sha: z.string().min(7).max(64),
  build_time: z.string().datetime(),
});
export type ApiVersion = z.infer<typeof apiVersionSchema>;

/**
 * Sağlık durumu enum'u. `ok` tamamen hazır, `degraded` kısmen çalışır
 * (ör. cache düştü), `down` kritik bağımlılık (DB) erişilemez.
 */
export const healthStatusSchema = z.enum(["ok", "degraded", "down"]);
export type HealthStatus = z.infer<typeof healthStatusSchema>;

/**
 * Liveness response. Yalnızca sürecin ayakta olduğunu gösterir.
 */
export const livenessResponseSchema = z.object({
  status: healthStatusSchema,
  timestamp: z.string().datetime(),
});
export type LivenessResponse = z.infer<typeof livenessResponseSchema>;

/**
 * Readiness response. Tüm kritik bağımlılıkların durumunu içerir.
 * Faz 0'da yalnızca `db` kontrol edilir; GOAL-001 ile birlikte `redis`,
 * `auth`, `audit` eklenecektir.
 */
export const readinessResponseSchema = z.object({
  status: healthStatusSchema,
  timestamp: z.string().datetime(),
  version: apiVersionSchema,
  components: z.object({
    db: z.object({
      status: healthStatusSchema,
      latency_ms: z.number().nonnegative().optional(),
      message: z.string().optional(),
    }),
  }),
});
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
