/**
 * @file JobRun repository (kalıcı kaynaklı hızlı indeks).
 * @module apps/api/modules/job-runs/job-runs.repository
 *
 * @description GOAL-102 (FAZ-10) background job ve entegrasyon
 * logları için API'nin hızlı okuma indeksi. Worker tarafından Prisma
 * `JobRun` tablosuna yazılan kalıcı kayıtlar uygulama açılışında ve
 * düzenli yenilemeyle indekse alınır; API'nin mevcut senkron sözleşmesi
 * korunur.
 *
 * Davranış:
 * - `insert`: yeni JobRun ekler; id repository tarafından üretilir.
 * - `update`: id bazlı kısmi güncelleme. `parentRunId` immutable.
 * - `findById` / `findByJobKey` (sıralı liste).
 * - `search`: filtreli arama + pagination.
 * - `listDeadLetter`: yalnızca `status = dead_letter` olanlar.
 * - `listByQueue`: queue adı bazlı toplam.
 * - `oldestRunning`: `status = running` veya `pending` olan en eski.
 *
 * @since GOAL-102 (FAZ-10) background job ve entegrasyon logları core
 */

import { randomUUID } from "node:crypto";

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service.js";

import type { JobRunRecord } from "../../common/job-runs/job-run.types.js";
import type {
  ErrorEventCountry,
  JobRunSource,
  JobRunStatus,
  JobRunTriggeredBy,
} from "@vetniva/contracts";

/** Arama filtreleri. */
export interface JobRunSearchFilters {
  queueName?: string | undefined;
  jobName?: string | undefined;
  jobKey?: string | undefined;
  status?: JobRunStatus | undefined;
  source?: JobRunSource | undefined;
  tenantId?: string | undefined;
  branchId?: string | undefined;
  correlationId?: string | undefined;
  country?: ErrorEventCountry | undefined;
  triggeredBy?: JobRunTriggeredBy | undefined;
  from?: string | undefined;
  to?: string | undefined;
  search?: string | undefined;
  sort?: "asc" | "desc" | undefined;
  limit: number;
  offset: number;
}

/** Dead-letter sorgu filtreleri. */
export interface JobRunDeadLetterFilters {
  tenantId?: string | undefined;
  queueName?: string | undefined;
  jobName?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  limit: number;
  offset: number;
}

@Injectable()
export class JobRunsRepository implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobRunsRepository.name);
  /** key: id → record. */
  private readonly byId = new Map<string, JobRunRecord>();
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  /** Runtime'da kalıcı worker kayıtlarını Superadmin indeksine yükler. */
  public constructor(private readonly prisma?: PrismaService) {}

  public async onModuleInit(): Promise<void> {
    await this.refreshFromDatabase();
    if (!this.prisma) return;
    this.refreshTimer = setInterval(() => {
      void this.refreshFromDatabase();
    }, 5_000);
    this.refreshTimer.unref?.();
  }

  /** Worker'ın yeni kalıcı kayıtlarını superadmin RLS bağlamıyla indekse alır. */
  public async refreshFromDatabase(): Promise<void> {
    if (!this.prisma) return;
    try {
      const rows = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'true', true)`;
        return tx.jobRun.findMany({ orderBy: { startedAt: "asc" } });
      });
      for (const row of rows) {
        this.byId.set(row.id, {
          id: row.id,
          queueName: row.queueName,
          jobName: row.jobName,
          jobKey: row.jobKey,
          source: row.source as JobRunSource,
          status: row.status as JobRunStatus,
          attempt: row.attempt,
          maxAttempts: row.maxAttempts,
          tenantId: row.tenantId,
          branchId: row.branchId,
          correlationId: row.correlationId,
          requestId: row.requestId,
          actorId: row.actorId,
          actorType: row.actorType as JobRunRecord["actorType"],
          input: row.input as Record<string, unknown>,
          output: row.output as Record<string, unknown>,
          errorCode: row.errorCode,
          errorMessage: row.errorMessage,
          errorStack: row.errorStack,
          startedAt: row.startedAt.toISOString(),
          finishedAt: row.finishedAt?.toISOString() ?? null,
          durationMs: row.durationMs,
          parentRunId: row.parentRunId,
          triggeredBy: row.triggeredBy as JobRunTriggeredBy,
          country: row.country as ErrorEventCountry,
          release: row.release,
        });
      }
    } catch (error) {
      this.logger.error(
        "Kalıcı JobRun indeksi yenilenemedi",
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  public onModuleDestroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = null;
  }

  public nextId(): string {
    return randomUUID();
  }

  /**
   * Yeni run ekler. `id` çağırıcı tarafından atanır; bu sayede
   * `parentRunId` bağlama repository dışında yapılabilir.
   */
  public insert(record: JobRunRecord): JobRunRecord {
    this.byId.set(record.id, record);
    return record;
  }

  /**
   * Id bazlı kısmi güncelleme. `undefined` alanlar korunur; `null`
   * açıkça temizler. Bilinmeyen id → null.
   */
  public update(
    id: string,
    patch: Partial<Omit<JobRunRecord, "id">>,
  ): JobRunRecord | null {
    const existing = this.byId.get(id);
    if (!existing) return null;
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      // Object.entries ile gelen anahtarlar JobRunRecord alanlarıdır.
      (existing as unknown as Record<string, unknown>)[key] = value;
    }
    this.byId.set(id, existing);
    return existing;
  }

  public findById(id: string): JobRunRecord | null {
    return this.byId.get(id) ?? null;
  }

  /**
   * Aynı `jobKey` için tüm run'ları sıralı (en eski önce) döner.
   * Bir job'ın tüm retry geçmişini listelemek için kullanılır.
   */
  public findByJobKey(jobKey: string): JobRunRecord[] {
    const out: JobRunRecord[] = [];
    for (const r of this.byId.values()) {
      if (r.jobKey === jobKey) out.push(r);
    }
    out.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    return out;
  }

  /**
   * Filtreli arama + pagination. `search` queueName + jobName +
   * jobKey alanlarında case-insensitive substring arar.
   */
  public search(filters: JobRunSearchFilters): {
    items: JobRunRecord[];
    total: number;
  } {
    const all: JobRunRecord[] = [];
    for (const r of this.byId.values()) {
      if (filters.queueName && r.queueName !== filters.queueName) continue;
      if (filters.jobName && r.jobName !== filters.jobName) continue;
      if (filters.jobKey && r.jobKey !== filters.jobKey) continue;
      if (filters.status && r.status !== filters.status) continue;
      if (filters.source && r.source !== filters.source) continue;
      if (filters.tenantId && r.tenantId !== filters.tenantId) continue;
      if (filters.branchId && r.branchId !== filters.branchId) continue;
      if (filters.correlationId && r.correlationId !== filters.correlationId) {
        continue;
      }
      if (filters.country && r.country !== filters.country) continue;
      if (filters.triggeredBy && r.triggeredBy !== filters.triggeredBy) {
        continue;
      }
      // Tarih filtresi: startedAt üzerinden.
      if (filters.from && r.startedAt < filters.from) continue;
      if (filters.to && r.startedAt > filters.to) continue;
      if (filters.search) {
        const needle = filters.search.toLowerCase();
        const inQueue = r.queueName.toLowerCase().includes(needle);
        const inJob = r.jobName.toLowerCase().includes(needle);
        const inKey = r.jobKey.toLowerCase().includes(needle);
        const inError = r.errorMessage?.toLowerCase().includes(needle) ?? false;
        if (!inQueue && !inJob && !inKey && !inError) continue;
      }
      all.push(r);
    }
    const sort = filters.sort ?? "desc";
    all.sort((a, b) => {
      const cmp = a.startedAt.localeCompare(b.startedAt);
      return sort === "desc" ? -cmp : cmp;
    });
    const total = all.length;
    const items = all.slice(filters.offset, filters.offset + filters.limit);
    return { items, total };
  }

  /**
   * Dead-letter listesi. `status = dead_letter` olan run'ları
   * tenant/queue/jobName filtresi ile döner. Son `finishedAt`'a
   * göre azalan sıralı.
   */
  public listDeadLetter(filters: JobRunDeadLetterFilters): {
    items: JobRunRecord[];
    total: number;
  } {
    const all: JobRunRecord[] = [];
    for (const r of this.byId.values()) {
      if (r.status !== "dead_letter") continue;
      if (filters.tenantId && r.tenantId !== filters.tenantId) continue;
      if (filters.queueName && r.queueName !== filters.queueName) continue;
      if (filters.jobName && r.jobName !== filters.jobName) continue;
      if (filters.from && r.startedAt < filters.from) continue;
      if (filters.to && r.startedAt > filters.to) continue;
      all.push(r);
    }
    // dead-letter sıralaması: en son bitenler üstte.
    all.sort((a, b) => {
      const af = a.finishedAt ?? a.startedAt;
      const bf = b.finishedAt ?? b.startedAt;
      return bf.localeCompare(af);
    });
    const total = all.length;
    const items = all.slice(filters.offset, filters.offset + filters.limit);
    return { items, total };
  }

  /**
   * Tüm queue adları için status kırılımı. SUPERADMIN özet paneli
   * için tasarlandı; tenant filtresi opsiyonel.
   */
  public countByQueue(
    filters: { from?: string | undefined; to?: string | undefined } = {},
  ): Array<{
    queueName: string;
    total: number;
    succeeded: number;
    failed: number;
    deadLetter: number;
    running: number;
    pending: number;
  }> {
    const byQ = new Map<
      string,
      {
        queueName: string;
        total: number;
        succeeded: number;
        failed: number;
        deadLetter: number;
        running: number;
        pending: number;
      }
    >();
    for (const r of this.byId.values()) {
      if (filters.from && r.startedAt < filters.from) continue;
      if (filters.to && r.startedAt > filters.to) continue;
      let entry = byQ.get(r.queueName);
      if (!entry) {
        entry = {
          queueName: r.queueName,
          total: 0,
          succeeded: 0,
          failed: 0,
          deadLetter: 0,
          running: 0,
          pending: 0,
        };
        byQ.set(r.queueName, entry);
      }
      entry.total += 1;
      switch (r.status) {
        case "succeeded":
          entry.succeeded += 1;
          break;
        case "failed":
          entry.failed += 1;
          break;
        case "dead_letter":
          entry.deadLetter += 1;
          break;
        case "running":
          entry.running += 1;
          break;
        case "pending":
          entry.pending += 1;
          break;
      }
    }
    return Array.from(byQ.values()).sort((a, b) => b.total - a.total);
  }

  /**
   * Tüm status sayaçlarını döner (sırasız; servis siparişi ayarlar).
   */
  public countByStatus(
    filters: { from?: string | undefined; to?: string | undefined } = {},
  ): Map<JobRunStatus, number> {
    const out = new Map<JobRunStatus, number>();
    for (const r of this.byId.values()) {
      if (filters.from && r.startedAt < filters.from) continue;
      if (filters.to && r.startedAt > filters.to) continue;
      out.set(r.status, (out.get(r.status) ?? 0) + 1);
    }
    return out;
  }

  /**
   * `status = dead_letter` olan run'ların sayısı, yalnızca
   * `startedAt` >= cutoffTs olanlar.
   */
  public countDeadLetterSince(cutoffIso: string): number {
    let n = 0;
    for (const r of this.byId.values()) {
      if (r.status === "dead_letter" && r.startedAt >= cutoffIso) n += 1;
    }
    return n;
  }

  /**
   * `status = running` veya `pending` olan en eski run'ın
   * `startedAt` değeri. Yoksa null.
   */
  public oldestActiveStartedAt(): string | null {
    let minIso: string | null = null;
    for (const r of this.byId.values()) {
      if (r.status !== "running" && r.status !== "pending") continue;
      if (minIso === null || r.startedAt < minIso) minIso = r.startedAt;
    }
    return minIso;
  }

  /**
   * Tüm kayıtları iterate eder (özet aggregate için).
   */
  public all(): JobRunRecord[] {
    return Array.from(this.byId.values());
  }

  /**
   * Test yardımcısı. Tüm state'i temizler.
   */
  public clear(): void {
    this.byId.clear();
  }

  /* ------------------------------------------------------------------------
   * Retention (GOAL-106) — cutoff bazlı süpürme
   * ------------------------------------------------------------------------
   */

  /**
   * `startedAt` alanı `cutoff` değerinden küçük veya eşit olan
   * (yani cutoff'a kadar olan) job run kayıtlarını siler. Tenant
   * filtresi opsiyoneldir; null ise tüm tenant'lar. Silinen kayıt
   * sayısını döner.
   */
  public expireOlderThan(args: {
    cutoff: string;
    tenantId?: string | null;
  }): number {
    const idsToDelete: string[] = [];
    for (const r of this.byId.values()) {
      if (args.tenantId !== undefined && r.tenantId !== args.tenantId) {
        continue;
      }
      if (r.startedAt <= args.cutoff) {
        idsToDelete.push(r.id);
      }
    }
    for (const id of idsToDelete) {
      this.byId.delete(id);
    }
    return idsToDelete.length;
  }

  /** Kalıcı JobRun satırlarını ve API indeksini birlikte temizler. */
  public async expirePersistedOlderThan(args: {
    cutoff: string;
    tenantId?: string | null;
  }): Promise<number> {
    if (!this.prisma) return this.expireOlderThan(args);
    const deleted = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'true', true)`;
      return tx.jobRun.deleteMany({
        where: {
          ...(args.tenantId !== undefined ? { tenantId: args.tenantId } : {}),
          startedAt: { lte: new Date(args.cutoff) },
        },
      });
    });
    this.expireOlderThan(args);
    return deleted.count;
  }

  /**
   * `startedAt` alanı `cutoff` değerinden küçük veya eşit olan
   * (yani cutoff'a kadar olan) job run kayıtlarını sayar. Tenant
   * filtresi opsiyoneldir. Dry-run sweep'lerde kullanılır.
   */
  public countOlderThan(args: {
    cutoff: string;
    tenantId?: string | null;
  }): number {
    let n = 0;
    for (const r of this.byId.values()) {
      if (args.tenantId !== undefined && r.tenantId !== args.tenantId) {
        continue;
      }
      if (r.startedAt <= args.cutoff) n += 1;
    }
    return n;
  }
}
