/**
 * @file Prescription (reçete) repository (in-memory).
 * @module apps/api/modules/prescriptions/prescriptions.repository
 *
 * @description GOAL-045 reçete veri erişim katmanı. DB migration
 * sonraya bırakıldı; tenant-scoped in-memory Map kullanılır.
 * Production'a geçişte Prisma repository'si ile değiştirilecek
 * (API sözleşmesi sabit kalır).
 *
 * @security Tüm sorgular tenantId ile filtrelenir. RLS olmadığı
 *   için uygulama katmanı tenant izolasyonundan sorumludur.
 *
 * @since GOAL-045 (FAZ-4) reçete oluşturma core
 */

import { randomUUID } from "node:crypto";

import { Injectable, Optional } from "@nestjs/common";

import {
  toPrescription,
  type PrescriptionRecord,
} from "../../common/prescriptions/prescription.types.js";
import { PrismaService } from "../../prisma/prisma.service.js";

import type { Prisma } from "@prisma/client";
import type { Prescription } from "@vetniva/contracts";

type DbPrescription = Prisma.PrescriptionRecordGetPayload<{
  include: { items: true };
}>;

/** Patch tipi: kısmi güncelleme için izin verilen alanlar. */
export interface PrescriptionPatch {
  status?: PrescriptionRecord["status"] | undefined;
  dispensedAt?: string | null | undefined;
  dispensedBy?: string | null | undefined;
  cancelReason?: string | null | undefined;
  updatedAt?: string | undefined;
}

@Injectable()
export class PrescriptionsRepository {
  /** key: id → record. */
  private readonly byId = new Map<string, PrescriptionRecord>();
  /** Her tenant için id counter. */
  private readonly counters = new Map<string, number>();

  public constructor(@Optional() private readonly prisma?: PrismaService) {}

  public nextId(tenantId: string): string {
    if (this.prisma) return `prsc-${tenantId.slice(0, 8)}-${randomUUID()}`;
    const n = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, n);
    return `prsc-${tenantId.slice(0, 8)}-${String(n).padStart(6, "0")}`;
  }

  /** Kalıcı yazma; ilişkili kalemler aynı tenant RLS transaction'ında yazılır. */
  public async persist(
    record: PrescriptionRecord,
  ): Promise<PrescriptionRecord> {
    if (!this.prisma) return this.insert(record);
    const persisted: DbPrescription = await this.inTenant(
      record.tenantId,
      (tx) =>
        tx.prescriptionRecord.create({
          data: {
            id: record.id,
            tenantId: record.tenantId,
            examinationId: record.examinationId,
            patientId: record.patientId,
            veterinarianId: record.veterinarianId,
            notes: record.notes,
            status: record.status,
            prescribedAt: new Date(record.prescribedAt),
            expiresAt: new Date(record.expiresAt),
            dispensedAt: record.dispensedAt
              ? new Date(record.dispensedAt)
              : null,
            dispensedBy: record.dispensedBy,
            cancelReason: record.cancelReason,
            createdAt: new Date(record.createdAt),
            updatedAt: new Date(record.updatedAt),
            items: {
              create: record.items.map((item) => ({
                drugName: item.drugName,
                dosage: item.dosage,
                frequency: item.frequency,
                customFrequency: item.customFrequency ?? null,
                durationDays: item.durationDays,
                route: item.route,
                instructions: item.instructions ?? null,
                productId: item.productId ?? null,
                dispensedQuantity: item.dispensedQuantity ?? null,
                dispensedLotId: item.dispensedLotId ?? null,
              })),
            },
          },
          include: { items: true },
        }),
    );
    this.insert(record);
    return this.map(persisted);
  }

  public async persistedFindById(
    tenantId: string,
    id: string,
  ): Promise<PrescriptionRecord | null> {
    if (!this.prisma) return this.findById(tenantId, id);
    const row = await this.inTenant(tenantId, (tx) =>
      tx.prescriptionRecord.findFirst({
        where: { id, tenantId },
        include: { items: true },
      }),
    );
    return row ? this.map(row) : null;
  }

  public async persistedSearch(
    tenantId: string,
    filters: Parameters<PrescriptionsRepository["search"]>[1],
  ): Promise<{ items: PrescriptionRecord[]; total: number }> {
    if (!this.prisma) return this.search(tenantId, filters);
    const where = {
      tenantId,
      ...(filters.patientId ? { patientId: filters.patientId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.from || filters.to
        ? {
            prescribedAt: {
              ...(filters.from ? { gte: new Date(filters.from) } : {}),
              ...(filters.to ? { lte: new Date(filters.to) } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await this.inTenant(tenantId, (tx) =>
      Promise.all([
        tx.prescriptionRecord.findMany({
          where,
          include: { items: true },
          orderBy: { prescribedAt: "desc" },
          skip: filters.offset,
          take: filters.limit,
        }),
        tx.prescriptionRecord.count({ where }),
      ]),
    );
    return { items: rows.map((row) => this.map(row)), total };
  }

  public async persistedUpdate(
    tenantId: string,
    id: string,
    patch: PrescriptionPatch,
  ): Promise<PrescriptionRecord | null> {
    if (!this.prisma) return this.update(tenantId, id, patch);
    const data: Prisma.PrescriptionRecordUpdateManyMutationInput = {
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.dispensedAt !== undefined
        ? {
            dispensedAt: patch.dispensedAt ? new Date(patch.dispensedAt) : null,
          }
        : {}),
      ...(patch.dispensedBy !== undefined
        ? { dispensedBy: patch.dispensedBy }
        : {}),
      ...(patch.cancelReason !== undefined
        ? { cancelReason: patch.cancelReason }
        : {}),
      ...(patch.updatedAt !== undefined
        ? { updatedAt: new Date(patch.updatedAt) }
        : {}),
    };
    const updated = await this.inTenant(tenantId, (tx) =>
      tx.prescriptionRecord.updateMany({ where: { id, tenantId }, data }),
    );
    return updated.count ? this.persistedFindById(tenantId, id) : null;
  }

  public async persistedOverdueActive(
    nowIso: string,
  ): Promise<PrescriptionRecord[]> {
    if (!this.prisma) return this.findOverdueActive(nowIso);
    const rows = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_superadmin','true',true)`;
      return tx.prescriptionRecord.findMany({
        where: { status: "active", expiresAt: { lt: new Date(nowIso) } },
        include: { items: true },
      });
    });
    return rows.map((row) => this.map(row));
  }

  /** Reçete dağıtımı, klinik tüketim ve stok çıkışlarını tek transaction'da yazar. */
  public async dispenseWithConsumption(
    tenantId: string,
    id: string,
    actorId: string,
    lines: Array<{
      productId: string;
      lotId?: string | undefined;
      quantity: string;
    }>,
    nowIso: string,
  ): Promise<PrescriptionRecord | null> {
    if (!this.prisma) return null;
    return this.inTenant(tenantId, async (tx) => {
      const current = await tx.prescriptionRecord.findFirst({
        where: { tenantId, id },
        include: { items: true },
      });
      if (!current || current.status !== "active")
        return current ? this.map(current) : null;
      const now = new Date(nowIso);
      let consumptionId: string | null = null;
      if (lines.length > 0) {
        const products = await tx.productRecord.findMany({
          where: {
            tenantId,
            id: { in: lines.map((line) => line.productId) },
            archivedAt: null,
            active: true,
          },
        });
        if (
          products.length !== new Set(lines.map((line) => line.productId)).size
        )
          throw new Error("Klinik tüketim ürünü bulunamadı veya aktif değil");
        const movementIds: string[] = [];
        for (const line of lines) {
          if (line.lotId) {
            const lot = await tx.stockLotRecord.findFirst({
              where: {
                tenantId,
                id: line.lotId,
                productId: line.productId,
                archivedAt: null,
                active: true,
              },
            });
            if (!lot)
              throw new Error(
                "Klinik tüketim lotu bulunamadı veya ürünle eşleşmiyor",
              );
          }
          const movementId = `stmv-${tenantId.slice(0, 8)}-${randomUUID()}`;
          movementIds.push(movementId);
          await tx.stockMovementRecord.create({
            data: {
              id: movementId,
              tenantId,
              type: "clinical_use",
              productId: line.productId,
              lotId: line.lotId ?? null,
              quantity: line.quantity.startsWith("-")
                ? line.quantity
                : `-${line.quantity}`,
              unitCost: null,
              unitPrice: null,
              sourceType: "clinical_consumption",
              sourceId: "pending",
              reversesMovementId: null,
              reason: null,
              occurredAt: now,
              notes: null,
              createdAt: now,
              createdBy: actorId,
            },
          });
        }
        consumptionId = `clco-${tenantId.slice(0, 8)}-${randomUUID()}`;
        await tx.clinicalConsumptionRecord.create({
          data: {
            id: consumptionId,
            tenantId,
            context: "prescription",
            contextRefId: id,
            patientId: current.patientId,
            lines: lines,
            notes: null,
            status: "recorded",
            occurredAt: now,
            createdAt: now,
            createdBy: actorId,
            cancelledAt: null,
            cancelledBy: null,
            cancelReason: null,
            stockMovementIds: movementIds,
          },
        });
        await tx.stockMovementRecord.updateMany({
          where: {
            tenantId,
            sourceId: "pending",
            sourceType: "clinical_consumption",
            id: { in: movementIds },
          },
          data: { sourceId: consumptionId },
        });
      }
      const update = await tx.prescriptionRecord.updateMany({
        where: { tenantId, id, status: "active" },
        data: {
          status: "dispensed",
          dispensedAt: now,
          dispensedBy: actorId,
          updatedAt: now,
        },
      });
      if (!update.count) return null;
      const result = await tx.prescriptionRecord.findFirst({
        where: { tenantId, id },
        include: { items: true },
      });
      return result ? this.map(result) : null;
    });
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

  private map(row: DbPrescription): PrescriptionRecord {
    return {
      id: row.id,
      tenantId: row.tenantId,
      examinationId: row.examinationId,
      patientId: row.patientId,
      veterinarianId: row.veterinarianId,
      items: row.items.map((item) => ({
        drugName: item.drugName,
        dosage: item.dosage,
        frequency:
          item.frequency as PrescriptionRecord["items"][number]["frequency"],
        ...(item.customFrequency
          ? { customFrequency: item.customFrequency }
          : {}),
        durationDays: item.durationDays,
        route: item.route as PrescriptionRecord["items"][number]["route"],
        ...(item.instructions ? { instructions: item.instructions } : {}),
        ...(item.productId ? { productId: item.productId } : {}),
        ...(item.dispensedQuantity
          ? { dispensedQuantity: item.dispensedQuantity }
          : {}),
        ...(item.dispensedLotId ? { dispensedLotId: item.dispensedLotId } : {}),
      })),
      notes: row.notes,
      status: row.status as PrescriptionRecord["status"],
      prescribedAt: row.prescribedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      dispensedAt: row.dispensedAt?.toISOString() ?? null,
      dispensedBy: row.dispensedBy,
      cancelReason: row.cancelReason,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  public insert(record: PrescriptionRecord): PrescriptionRecord {
    this.byId.set(record.id, record);
    return record;
  }

  public findById(tenantId: string, id: string): PrescriptionRecord | null {
    const rec = this.byId.get(id);
    if (!rec || rec.tenantId !== tenantId) return null;
    return rec;
  }

  /**
   * Kısmi güncelleme. `undefined` alanlar atlanır; `null` alanlar
   * açıkça null yapılır (örn. `cancelReason`).
   */
  public update(
    tenantId: string,
    id: string,
    patch: PrescriptionPatch,
  ): PrescriptionRecord | null {
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

  /**
   * Tenant-scoped liste + filtre. `from`/`to` aralığı `prescribedAt`
   * alanına göre uygulanır. En yeni reçete üstte.
   */
  public search(
    tenantId: string,
    filters: {
      patientId?: string | undefined;
      status?: PrescriptionRecord["status"] | undefined;
      from?: string | undefined;
      to?: string | undefined;
      limit: number;
      offset: number;
    },
  ): { items: PrescriptionRecord[]; total: number } {
    const all: PrescriptionRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.tenantId !== tenantId) continue;
      if (filters.patientId && rec.patientId !== filters.patientId) continue;
      if (filters.status && rec.status !== filters.status) continue;
      if (filters.from && rec.prescribedAt < filters.from) continue;
      if (filters.to && rec.prescribedAt > filters.to) continue;
      all.push(rec);
    }
    all.sort((a, b) => b.prescribedAt.localeCompare(a.prescribedAt));
    const total = all.length;
    const items = all.slice(filters.offset, filters.offset + filters.limit);
    return { items, total };
  }

  /**
   * Tüm tenant'larda `expiresAt < now` ve `status='active'` olan
   * reçeteleri getirir. `expireOverdue` periyodik job'ı içindir.
   */
  public findOverdueActive(nowIso: string): PrescriptionRecord[] {
    const out: PrescriptionRecord[] = [];
    for (const rec of this.byId.values()) {
      if (rec.status !== "active") continue;
      if (rec.expiresAt < nowIso) out.push(rec);
    }
    return out;
  }

  /** Test yardımcısı. */
  public clear(): void {
    this.byId.clear();
    this.counters.clear();
  }

  public toRecord(args: PrescriptionRecord): PrescriptionRecord {
    return { ...args };
  }
}

/** Record → public Prescription (API response). */
export function toPrescriptionPublic(rec: PrescriptionRecord): Prescription {
  return toPrescription(rec);
}
