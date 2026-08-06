/**
 * @file ErrorEvent repository (in-memory).
 * @module apps/api/modules/error-events/error-events.repository
 * @description GOAL-100 (FAZ-10) merkezi backend hata kayıt deposu.
 * İzole birim testleri için in-memory Map sözleşmesi korunur; uygulama
 * çalışma zamanında aggregate kayıtlar ayrıca Prisma üzerinden kalıcı,
 * RLS korumalı PostgreSQL tablosuna yazılır.
 *
 * Davranış:
 * - `recordError` aynı `fingerprint` için mevcut kayıt varsa
 *   `occurrenceCount`'i artırır + `lastSeenAt`/`occurredAt` ve
 *   `context` günceller; `firstSeenAt` ilk oluşturulduğunda
 *   sabitlenir. `status` ve `assignedToUserId` mevcut değerleri
 *   korunur (otomatik terfi sadece `resolved → reopened`).
 * - `fingerprint` repo tarafından hesaplanmaz; servis katmanında üretilir.
 * - `persistSnapshot` tenant kayıtlarını transaction-yerel tenant RLS
 *   bağlamında, tenant'sız sistem kayıtlarını daraltılmış system-write
 *   bağlamında yazar.
 *
 * GOAL-103 ile birlikte eklenen yapı:
 * - Status geçiş logu: `transitionsByFingerprint` Map'i
 *   (fingerprint → transition[]).
 * - `updateStatus()`: belirli bir kaydın status + assignedToUserId
 *   alanlarını günceller. Status değişimi transition kaydı ile
 *   append-only log'a yazılır.
 * - `search()` filtresine `status`, `branchId`, `release`,
 *   `assignedToUserId` eklenmiştir.
 *
 * GOAL-104 ile birlikte eklenen yapı:
 * - Çözüm notları: `notesByFingerprint` Map'i (append-only).
 * - Destek bağlantıları: `supportLinksByFingerprint` Map'i.
 * - Atama geçmişi: `assignmentsByFingerprint` Map'i
 *   (assignee + unassign aksiyonları ayrı kayıt).
 * - Yardımcı metotlar: `addNote`, `listNotes`, `addSupportLink`,
 *   `listSupportLinks`, `addAssignment`, `listAssignments`.
 * @since GOAL-100 (FAZ-10) merkezi backend hata yakalama core
 * @updated GOAL-104 (FAZ-10) hata atama ve çözüm notları core
 */

import { randomUUID } from "node:crypto";

import { Injectable, OnModuleInit } from "@nestjs/common";

import { UNASSIGNED } from "../../common/error-events/error-event.types.js";
import { PrismaService } from "../../prisma/prisma.service.js";

import type {
  ErrorEventAssignmentRecordInternal,
  ErrorEventNoteRecord,
  ErrorEventNoteVisibility,
  ErrorEventRecord,
  ErrorEventStatusTransitionRecord,
  ErrorEventSupportLinkRecord,
} from "../../common/error-events/error-event.types.js";
import type {
  ErrorEventNote as PrismaErrorEventNote,
  ErrorEventSupportLink as PrismaErrorEventSupportLink,
  ErrorEventAssignment as PrismaErrorEventAssignment,
  ErrorEventStatusTransition as PrismaErrorEventStatusTransition,
  ErrorEvent as PrismaErrorEvent,
  Prisma,
} from "@prisma/client";
import type {
  ErrorEventCountry,
  ErrorEventModule,
  ErrorEventActorType,
  ErrorEventStatus,
  ErrorEventSupportSystem,
  ErrorCode,
  ErrorSeverity,
} from "@vetniva/contracts";

/** Arama filtreleri. */
export interface ErrorEventSearchFilters {
  severity?: ErrorSeverity | undefined;
  module?: ErrorEventModule | undefined;
  errorCode?: ErrorCode | undefined;
  fingerprint?: string | undefined;
  tenantId?: string | undefined;
  branchId?: string | undefined;
  country?: ErrorEventCountry | undefined;
  release?: string | undefined;
  route?: string | undefined;
  status?: ErrorEventStatus | undefined;
  assignedToUserId?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  search?: string | undefined;
  sort?: "asc" | "desc" | undefined;
  limit: number;
  offset: number;
}

/** Status update argümanları. */
export interface ErrorEventStatusUpdate {
  toStatus: ErrorEventStatus;
  actorId: string;
  actorType: ErrorEventActorType;
  reason: string | null;
  assignedToUserId?: string | undefined;
  clearAssignment?: boolean | undefined;
}

/** Çözüm notu ekleme argümanları. */
export interface ErrorEventNoteCreate {
  fingerprint: string;
  authorId: string;
  authorType: ErrorEventActorType;
  body: string;
  visibility: ErrorEventNoteVisibility;
}

/** Destek bağlantısı ekleme argümanları. */
export interface ErrorEventSupportLinkCreate {
  fingerprint: string;
  system: ErrorEventSupportSystem;
  externalId: string | null;
  url: string | null;
  title: string | null;
  createdById: string;
  createdByType: ErrorEventActorType;
}

/** Atama kaydı ekleme argümanları. */
export interface ErrorEventAssignmentCreate {
  fingerprint: string;
  /** Hedef atanan kişi; UNASSIGNED sentetik değeri ile atama kaldırma. */
  assigneeId: string;
  assignedById: string;
  assignedByType: ErrorEventActorType;
  reason: string | null;
}

@Injectable()
export class ErrorEventsRepository implements OnModuleInit {
  /** Key: id → error event. */
  private readonly byId = new Map<string, ErrorEventRecord>();
  /** Tenant kapsamı + fingerprint → id (cross-tenant birleşmeyi engeller). */
  private readonly byFingerprint = new Map<string, string>();
  /** Fingerprint → status transition listesi (append-only). */
  private readonly transitionsByFingerprint = new Map<
    string,
    ErrorEventStatusTransitionRecord[]
  >();
  /** Fingerprint → çözüm notu listesi (append-only — GOAL-104). */
  private readonly notesByFingerprint = new Map<
    string,
    ErrorEventNoteRecord[]
  >();
  /** Fingerprint → destek bağlantısı listesi (GOAL-104). */
  private readonly supportLinksByFingerprint = new Map<
    string,
    ErrorEventSupportLinkRecord[]
  >();
  /** Fingerprint → atama geçmişi (append-only — GOAL-104). */
  private readonly assignmentsByFingerprint = new Map<
    string,
    ErrorEventAssignmentRecordInternal[]
  >();
  /** Global id counter'lar. */
  private readonly counter = { n: 0 };
  private readonly transitionCounter = { n: 0 };
  private readonly noteCounter = { n: 0 };
  private readonly supportLinkCounter = { n: 0 };
  private readonly assignmentCounter = { n: 0 };

  /**
   * Prisma yalnız uygulama çalışma zamanında enjekte edilir. Bellek içi
   * adapter, izole birim testlerinin mevcut sözleşmesini korur; production
   * kayıtları ayrıca RLS korumalı PostgreSQL'e yazılır.
   */
  public constructor(private readonly prisma?: PrismaService) {}

  /**
   * Uygulama yeniden başlatıldığında kalıcı aggregate'leri bellekteki hızlı
   * sorgu indeksine alır. Bu global teknik servis yalnızca SUPERADMIN
   * görünümünün kullandığı hata merkezini hydrate eder; tenant endpoint'ine
   * doğrudan veri açmaz.
   */
  public async onModuleInit(): Promise<void> {
    if (!this.prisma) return;
    const rows = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'true', true)`;
      return tx.errorEvent.findMany({ orderBy: { lastSeenAt: "asc" } });
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

  public nextTransitionId(): string {
    this.transitionCounter.n += 1;
    return `trn-${String(this.transitionCounter.n).padStart(10, "0")}`;
  }

  public nextNoteId(): string {
    this.noteCounter.n += 1;
    return `note-${String(this.noteCounter.n).padStart(8, "0")}`;
  }

  public nextSupportLinkId(): string {
    this.supportLinkCounter.n += 1;
    return `sup-${String(this.supportLinkCounter.n).padStart(8, "0")}`;
  }

  public nextAssignmentId(): string {
    this.assignmentCounter.n += 1;
    return `asn-${String(this.assignmentCounter.n).padStart(8, "0")}`;
  }

  /**
   * Yeni hata olayı ekler. Aynı `fingerprint` için mevcut kayıt
   * varsa `occurrenceCount` artırılır + occurredAt/lastSeenAt +
   * context güncellenir ve mevcut kayıt döner. `firstSeenAt`
   * ilk oluşturulduğunda set edilir ve değişmez. `status` ve
   * `assignedToUserId` mevcut değerler korunur. Aksi halde yeni
   * kayıt oluşturulur.
   *
   * NOT: `firstSeenAt`, `lastSeenAt`, `status`, `assignedToUserId`
   * alanları repo tarafından otomatik yönetilir; caller bunları
   * göndermemelidir.
   * @param args
   * @param args.fingerprint
   * @param args.record
   */
  public upsertByFingerprint(args: {
    fingerprint: string;
    record: Omit<
      ErrorEventRecord,
      | "id"
      | "fingerprint"
      | "occurrenceCount"
      | "firstSeenAt"
      | "lastSeenAt"
      | "status"
      | "assignedToUserId"
    >;
  }): ErrorEventRecord {
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
        existing.stack = args.record.stack;
        // status + assignedToUserId mevcut değerleri korunur.
        // firstSeenAt sabit kalır.
        this.byId.set(existing.id, existing);
        return existing;
      }
    }
    const id = this.nextId();
    const rec: ErrorEventRecord = {
      ...args.record,
      id,
      fingerprint: args.fingerprint,
      occurrenceCount: 1,
      firstSeenAt: args.record.occurredAt,
      lastSeenAt: args.record.occurredAt,
      status: "new",
      assignedToUserId: null,
    };
    this.byId.set(id, rec);
    this.byFingerprint.set(scopeKey, id);
    return rec;
  }

  /**
   * Bellek içi aggregate'in kalıcı kopyasını yazar. Exception filter ana
   * yanıt akışını engellememek için çağıran taraf bu Promise'i best-effort
   * olarak ele alır. Tenant kayıtlarında tenant-local RLS, sistem
   * kayıtlarında daraltılmış `app.system_write` bağlamı kurulur.
   *
   * @param record PII maskelenmiş ErrorEvent aggregate kaydı.
   */
  public async persistSnapshot(record: ErrorEventRecord): Promise<void> {
    if (!this.prisma) return;
    const write = async (tx: Prisma.TransactionClient): Promise<void> => {
      const existing = await tx.errorEvent.findFirst({
        where: {
          tenantId: record.tenantId,
          fingerprint: record.fingerprint,
        },
        select: { id: true },
      });
      const data = this.toPersistenceData(record);
      if (existing) {
        await tx.errorEvent.update({ where: { id: existing.id }, data });
        return;
      }
      try {
        await tx.errorEvent.create({ data: { id: record.id, ...data } });
      } catch (error) {
        // Aynı fingerprint için paralel iki exception geldiğinde ilk create
        // unique index'i kazanır. İkinci yazıcı yalnız gerçekten oluşmuş
        // aggregate'i güncelleyebilir; başka DB hataları aynen yükseltilir.
        const concurrent = await tx.errorEvent.findFirst({
          where: {
            tenantId: record.tenantId,
            fingerprint: record.fingerprint,
          },
          select: { id: true },
        });
        if (!concurrent) throw error;
        await tx.errorEvent.update({ where: { id: concurrent.id }, data });
      }
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

  /** ErrorEventRecord'u Prisma create/update payload'ına dönüştürür. */
  private toPersistenceData(
    record: ErrorEventRecord,
  ): Prisma.ErrorEventUncheckedCreateInput {
    return {
      tenantId: record.tenantId,
      branchId: record.branchId,
      userId: record.userId,
      requestId: record.requestId,
      actorType: record.actorType,
      module: record.module,
      route: record.route,
      release: record.release,
      severity: record.severity,
      fingerprint: record.fingerprint,
      errorCode: record.errorCode,
      message: record.message,
      statusCode: record.statusCode,
      stack: record.stack,
      context: record.context as Prisma.InputJsonValue,
      country: record.country,
      occurredAt: new Date(record.occurredAt),
      firstSeenAt: new Date(record.firstSeenAt),
      lastSeenAt: new Date(record.lastSeenAt),
      occurrenceCount: record.occurrenceCount,
      status: record.status,
      assignedToUserId: record.assignedToUserId,
    };
  }

  /**
   * Çözüm notunu kalıcı tabloya yazar. Tenant bağlamı mevcutsa
   * tenant-local RLS, yoksa system-write bağlamı kurulur. Hata
   * durumunda loglama repository sahibine bırakılır (caller
   * best-effort `void` ile çağırır).
   *
   * @param record
   * @param tenantId
   */
  public async persistNoteSnapshot(
    record: ErrorEventNoteRecord,
    tenantId: string | null,
  ): Promise<void> {
    if (!this.prisma) return;
    const data: Prisma.ErrorEventNoteUncheckedCreateInput = {
      id: record.id,
      fingerprint: record.fingerprint,
      authorId: record.authorId,
      authorType: record.authorType,
      body: record.body,
      visibility: record.visibility,
      createdAt: new Date(record.createdAt),
    };
    const write = async (
      tx: Prisma.TransactionClient,
    ): Promise<PrismaErrorEventNote> => {
      return tx.errorEventNote.upsert({
        where: { id: record.id },
        create: data,
        update: data,
      });
    };
    if (tenantId) {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
        await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'false', true)`;
        await write(tx);
      });
    } else {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'true', true)`;
        await tx.$executeRaw`SELECT set_config('app.system_write', 'true', true)`;
        await write(tx);
      });
    }
  }

  /**
   * Destek bağlantısını kalıcı tabloya yazar. Tenant bağlamı
   * mevcutsa tenant-local RLS, yoksa system-write bağlamı kurulur.
   *
   * @param record
   * @param tenantId
   */
  public async persistSupportLinkSnapshot(
    record: ErrorEventSupportLinkRecord,
    tenantId: string | null,
  ): Promise<void> {
    if (!this.prisma) return;
    const data: Prisma.ErrorEventSupportLinkUncheckedCreateInput = {
      id: record.id,
      fingerprint: record.fingerprint,
      system: record.system,
      externalId: record.externalId,
      url: record.url,
      title: record.title,
      createdById: record.createdById,
      createdByType: record.createdByType,
      createdAt: new Date(record.createdAt),
    };
    const write = async (
      tx: Prisma.TransactionClient,
    ): Promise<PrismaErrorEventSupportLink> => {
      return tx.errorEventSupportLink.upsert({
        where: { id: record.id },
        create: data,
        update: data,
      });
    };
    if (tenantId) {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
        await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'false', true)`;
        await write(tx);
      });
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'true', true)`;
      await tx.$executeRaw`SELECT set_config('app.system_write', 'true', true)`;
      await write(tx);
    });
  }

  /**
   * Atama kaydını kalıcı tabloya yazar. `assigneeId === UNASSIGNED`
   * sentetik değeri DB'de `unassigned=true` + `assigneeId=null`
   * olarak saklanır. Tenant bağlamı yukarıdaki metotlarla aynı.
   *
   * @param record
   * @param tenantId
   */
  public async persistAssignmentSnapshot(
    record: ErrorEventAssignmentRecordInternal,
    tenantId: string | null,
  ): Promise<void> {
    if (!this.prisma) return;
    const isUnassign = record.assigneeId === UNASSIGNED;
    const data: Prisma.ErrorEventAssignmentUncheckedCreateInput = {
      id: record.id,
      fingerprint: record.fingerprint,
      assigneeId: isUnassign ? null : record.assigneeId,
      unassigned: isUnassign,
      actorId: record.assignedById,
      actorType: record.assignedByType,
      reason: record.reason,
      assignedAt: new Date(record.assignedAt),
    };
    const write = async (
      tx: Prisma.TransactionClient,
    ): Promise<PrismaErrorEventAssignment> => {
      return tx.errorEventAssignment.upsert({
        where: { id: record.id },
        create: data,
        update: data,
      });
    };
    if (tenantId) {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
        await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'false', true)`;
        await write(tx);
      });
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'true', true)`;
      await tx.$executeRaw`SELECT set_config('app.system_write', 'true', true)`;
      await write(tx);
    });
  }

  /**
   * Status transition kaydını kalıcı tabloya yazar. Tenant bağlamı
   * yukarıdaki metotlarla aynı.
   *
   * @param record
   * @param tenantId
   */
  public async persistStatusTransitionSnapshot(
    record: ErrorEventStatusTransitionRecord,
    tenantId: string | null,
  ): Promise<void> {
    if (!this.prisma) return;
    const data: Prisma.ErrorEventStatusTransitionUncheckedCreateInput = {
      id: record.id,
      fingerprint: record.fingerprint,
      fromStatus: record.fromStatus,
      toStatus: record.toStatus,
      actorId: record.actorId,
      actorType: record.actorType,
      reason: record.reason,
      occurredAt: new Date(record.occurredAt),
    };
    const write = async (
      tx: Prisma.TransactionClient,
    ): Promise<PrismaErrorEventStatusTransition> => {
      return tx.errorEventStatusTransition.upsert({
        where: { id: record.id },
        create: data,
        update: data,
      });
    };
    if (tenantId) {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
        await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'false', true)`;
        await write(tx);
      });
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'true', true)`;
      await tx.$executeRaw`SELECT set_config('app.system_write', 'true', true)`;
      await write(tx);
    });
  }

  /** PostgreSQL satırını in-memory aggregate sözleşmesine dönüştürür. */
  private fromPersistenceRecord(row: PrismaErrorEvent): ErrorEventRecord {
    return {
      id: row.id,
      requestId: row.requestId,
      tenantId: row.tenantId,
      branchId: row.branchId,
      userId: row.userId,
      actorType: row.actorType as ErrorEventActorType,
      module: row.module as ErrorEventModule,
      route: row.route,
      release: row.release,
      severity: row.severity as ErrorSeverity,
      fingerprint: row.fingerprint,
      errorCode: row.errorCode,
      message: row.message,
      statusCode: row.statusCode,
      stack: row.stack,
      context: this.toContextRecord(row.context),
      country: row.country as ErrorEventCountry,
      occurredAt: row.occurredAt.toISOString(),
      firstSeenAt: row.firstSeenAt.toISOString(),
      lastSeenAt: row.lastSeenAt.toISOString(),
      occurrenceCount: row.occurrenceCount,
      status: row.status as ErrorEventStatus,
      assignedToUserId: row.assignedToUserId,
    };
  }

  /** JSON context'in yalnız düz nesne biçimindeki değerini kabul eder. */
  private toContextRecord(value: Prisma.JsonValue): Record<string, unknown> {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value;
    }
    return {};
  }

  public findById(id: string): ErrorEventRecord | null {
    return this.byId.get(id) ?? null;
  }

  public findByFingerprint(
    fingerprint: string,
    tenantId?: string | null,
  ): ErrorEventRecord | null {
    if (tenantId !== undefined) {
      const id = this.byFingerprint.get(
        this.fingerprintScopeKey(tenantId, fingerprint),
      );
      return id ? (this.byId.get(id) ?? null) : null;
    }
    // SUPERADMIN fingerprint görünümü tüm tenant'ları kapsayabilir. Bu eski
    // imza için deterministik ilk aggregate'i döndürür; tenant bazlı yazma
    // yolları mutlaka yukarıdaki tenantId argümanını kullanır.
    return (
      [...this.byId.values()].find(
        (record) => record.fingerprint === fingerprint,
      ) ?? null
    );
  }

  /** Null sistem tenant'ı da dahil olmak üzere güvenli Map anahtarı üretir. */
  private fingerprintScopeKey(
    tenantId: string | null,
    fingerprint: string,
  ): string {
    return `${tenantId ?? "system"}:${fingerprint}`;
  }

  /**
   * Filtreli arama. SUPERADMIN paneli için tasarlandı; tenant
   * filtresi opsiyonel. `search` route + message alanlarında
   * case-insensitive substring arar. `from`/`to` artık
   * `lastSeenAt` üzerinde filtreler (görüldüğü son an).
   * @param filters
   */
  public search(filters: ErrorEventSearchFilters): {
    items: ErrorEventRecord[];
    total: number;
  } {
    const all: ErrorEventRecord[] = [];
    for (const rec of this.byId.values()) {
      if (filters.severity && rec.severity !== filters.severity) continue;
      if (filters.module && rec.module !== filters.module) continue;
      if (filters.errorCode && rec.errorCode !== filters.errorCode) continue;
      if (filters.fingerprint && rec.fingerprint !== filters.fingerprint) {
        continue;
      }
      if (filters.tenantId && rec.tenantId !== filters.tenantId) continue;
      if (filters.branchId && rec.branchId !== filters.branchId) continue;
      if (filters.country && rec.country !== filters.country) continue;
      if (filters.release && rec.release !== filters.release) continue;
      if (filters.status && rec.status !== filters.status) continue;
      if (
        filters.assignedToUserId &&
        rec.assignedToUserId !== filters.assignedToUserId
      ) {
        continue;
      }
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
   * Tüm fingerprint'leri occurrenceCount'a göre azalan
   * sırada döner (özet için).
   * @param filters
   */
  public listByFingerprint(
    filters: Omit<
      ErrorEventSearchFilters,
      "fingerprint" | "sort" | "limit" | "offset"
    >,
  ): ErrorEventRecord[] {
    const out: ErrorEventRecord[] = [];
    for (const rec of this.byId.values()) {
      if (filters.severity && rec.severity !== filters.severity) continue;
      if (filters.module && rec.module !== filters.module) continue;
      if (filters.errorCode && rec.errorCode !== filters.errorCode) continue;
      if (filters.tenantId && rec.tenantId !== filters.tenantId) continue;
      if (filters.branchId && rec.branchId !== filters.branchId) continue;
      if (filters.country && rec.country !== filters.country) continue;
      if (filters.release && rec.release !== filters.release) continue;
      if (filters.status && rec.status !== filters.status) continue;
      if (filters.route && !rec.route.startsWith(filters.route)) continue;
      if (filters.from && rec.lastSeenAt < filters.from) continue;
      if (filters.to && rec.lastSeenAt > filters.to) continue;
      out.push(rec);
    }
    out.sort((a, b) => {
      if (b.occurrenceCount !== a.occurrenceCount) {
        return b.occurrenceCount - a.occurrenceCount;
      }
      return b.lastSeenAt.localeCompare(a.lastSeenAt);
    });
    return out;
  }

  /**
   * Tüm kayıtları iterate eder (özet aggregate için).
   */
  public all(): ErrorEventRecord[] {
    return Array.from(this.byId.values());
  }

  /**
   * Bir kaydın durumunu ve atamasını günceller. Transition
   * log'a yeni kayıt eklenir. Mevcut kayıt yoksa null döner.
   * @param id
   * @param update
   */
  public updateStatus(
    id: string,
    update: ErrorEventStatusUpdate,
  ): {
    record: ErrorEventRecord;
    transition: ErrorEventStatusTransitionRecord;
  } | null {
    const rec = this.byId.get(id);
    if (!rec) return null;
    const fromStatus = rec.status;
    rec.status = update.toStatus;
    if (update.clearAssignment === true) {
      rec.assignedToUserId = null;
    } else if (
      update.assignedToUserId !== undefined &&
      update.assignedToUserId !== null
    ) {
      rec.assignedToUserId = update.assignedToUserId;
    }
    const transition: ErrorEventStatusTransitionRecord = {
      id: this.nextTransitionId(),
      fingerprint: rec.fingerprint,
      fromStatus,
      toStatus: update.toStatus,
      actorId: update.actorId,
      actorType: update.actorType,
      reason: update.reason,
      occurredAt: new Date().toISOString(),
    };
    const scopeKey = this.fingerprintScopeKey(rec.tenantId, rec.fingerprint);
    const list = this.transitionsByFingerprint.get(scopeKey) ?? [];
    list.push(transition);
    this.transitionsByFingerprint.set(scopeKey, list);
    this.byId.set(rec.id, rec);
    // Best-effort: kalıcı snapshot yaz.
    void this.persistStatusTransitionSnapshot(transition, rec.tenantId);
    // Ana kaydın status + assignedToUserId alanı da güncellenir.
    void this.persistSnapshot(rec);
    return { record: rec, transition };
  }

  /**
   * Bir fingerprint'in tüm status geçişlerini tarih sırasıyla
   * döner. Bulunamazsa boş liste.
   * @param fingerprint
   */
  public listTransitionsByFingerprint(
    fingerprint: string,
    tenantId: string | null,
  ): ErrorEventStatusTransitionRecord[] {
    return [
      ...(this.transitionsByFingerprint.get(
        this.fingerprintScopeKey(tenantId, fingerprint),
      ) ?? []),
    ];
  }

  /* ------------------------------------------------------------------------
   * Çözüm notu — GOAL-104
   * ------------------------------------------------------------------------
   */

  /**
   * Yeni çözüm notu ekler. Append-only; mevcut notlar etkilenmez.
   * Sıralama: createdAt artan. UI tarafı desc ile gösterir.
   * @param input
   */
  public addNote(
    input: ErrorEventNoteCreate,
    tenantId: string | null,
  ): ErrorEventNoteRecord {
    const rec: ErrorEventNoteRecord = {
      id: this.nextNoteId(),
      fingerprint: input.fingerprint,
      authorId: input.authorId,
      authorType: input.authorType,
      body: input.body,
      visibility: input.visibility,
      createdAt: new Date().toISOString(),
    };
    const scopeKey = this.fingerprintScopeKey(tenantId, input.fingerprint);
    const list = this.notesByFingerprint.get(scopeKey) ?? [];
    list.push(rec);
    this.notesByFingerprint.set(scopeKey, list);
    // Best-effort: kalıcı snapshot yaz.
    void this.persistNoteSnapshot(rec, tenantId);
    return rec;
  }

  /**
   * Bir fingerprint'in tüm notlarını createdAt artan sırada döner.
   * @param fingerprint
   */
  public listNotesByFingerprint(
    fingerprint: string,
    tenantId: string | null,
  ): ErrorEventNoteRecord[] {
    return [
      ...(this.notesByFingerprint.get(
        this.fingerprintScopeKey(tenantId, fingerprint),
      ) ?? []),
    ];
  }

  /**
   * Tek bir notu id üzerinden döner (test/düzeltme için).
   * @param id
   */
  public findNoteById(id: string): ErrorEventNoteRecord | null {
    for (const list of this.notesByFingerprint.values()) {
      for (const n of list) {
        if (n.id === id) return n;
      }
    }
    return null;
  }

  /* ------------------------------------------------------------------------
   * Destek kaydı bağlantısı — GOAL-104
   * ------------------------------------------------------------------------
   */

  /**
   * Yeni destek bağlantısı ekler.
   * @param input
   */
  public addSupportLink(
    input: ErrorEventSupportLinkCreate,
    tenantId: string | null,
  ): ErrorEventSupportLinkRecord {
    const rec: ErrorEventSupportLinkRecord = {
      id: this.nextSupportLinkId(),
      fingerprint: input.fingerprint,
      system: input.system,
      externalId: input.externalId,
      url: input.url,
      title: input.title,
      createdById: input.createdById,
      createdByType: input.createdByType,
      createdAt: new Date().toISOString(),
    };
    const scopeKey = this.fingerprintScopeKey(tenantId, input.fingerprint);
    const list = this.supportLinksByFingerprint.get(scopeKey) ?? [];
    list.push(rec);
    this.supportLinksByFingerprint.set(scopeKey, list);
    // Best-effort: kalıcı snapshot yaz.
    void this.persistSupportLinkSnapshot(rec, tenantId);
    return rec;
  }

  /**
   * Bir fingerprint'in tüm destek bağlantılarını döner.
   * @param fingerprint
   */
  public listSupportLinksByFingerprint(
    fingerprint: string,
    tenantId: string | null,
  ): ErrorEventSupportLinkRecord[] {
    return [
      ...(this.supportLinksByFingerprint.get(
        this.fingerprintScopeKey(tenantId, fingerprint),
      ) ?? []),
    ];
  }

  /* ------------------------------------------------------------------------
   * Atama geçmişi — GOAL-104
   * ------------------------------------------------------------------------
   */

  /**
   * Yeni atama kaydı ekler. `assigneeId === UNASSIGNED` ile atama
   * kaldırma anlamına gelir. Append-only; mevcut kayıtlar korunur.
   *
   * Yan etki: `byId` içindeki ilgili kaydın `assignedToUserId`
   * alanı güncellenir (en son atama = kaydın güncel durumu). UNASSIGNED
   * ise null yapılır.
   * @param input
   */
  public addAssignment(
    input: ErrorEventAssignmentCreate,
    tenantId: string | null,
  ): ErrorEventAssignmentRecordInternal {
    const rec: ErrorEventAssignmentRecordInternal = {
      id: this.nextAssignmentId(),
      fingerprint: input.fingerprint,
      assigneeId: input.assigneeId,
      assignedById: input.assignedById,
      assignedByType: input.assignedByType,
      reason: input.reason,
      assignedAt: new Date().toISOString(),
    };
    const scopeKey = this.fingerprintScopeKey(tenantId, input.fingerprint);
    const list = this.assignmentsByFingerprint.get(scopeKey) ?? [];
    list.push(rec);
    this.assignmentsByFingerprint.set(scopeKey, list);

    // İlgili ErrorEvent'in assignedToUserId alanını güncelle.
    const ev = this.findByFingerprint(input.fingerprint, tenantId);
    if (ev) {
      ev.assignedToUserId =
        input.assigneeId === UNASSIGNED ? null : input.assigneeId;
      this.byId.set(ev.id, ev);
      // Best-effort: ana kayıt güncellenir.
      void this.persistSnapshot(ev);
    }
    // Best-effort: kalıcı atama kaydı yaz.
    void this.persistAssignmentSnapshot(rec, tenantId);
    return rec;
  }

  /**
   * Bir fingerprint'in tüm atama geçmişini assignedAt artan sırada döner.
   * @param fingerprint
   */
  public listAssignmentsByFingerprint(
    fingerprint: string,
    tenantId: string | null,
  ): ErrorEventAssignmentRecordInternal[] {
    return [
      ...(this.assignmentsByFingerprint.get(
        this.fingerprintScopeKey(tenantId, fingerprint),
      ) ?? []),
    ];
  }

  /**
   * Test yardımcısı. Tüm state'i temizler.
   */
  public clear(): void {
    this.byId.clear();
    this.byFingerprint.clear();
    this.transitionsByFingerprint.clear();
    this.notesByFingerprint.clear();
    this.supportLinksByFingerprint.clear();
    this.assignmentsByFingerprint.clear();
    this.counter.n = 0;
    this.transitionCounter.n = 0;
    this.noteCounter.n = 0;
    this.supportLinkCounter.n = 0;
    this.assignmentCounter.n = 0;
  }

  /* ------------------------------------------------------------------------
   * Retention (GOAL-106) — cutoff bazlı süpürme
   * ------------------------------------------------------------------------
   */

  /**
   * `lastSeenAt` alanı `cutoff` değerinden küçük veya eşit olan
   * (yani cutoff'a kadar olan) hata kayıtlarını siler. Tenant
   * filtresi opsiyoneldir; null ise tüm tenant'lar. Fingerprint
   * index, transition listesi, notlar, destek bağlantıları ve
   * atama geçmişi de eşit olarak silinir. Silinen kayıt sayısını
   * döner.
   *
   * NOT: dryRun desteği bu metoda parametre olarak eklenmemiştir;
   *   üst katman (LogRetentionService) dryRun ise bu metodu hiç
   *   çağırmaz, yalnız `countOlderThan` ile sayım yapar.
   * @param args
   * @param args.cutoff
   * @param args.tenantId
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
      const scopeKey = this.fingerprintScopeKey(rec.tenantId, rec.fingerprint);
      this.transitionsByFingerprint.delete(scopeKey);
      this.notesByFingerprint.delete(scopeKey);
      this.supportLinksByFingerprint.delete(scopeKey);
      this.assignmentsByFingerprint.delete(scopeKey);
    }
    return idsToDelete.length;
  }

  /** Kalıcı hata olaylarını ve bellek indeksini aynı retention cutoff'ı ile temizler. */
  public async expirePersistedOlderThan(args: {
    cutoff: string;
    tenantId?: string | null;
  }): Promise<number> {
    if (!this.prisma) return this.expireOlderThan(args);
    const deleted = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'true', true)`;
      return tx.errorEvent.deleteMany({
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
   * (yani cutoff'a kadar olan) hata kayıtlarını sayar. Tenant
   * filtresi opsiyoneldir. Dry-run sweep'lerde kullanılır.
   * @param args
   * @param args.cutoff
   * @param args.tenantId
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
