/**
 * @file Controlled Drugs repository.
 * @module apps/api/modules/controlled-drugs/controlled-drugs.repository
 * @description GB controlled-drug defterinin append-only veri erişim katmanı.
 * Prisma sağlandığında kalıcı PostgreSQL tablosunu; izole unit testlerde ise
 * aynı sözleşmeye sahip bellek içi adapteri kullanır.
 * @security Her kalıcı sorgu transaction içinde `app.tenant_id` RLS bağlamını
 * kurar. UPDATE/DELETE metodu yoktur; migration trigger'ı da bu yasağı
 * veritabanında zorlar. Transfer çifti tek transaction içinde eklenir.
 */

import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../prisma/prisma.service.js";

import type {
  CdRegisterRecord,
  CdRegisterSearchFilters,
  CdStockBalance,
} from "../../common/controlled-drugs/controlled-drug.types.js";
import type { Prisma } from "@prisma/client";
import type { CdEntryType, CdSchedule } from "@vetniva/contracts";

type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class ControlledDrugsRepository {
  /** Unit test adapteri; production'da Prisma her zaman enjekte edilir. */
  private readonly byId = new Map<string, CdRegisterRecord>();

  public constructor(private readonly prisma?: PrismaService) {}

  /**
   * UUID, Prisma `controlled_drug_entries.id` alanıyla uyumludur.
   * @param _tenantId
   */
  public nextId(_tenantId?: string): string {
    return randomUUID();
  }

  public async insert(record: CdRegisterRecord): Promise<CdRegisterRecord> {
    if (!this.prisma) {
      this.byId.set(record.id, record);
      return record;
    }
    return this.withTenant(record.tenantId, async (tx) => {
      const row = await tx.controlledDrugEntry.create({
        data: this.toDatabaseRecord(record),
      });
      return this.toRecord(row);
    });
  }

  /**
   * Transfer out/in satırlarını atomik olarak yazar.
   * @param records
   */
  public async insertMany(
    records: readonly CdRegisterRecord[],
  ): Promise<CdRegisterRecord[]> {
    if (records.length === 0) return [];
    const tenantId = records[0]?.tenantId;
    if (!tenantId || records.some((record) => record.tenantId !== tenantId)) {
      throw new Error("Controlled Drugs batch tek tenant'a ait olmalıdır");
    }
    if (!this.prisma) {
      for (const record of records) this.byId.set(record.id, record);
      return [...records];
    }
    return this.withTenant(tenantId, async (tx) => {
      const inserted: CdRegisterRecord[] = [];
      for (const record of records) {
        const row = await tx.controlledDrugEntry.create({
          data: this.toDatabaseRecord(record),
        });
        inserted.push(this.toRecord(row));
      }
      return inserted;
    });
  }

  public findById(id: string): Promise<CdRegisterRecord | null> {
    if (!this.prisma) return Promise.resolve(this.byId.get(id) ?? null);
    // Çağıran servis kaydın tenant'ını henüz bilmeyebilir. RLS yerine güvenli
    // lookup için tenant filtresi zorunlu olan `findByIdForTenant` kullanılır.
    return Promise.reject(
      new Error("findById yerine findByIdForTenant kullanılmalıdır"),
    );
  }

  public async findByIdForTenant(
    tenantId: string,
    id: string,
  ): Promise<CdRegisterRecord | null> {
    if (!this.prisma) {
      const record = this.byId.get(id) ?? null;
      return record?.tenantId === tenantId ? record : null;
    }
    return this.withTenant(tenantId, async (tx) => {
      const row = await tx.controlledDrugEntry.findFirst({
        where: { id, tenantId },
      });
      return row ? this.toRecord(row) : null;
    });
  }

  public async search(
    tenantId: string,
    filters: CdRegisterSearchFilters,
  ): Promise<{ items: CdRegisterRecord[]; total: number }> {
    if (!this.prisma) {
      const all = this.filterMemory(tenantId, filters);
      return {
        items: all.slice(filters.offset, filters.offset + filters.limit),
        total: all.length,
      };
    }
    return this.withTenant(tenantId, async (tx) => {
      const where: Prisma.ControlledDrugEntryWhereInput = {
        tenantId,
        ...(filters.entryType ? { entryType: filters.entryType } : {}),
        ...(filters.schedule ? { schedule: filters.schedule } : {}),
        ...(filters.branchId ? { branchId: filters.branchId } : {}),
        ...(filters.storageAreaId
          ? { storageAreaId: filters.storageAreaId }
          : {}),
        ...(filters.drugName
          ? { drugName: { contains: filters.drugName, mode: "insensitive" } }
          : {}),
        ...(filters.from || filters.to
          ? {
              occurredAt: {
                ...(filters.from ? { gte: new Date(filters.from) } : {}),
                ...(filters.to ? { lte: new Date(filters.to) } : {}),
              },
            }
          : {}),
      };
      const [rows, total] = await Promise.all([
        tx.controlledDrugEntry.findMany({
          where,
          orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
          skip: filters.offset,
          take: filters.limit,
        }),
        tx.controlledDrugEntry.count({ where }),
      ]);
      return { items: rows.map((row) => this.toRecord(row)), total };
    });
  }

  public async listByTenant(tenantId: string): Promise<CdRegisterRecord[]> {
    if (!this.prisma) {
      return [...this.byId.values()].filter(
        (record) => record.tenantId === tenantId,
      );
    }
    return this.withTenant(tenantId, async (tx) => {
      const rows = await tx.controlledDrugEntry.findMany({
        where: { tenantId },
        orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      });
      return rows.map((row) => this.toRecord(row));
    });
  }

  /** Bir kayıt için daha önce append-only ters kayıt oluşturulup oluşturulmadığını döner. */
  public async hasCorrectionForEntry(
    tenantId: string,
    originalEntryId: string,
  ): Promise<boolean> {
    if (!this.prisma) {
      return [...this.byId.values()].some(
        (record) =>
          record.tenantId === tenantId &&
          record.entryType === "correction" &&
          record.correctsEntryId === originalEntryId,
      );
    }
    return this.withTenant(
      tenantId,
      async (tx) =>
        (await tx.controlledDrugEntry.count({
          where: {
            tenantId,
            entryType: "correction",
            correctsEntryId: originalEntryId,
          },
        })) > 0,
    );
  }

  public async listForStock(args: {
    tenantId: string;
    drugName: string;
    schedule: CdSchedule;
    unit: "mg" | "ml";
    branchId: string;
    storageAreaId: string;
  }): Promise<CdRegisterRecord[]> {
    const records = await this.listByTenant(args.tenantId);
    return records.filter(
      (record) =>
        record.drugName === args.drugName &&
        record.schedule === args.schedule &&
        record.unit === args.unit &&
        record.branchId === args.branchId &&
        record.storageAreaId === args.storageAreaId,
    );
  }

  public async computeStockBalances(
    tenantId: string,
  ): Promise<CdStockBalance[]> {
    const keyMap = new Map<string, CdStockBalance>();
    for (const record of await this.listByTenant(tenantId)) {
      const apply = (
        branchId: string,
        storageAreaId: string,
        delta: number,
      ): void => {
        const key = this.balanceKey(record, branchId, storageAreaId);
        const current = keyMap.get(key) ?? {
          tenantId: record.tenantId,
          drugName: record.drugName,
          schedule: record.schedule,
          unit: record.unit,
          branchId,
          storageAreaId,
          currentQuantity: 0,
          lastMovementAt: null,
        };
        current.currentQuantity += delta;
        if (
          !current.lastMovementAt ||
          record.occurredAt > current.lastMovementAt
        ) {
          current.lastMovementAt = record.occurredAt;
        }
        keyMap.set(key, current);
      };
      // Fiziksel sayım yalnız raporlama amaçlıdır; stok miktarını değiştirmez.
      // Correction ise append-only ters harekettir ve stok toplamına mutlaka
      // katılmalıdır. Aksi halde düzeltilmiş bir alım/kullanım bakiye üzerinde
      // etkisini korur.
      if (record.entryType === "count") continue;
      apply(record.branchId, record.storageAreaId, record.quantityDelta);
    }
    return [...keyMap.values()].sort(
      (left, right) =>
        left.drugName.localeCompare(right.drugName) ||
        left.branchId.localeCompare(right.branchId) ||
        left.storageAreaId.localeCompare(right.storageAreaId),
    );
  }

  public async existsByEntryType(
    tenantId: string,
    entryType: CdEntryType,
  ): Promise<boolean> {
    if (!this.prisma) {
      return [...this.byId.values()].some(
        (record) =>
          record.tenantId === tenantId && record.entryType === entryType,
      );
    }
    return this.withTenant(
      tenantId,
      async (tx) =>
        (await tx.controlledDrugEntry.count({
          where: { tenantId, entryType },
        })) > 0,
    );
  }

  /** Test yardımı; production'da fiziksel silme yapmaz. */
  public clear(): void {
    this.byId.clear();
  }

  private async withTenant<T>(
    tenantId: string,
    action: (tx: TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (!this.prisma) throw new Error("PrismaService bulunamadı");
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      await tx.$executeRaw`SELECT set_config('app.is_superadmin', 'false', true)`;
      return action(tx);
    });
  }

  private filterMemory(
    tenantId: string,
    filters: CdRegisterSearchFilters,
  ): CdRegisterRecord[] {
    return [...this.byId.values()]
      .filter((record) => {
        if (record.tenantId !== tenantId) return false;
        if (filters.entryType && record.entryType !== filters.entryType)
          return false;
        if (filters.schedule && record.schedule !== filters.schedule)
          return false;
        if (filters.branchId && record.branchId !== filters.branchId)
          return false;
        if (
          filters.storageAreaId &&
          record.storageAreaId !== filters.storageAreaId
        )
          return false;
        if (
          filters.drugName &&
          !record.drugName
            .toLowerCase()
            .includes(filters.drugName.toLowerCase())
        )
          return false;
        if (filters.from && record.occurredAt < filters.from) return false;
        return !(filters.to && record.occurredAt > filters.to);
      })
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  }

  private balanceKey(
    record: CdRegisterRecord,
    branchId: string,
    storageAreaId: string,
  ): string {
    return [
      record.tenantId,
      record.drugName,
      record.schedule,
      record.unit,
      branchId,
      storageAreaId,
    ].join("|");
  }

  private toDatabaseRecord(
    record: CdRegisterRecord,
  ): Prisma.ControlledDrugEntryUncheckedCreateInput {
    return {
      id: record.id,
      tenantId: record.tenantId,
      entryType: record.entryType,
      drugName: record.drugName,
      schedule: record.schedule,
      unit: record.unit,
      quantityDelta: record.quantityDelta,
      branchId: record.branchId,
      storageAreaId: record.storageAreaId,
      occurredAt: new Date(record.occurredAt),
      recordedAt: new Date(record.recordedAt),
      recordedBy: record.recordedBy,
      supplier: record.supplier,
      lotNumber: record.lotNumber,
      expiryDate: record.expiryDate ? new Date(record.expiryDate) : null,
      ownerId: record.ownerId,
      patientId: record.patientId,
      prescribedByVeterinarianId: record.prescribedByVeterinarianId,
      prescriptionNumber: record.prescriptionNumber,
      emergencyUse: record.emergencyUse,
      reason: record.reason,
      witnessUserId: record.witnessUserId,
      targetBranchId: record.targetBranchId,
      targetStorageAreaId: record.targetStorageAreaId,
      transferGroupId: record.transferGroupId,
      physicalQuantity: record.physicalQuantity,
      bookQuantity: record.bookQuantity,
      discrepancy: record.discrepancy,
      countDate: record.countDate ? new Date(record.countDate) : null,
      correctsEntryId: record.correctsEntryId,
      notes: record.notes,
    };
  }

  private toRecord(row: {
    id: string;
    tenantId: string;
    entryType: CdEntryType;
    drugName: string;
    schedule: CdSchedule;
    unit: "mg" | "ml";
    quantityDelta: { toNumber(): number };
    branchId: string;
    storageAreaId: string;
    occurredAt: Date;
    recordedAt: Date;
    recordedBy: string;
    supplier: string | null;
    lotNumber: string | null;
    expiryDate: Date | null;
    ownerId: string | null;
    patientId: string | null;
    prescribedByVeterinarianId: string | null;
    prescriptionNumber: string | null;
    emergencyUse: boolean | null;
    reason: string | null;
    witnessUserId: string | null;
    targetBranchId: string | null;
    targetStorageAreaId: string | null;
    transferGroupId: string | null;
    physicalQuantity: { toNumber(): number } | null;
    bookQuantity: { toNumber(): number } | null;
    discrepancy: { toNumber(): number } | null;
    countDate: Date | null;
    correctsEntryId: string | null;
    notes: string | null;
  }): CdRegisterRecord {
    return {
      ...row,
      quantityDelta: row.quantityDelta.toNumber(),
      occurredAt: row.occurredAt.toISOString(),
      recordedAt: row.recordedAt.toISOString(),
      expiryDate: row.expiryDate?.toISOString().slice(0, 10) ?? null,
      physicalQuantity: row.physicalQuantity?.toNumber() ?? null,
      bookQuantity: row.bookQuantity?.toNumber() ?? null,
      discrepancy: row.discrepancy?.toNumber() ?? null,
      countDate: row.countDate?.toISOString().slice(0, 10) ?? null,
    };
  }
}
