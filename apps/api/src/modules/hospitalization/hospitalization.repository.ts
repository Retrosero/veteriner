/**
 * @file Hospitalization repository (in-memory).
 * @module apps/api/modules/hospitalization/hospitalization.repository
 *
 * @description GOAL-084 yatış + kafes veri erişim katmanı. DB
 * migration sonraya bırakıldı; tenant-scoped in-memory Map
 * kullanılır. 3 varlık tipi (cage, hospitalization, cageAssignment)
 * ayrı Map'lerde tutulur.
 *
 * CageAssignment çakışma kontrolü: `findOverlappingAssignment`
 * aynı cageId için [from, to] aralığı çakışan aktif kayıt
 * döner (to=null olanlar "devam eden" sayılır).
 *
 * @security Tüm sorgular tenantId ile filtrelenir; cross-tenant
 *   erişim null döner.
 *
 * @since GOAL-084 (FAZ-8) yatış ve kafes yönetimi core
 */

import { Injectable, Optional } from "@nestjs/common";
import type {
  CageAssignmentRecord as DbAssignment,
  CageRecord as DbCage,
  HospitalizationRecord as DbHospitalization,
  Prisma,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service.js";

import type {
  CageAssignmentRecord,
  CageRecord,
  HospitalizationRecord,
} from "../../common/hospitalization/hospitalization.types.js";
import type { CageKind, HospitalizationStatus } from "@vetniva/contracts";

/* --------------------------------------------------------------------------
 * Patch tipleri
 * --------------------------------------------------------------------------
 */

export interface CagePatch {
  name?: string | null | undefined;
  kind?: CageKind | undefined;
  capacity?: number | undefined;
  active?: boolean | undefined;
  notes?: string | null | undefined;
  updatedAt?: string | undefined;
}

export interface HospitalizationPatch {
  plannedAt?: string | null | undefined;
  admittedAt?: string | null | undefined;
  admittedBy?: string | null | undefined;
  dischargedAt?: string | null | undefined;
  dischargedBy?: string | null | undefined;
  cancelReason?: string | null | undefined;
  reason?: string | null | undefined;
  notes?: string | null | undefined;
  status?: HospitalizationStatus | undefined;
  updatedAt?: string | undefined;
}

export interface CageAssignmentPatch {
  to?: string | null | undefined;
  endedBy?: string | null | undefined;
}

/* --------------------------------------------------------------------------
 * Arama filtreleri
 * --------------------------------------------------------------------------
 */

export interface HospitalizationSearchFilters {
  status?: HospitalizationStatus | undefined;
  patientId?: string | undefined;
  activeOnly?: boolean | undefined;
  sort?: "asc" | "desc" | undefined;
  limit: number;
  offset: number;
}

export interface CageSearchFilters {
  kind?: CageKind | undefined;
  active?: boolean | undefined;
  sort?: "asc" | "desc" | undefined;
  limit: number;
  offset: number;
}

@Injectable()
export class HospitalizationRepository {
  // -------------------------------------------------------------------------
  // Counter'lar
  // -------------------------------------------------------------------------

  private readonly counters = new Map<string, number>();
  public constructor(@Optional() private readonly prisma?: PrismaService) {}

  public nextId(tenantId: string, prefix: string): string {
    if (this.prisma) return `${prefix}-${tenantId.slice(0, 8)}-${randomUUID()}`;
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `${prefix}-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  // -------------------------------------------------------------------------
  // Cage
  // -------------------------------------------------------------------------

  private readonly cages = new Map<string, CageRecord>();
  private readonly cageByCode = new Map<string, string>(); // `${tenantId}::${code}` → id

  public insertCage(rec: CageRecord): CageRecord {
    this.cages.set(rec.id, rec);
    this.cageByCode.set(`${rec.tenantId}::${rec.code}`, rec.id);
    return rec;
  }
  public async persistCage(rec: CageRecord): Promise<CageRecord> {
    if (!this.prisma) return this.insertCage(rec);
    const row = await this.inTenant(rec.tenantId, (tx) =>
      tx.cageRecord.create({
        data: {
          ...rec,
          createdAt: new Date(rec.createdAt),
          updatedAt: new Date(rec.updatedAt),
        },
      }),
    );
    return this.mapCage(row);
  }
  public async persistedCageById(
    tenantId: string,
    id: string,
  ): Promise<CageRecord | null> {
    if (!this.prisma) return this.findCageById(tenantId, id);
    const row = await this.inTenant(tenantId, (tx) =>
      tx.cageRecord.findFirst({ where: { tenantId, id } }),
    );
    return row ? this.mapCage(row) : null;
  }
  public async persistedCageByCode(
    tenantId: string,
    code: string,
  ): Promise<CageRecord | null> {
    if (!this.prisma) return this.findCageByCode(tenantId, code);
    const row = await this.inTenant(tenantId, (tx) =>
      tx.cageRecord.findFirst({ where: { tenantId, code } }),
    );
    return row ? this.mapCage(row) : null;
  }
  public async persistedSearchCages(
    tenantId: string,
    f: CageSearchFilters,
  ): Promise<{ items: CageRecord[]; total: number }> {
    if (!this.prisma) return this.searchCages(tenantId, f);
    const where: Prisma.CageRecordWhereInput = {
      tenantId,
      ...(f.kind ? { kind: f.kind } : {}),
      ...(f.active !== undefined ? { active: f.active } : {}),
    };
    return this.inTenant(tenantId, async (tx) => {
      const [items, total] = await Promise.all([
        tx.cageRecord.findMany({
          where,
          orderBy: { code: f.sort ?? "asc" },
          skip: f.offset,
          take: f.limit,
        }),
        tx.cageRecord.count({ where }),
      ]);
      return { items: items.map((row) => this.mapCage(row)), total };
    });
  }
  public async persistedUpdateCage(
    tenantId: string,
    id: string,
    p: CagePatch,
  ): Promise<CageRecord | null> {
    if (!this.prisma) return this.updateCage(tenantId, id, p);
    const data: Prisma.CageRecordUpdateManyMutationInput = {
      ...(p.name !== undefined ? { name: p.name } : {}),
      ...(p.kind !== undefined ? { kind: p.kind } : {}),
      ...(p.capacity !== undefined ? { capacity: p.capacity } : {}),
      ...(p.active !== undefined ? { active: p.active } : {}),
      ...(p.notes !== undefined ? { notes: p.notes } : {}),
      ...(p.updatedAt !== undefined
        ? { updatedAt: new Date(p.updatedAt) }
        : {}),
    };
    const out = await this.inTenant(tenantId, (tx) =>
      tx.cageRecord.updateMany({ where: { tenantId, id }, data }),
    );
    return out.count ? this.persistedCageById(tenantId, id) : null;
  }

  public findCageById(tenantId: string, id: string): CageRecord | null {
    const rec = this.cages.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public findCageByCode(tenantId: string, code: string): CageRecord | null {
    const id = this.cageByCode.get(`${tenantId}::${code}`);
    if (!id) return null;
    return this.findCageById(tenantId, id);
  }

  public updateCage(
    tenantId: string,
    id: string,
    patch: CagePatch,
  ): CageRecord | null {
    const rec = this.findCageById(tenantId, id);
    if (!rec) return null;
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) {
        (rec as unknown as Record<string, unknown>)[k] = v;
      }
    }
    this.cages.set(id, rec);
    return rec;
  }

  public searchCages(
    tenantId: string,
    filters: CageSearchFilters,
  ): { items: CageRecord[]; total: number } {
    const all: CageRecord[] = [];
    for (const rec of this.cages.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (filters.kind && rec.kind !== filters.kind) continue;
      if (filters.active !== undefined && rec.active !== filters.active)
        continue;
      all.push(rec);
    }
    const sort = filters.sort ?? "asc";
    all.sort((a, b) => {
      const cmp = a.code.localeCompare(b.code);
      return sort === "desc" ? -cmp : cmp;
    });
    const total = all.length;
    const items = all.slice(filters.offset, filters.offset + filters.limit);
    return { items, total };
  }

  // -------------------------------------------------------------------------
  // Hospitalization
  // -------------------------------------------------------------------------

  private readonly hospitalizations = new Map<string, HospitalizationRecord>();
  /** patientId → active hospitalizationId (status in
   * {planned, admitted, active}). Tenant-scoped key. */
  private readonly activeByPatient = new Map<string, string>();

  public insertHospitalization(
    rec: HospitalizationRecord,
  ): HospitalizationRecord {
    this.hospitalizations.set(rec.id, rec);
    if (
      rec.status === "planned" ||
      rec.status === "admitted" ||
      rec.status === "active"
    ) {
      this.activeByPatient.set(`${rec.tenantId}::${rec.patientId}`, rec.id);
    }
    return rec;
  }
  public async persistHospitalization(
    rec: HospitalizationRecord,
  ): Promise<HospitalizationRecord> {
    if (!this.prisma) return this.insertHospitalization(rec);
    const row = await this.inTenant(rec.tenantId, (tx) =>
      tx.hospitalizationRecord.create({
        data: {
          ...rec,
          plannedAt: rec.plannedAt ? new Date(rec.plannedAt) : null,
          admittedAt: rec.admittedAt ? new Date(rec.admittedAt) : null,
          dischargedAt: rec.dischargedAt ? new Date(rec.dischargedAt) : null,
          createdAt: new Date(rec.createdAt),
          updatedAt: new Date(rec.updatedAt),
        },
      }),
    );
    return this.mapHospitalization(row);
  }
  public async persistedHospitalizationById(
    tenantId: string,
    id: string,
  ): Promise<HospitalizationRecord | null> {
    if (!this.prisma) return this.findHospitalizationById(tenantId, id);
    const row = await this.inTenant(tenantId, (tx) =>
      tx.hospitalizationRecord.findFirst({ where: { tenantId, id } }),
    );
    return row ? this.mapHospitalization(row) : null;
  }
  public async persistedActiveByPatient(
    tenantId: string,
    patientId: string,
  ): Promise<HospitalizationRecord | null> {
    if (!this.prisma) return this.findActiveByPatient(tenantId, patientId);
    const row = await this.inTenant(tenantId, (tx) =>
      tx.hospitalizationRecord.findFirst({
        where: {
          tenantId,
          patientId,
          status: { in: ["planned", "admitted", "active"] },
        },
        orderBy: { createdAt: "desc" },
      }),
    );
    return row ? this.mapHospitalization(row) : null;
  }
  public async persistedUpdateHospitalization(
    tenantId: string,
    id: string,
    p: HospitalizationPatch,
  ): Promise<HospitalizationRecord | null> {
    if (!this.prisma) return this.updateHospitalization(tenantId, id, p);
    const data: Prisma.HospitalizationRecordUpdateManyMutationInput = {
      ...(p.plannedAt !== undefined
        ? { plannedAt: p.plannedAt ? new Date(p.plannedAt) : null }
        : {}),
      ...(p.admittedAt !== undefined
        ? { admittedAt: p.admittedAt ? new Date(p.admittedAt) : null }
        : {}),
      ...(p.admittedBy !== undefined ? { admittedBy: p.admittedBy } : {}),
      ...(p.dischargedAt !== undefined
        ? { dischargedAt: p.dischargedAt ? new Date(p.dischargedAt) : null }
        : {}),
      ...(p.dischargedBy !== undefined ? { dischargedBy: p.dischargedBy } : {}),
      ...(p.cancelReason !== undefined ? { cancelReason: p.cancelReason } : {}),
      ...(p.reason !== undefined ? { reason: p.reason } : {}),
      ...(p.notes !== undefined ? { notes: p.notes } : {}),
      ...(p.status !== undefined ? { status: p.status } : {}),
      ...(p.updatedAt !== undefined
        ? { updatedAt: new Date(p.updatedAt) }
        : {}),
    };
    const r = await this.inTenant(tenantId, (tx) =>
      tx.hospitalizationRecord.updateMany({ where: { tenantId, id }, data }),
    );
    return r.count ? this.persistedHospitalizationById(tenantId, id) : null;
  }

  public findHospitalizationById(
    tenantId: string,
    id: string,
  ): HospitalizationRecord | null {
    const rec = this.hospitalizations.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public findActiveByPatient(
    tenantId: string,
    patientId: string,
  ): HospitalizationRecord | null {
    const id = this.activeByPatient.get(`${tenantId}::${patientId}`);
    if (!id) return null;
    return this.findHospitalizationById(tenantId, id);
  }

  public updateHospitalization(
    tenantId: string,
    id: string,
    patch: HospitalizationPatch,
  ): HospitalizationRecord | null {
    const rec = this.findHospitalizationById(tenantId, id);
    if (!rec) return null;
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) {
        (rec as unknown as Record<string, unknown>)[k] = v;
      }
    }
    // Active index güncelle.
    const key = `${rec.tenantId}::${rec.patientId}`;
    if (
      rec.status === "planned" ||
      rec.status === "admitted" ||
      rec.status === "active"
    ) {
      this.activeByPatient.set(key, rec.id);
    } else {
      // discharged veya cancelled → indexten çıkar.
      const cur = this.activeByPatient.get(key);
      if (cur === rec.id) this.activeByPatient.delete(key);
    }
    this.hospitalizations.set(id, rec);
    return rec;
  }

  public searchHospitalizations(
    tenantId: string,
    filters: HospitalizationSearchFilters,
  ): { items: HospitalizationRecord[]; total: number } {
    const all: HospitalizationRecord[] = [];
    for (const rec of this.hospitalizations.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (filters.status && rec.status !== filters.status) continue;
      if (filters.patientId && rec.patientId !== filters.patientId) continue;
      if (filters.activeOnly) {
        if (
          rec.status !== "planned" &&
          rec.status !== "admitted" &&
          rec.status !== "active"
        ) {
          continue;
        }
      }
      all.push(rec);
    }
    const sort = filters.sort ?? "desc";
    all.sort((a, b) => {
      const cmp = a.createdAt.localeCompare(b.createdAt);
      return sort === "desc" ? -cmp : cmp;
    });
    const total = all.length;
    const items = all.slice(filters.offset, filters.offset + filters.limit);
    return { items, total };
  }

  // -------------------------------------------------------------------------
  // CageAssignment
  // -------------------------------------------------------------------------

  private readonly cageAssignments = new Map<string, CageAssignmentRecord>();

  public insertCageAssignment(rec: CageAssignmentRecord): CageAssignmentRecord {
    this.cageAssignments.set(rec.id, rec);
    return rec;
  }
  public async persistCageAssignment(
    rec: CageAssignmentRecord,
  ): Promise<CageAssignmentRecord> {
    if (!this.prisma) return this.insertCageAssignment(rec);
    const row = await this.inTenant(rec.tenantId, (tx) =>
      tx.cageAssignmentRecord.create({
        data: {
          ...rec,
          from: new Date(rec.from),
          to: rec.to ? new Date(rec.to) : null,
          createdAt: new Date(rec.createdAt),
        },
      }),
    );
    return this.mapAssignment(row);
  }
  public async persistedAssignmentById(
    tenantId: string,
    id: string,
  ): Promise<CageAssignmentRecord | null> {
    if (!this.prisma) return this.findCageAssignmentById(tenantId, id);
    const row = await this.inTenant(tenantId, (tx) =>
      tx.cageAssignmentRecord.findFirst({ where: { tenantId, id } }),
    );
    return row ? this.mapAssignment(row) : null;
  }
  public async persistedAssignments(
    tenantId: string,
    hospitalizationId: string,
  ): Promise<CageAssignmentRecord[]> {
    if (!this.prisma)
      return this.listCageAssignments(tenantId, hospitalizationId);
    const rows = await this.inTenant(tenantId, (tx) =>
      tx.cageAssignmentRecord.findMany({
        where: { tenantId, hospitalizationId },
        orderBy: { from: "asc" },
      }),
    );
    return rows.map((row) => this.mapAssignment(row));
  }
  public async persistedUpdateAssignment(
    tenantId: string,
    id: string,
    p: CageAssignmentPatch,
  ): Promise<CageAssignmentRecord | null> {
    if (!this.prisma) return this.updateCageAssignment(tenantId, id, p);
    const data: Prisma.CageAssignmentRecordUpdateManyMutationInput = {
      ...(p.to !== undefined ? { to: p.to ? new Date(p.to) : null } : {}),
      ...(p.endedBy !== undefined ? { endedBy: p.endedBy } : {}),
    };
    const r = await this.inTenant(tenantId, (tx) =>
      tx.cageAssignmentRecord.updateMany({ where: { tenantId, id }, data }),
    );
    return r.count ? this.persistedAssignmentById(tenantId, id) : null;
  }
  public async persistedOverlappingAssignment(
    tenantId: string,
    cageId: string,
    from: string,
    to: string | null,
    excludeAssignmentId: string | null,
  ): Promise<CageAssignmentRecord | null> {
    if (!this.prisma)
      return this.findOverlappingAssignment(
        tenantId,
        cageId,
        from,
        to,
        excludeAssignmentId,
      );
    const rows = await this.inTenant(tenantId, (tx) =>
      tx.cageAssignmentRecord.findMany({
        where: {
          tenantId,
          cageId,
          ...(excludeAssignmentId ? { id: { not: excludeAssignmentId } } : {}),
        },
      }),
    );
    const start = new Date(from).getTime(),
      end = new Date(to ?? "9999-12-31T23:59:59.999Z").getTime();
    const hit = rows.find(
      (row) =>
        start <= (row.to ?? new Date("9999-12-31T23:59:59.999Z")).getTime() &&
        end >= row.from.getTime(),
    );
    return hit ? this.mapAssignment(hit) : null;
  }

  public findCageAssignmentById(
    tenantId: string,
    id: string,
  ): CageAssignmentRecord | null {
    const rec = this.cageAssignments.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public updateCageAssignment(
    tenantId: string,
    id: string,
    patch: CageAssignmentPatch,
  ): CageAssignmentRecord | null {
    const rec = this.findCageAssignmentById(tenantId, id);
    if (!rec) return null;
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) {
        (rec as unknown as Record<string, unknown>)[k] = v;
      }
    }
    this.cageAssignments.set(id, rec);
    return rec;
  }

  public listCageAssignments(
    tenantId: string,
    hospitalizationId: string,
  ): CageAssignmentRecord[] {
    const out: CageAssignmentRecord[] = [];
    for (const rec of this.cageAssignments.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.hospitalizationId !== hospitalizationId) continue;
      out.push(rec);
    }
    out.sort((a, b) => a.from.localeCompare(b.from));
    return out;
  }

  /**
   * Aynı `cageId` için `excludeAssignmentId` dışında, yeni
   * atama `[from, to]` aralığıyla çakışan aktif (to=null veya
   * tarih aralığı kesişen) kayıtları döner.
   *
   * Çakışma: mevcut kaydın (e.from <= new.to) VE
   *           (e.to == null VEYA e.to >= new.from).
   * to=null olan kayıt "açık" sayılır (devam eden atama).
   */
  public findOverlappingAssignment(
    tenantId: string,
    cageId: string,
    from: string,
    to: string | null,
    excludeAssignmentId: string | null,
  ): CageAssignmentRecord | null {
    for (const rec of this.cageAssignments.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.cageId !== cageId) continue;
      if (excludeAssignmentId && rec.id === excludeAssignmentId) continue;
      const eFrom = rec.from;
      const eTo = rec.to;
      // yeni interval [from, to], mevcut [eFrom, eTo]
      // overlap: from <= eTo AND to >= eFrom (to=null → açık)
      const eToResolved = eTo ?? "9999-12-31T23:59:59.999Z";
      if (from <= eToResolved && (to ?? "9999-12-31T23:59:59.999Z") >= eFrom) {
        return rec;
      }
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Test yardımcıları
  // -------------------------------------------------------------------------

  public clear(): void {
    this.counters.clear();
    this.cages.clear();
    this.cageByCode.clear();
    this.hospitalizations.clear();
    this.activeByPatient.clear();
    this.cageAssignments.clear();
  }
  private mapCage(row: DbCage): CageRecord {
    return {
      ...row,
      kind: row.kind as CageKind,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
  private mapHospitalization(row: DbHospitalization): HospitalizationRecord {
    return {
      ...row,
      status: row.status as HospitalizationStatus,
      plannedAt: row.plannedAt?.toISOString() ?? null,
      admittedAt: row.admittedAt?.toISOString() ?? null,
      dischargedAt: row.dischargedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
  private mapAssignment(row: DbAssignment): CageAssignmentRecord {
    return {
      ...row,
      from: row.from.toISOString(),
      to: row.to?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
  private async inTenant<T>(
    tenantId: string,
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (!this.prisma) throw new Error("Prisma bağlantısı bulunamadı");
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superadmin','false',true)`;
      await tx.$executeRaw`SELECT set_config('app.tenant_id',${tenantId},true)`;
      return callback(tx);
    });
  }
}
