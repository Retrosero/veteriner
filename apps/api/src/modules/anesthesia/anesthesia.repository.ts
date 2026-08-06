/**
 * @file Anesthesia repository (in-memory).
 * @module apps/api/modules/anesthesia/anesthesia.repository
 *
 * @description GOAL-082 anestezi takip veri erişim katmanı.
 * DB migration sonraya bırakıldı; tenant-scoped in-memory Map
 * kullanılır. Anesthesia + 4 alt kayıt tipi (medication, vital,
 * complication, staff) ayrı Map'lerde tutulur.
 *
 * @security Tüm sorgular tenantId ile filtrelenir; cross-tenant
 *   erişim null döner.
 *
 * @since GOAL-082 (FAZ-8) anestezi takip core
 */

import { randomUUID } from "node:crypto";

import { Injectable, Optional } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service.js";

import type {
  AnesthesiaComplicationRecord,
  AnesthesiaMedicationRecord,
  AnesthesiaRecord,
  AnesthesiaStaffRecord,
  AnesthesiaVitalRecord,
} from "../../common/anesthesia/anesthesia.types.js";
import type {
  AnesthesiaComplicationRecord as DbComplication,
  AnesthesiaMedicationRecord as DbMedication,
  AnesthesiaRecord as DbAnesthesia,
  AnesthesiaStaffRecord as DbStaff,
  AnesthesiaVitalRecord as DbVital,
  Prisma,
} from "@prisma/client";
import type { AnesthesiaStatus } from "@vetniva/contracts";

/** Patch tipi (kısmi güncelleme). */
export interface AnesthesiaPatch {
  protocol?: string | undefined;
  protocolNotes?: string | null | undefined;
  status?: AnesthesiaStatus | undefined;
  inductionAt?: string | null | undefined;
  recoveryAt?: string | null | undefined;
  finalizedAt?: string | null | undefined;
  finalizedBy?: string | null | undefined;
  notes?: string | null | undefined;
  updatedAt?: string | undefined;
}

/** Arama filtreleri. */
export interface AnesthesiaSearchFilters {
  status?: AnesthesiaStatus | undefined;
  patientId?: string | undefined;
  surgeryPlanId?: string | undefined;
  sort?: "asc" | "desc" | undefined;
  limit: number;
  offset: number;
}

@Injectable()
export class AnesthesiaRepository {
  public constructor(@Optional() private readonly prisma?: PrismaService) {}
  /** key: id → anesthesia. */
  private readonly byId = new Map<string, AnesthesiaRecord>();
  /** surgeryPlanId → anesthesiaId (uniq). */
  private readonly bySurgeryPlanId = new Map<string, string>();
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();
  /** Her tenant için sub-record id counter. */
  private readonly subCounters = new Map<string, number>();

  /** Alt kayıtlar. */
  private readonly medications = new Map<string, AnesthesiaMedicationRecord>();
  private readonly vitals = new Map<string, AnesthesiaVitalRecord>();
  private readonly complications = new Map<
    string,
    AnesthesiaComplicationRecord
  >();
  private readonly staff = new Map<string, AnesthesiaStaffRecord>();

  // -------------------------------------------------------------------------
  // ID
  // -------------------------------------------------------------------------

  public nextId(tenantId: string): string {
    if (this.prisma) return randomUUID();
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `an-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  public nextSubId(tenantId: string, prefix: string): string {
    if (this.prisma) return randomUUID();
    const n = (this.subCounters.get(tenantId) ?? 0) + 1;
    this.subCounters.set(tenantId, n);
    return `${prefix}-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  // -------------------------------------------------------------------------
  // Anesthesia CRUD
  // -------------------------------------------------------------------------

  public insert(record: AnesthesiaRecord): AnesthesiaRecord {
    this.byId.set(record.id, record);
    this.bySurgeryPlanId.set(record.surgeryPlanId, record.id);
    return record;
  }

  public findById(tenantId: string, id: string): AnesthesiaRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  public findBySurgeryPlanId(
    tenantId: string,
    surgeryPlanId: string,
  ): AnesthesiaRecord | null {
    const id = this.bySurgeryPlanId.get(surgeryPlanId);
    if (!id) return null;
    return this.findById(tenantId, id);
  }

  public update(
    tenantId: string,
    id: string,
    patch: AnesthesiaPatch,
  ): AnesthesiaRecord | null {
    const rec = this.findById(tenantId, id);
    if (!rec) return null;
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) {
        (rec as unknown as Record<string, unknown>)[k] = v;
      }
    }
    this.byId.set(id, rec);
    return rec;
  }

  public search(
    tenantId: string,
    filters: AnesthesiaSearchFilters,
  ): { items: AnesthesiaRecord[]; total: number } {
    const all: AnesthesiaRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (filters.status && rec.status !== filters.status) continue;
      if (filters.patientId && rec.patientId !== filters.patientId) continue;
      if (filters.surgeryPlanId && rec.surgeryPlanId !== filters.surgeryPlanId)
        continue;
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
  // Medications
  // -------------------------------------------------------------------------

  public insertMedication(
    rec: AnesthesiaMedicationRecord,
  ): AnesthesiaMedicationRecord {
    this.medications.set(rec.id, rec);
    return rec;
  }

  public listMedications(
    tenantId: string,
    anesthesiaId: string,
  ): AnesthesiaMedicationRecord[] {
    const out: AnesthesiaMedicationRecord[] = [];
    for (const rec of this.medications.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.anesthesiaId !== anesthesiaId) continue;
      out.push(rec);
    }
    out.sort((a, b) => a.administeredAt.localeCompare(b.administeredAt));
    return out;
  }

  // -------------------------------------------------------------------------
  // Vitals
  // -------------------------------------------------------------------------

  public insertVital(rec: AnesthesiaVitalRecord): AnesthesiaVitalRecord {
    this.vitals.set(rec.id, rec);
    return rec;
  }

  public listVitals(
    tenantId: string,
    anesthesiaId: string,
  ): AnesthesiaVitalRecord[] {
    const out: AnesthesiaVitalRecord[] = [];
    for (const rec of this.vitals.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.anesthesiaId !== anesthesiaId) continue;
      out.push(rec);
    }
    out.sort((a, b) => a.observedAt.localeCompare(b.observedAt));
    return out;
  }

  // -------------------------------------------------------------------------
  // Complications
  // -------------------------------------------------------------------------

  public insertComplication(
    rec: AnesthesiaComplicationRecord,
  ): AnesthesiaComplicationRecord {
    this.complications.set(rec.id, rec);
    return rec;
  }

  public listComplications(
    tenantId: string,
    anesthesiaId: string,
  ): AnesthesiaComplicationRecord[] {
    const out: AnesthesiaComplicationRecord[] = [];
    for (const rec of this.complications.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.anesthesiaId !== anesthesiaId) continue;
      out.push(rec);
    }
    out.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    return out;
  }

  // -------------------------------------------------------------------------
  // Staff
  // -------------------------------------------------------------------------

  public insertStaff(rec: AnesthesiaStaffRecord): AnesthesiaStaffRecord {
    this.staff.set(rec.id, rec);
    return rec;
  }

  public listStaff(
    tenantId: string,
    anesthesiaId: string,
  ): AnesthesiaStaffRecord[] {
    const out: AnesthesiaStaffRecord[] = [];
    for (const rec of this.staff.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (rec.anesthesiaId !== anesthesiaId) continue;
      out.push(rec);
    }
    out.sort((a, b) => a.assignedAt.localeCompare(b.assignedAt));
    return out;
  }

  // -------------------------------------------------------------------------
  // Prisma kalıcı erişim — Prisma yokken birim test Map'i korunur.
  // -------------------------------------------------------------------------

  public async persist(record: AnesthesiaRecord): Promise<AnesthesiaRecord> {
    if (!this.prisma) return this.insert(record);
    const row = await this.inTenant(record.tenantId, (tx) =>
      tx.anesthesiaRecord.create({ data: anesthesiaData(record) }),
    );
    return mapAnesthesia(row);
  }

  public async persistedById(
    tenantId: string,
    id: string,
  ): Promise<AnesthesiaRecord | null> {
    if (!this.prisma) return this.findById(tenantId, id);
    const row = await this.inTenant(tenantId, (tx) =>
      tx.anesthesiaRecord.findFirst({ where: { tenantId, id } }),
    );
    return row ? mapAnesthesia(row) : null;
  }

  public async persistedBySurgeryPlanId(
    tenantId: string,
    surgeryPlanId: string,
  ): Promise<AnesthesiaRecord | null> {
    if (!this.prisma) return this.findBySurgeryPlanId(tenantId, surgeryPlanId);
    const row = await this.inTenant(tenantId, (tx) =>
      tx.anesthesiaRecord.findFirst({ where: { tenantId, surgeryPlanId } }),
    );
    return row ? mapAnesthesia(row) : null;
  }

  public async persistedUpdate(
    tenantId: string,
    id: string,
    patch: AnesthesiaPatch,
  ): Promise<AnesthesiaRecord | null> {
    if (!this.prisma) return this.update(tenantId, id, patch);
    const data: Prisma.AnesthesiaRecordUpdateManyMutationInput = {
      ...(patch.protocol !== undefined ? { protocol: patch.protocol } : {}),
      ...(patch.protocolNotes !== undefined
        ? { protocolNotes: patch.protocolNotes }
        : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.inductionAt !== undefined
        ? { inductionAt: dateOrNull(patch.inductionAt) }
        : {}),
      ...(patch.recoveryAt !== undefined
        ? { recoveryAt: dateOrNull(patch.recoveryAt) }
        : {}),
      ...(patch.finalizedAt !== undefined
        ? { finalizedAt: dateOrNull(patch.finalizedAt) }
        : {}),
      ...(patch.finalizedBy !== undefined
        ? { finalizedBy: patch.finalizedBy }
        : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.updatedAt !== undefined
        ? { updatedAt: new Date(patch.updatedAt) }
        : {}),
    };
    const updated = await this.inTenant(tenantId, (tx) =>
      tx.anesthesiaRecord.updateMany({ where: { tenantId, id }, data }),
    );
    return updated.count ? this.persistedById(tenantId, id) : null;
  }

  public async persistedSearch(
    tenantId: string,
    filters: AnesthesiaSearchFilters,
  ): Promise<{ items: AnesthesiaRecord[]; total: number }> {
    if (!this.prisma) return this.search(tenantId, filters);
    const where: Prisma.AnesthesiaRecordWhereInput = {
      tenantId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.patientId ? { patientId: filters.patientId } : {}),
      ...(filters.surgeryPlanId
        ? { surgeryPlanId: filters.surgeryPlanId }
        : {}),
    };
    return this.inTenant(tenantId, async (tx) => {
      const [items, total] = await Promise.all([
        tx.anesthesiaRecord.findMany({
          where,
          orderBy: { createdAt: filters.sort ?? "desc" },
          skip: filters.offset,
          take: filters.limit,
        }),
        tx.anesthesiaRecord.count({ where }),
      ]);
      return { items: items.map(mapAnesthesia), total };
    });
  }

  public async persistMedication(
    record: AnesthesiaMedicationRecord,
  ): Promise<AnesthesiaMedicationRecord> {
    if (!this.prisma) return this.insertMedication(record);
    const row = await this.inTenant(record.tenantId, (tx) =>
      tx.anesthesiaMedicationRecord.create({ data: medicationData(record) }),
    );
    return mapMedication(row);
  }
  public async persistedMedications(
    tenantId: string,
    anesthesiaId: string,
  ): Promise<AnesthesiaMedicationRecord[]> {
    if (!this.prisma) return this.listMedications(tenantId, anesthesiaId);
    const rows = await this.inTenant(tenantId, (tx) =>
      tx.anesthesiaMedicationRecord.findMany({
        where: { tenantId, anesthesiaId },
        orderBy: { administeredAt: "asc" },
      }),
    );
    return rows.map(mapMedication);
  }
  public async persistVital(
    record: AnesthesiaVitalRecord,
  ): Promise<AnesthesiaVitalRecord> {
    if (!this.prisma) return this.insertVital(record);
    const row = await this.inTenant(record.tenantId, (tx) =>
      tx.anesthesiaVitalRecord.create({ data: vitalData(record) }),
    );
    return mapVital(row);
  }
  public async persistedVitals(
    tenantId: string,
    anesthesiaId: string,
  ): Promise<AnesthesiaVitalRecord[]> {
    if (!this.prisma) return this.listVitals(tenantId, anesthesiaId);
    const rows = await this.inTenant(tenantId, (tx) =>
      tx.anesthesiaVitalRecord.findMany({
        where: { tenantId, anesthesiaId },
        orderBy: { observedAt: "asc" },
      }),
    );
    return rows.map(mapVital);
  }
  public async persistComplication(
    record: AnesthesiaComplicationRecord,
  ): Promise<AnesthesiaComplicationRecord> {
    if (!this.prisma) return this.insertComplication(record);
    const row = await this.inTenant(record.tenantId, (tx) =>
      tx.anesthesiaComplicationRecord.create({
        data: complicationData(record),
      }),
    );
    return mapComplication(row);
  }
  public async persistedComplications(
    tenantId: string,
    anesthesiaId: string,
  ): Promise<AnesthesiaComplicationRecord[]> {
    if (!this.prisma) return this.listComplications(tenantId, anesthesiaId);
    const rows = await this.inTenant(tenantId, (tx) =>
      tx.anesthesiaComplicationRecord.findMany({
        where: { tenantId, anesthesiaId },
        orderBy: { occurredAt: "asc" },
      }),
    );
    return rows.map(mapComplication);
  }
  public async persistStaff(
    record: AnesthesiaStaffRecord,
  ): Promise<AnesthesiaStaffRecord> {
    if (!this.prisma) return this.insertStaff(record);
    const row = await this.inTenant(record.tenantId, (tx) =>
      tx.anesthesiaStaffRecord.create({ data: staffData(record) }),
    );
    return mapStaff(row);
  }
  public async persistedStaff(
    tenantId: string,
    anesthesiaId: string,
  ): Promise<AnesthesiaStaffRecord[]> {
    if (!this.prisma) return this.listStaff(tenantId, anesthesiaId);
    const rows = await this.inTenant(tenantId, (tx) =>
      tx.anesthesiaStaffRecord.findMany({
        where: { tenantId, anesthesiaId },
        orderBy: { assignedAt: "asc" },
      }),
    );
    return rows.map(mapStaff);
  }

  // -------------------------------------------------------------------------
  // Test yardımcıları
  // -------------------------------------------------------------------------

  public clear(): void {
    this.byId.clear();
    this.bySurgeryPlanId.clear();
    this.counters.clear();
    this.subCounters.clear();
    this.medications.clear();
    this.vitals.clear();
    this.complications.clear();
    this.staff.clear();
  }

  private async inTenant<T>(
    tenantId: string,
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (!this.prisma) throw new Error("Prisma bağlantısı bulunamadı");
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'false', true)`;
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return callback(tx);
    });
  }
}

const dateOrNull = (value: string | null): Date | null =>
  value ? new Date(value) : null;
const anesthesiaData = (
  r: AnesthesiaRecord,
): Prisma.AnesthesiaRecordCreateInput => ({
  ...r,
  status: r.status,
  inductionAt: dateOrNull(r.inductionAt),
  recoveryAt: dateOrNull(r.recoveryAt),
  finalizedAt: dateOrNull(r.finalizedAt),
  createdAt: new Date(r.createdAt),
  updatedAt: new Date(r.updatedAt),
});
const medicationData = (
  r: AnesthesiaMedicationRecord,
): Prisma.AnesthesiaMedicationRecordCreateInput => ({
  ...r,
  route: r.route,
  administeredAt: new Date(r.administeredAt),
  createdAt: new Date(r.createdAt),
  anesthesia: { connect: { id: r.anesthesiaId } },
});
const vitalData = (
  r: AnesthesiaVitalRecord,
): Prisma.AnesthesiaVitalRecordCreateInput => ({
  ...r,
  kind: r.kind,
  observedAt: new Date(r.observedAt),
  createdAt: new Date(r.createdAt),
  anesthesia: { connect: { id: r.anesthesiaId } },
});
const complicationData = (
  r: AnesthesiaComplicationRecord,
): Prisma.AnesthesiaComplicationRecordCreateInput => ({
  ...r,
  severity: r.severity,
  occurredAt: new Date(r.occurredAt),
  resolvedAt: dateOrNull(r.resolvedAt),
  createdAt: new Date(r.createdAt),
  anesthesia: { connect: { id: r.anesthesiaId } },
});
const staffData = (
  r: AnesthesiaStaffRecord,
): Prisma.AnesthesiaStaffRecordCreateInput => ({
  ...r,
  role: r.role,
  assignedAt: new Date(r.assignedAt),
  endedAt: dateOrNull(r.endedAt),
  createdAt: new Date(r.createdAt),
  anesthesia: { connect: { id: r.anesthesiaId } },
});
const mapAnesthesia = (r: DbAnesthesia): AnesthesiaRecord => ({
  ...r,
  status: r.status as AnesthesiaRecord["status"],
  inductionAt: r.inductionAt?.toISOString() ?? null,
  recoveryAt: r.recoveryAt?.toISOString() ?? null,
  finalizedAt: r.finalizedAt?.toISOString() ?? null,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});
const mapMedication = (r: DbMedication): AnesthesiaMedicationRecord => ({
  ...r,
  route: r.route as AnesthesiaMedicationRecord["route"],
  administeredAt: r.administeredAt.toISOString(),
  createdAt: r.createdAt.toISOString(),
});
const mapVital = (r: DbVital): AnesthesiaVitalRecord => ({
  ...r,
  kind: r.kind as AnesthesiaVitalRecord["kind"],
  observedAt: r.observedAt.toISOString(),
  createdAt: r.createdAt.toISOString(),
});
const mapComplication = (r: DbComplication): AnesthesiaComplicationRecord => ({
  ...r,
  severity: r.severity as AnesthesiaComplicationRecord["severity"],
  occurredAt: r.occurredAt.toISOString(),
  resolvedAt: r.resolvedAt?.toISOString() ?? null,
  createdAt: r.createdAt.toISOString(),
});
const mapStaff = (r: DbStaff): AnesthesiaStaffRecord => ({
  ...r,
  role: r.role as AnesthesiaStaffRecord["role"],
  assignedAt: r.assignedAt.toISOString(),
  endedAt: r.endedAt?.toISOString() ?? null,
  createdAt: r.createdAt.toISOString(),
});
