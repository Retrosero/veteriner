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
export declare const apiVersionSchema: z.ZodObject<
  {
    name: z.ZodString;
    version: z.ZodString;
    build_sha: z.ZodString;
    build_time: z.ZodString;
  },
  "strip",
  z.ZodTypeAny,
  {
    name: string;
    version: string;
    build_sha: string;
    build_time: string;
  },
  {
    name: string;
    version: string;
    build_sha: string;
    build_time: string;
  }
>;
export type ApiVersion = z.infer<typeof apiVersionSchema>;
/**
 * Sağlık durumu enum'u. `ok` tamamen hazır, `degraded` kısmen çalışır
 * (ör. cache düştü), `down` kritik bağımlılık (DB) erişilemez.
 */
export declare const healthStatusSchema: z.ZodEnum<["ok", "degraded", "down"]>;
export type HealthStatus = z.infer<typeof healthStatusSchema>;
/**
 * Liveness response. Yalnızca sürecin ayakta olduğunu gösterir.
 */
export declare const livenessResponseSchema: z.ZodObject<
  {
    status: z.ZodEnum<["ok", "degraded", "down"]>;
    timestamp: z.ZodString;
  },
  "strip",
  z.ZodTypeAny,
  {
    status: "ok" | "degraded" | "down";
    timestamp: string;
  },
  {
    status: "ok" | "degraded" | "down";
    timestamp: string;
  }
>;
export type LivenessResponse = z.infer<typeof livenessResponseSchema>;
/**
 * Readiness response. Tüm kritik bağımlılıkların durumunu içerir.
 * Faz 0'da yalnızca `db` kontrol edilir; GOAL-001 ile birlikte `redis`,
 * `auth`, `audit` eklenecektir.
 */
export declare const readinessResponseSchema: z.ZodObject<
  {
    status: z.ZodEnum<["ok", "degraded", "down"]>;
    timestamp: z.ZodString;
    version: z.ZodObject<
      {
        name: z.ZodString;
        version: z.ZodString;
        build_sha: z.ZodString;
        build_time: z.ZodString;
      },
      "strip",
      z.ZodTypeAny,
      {
        name: string;
        version: string;
        build_sha: string;
        build_time: string;
      },
      {
        name: string;
        version: string;
        build_sha: string;
        build_time: string;
      }
    >;
    components: z.ZodObject<
      {
        db: z.ZodObject<
          {
            status: z.ZodEnum<["ok", "degraded", "down"]>;
            latency_ms: z.ZodOptional<z.ZodNumber>;
            message: z.ZodOptional<z.ZodString>;
          },
          "strip",
          z.ZodTypeAny,
          {
            status: "ok" | "degraded" | "down";
            message?: string | undefined;
            latency_ms?: number | undefined;
          },
          {
            status: "ok" | "degraded" | "down";
            message?: string | undefined;
            latency_ms?: number | undefined;
          }
        >;
      },
      "strip",
      z.ZodTypeAny,
      {
        db: {
          status: "ok" | "degraded" | "down";
          message?: string | undefined;
          latency_ms?: number | undefined;
        };
      },
      {
        db: {
          status: "ok" | "degraded" | "down";
          message?: string | undefined;
          latency_ms?: number | undefined;
        };
      }
    >;
  },
  "strip",
  z.ZodTypeAny,
  {
    version: {
      name: string;
      version: string;
      build_sha: string;
      build_time: string;
    };
    status: "ok" | "degraded" | "down";
    timestamp: string;
    components: {
      db: {
        status: "ok" | "degraded" | "down";
        message?: string | undefined;
        latency_ms?: number | undefined;
      };
    };
  },
  {
    version: {
      name: string;
      version: string;
      build_sha: string;
      build_time: string;
    };
    status: "ok" | "degraded" | "down";
    timestamp: string;
    components: {
      db: {
        status: "ok" | "degraded" | "down";
        message?: string | undefined;
        latency_ms?: number | undefined;
      };
    };
  }
>;
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
//# sourceMappingURL=health.d.ts.map
