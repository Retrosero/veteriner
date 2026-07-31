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
 *   `occurrenceCount`'i artırır + `lastSeenAt` (occurredAt) ve
 *   `context` günceller; aksi halde yeni kayıt ekler.
 * - `fingerprint` repo tarafından hesaplanmaz; servis
 *   katmanında üretilir.
 *
 * @since GOAL-100 (FAZ-10) merkezi backend hata yakalama core
 */

import { Injectable } from "@nestjs/common";

import type { ErrorEventRecord } from "../../common/error-events/error-event.types.js";
import type {
  ErrorEventCountry,
  ErrorEventModule,
  ErrorEventActorType,
} from "@vetniva/contracts";
import type { ErrorCode, ErrorSeverity } from "@vetniva/contracts";

/** Arama filtreleri. */
export interface ErrorEventSearchFilters {
  severity?: ErrorSeverity | undefined;
  module?: ErrorEventModule | undefined;
  errorCode?: ErrorCode | undefined;
  fingerprint?: string | undefined;
  tenantId?: string | undefined;
  country?: ErrorEventCountry | undefined;
  route?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  search?: string | undefined;
  sort?: "asc" | "desc" | undefined;
  limit: number;
  offset: number;
}

@Injectable()
export class ErrorEventsRepository {
  /** key: id → error event. */
  private readonly byId = new Map<string, ErrorEventRecord>();
  /** fingerprint → id (sık karşılaşılan hataların hızlı tespiti). */
  private readonly byFingerprint = new Map<string, string>();
  /** Global id counter. */
  private readonly counter = { n: 0 };

  public nextId(): string {
    this.counter.n += 1;
    return `err-${String(this.counter.n).padStart(10, "0")}`;
  }

  /**
   * Yeni hata olayı ekler. Aynı `fingerprint` için mevcut kayıt
   * varsa `occurrenceCount` artırılır + occurredAt + context
   * güncellenir ve mevcut kayıt döner. Aksi halde yeni kayıt
   * oluşturulur.
   *
   * NOT: Bu metot, kayıt *insert/update* mantığını içerir. Sık
   * karşılaşılan hatalar (aynı fingerprint) tek bir satırda
   * toplanır; SUPERADMIN özet ekranı için idealdir.
   */
  public upsertByFingerprint(args: {
    fingerprint: string;
    record: Omit<ErrorEventRecord, "id" | "fingerprint" | "occurrenceCount">;
  }): ErrorEventRecord {
    const existingId = this.byFingerprint.get(args.fingerprint);
    if (existingId) {
      const existing = this.byId.get(existingId);
      if (existing) {
        existing.occurrenceCount += 1;
        existing.occurredAt = args.record.occurredAt;
        existing.requestId = args.record.requestId;
        existing.message = args.record.message;
        existing.statusCode = args.record.statusCode;
        existing.severity = args.record.severity;
        existing.userId = args.record.userId;
        existing.tenantId = args.record.tenantId;
        existing.branchId = args.record.branchId;
        existing.context = args.record.context;
        existing.stack = args.record.stack;
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
   * case-insensitive substring arar.
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
      if (filters.country && rec.country !== filters.country) continue;
      if (filters.route && !rec.route.startsWith(filters.route)) continue;
      if (filters.from && rec.occurredAt < filters.from) continue;
      if (filters.to && rec.occurredAt > filters.to) continue;
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
      const cmp = a.occurredAt.localeCompare(b.occurredAt);
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
      if (filters.country && rec.country !== filters.country) continue;
      if (filters.route && !rec.route.startsWith(filters.route)) continue;
      if (filters.from && rec.occurredAt < filters.from) continue;
      if (filters.to && rec.occurredAt > filters.to) continue;
      out.push(rec);
    }
    out.sort((a, b) => {
      if (b.occurrenceCount !== a.occurrenceCount) {
        return b.occurrenceCount - a.occurrenceCount;
      }
      return b.occurredAt.localeCompare(a.occurredAt);
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
   * Test yardımcısı. Tüm state'i temizler.
   */
  public clear(): void {
    this.byId.clear();
    this.byFingerprint.clear();
    this.counter.n = 0;
  }
}
