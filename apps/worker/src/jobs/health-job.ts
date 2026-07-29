/**
 * @file Sağlık kontrolü job tanımı.
 * @module @vetniva/worker/jobs/health-job
 *
 * @description `health` queue'sunda işlenen job'un payload Zod
 * şeması ve processor fonksiyonu burada tanımlıdır. GOAL-000
 * kapsamında DB bağlantısı olmadığından `db` kontrolü no-op
 * loglamadır; `redis` ve `all` aktif PING yapar.
 *
 * @security Job payload'u Zod ile validate edilir; geçersiz
 * payload işlenmeden reddedilir. Bu sayede BullMQ worker'ında
 * runtime hata yerine schema hatası oluşur; failedReason
 * güvenli biçimde loglanır.
 */

import { z } from "zod";

import { logger } from "../logger.js";
import { getRedisConnection } from "../queues/connection.js";

/**
 * Job payload şeması. Üç kontrol tipi kabul edilir; `requestId`
 * correlation amaçlıdır (zincirleme job/süreç izleme).
 */
export const healthJobPayloadSchema = z.object({
  check: z.enum(["db", "redis", "all"]),
  requestId: z.string().min(1, "requestId zorunludur"),
});

/**
 * Doğrulanmış payload tipi.
 */
export type HealthJobPayload = z.infer<typeof healthJobPayloadSchema>;

/**
 * Job'un işlenme sonucu. Worker tarafından BullMQ'ya döner;
 * başarı/hata metrikleri için kullanılır.
 */
export interface HealthJobResult {
  ok: boolean;
  checks: Array<{
    name: string;
    status: "ok" | "noop" | "fail";
    latencyMs: number;
    message?: string;
  }>;
}

/**
 * Health job processor. BullMQ tarafından çağrılır; payload
 * Zod ile doğrulanır, sonra ilgili kontroller sırayla çalışır.
 *
 * @param payload Job payload'ı (BullMQ'dan gelen raw JSON).
 * @returns İşlem sonucu.
 * @throws Geçersiz payload veya `redis` kontrolünde bağlantı hatası.
 */
export async function processHealthJob(
  payload: unknown,
): Promise<HealthJobResult> {
  const parsed = healthJobPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`health-job: payload doğrulaması başarısız: ${issues}`);
  }

  const data = parsed.data;
  const childLogger = logger.child({
    module: "worker",
    action: "health-job",
    requestId: data.requestId,
  });

  childLogger.info({ check: data.check }, "health job başladı");

  const checks: HealthJobResult["checks"] = [];

  if (data.check === "db" || data.check === "all") {
    checks.push(await checkDb(data.requestId));
  }
  if (data.check === "redis" || data.check === "all") {
    checks.push(await checkRedis(data.requestId));
  }

  const ok = checks.every((c) => c.status !== "fail");
  childLogger.info(
    { ok, check: data.check, totalChecks: checks.length },
    "health job tamamlandı",
  );
  return { ok, checks };
}

/**
 * DB kontrolü. GOAL-000'da DB bağlantısı olmadığı için no-op
 * loglamadır; GOAL-001+ ile gerçek `pg.Pool` ping'i eklenecek.
 */
async function checkDb(
  requestId: string,
): Promise<HealthJobResult["checks"][number]> {
  const start = Date.now();
  // DB bağlantısı GOAL-001 ile birlikte gelecek. Burada sadece
  // loglama yapılır; status 'noop' olarak işaretlenir.
  logger.debug(
    { requestId, action: "db-check" },
    "DB kontrolü no-op (GOAL-000)",
  );
  return {
    name: "db",
    status: "noop",
    latencyMs: Date.now() - start,
    message: "GOAL-000: DB bağlantısı henüz kurulmadı",
  };
}

/**
 * Redis kontrolü. `PING` komutu ile sağlık kontrolü yapılır;
 * bağlantı hatası durumunda hata fırlatılır (BullMQ retry
 * tetikler).
 */
async function checkRedis(
  requestId: string,
): Promise<HealthJobResult["checks"][number]> {
  const start = Date.now();
  try {
    const connection = getRedisConnection();
    const reply = await connection.ping();
    if (reply !== "PONG") {
      return {
        name: "redis",
        status: "fail",
        latencyMs: Date.now() - start,
        message: `Beklenmeyen PING yanıtı: ${String(reply)}`,
      };
    }
    return {
      name: "redis",
      status: "ok",
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    logger.error(
      { requestId, action: "redis-check", err: error },
      "Redis PING başarısız",
    );
    return {
      name: "redis",
      status: "fail",
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : "Bilinmeyen hata",
    };
  }
}
