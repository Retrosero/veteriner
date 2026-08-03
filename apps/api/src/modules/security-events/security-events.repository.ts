/**
 * @file SecurityEvent repository (kalıcı kaynaklı indeks).
 * @module apps/api/modules/security-events/security-events.repository
 *
 * @description GOAL-105 (FAZ-10) güvenlik logları için hızlı bellek
 * indeksi ve Prisma snapshot deposu. Uygulama açılışında kalıcı
 * `SecurityEvent` satırları hydrate edilir; guard çağrıları senkron
 * kalırken snapshot yazımı ana güvenlik akışını engellemez.
 *
 * Davranış:
 * - `recordEvent` aynı `fingerprint` için mevcut kayıt varsa
 *   `occurrenceCount` artırılır + `lastSeenAt`/`occurredAt` ve
 *   `context` güncellenir; `firstSeenAt` ilk oluşturulduğunda
 *   sabitlenir. `alertSent` mevcut değer korunur.
 * - `fingerprint` repo tarafından hesaplanmaz; servis katmanında
 *   üretilir.
 *
 * Tenant olayları fingerprint dahil tenant kapsamlı tutulur ve Prisma
 * yazımı transaction-yerel RLS bağlamı altında yapılır. SUPERADMIN
 * görünümü bellek indeksinden cross-tenant sorgu yapabilir.
 *
 * @since GOAL-105 (FAZ-10) güvenlik logları ve alarm kuralları core
 */

import { randomUUID } from "node:crypto";

import { Injectable, OnModuleInit } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service.js";

import type { SecurityEventRecord } from "../../common/security-events/security-event.types.js";
import type {
  Prisma,
  SecurityEvent as PrismaSecurityEvent,
} from "@prisma/client";
import type {
  SecurityEventCountry,
  SecurityEventModule,
  SecurityEventType,
  SecurityEventSeverity,
} from "@vetniva/contracts";

/** Arama filtreleri. */
export interface SecurityEventSearchFilters {
  type?: SecurityEventType | undefined;
  severity?: SecurityEventSeverity | undefined;
  module?: SecurityEventModule | undefined;
  fingerprint?: string | undefined;
  tenantId?: string | undefined;
  branchId?: string | undefined;
  userId?: string | undefined;
  country?: SecurityEventCountry | undefined;
  release?: string | undefined;
  route?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  search?: string | undefined;
  sort?: "asc" | "desc" | undefined;
  limit: number;
  offset: number;
}

@Injectable()
export class SecurityEventsRepository implements OnModuleInit {
  /** key: id → security event. */
  private readonly byId = new Map<string, SecurityEventRecord>();
  /** fingerprint → id (sık karşılaşılan saldırıların hızlı tespiti). */
  private readonly byFingerprint = new Map<string, string>();
  /** Prisma olmayan birim testlerinde bellek içi adapter kullanılabilir. */
  public constructor(private readonly prisma?: PrismaService) {}

  /** Uygulama açılışında kalıcı olayları superadmin bağlamında hydrate eder. */
  public async onModuleInit(): Promise<void> {
    if (!this.prisma) return;
    const rows = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'true', true)`;
      return tx.securityEvent.findMany({ orderBy: { lastSeenAt: "asc" } });
    });
    for (const row of rows) {
      const record = this.fromPersistenceRecord(row);
      this.byId.set(record.id, record);
      this.byFingerprint.set(
        this.fingerprintScopeKey(record.tenantId, record.fingerprint),
        record.id,
      );
    }
  }

  public nextId(): string {
    return randomUUID();
  }

  /**
   * Yeni güvenlik olayı ekler. Aynı `fingerprint` için mevcut kayıt
   * varsa `occurrenceCount` artırılır + occurredAt/lastSeenAt +
   * context güncellenir ve mevcut kayıt döner. `firstSeenAt` ilk
   * oluşturulduğunda set edilir ve değişmez. `alertSent` mevcut
   * değer korunur. Aksi halde yeni kayıt oluşturulur.
   *
   * NOT: `firstSeenAt`, `lastSeenAt`, `occurrenceCount`, `alertSent`
   * alanları repo tarafından otomatik yönetilir; caller bunları
   * göndermemelidir.
   */
  public upsertByFingerprint(args: {
    fingerprint: string;
    record: Omit<
      SecurityEventRecord,
      | "id"
      | "fingerprint"
      | "occurrenceCount"
      | "firstSeenAt"
      | "lastSeenAt"
      | "alertSent"
    >;
    /** Mevcut kayıt yoksa default `alertSent=false`. */
    initialAlertSent?: boolean;
  }): SecurityEventRecord {
    const scopeKey = this.fingerprintScopeKey(
      args.record.tenantId,
      args.fingerprint,
    );
    const existingId = this.byFingerprint.get(scopeKey);
    if (existingId) {
      const existing = this.byId.get(existingId);
      if (existing) {
        existing.occurrenceCount += 1;
        existing.occurredAt = args.record.occurredAt;
        existing.lastSeenAt = args.record.occurredAt;
        existing.requestId = args.record.requestId;
        existing.message = args.record.message;
        existing.statusCode = args.record.statusCode;
        existing.severity = args.record.severity;
        existing.userId = args.record.userId;
        existing.tenantId = args.record.tenantId;
        existing.branchId = args.record.branchId;
        existing.context = args.record.context;
        existing.errorCode = args.record.errorCode;
        // alertSent mevcut değer korunur (önceden alarm gönderildiyse
        // tekrar göndermeyiz).
        // firstSeenAt sabit kalır.
        this.byId.set(existing.id, existing);
        return existing;
      }
    }
    const id = this.nextId();
    const rec: SecurityEventRecord = {
      ...args.record,
      id,
      fingerprint: args.fingerprint,
      occurrenceCount: 1,
      firstSeenAt: args.record.occurredAt,
      lastSeenAt: args.record.occurredAt,
      alertSent: args.initialAlertSent ?? false,
    };
    this.byId.set(id, rec);
    this.byFingerprint.set(scopeKey, id);
    return rec;
  }

  public findById(id: string): SecurityEventRecord | null {
    return this.byId.get(id) ?? null;
  }

  public findByFingerprint(
    fingerprint: string,
    tenantId?: string | null,
  ): SecurityEventRecord | null {
    if (tenantId !== undefined) {
      const id = this.byFingerprint.get(
        this.fingerprintScopeKey(tenantId, fingerprint),
      );
      return id ? (this.byId.get(id) ?? null) : null;
    }
    return (
      Array.from(this.byId.values()).find(
        (record) => record.fingerprint === fingerprint,
      ) ?? null
    );
  }

  /**
   * Filtreli arama. SUPERADMIN paneli için tasarlandı; tenant
   * filtresi opsiyonel. `search` route + message alanlarında
   * case-insensitive substring arar. `from`/`to` `lastSeenAt`
   * üzerinde filtreler.
   */
  public search(filters: SecurityEventSearchFilters): {
    items: SecurityEventRecord[];
    total: number;
  } {
    const all: SecurityEventRecord[] = [];
    for (const rec of this.byId.values()) {
      if (filters.type && rec.type !== filters.type) continue;
      if (filters.severity && rec.severity !== filters.severity) continue;
      if (filters.module && rec.module !== filters.module) continue;
      if (filters.fingerprint && rec.fingerprint !== filters.fingerprint) {
        continue;
      }
      if (filters.tenantId && rec.tenantId !== filters.tenantId) continue;
      if (filters.branchId && rec.branchId !== filters.branchId) continue;
      if (filters.userId && rec.userId !== filters.userId) continue;
      if (filters.country && rec.country !== filters.country) continue;
      if (filters.release && rec.release !== filters.release) continue;
      if (filters.route && !rec.route.startsWith(filters.route)) continue;
      if (filters.from && rec.lastSeenAt < filters.from) continue;
      if (filters.to && rec.lastSeenAt > filters.to) continue;
      if (filters.search) {
        const needle = filters.search.toLowerCase();
        const inMessage = rec.message.toLowerCase().includes(needle);
        const inRoute = rec.route.toLowerCase().includes(needle);
        if (!inMessage && !inRoute) continue;
      }
      all.push(rec);
    }
    const sort = filters.sort ?? "desc";
    all.sort((a, b) => {
      const cmp = a.lastSeenAt.localeCompare(b.lastSeenAt);
      return sort === "desc" ? -cmp : cmp;
    });
    const total = all.length;
    const items = all.slice(filters.offset, filters.offset + filters.limit);
    return { items, total };
  }

  /**
   * Tüm kayıtları iterate eder (özet aggregate için).
   */
  public all(): SecurityEventRecord[] {
    return Array.from(this.byId.values());
  }

  /**
   * Bir kaydın `alertSent` alanını günceller. Alarm adapter
   * tarafından gönderildikten sonra çağrılır; aynı fingerprint
   * için tekrar gönderim engellenir.
   */
  public markAlertSent(fingerprint: string, tenantId?: string | null): boolean {
    const rec =
      tenantId === undefined
        ? this.findByFingerprint(fingerprint)
        : this.findByFingerprint(fingerprint, tenantId);
    if (!rec) return false;
    rec.alertSent = true;
    this.byId.set(rec.id, rec);
    return true;
  }

  /**
   * Test yardımcısı. Tüm state'i temizler.
   */
  public clear(): void {
    this.byId.clear();
    this.byFingerprint.clear();
  }

  /**
   * Bellek içi aggregate'in PII maskeli kalıcı kopyasını yazar.
   * @description Security guard ve exception akışını engellememek için
   * service bu işlemi best-effort başlatır. Tenant olaylarında RLS tenant
   * bağlamı, sistem olaylarında dar system-write bağlamı kurulur.
   * @param record
   */
  public async persistSnapshot(record: SecurityEventRecord): Promise<void> {
    if (!this.prisma) return;
    const write = async (tx: Prisma.TransactionClient): Promise<void> => {
      const existing = await tx.securityEvent.findFirst({
        where: { tenantId: record.tenantId, fingerprint: record.fingerprint },
        select: { id: true },
      });
      const data = this.toPersistenceData(record);
      if (existing) {
        await tx.securityEvent.update({ where: { id: existing.id }, data });
        return;
      }
      // PostgreSQL'de failed INSERT sonrası aynı transaction içinde sorgu
      // çalıştırılamaz. Bu nedenle çakışma, dıştaki best-effort çağrıda
      // yeniden denemeye bırakılır; burada transaction abort edilmez.
      await tx.securityEvent.create({ data: { id: record.id, ...data } });
    };

    if (record.tenantId) {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${record.tenantId}, true)`;
        await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'false', true)`;
        await write(tx);
      });
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'false', true)`;
      await tx.$executeRaw`SELECT set_config('app.system_write', 'true', true)`;
      await write(tx);
    });
  }

  private fingerprintScopeKey(
    tenantId: string | null,
    fingerprint: string,
  ): string {
    return `${tenantId ?? "__system__"}|${fingerprint}`;
  }

  private toPersistenceData(
    record: SecurityEventRecord,
  ): Prisma.SecurityEventUncheckedCreateInput {
    return {
      requestId: record.requestId,
      tenantId: record.tenantId,
      branchId: record.branchId,
      userId: record.userId,
      actorType: record.actorType,
      type: record.type,
      module: record.module,
      route: record.route,
      release: record.release,
      severity: record.severity,
      fingerprint: record.fingerprint,
      errorCode: record.errorCode,
      message: record.message,
      statusCode: record.statusCode,
      ipAddress: record.ipAddress,
      userAgentHash: record.userAgentHash,
      context: record.context as Prisma.InputJsonValue,
      country: record.country,
      occurredAt: new Date(record.occurredAt),
      firstSeenAt: new Date(record.firstSeenAt),
      lastSeenAt: new Date(record.lastSeenAt),
      occurrenceCount: record.occurrenceCount,
      alertSent: record.alertSent,
    };
  }

  private fromPersistenceRecord(row: PrismaSecurityEvent): SecurityEventRecord {
    return {
      id: row.id,
      requestId: row.requestId,
      tenantId: row.tenantId,
      branchId: row.branchId,
      userId: row.userId,
      actorType: row.actorType as SecurityEventRecord["actorType"],
      type: row.type as SecurityEventRecord["type"],
      module: row.module as SecurityEventRecord["module"],
      route: row.route,
      release: row.release,
      severity: row.severity as SecurityEventRecord["severity"],
      fingerprint: row.fingerprint,
      errorCode: row.errorCode as SecurityEventRecord["errorCode"],
      message: row.message,
      statusCode: row.statusCode,
      ipAddress: row.ipAddress,
      userAgentHash: row.userAgentHash,
      context: this.toContextRecord(row.context),
      country: row.country as SecurityEventRecord["country"],
      occurredAt: row.occurredAt.toISOString(),
      firstSeenAt: row.firstSeenAt.toISOString(),
      lastSeenAt: row.lastSeenAt.toISOString(),
      occurrenceCount: row.occurrenceCount,
      alertSent: row.alertSent,
    };
  }

  private toContextRecord(value: Prisma.JsonValue): Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  /* ------------------------------------------------------------------------
   * Retention (GOAL-106) — cutoff bazlı süpürme
   * ------------------------------------------------------------------------
   */

  /**
   * `lastSeenAt` alanı `cutoff` değerinden küçük veya eşit olan
   * (yani cutoff'a kadar olan) güvenlik kayıtlarını siler. Tenant
   * filtresi opsiyoneldir; null ise tüm tenant'lar. Silinen kayıt
   * sayısını döner.
   */
  public expireOlderThan(args: {
    cutoff: string;
    tenantId?: string | null;
  }): number {
    const idsToDelete: string[] = [];
    for (const rec of this.byId.values()) {
      if (args.tenantId !== undefined && rec.tenantId !== args.tenantId) {
        continue;
      }
      if (rec.lastSeenAt <= args.cutoff) {
        idsToDelete.push(rec.id);
      }
    }
    for (const id of idsToDelete) {
      const rec = this.byId.get(id);
      if (!rec) continue;
      this.byId.delete(id);
      this.byFingerprint.delete(
        this.fingerprintScopeKey(rec.tenantId, rec.fingerprint),
      );
    }
    return idsToDelete.length;
  }

  /**
   * Kalıcı security event kayıtlarını ve bellek indeksini aynı cutoff ile
   * süpürür. Retention işi bu metodu kullanır; aksi halde uygulama yeniden
   * başladığında yalnızca bellekten silinen kayıtlar tekrar görünürdü.
   */
  public async expirePersistedOlderThan(args: {
    cutoff: string;
    tenantId?: string | null;
  }): Promise<number> {
    if (!this.prisma) return this.expireOlderThan(args);
    const deleted = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'true', true)`;
      return tx.securityEvent.deleteMany({
        where: {
          ...(args.tenantId !== undefined ? { tenantId: args.tenantId } : {}),
          lastSeenAt: { lte: new Date(args.cutoff) },
        },
      });
    });
    this.expireOlderThan(args);
    return deleted.count;
  }

  /**
   * `lastSeenAt` alanı `cutoff` değerinden küçük veya eşit olan
   * (yani cutoff'a kadar olan) güvenlik kayıtlarını sayar. Tenant
   * filtresi opsiyoneldir. Dry-run sweep'lerde kullanılır.
   */
  public countOlderThan(args: {
    cutoff: string;
    tenantId?: string | null;
  }): number {
    let n = 0;
    for (const rec of this.byId.values()) {
      if (args.tenantId !== undefined && rec.tenantId !== args.tenantId) {
        continue;
      }
      if (rec.lastSeenAt <= args.cutoff) n += 1;
    }
    return n;
  }
}
