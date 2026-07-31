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
 * GOAL-104 ile birlikte eklenen yapı:
 * - Çözüm notları: `notesByFingerprint` Map'i (append-only).
 * - Destek bağlantıları: `supportLinksByFingerprint` Map'i.
 * - Atama geçmişi: `assignmentsByFingerprint` Map'i
 *   (assignee + unassign aksiyonları ayrı kayıt).
 * - Yardımcı metotlar: `addNote`, `listNotes`, `addSupportLink`,
 *   `listSupportLinks`, `addAssignment`, `listAssignments`.
 *
 * @since GOAL-100 (FAZ-10) merkezi backend hata yakalama core
 * @updated GOAL-104 (FAZ-10) hata atama ve çözüm notları core
 */

import { Injectable } from "@nestjs/common";

import type {
  ErrorEventAssignmentRecordInternal,
  ErrorEventNoteRecord,
  ErrorEventNoteVisibility,
  ErrorEventRecord,
  ErrorEventStatusTransitionRecord,
  ErrorEventSupportLinkRecord,
} from "../../common/error-events/error-event.types.js";
import { UNASSIGNED } from "../../common/error-events/error-event.types.js";
import type {
  ErrorEventCountry,
  ErrorEventModule,
  ErrorEventActorType,
  ErrorEventStatus,
  ErrorEventSupportSystem,
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
  /** fingerprint → çözüm notu listesi (append-only — GOAL-104). */
  private readonly notesByFingerprint = new Map<
    string,
    ErrorEventNoteRecord[]
  >();
  /** fingerprint → destek bağlantısı listesi (GOAL-104). */
  private readonly supportLinksByFingerprint = new Map<
    string,
    ErrorEventSupportLinkRecord[]
  >();
  /** fingerprint → atama geçmişi (append-only — GOAL-104). */
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

  public nextId(): string {
    this.counter.n += 1;
    return `err-${String(this.counter.n).padStart(10, "0")}`;
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

  /* ------------------------------------------------------------------------
   * Çözüm notu — GOAL-104
   * ------------------------------------------------------------------------
   */

  /**
   * Yeni çözüm notu ekler. Append-only; mevcut notlar etkilenmez.
   * Sıralama: createdAt artan. UI tarafı desc ile gösterir.
   */
  public addNote(input: ErrorEventNoteCreate): ErrorEventNoteRecord {
    const rec: ErrorEventNoteRecord = {
      id: this.nextNoteId(),
      fingerprint: input.fingerprint,
      authorId: input.authorId,
      authorType: input.authorType,
      body: input.body,
      visibility: input.visibility,
      createdAt: new Date().toISOString(),
    };
    const list = this.notesByFingerprint.get(input.fingerprint) ?? [];
    list.push(rec);
    this.notesByFingerprint.set(input.fingerprint, list);
    return rec;
  }

  /** Bir fingerprint'in tüm notlarını createdAt artan sırada döner. */
  public listNotesByFingerprint(
    fingerprint: string,
  ): ErrorEventNoteRecord[] {
    return [...(this.notesByFingerprint.get(fingerprint) ?? [])];
  }

  /** Tek bir notu id üzerinden döner (test/düzeltme için). */
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

  /** Yeni destek bağlantısı ekler. */
  public addSupportLink(
    input: ErrorEventSupportLinkCreate,
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
    const list = this.supportLinksByFingerprint.get(input.fingerprint) ?? [];
    list.push(rec);
    this.supportLinksByFingerprint.set(input.fingerprint, list);
    return rec;
  }

  /** Bir fingerprint'in tüm destek bağlantılarını döner. */
  public listSupportLinksByFingerprint(
    fingerprint: string,
  ): ErrorEventSupportLinkRecord[] {
    return [...(this.supportLinksByFingerprint.get(fingerprint) ?? [])];
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
   */
  public addAssignment(
    input: ErrorEventAssignmentCreate,
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
    const list = this.assignmentsByFingerprint.get(input.fingerprint) ?? [];
    list.push(rec);
    this.assignmentsByFingerprint.set(input.fingerprint, list);

    // İlgili ErrorEvent'in assignedToUserId alanını güncelle.
    const eventId = this.byFingerprint.get(input.fingerprint);
    if (eventId) {
      const ev = this.byId.get(eventId);
      if (ev) {
        ev.assignedToUserId =
          input.assigneeId === UNASSIGNED ? null : input.assigneeId;
        this.byId.set(eventId, ev);
      }
    }
    return rec;
  }

  /** Bir fingerprint'in tüm atama geçmişini assignedAt artan sırada döner. */
  public listAssignmentsByFingerprint(
    fingerprint: string,
  ): ErrorEventAssignmentRecordInternal[] {
    return [...(this.assignmentsByFingerprint.get(fingerprint) ?? [])];
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
}
