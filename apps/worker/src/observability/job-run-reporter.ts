/**
 * @file BullMQ denemelerini kalıcı JobRun kaydına yazan adapter.
 * @module @vetniva/worker/observability
 * @description Worker yalnız kısıtlı runtime PostgreSQL rolüyle bağlanır.
 * Tenant'sız sistem jobları explicit transaction-local system-write bağlamı
 * ile yazılır; hata raporlama worker işini veya BullMQ retry akışını bozmaz.
 */

import { PrismaClient } from "@prisma/client";

import { logger } from "../logger.js";

import type { Prisma } from "@prisma/client";

let client: PrismaClient | null = null;

function prisma(): PrismaClient {
  if (client === null) client = new PrismaClient();
  return client;
}

/** Bir BullMQ denemesi için running JobRun satırı açar. */
export async function startJobRun(args: {
  queueName: string;
  jobName: string;
  jobKey: string;
  attempt: number;
  maxAttempts: number;
  input: Record<string, unknown>;
}): Promise<string | null> {
  try {
    const row = await prisma().$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'false', true)`;
      await tx.$executeRaw`SELECT set_config('app.system_write', 'true', true)`;
      return tx.jobRun.create({
        data: {
          queueName: args.queueName, jobName: args.jobName, jobKey: args.jobKey,
          source: "queue", status: "running", attempt: args.attempt,
          maxAttempts: args.maxAttempts, tenantId: null, branchId: null,
          correlationId: args.jobKey, requestId: null, actorId: null,
          actorType: "system", input: args.input as Prisma.InputJsonValue, output: {}, country: "SYSTEM",
          startedAt: new Date(), triggeredBy: "system", release: process.env["APP_VERSION"] ?? "0.0.0-dev",
        }, select: { id: true },
      });
    });
    return row.id;
  } catch (error) {
    logger.error({ err: error, action: "job-run-start" }, "JobRun başlatılamadı");
    return null;
  }
}

/** Çalışan denemeyi başarı veya hata ile kapatır; log yazımı best-effort'tur. */
export async function finishJobRun(args: {
  id: string | null;
  succeeded: boolean;
  attempt: number;
  maxAttempts: number;
  output?: Record<string, unknown>;
  error?: unknown;
}): Promise<void> {
  const id = args.id;
  if (!id) return;
  try {
    await prisma().$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'false', true)`;
      await tx.$executeRaw`SELECT set_config('app.system_write', 'true', true)`;
      const now = new Date();
      const current = await tx.jobRun.findUnique({ where: { id }, select: { startedAt: true } });
      if (!current) return;
      const status = args.succeeded ? "succeeded" : args.attempt >= args.maxAttempts ? "dead_letter" : "failed";
      const message = args.error instanceof Error ? args.error.message : args.error ? "Bilinmeyen worker hatası" : null;
      await tx.jobRun.update({ where: { id }, data: {
        status, finishedAt: now, durationMs: Math.max(0, now.getTime() - current.startedAt.getTime()),
        output: (args.succeeded ? args.output ?? {} : {}) as Prisma.InputJsonValue,
        errorCode: args.succeeded ? null : "VET-SYSTEM-0001",
        errorMessage: args.succeeded ? null : message,
        errorStack: !args.succeeded && args.error instanceof Error ? args.error.stack ?? null : null,
      } });
    });
  } catch (error) {
    logger.error({ err: error, action: "job-run-finish" }, "JobRun sonuçlandırılamadı");
  }
}

export async function closeJobRunReporter(): Promise<void> {
  if (client) await client.$disconnect();
  client = null;
}
