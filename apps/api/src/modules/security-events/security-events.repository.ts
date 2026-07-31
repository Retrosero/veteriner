/**
 * @file SecurityEvent repository (in-memory).
 * @module apps/api/modules/security-events/security-events.repository
 *
 * @description GOAL-105 (FAZ-10) güvenlik logları için in-memory
 * kayıt deposu. DB migration sonraya bırakıldı; production'a
 * geçişte Prisma `SecurityEvent` tablosu ile değiştirilecek
 * (API sözleşmesi sabit kalır).
 *
 * Davranış:
 * - `recordEvent` aynı `fingerprint` için mevcut kayıt varsa
 *   `occurrenceCount` artırılır + `lastSeenAt`/`occurredAt` ve
 *   `context` güncellenir; `firstSeenAt` ilk oluşturulduğunda
 *   sabitlenir. `alertSent` mevcut değer korunur.
 * - `fingerprint` repo tarafından hesaplanmaz; servis katmanında
 *   üretilir.
 *
 * Tenant izolasyonu YOKTUR (SUPERADMIN cross-tenant görür);
 * ancak tenant filtresi ile sorgulanabilir.
 *
 * @since GOAL-105 (FAZ-10) güvenlik logları ve alarm kuralları core
 */

import { Injectable } from "@nestjs/common";

import type { SecurityEventRecord } from "../../common/security-events/security-event.types.js";
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
export class SecurityEventsRepository {
  /** key: id → security event. */
  private readonly byId = new Map<string, SecurityEventRecord>();
  /** fingerprint → id (sık karşılaşılan saldırıların hızlı tespiti). */
  private readonly byFingerprint = new Map<string, string>();
  /** Global id counter. */
  private readonly counter = { n: 0 };

  public nextId(): string {
    this.counter.n += 1;
    return `sec-${String(this.counter.n).padStart(10, "0")}`;
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
      "id" | "fingerprint" | "occurrenceCount" | "firstSeenAt" | "lastSeenAt" | "alertSent"
    >;
    /** Mevcut kayıt yoksa default `alertSent=false`. */
    initialAlertSent?: boolean;
  }): SecurityEventRecord {
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
    this.byFingerprint.set(args.fingerprint, id);
    return rec;
  }

  public findById(id: string): SecurityEventRecord | null {
    return this.byId.get(id) ?? null;
  }

  public findByFingerprint(
    fingerprint: string,
  ): SecurityEventRecord | null {
    const id = this.byFingerprint.get(fingerprint);
    if (!id) return null;
    return this.byId.get(id) ?? null;
  }

  /**
   * Filtreli arama. SUPERADMIN paneli için tasarlandı; tenant
   * filtresi opsiyonel. `search` route + message alanlarında
   * case-insensitive substring arar. `from`/`to` `lastSeenAt`
   * üzerinde filtreler.
   */
  public search(
    filters: SecurityEventSearchFilters,
  ): { items: SecurityEventRecord[]; total: number } {
    const all: SecurityEventRecord[] = [];
    for (const rec of this.byId.values()) {
      if (filters.type && rec.type !== filters.type) continue;
      if (filters.severity && rec.severity !== filters.severity) continue;
      if (filters.module && rec.module !== filters.module) continue;
      if (
        filters.fingerprint &&
        rec.fingerprint !== filters.fingerprint
      ) {
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
  public markAlertSent(fingerprint: string): boolean {
    const id = this.byFingerprint.get(fingerprint);
    if (!id) return false;
    const rec = this.byId.get(id);
    if (!rec) return false;
    rec.alertSent = true;
    this.byId.set(id, rec);
    return true;
  }

  /**
   * Test yardımcısı. Tüm state'i temizler.
   */
  public clear(): void {
    this.byId.clear();
    this.byFingerprint.clear();
    this.counter.n = 0;
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
      this.byFingerprint.delete(rec.fingerprint);
    }
    return idsToDelete.length;
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
