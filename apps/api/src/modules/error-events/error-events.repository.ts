/**
 * @file ErrorEvent repository (in-memory).
 * @module apps/api/modules/error-events/error-events.repository
 *
 * @description GOAL-100 (FAZ-10) merkezi backend hata kayıt
 * deposu. In-memory Map'te tutulur; DB migration sonraya
 * bırakıldı. Tenant izolasyonu YOKTUR (SUPERADMIN cross-tenant
 * görür); ancak tenant filtresi ile sorgulanabilir.
 *
 * Davranış:
 * - `recordError` aynı `fingerprint` için mevcut kayıt varsa
 *   `occurrenceCount`'i artırır + `lastSeenAt`/`occurredAt` ve
 *   `context` günceller; `firstSeenAt` ilk oluşturulduğunda
 *   sabitlenir. `status` ve `assignedToUserId` mevcut değerleri
 *   korunur (otomatik terfi sadece `resolved → reopened`).
 * - `fingerprint` repo tarafından hesaplanmaz; servis
 *   katmanında üretilir.
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
 * @since GOAL-100 (FAZ-10) merkezi backend hata yakalama core
 * @updated GOAL-103 (FAZ-10) superadmin hata merkezi core
 */

import { Injectable } from "@nestjs/common";

import type {
  ErrorEventRecord,
  ErrorEventStatusTransitionRecord,
} from "../../common/error-events/error-event.types.js";
import type {
  ErrorEventCountry,
  ErrorEventModule,
  ErrorEventActorType,
  ErrorEventStatus,
} from "@vetniva/contracts";
import type { ErrorCode, ErrorSeverity } from "@vetniva/contracts";

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

@Injectable()
export class ErrorEventsRepository {
  /** key: id → error event. */
  private readonly byId = new Map<string, ErrorEventRecord>();
  /** fingerprint → id (sık karşılaşılan hataların hızlı tespiti). */
  private readonly byFingerprint = new Map<string, string>();
  /** fingerprint → status transition listesi (append-only). */
  private readonly transitionsByFingerprint = new Map<
    string,
    ErrorEventStatusTransitionRecord[]
  >();
  /** Global id counter'lar. */
  private readonly counter = { n: 0 };
  private readonly transitionCounter = { n: 0 };

  public nextId(): string {
    this.counter.n += 1;
    return `err-${String(this.counter.n).padStart(10, "0")}`;
  }

  public nextTransitionId(): string {
    this.transitionCounter.n += 1;
    return `trn-${String(this.transitionCounter.n).padStart(10, "0")}`;
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
    const existingId = this.byFingerprint.get(args.fingerprint);
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
    this.byFingerprint.set(args.fingerprint, id);
    return rec;
  }

  public findById(id: string): ErrorEventRecord | null {
    return this.byId.get(id) ?? null;
  }

  public findByFingerprint(
    fingerprint: string,
  ): ErrorEventRecord | null {
    const id = this.byFingerprint.get(fingerprint);
    if (!id) return null;
    return this.byId.get(id) ?? null;
  }

  /**
   * Filtreli arama. SUPERADMIN paneli için tasarlandı; tenant
   * filtresi opsiyonel. `search` route + message alanlarında
   * case-insensitive substring arar. `from`/`to` artık
   * `lastSeenAt` üzerinde filtreler (görüldüğü son an).
   */
  public search(
    filters: ErrorEventSearchFilters,
  ): { items: ErrorEventRecord[]; total: number } {
    const all: ErrorEventRecord[] = [];
    for (const rec of this.byId.values()) {
      if (filters.severity && rec.severity !== filters.severity) continue;
      if (filters.module && rec.module !== filters.module) continue;
      if (filters.errorCode && rec.errorCode !== filters.errorCode) continue;
      if (
        filters.fingerprint &&
        rec.fingerprint !== filters.fingerprint
      ) {
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
   */
  public listByFingerprint(
    filters: Omit<ErrorEventSearchFilters, "fingerprint" | "sort" | "limit" | "offset">,
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
    const list = this.transitionsByFingerprint.get(rec.fingerprint) ?? [];
    list.push(transition);
    this.transitionsByFingerprint.set(rec.fingerprint, list);
    this.byId.set(rec.id, rec);
    return { record: rec, transition };
  }

  /**
   * Bir fingerprint'in tüm status geçişlerini tarih sırasıyla
   * döner. Bulunamazsa boş liste.
   */
  public listTransitionsByFingerprint(
    fingerprint: string,
  ): ErrorEventStatusTransitionRecord[] {
    return [...(this.transitionsByFingerprint.get(fingerprint) ?? [])];
  }

  /**
   * Test yardımcısı. Tüm state'i temizler.
   */
  public clear(): void {
    this.byId.clear();
    this.byFingerprint.clear();
    this.transitionsByFingerprint.clear();
    this.counter.n = 0;
    this.transitionCounter.n = 0;
  }
}
