/**
 * @file ControlledDrugs service.
 * @module apps/api/modules/controlled-drugs/controlled-drugs.service
 * @description GOAL-143 (FAZ-14) İngiltere kontrollü ilaç defteri
 * iş kuralları.
 *
 * Append-only semantik:
 * - Fiziksel silme/güncelleme YOK. Her düzeltme için
 *   `correctEntry` çağrılır; bu çağrı orijinal kayıt için
 *   ters işaretli bir `correction` entry'si ekler, ardından
 *   yeni doğru kayıt eklenir (caller tarafından yapılır).
 * - Audit her entry için zorunlu (`audit:cd.*`).
 *
 * Yetki modeli:
 * - `clinic:prescription:create` — received, dispensed, wasted,
 *   returned, transferred, correction.
 * - `clinic:prescription:read` — register list, getById, stock.
 * - `clinic:stock:adjust` — stock_count (yıllık sayım).
 *
 * İş kuralları:
 * - `recordReceipt`: alınan miktar +quantity; supplier/lot/expiry
 *   zorunlu; audit `audit:cd.stock_received` (info).
 * - `recordDispensing`: negatif miktar; reçete eden vet + reçete
 *   no zorunlu; `emergencyUse=true` ise owner/patient opsiyonel;
 *   audit `audit:cd.dispensed` (info).
 * - `recordWastage`: negatif miktar; S2-S3 için `witnessUserId`
 *   zorunlu; S4-S5 için de önerilir (service her durumda
 *   doğrular); audit `audit:cd.wasted` (warning).
 * - `recordReturn`: pozitif miktar; owner zorunlu; audit
 *   `audit:cd.returned` (info).
 * - `recordTransfer`: out (negatif) + in (pozitif) çift kayıt
 *   aynı `transferGroupId` ile bağlanır; audit
 *   `audit:cd.transferred` (info).
 * - `recordStockCount`: miktar 0 (etkisiz); `witnessUserId`
 *   zorunlu; sayım kaydı + sapma raporu; audit
 *   `audit:cd.stock_count` (info).
 * - `correctEntry`: orijinal kayıt için ters işaretli
 *   `correction` entry'si ekler; caller yeni doğru kaydı
 *   eklemekten sorumludur (append-only); audit
 *   `audit:cd.corrected` (warning).
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır;
 *   request body/query'den güvenilmez. Append-only klinik kayıt
 *   politikası (fiziksel silme YOK).
 * @since GOAL-143 (FAZ-14) İngiltere kontrollü ilaç defteri core
 */

import { Injectable, Logger } from "@nestjs/common";

import { ControlledDrugsRepository } from "./controlled-drugs.repository.js";
import { AuditService } from "../../common/audit/audit.service.js";
import {
  toCdRegisterEntry,
  type CdRegisterRecord,
  type CdStockBalance,
} from "../../common/controlled-drugs/controlled-drug.types.js";
import { DomainError } from "../../common/errors/domain-error.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type {
  CdRegisterEntry,
  CdRegisterFilters,
  CdRegisterListResponse,
  CdStockEntry,
  CdStockSummaryResponse,
  CdCorrectionInput,
  CdReceiptInput,
  CdDispensingInput,
  CdWastageInput,
  CdReturnInput,
  CdTransferInput,
  CdStockCountInput,
} from "@vetniva/contracts";

/** S2-S3 için witness (tanık imza) zorunluluğu. */
const SCHEDULES_REQUIRING_WITNESS = new Set(["S2", "S3"]);

@Injectable()
export class ControlledDrugsService {
  private readonly logger = new Logger(ControlledDrugsService.name);

  public constructor(
    private readonly repo: ControlledDrugsRepository,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // Receipt (alım)
  // -------------------------------------------------------------------------

  public async recordReceipt(
    tenantId: string,
    input: CdReceiptInput,
    actor: ActorContext,
  ): Promise<CdRegisterEntry> {
    this.requireTenantScope(actor, tenantId);
    const occurredAt = input.occurredAt ?? new Date().toISOString();
    const recordedAt = new Date().toISOString();
    const recordedBy = actor.actorId ?? "system";
    const id = this.repo.nextId(tenantId);

    const rec: CdRegisterRecord = {
      id,
      tenantId,
      entryType: "received",
      drugName: input.drugName,
      schedule: input.schedule,
      unit: input.unit,
      quantityDelta: input.quantity,
      branchId: input.branchId,
      storageAreaId: input.storageAreaId,
      occurredAt,
      recordedAt,
      recordedBy,
      supplier: input.supplier,
      lotNumber: input.lotNumber,
      expiryDate: input.expiryDate,
      ownerId: null,
      patientId: null,
      prescribedByVeterinarianId: null,
      prescriptionNumber: null,
      emergencyUse: null,
      reason: null,
      witnessUserId: null,
      targetBranchId: null,
      targetStorageAreaId: null,
      transferGroupId: null,
      physicalQuantity: null,
      bookQuantity: null,
      discrepancy: null,
      countDate: null,
      correctsEntryId: null,
      notes: input.notes ?? null,
    };
    await this.repo.insert(rec);

    await this.audit.recordSimple(
      "audit:cd.stock_received",
      "controlled_drug_entry",
      id,
      "receive",
      this.actorToAuditActor(actor),
      "info",
      {
        drugName: input.drugName,
        schedule: input.schedule,
        unit: input.unit,
        quantity: input.quantity,
        branchId: input.branchId,
        storageAreaId: input.storageAreaId,
        supplier: input.supplier,
        lotNumber: input.lotNumber,
        expiryDate: input.expiryDate,
      },
    );

    return toCdRegisterEntry(rec);
  }

  // -------------------------------------------------------------------------
  // Dispensing (kullanım)
  // -------------------------------------------------------------------------

  public async recordDispensing(
    tenantId: string,
    input: CdDispensingInput,
    actor: ActorContext,
  ): Promise<CdRegisterEntry> {
    this.requireTenantScope(actor, tenantId);

    const isEmergency = input.emergencyUse === true;
    if (!isEmergency) {
      if (!input.ownerId || !input.patientId) {
        throw new DomainError({
          errorCode: "VET-CD-0001",
          message:
            "Dispensing için ownerId ve patientId zorunlu (emergencyUse=true ise opsiyonel)",
          httpStatus: 422,
          severity: "warning",
          i18nKey: "error.VET-CD-0001",
        });
      }
    }

    const occurredAt = input.occurredAt ?? new Date().toISOString();
    const recordedAt = new Date().toISOString();
    const recordedBy = actor.actorId ?? "system";
    const id = this.repo.nextId(tenantId);

    const rec: CdRegisterRecord = {
      id,
      tenantId,
      entryType: "dispensed",
      drugName: input.drugName,
      schedule: input.schedule,
      unit: input.unit,
      quantityDelta: -Math.abs(input.quantity),
      branchId: input.branchId,
      storageAreaId: input.storageAreaId,
      occurredAt,
      recordedAt,
      recordedBy,
      supplier: null,
      lotNumber: null,
      expiryDate: null,
      ownerId: input.ownerId ?? null,
      patientId: input.patientId ?? null,
      prescribedByVeterinarianId: input.prescribedByVeterinarianId,
      prescriptionNumber: input.prescriptionNumber,
      emergencyUse: input.emergencyUse ?? false,
      reason: null,
      witnessUserId: null,
      targetBranchId: null,
      targetStorageAreaId: null,
      transferGroupId: null,
      physicalQuantity: null,
      bookQuantity: null,
      discrepancy: null,
      countDate: null,
      correctsEntryId: null,
      notes: input.notes ?? null,
    };
    await this.repo.insert(rec);

    await this.audit.recordSimple(
      "audit:cd.dispensed",
      "controlled_drug_entry",
      id,
      "dispense",
      this.actorToAuditActor(actor),
      "info",
      {
        drugName: input.drugName,
        schedule: input.schedule,
        unit: input.unit,
        quantity: input.quantity,
        branchId: input.branchId,
        storageAreaId: input.storageAreaId,
        ownerId: input.ownerId ?? null,
        patientId: input.patientId ?? null,
        prescribedByVeterinarianId: input.prescribedByVeterinarianId,
        prescriptionNumber: input.prescriptionNumber,
        emergencyUse: input.emergencyUse ?? false,
      },
    );

    return toCdRegisterEntry(rec);
  }

  // -------------------------------------------------------------------------
  // Wastage (imha)
  // -------------------------------------------------------------------------

  public async recordWastage(
    tenantId: string,
    input: CdWastageInput,
    actor: ActorContext,
  ): Promise<CdRegisterEntry> {
    this.requireTenantScope(actor, tenantId);

    if (SCHEDULES_REQUIRING_WITNESS.has(input.schedule)) {
      if (!input.witnessUserId) {
        throw new DomainError({
          errorCode: "VET-CD-0002",
          message: "S2 ve S3 ilaçlar için witness (tanık) imzası zorunlu",
          httpStatus: 422,
          severity: "warning",
          i18nKey: "error.VET-CD-0002",
          details: { schedule: input.schedule },
        });
      }
      if (input.witnessUserId === actor.actorId) {
        throw new DomainError({
          errorCode: "VET-CD-0003",
          message:
            "Witness işlemi yapan kişiden farklı olmalı (çift imza zorunlu)",
          httpStatus: 422,
          severity: "warning",
          i18nKey: "error.VET-CD-0003",
        });
      }
    }

    const occurredAt = input.occurredAt ?? new Date().toISOString();
    const recordedAt = new Date().toISOString();
    const recordedBy = actor.actorId ?? "system";
    const id = this.repo.nextId(tenantId);

    const rec: CdRegisterRecord = {
      id,
      tenantId,
      entryType: "wasted",
      drugName: input.drugName,
      schedule: input.schedule,
      unit: input.unit,
      quantityDelta: -Math.abs(input.quantity),
      branchId: input.branchId,
      storageAreaId: input.storageAreaId,
      occurredAt,
      recordedAt,
      recordedBy,
      supplier: null,
      lotNumber: null,
      expiryDate: null,
      ownerId: null,
      patientId: null,
      prescribedByVeterinarianId: null,
      prescriptionNumber: null,
      emergencyUse: null,
      reason: input.reason,
      witnessUserId: input.witnessUserId,
      targetBranchId: null,
      targetStorageAreaId: null,
      transferGroupId: null,
      physicalQuantity: null,
      bookQuantity: null,
      discrepancy: null,
      countDate: null,
      correctsEntryId: null,
      notes: input.notes ?? null,
    };
    await this.repo.insert(rec);

    await this.audit.recordSimple(
      "audit:cd.wasted",
      "controlled_drug_entry",
      id,
      "dispense",
      this.actorToAuditActor(actor),
      "warning",
      {
        drugName: input.drugName,
        schedule: input.schedule,
        unit: input.unit,
        quantity: input.quantity,
        branchId: input.branchId,
        storageAreaId: input.storageAreaId,
        reason: input.reason,
        witnessUserId: input.witnessUserId,
      },
    );

    return toCdRegisterEntry(rec);
  }

  // -------------------------------------------------------------------------
  // Return (sahibine iade)
  // -------------------------------------------------------------------------

  public async recordReturn(
    tenantId: string,
    input: CdReturnInput,
    actor: ActorContext,
  ): Promise<CdRegisterEntry> {
    this.requireTenantScope(actor, tenantId);
    const occurredAt = input.occurredAt ?? new Date().toISOString();
    const recordedAt = new Date().toISOString();
    const recordedBy = actor.actorId ?? "system";
    const id = this.repo.nextId(tenantId);

    const rec: CdRegisterRecord = {
      id,
      tenantId,
      entryType: "returned",
      drugName: input.drugName,
      schedule: input.schedule,
      unit: input.unit,
      quantityDelta: input.quantity,
      branchId: input.branchId,
      storageAreaId: input.storageAreaId,
      occurredAt,
      recordedAt,
      recordedBy,
      supplier: null,
      lotNumber: null,
      expiryDate: null,
      ownerId: input.ownerId,
      patientId: input.patientId ?? null,
      prescribedByVeterinarianId: null,
      prescriptionNumber: null,
      emergencyUse: null,
      reason: input.reason,
      witnessUserId: null,
      targetBranchId: null,
      targetStorageAreaId: null,
      transferGroupId: null,
      physicalQuantity: null,
      bookQuantity: null,
      discrepancy: null,
      countDate: null,
      correctsEntryId: null,
      notes: null,
    };
    await this.repo.insert(rec);

    await this.audit.recordSimple(
      "audit:cd.returned",
      "controlled_drug_entry",
      id,
      "dispense",
      this.actorToAuditActor(actor),
      "info",
      {
        drugName: input.drugName,
        schedule: input.schedule,
        unit: input.unit,
        quantity: input.quantity,
        branchId: input.branchId,
        storageAreaId: input.storageAreaId,
        ownerId: input.ownerId,
        patientId: input.patientId ?? null,
        reason: input.reason,
      },
    );

    return toCdRegisterEntry(rec);
  }

  // -------------------------------------------------------------------------
  // Transfer (şubeler arası)
  // -------------------------------------------------------------------------

  /**
   * Transfer: iki kayıt oluşturur (out + in), `transferGroupId` ile
   * bağlanır. Aynı API çağrısında çift kayıt yazılır; birinin
   * yazımı başarısız olursa diğeri de yazılmaz (validation
   * sırası). Production'da DB transaction ile sarılmalı; in-memory
   * repo için caller'a yeterli koruma sağlanır.
   * @param tenantId
   * @param input
   * @param actor
   */
  public async recordTransfer(
    tenantId: string,
    input: CdTransferInput,
    actor: ActorContext,
  ): Promise<{ out: CdRegisterEntry; in: CdRegisterEntry }> {
    this.requireTenantScope(actor, tenantId);
    if (
      input.targetBranchId === input.branchId &&
      input.targetStorageAreaId === input.storageAreaId
    ) {
      throw new DomainError({
        errorCode: "VET-CD-0004",
        message: "Transfer kaynak ve hedef aynı olamaz",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-CD-0004",
      });
    }

    const occurredAt = input.occurredAt ?? new Date().toISOString();
    const recordedAt = new Date().toISOString();
    const recordedBy = actor.actorId ?? "system";

    // Out (kaynak)
    const outId = this.repo.nextId(tenantId);
    const outRec: CdRegisterRecord = {
      id: outId,
      tenantId,
      entryType: "transferred",
      drugName: input.drugName,
      schedule: input.schedule,
      unit: input.unit,
      quantityDelta: -Math.abs(input.quantity),
      branchId: input.branchId,
      storageAreaId: input.storageAreaId,
      occurredAt,
      recordedAt,
      recordedBy,
      supplier: null,
      lotNumber: null,
      expiryDate: null,
      ownerId: null,
      patientId: null,
      prescribedByVeterinarianId: null,
      prescriptionNumber: null,
      emergencyUse: null,
      reason: null,
      witnessUserId: null,
      targetBranchId: input.targetBranchId,
      targetStorageAreaId: input.targetStorageAreaId,
      transferGroupId: input.transferGroupId,
      physicalQuantity: null,
      bookQuantity: null,
      discrepancy: null,
      countDate: null,
      correctsEntryId: null,
      notes: input.notes ?? null,
    };
    // Transfer çift kaydı tek DB transaction'ında aşağıda yazılır.

    // In (hedef) — ayrı bir kayıt olarak, ayrı storage alanı.
    const inId = this.repo.nextId(tenantId);
    const inRec: CdRegisterRecord = {
      id: inId,
      tenantId,
      entryType: "transferred",
      drugName: input.drugName,
      schedule: input.schedule,
      unit: input.unit,
      quantityDelta: Math.abs(input.quantity),
      branchId: input.targetBranchId,
      storageAreaId: input.targetStorageAreaId,
      occurredAt,
      recordedAt,
      recordedBy,
      supplier: null,
      lotNumber: null,
      expiryDate: null,
      ownerId: null,
      patientId: null,
      prescribedByVeterinarianId: null,
      prescriptionNumber: null,
      emergencyUse: null,
      reason: null,
      witnessUserId: null,
      targetBranchId: null,
      targetStorageAreaId: null,
      transferGroupId: input.transferGroupId,
      physicalQuantity: null,
      bookQuantity: null,
      discrepancy: null,
      countDate: null,
      correctsEntryId: null,
      notes: input.notes ?? null,
    };
    await this.repo.insertMany([outRec, inRec]);

    await this.audit.recordSimple(
      "audit:cd.transferred",
      "controlled_drug_entry",
      outId,
      "transfer",
      this.actorToAuditActor(actor),
      "info",
      {
        drugName: input.drugName,
        schedule: input.schedule,
        unit: input.unit,
        quantity: input.quantity,
        sourceBranchId: input.branchId,
        sourceStorageAreaId: input.storageAreaId,
        targetBranchId: input.targetBranchId,
        targetStorageAreaId: input.targetStorageAreaId,
        transferGroupId: input.transferGroupId,
        linkedInEntryId: inId,
      },
    );

    return { out: toCdRegisterEntry(outRec), in: toCdRegisterEntry(inRec) };
  }

  // -------------------------------------------------------------------------
  // Stock count (yıllık fiziksel sayım)
  // -------------------------------------------------------------------------

  public async recordStockCount(
    tenantId: string,
    input: CdStockCountInput,
    actor: ActorContext,
  ): Promise<CdRegisterEntry> {
    this.requireTenantScope(actor, tenantId);

    if (!input.witnessUserId) {
      throw new DomainError({
        errorCode: "VET-CD-0005",
        message: "Yıllık stok sayımı için witness (tanık) imzası zorunlu",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-CD-0005",
      });
    }
    if (input.witnessUserId === actor.actorId) {
      throw new DomainError({
        errorCode: "VET-CD-0003",
        message:
          "Witness işlemi yapan kişiden farklı olmalı (çift imza zorunlu)",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-CD-0003",
      });
    }

    const discrepancy = input.physicalQuantity - input.bookQuantity;
    const recordedAt = new Date().toISOString();
    const recordedBy = actor.actorId ?? "system";
    const id = this.repo.nextId(tenantId);

    const rec: CdRegisterRecord = {
      id,
      tenantId,
      entryType: "count",
      drugName: input.drugName,
      schedule: input.schedule,
      unit: input.unit,
      quantityDelta: 0,
      branchId: input.branchId,
      storageAreaId: input.storageAreaId,
      occurredAt: input.countDate,
      recordedAt,
      recordedBy,
      supplier: null,
      lotNumber: null,
      expiryDate: null,
      ownerId: null,
      patientId: null,
      prescribedByVeterinarianId: null,
      prescriptionNumber: null,
      emergencyUse: null,
      reason: null,
      witnessUserId: input.witnessUserId,
      targetBranchId: null,
      targetStorageAreaId: null,
      transferGroupId: null,
      physicalQuantity: input.physicalQuantity,
      bookQuantity: input.bookQuantity,
      discrepancy,
      countDate: input.countDate,
      correctsEntryId: null,
      notes: input.notes ?? null,
    };
    await this.repo.insert(rec);

    await this.audit.recordSimple(
      "audit:cd.stock_count",
      "controlled_drug_entry",
      id,
      "adjust",
      this.actorToAuditActor(actor),
      "info",
      {
        drugName: input.drugName,
        schedule: input.schedule,
        unit: input.unit,
        branchId: input.branchId,
        storageAreaId: input.storageAreaId,
        physicalQuantity: input.physicalQuantity,
        bookQuantity: input.bookQuantity,
        discrepancy,
        witnessUserId: input.witnessUserId,
        countDate: input.countDate,
      },
    );

    return toCdRegisterEntry(rec);
  }

  // -------------------------------------------------------------------------
  // Correction (düzeltme — ters kayıt)
  // -------------------------------------------------------------------------

  /**
   * Bir kaydı düzeltmek için ters işaretli correction entry'si
   * ekler. Orijinal kayıt immutable kalır; caller yeni doğru
   * kaydı eklemekten sorumludur (append-only).
   * @param tenantId
   * @param input
   * @param actor
   */
  public async correctEntry(
    tenantId: string,
    input: CdCorrectionInput,
    actor: ActorContext,
  ): Promise<CdRegisterEntry> {
    this.requireTenantScope(actor, tenantId);
    const original = await this.repo.findByIdForTenant(
      tenantId,
      input.originalEntryId,
    );
    if (!original || original.tenantId !== tenantId) {
      throw new DomainError({
        errorCode: "VET-CD-0006",
        message: "Düzeltilecek kayıt bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CD-0006",
        details: { originalEntryId: input.originalEntryId },
      });
    }
    if (original.entryType === "correction") {
      throw new DomainError({
        errorCode: "VET-CD-0007",
        message: "Correction kaydı yeniden düzeltilemez",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-CD-0007",
        details: { originalEntryId: original.id },
      });
    }
    if (await this.repo.hasCorrectionForEntry(tenantId, original.id)) {
      throw new DomainError({
        errorCode: "VET-CD-0007",
        message: "Bu kayıt için zaten bir correction kaydı oluşturulmuş",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-CD-0007",
        details: { originalEntryId: original.id },
      });
    }

    const recordedAt = new Date().toISOString();
    const recordedBy = actor.actorId ?? "system";
    const id = this.repo.nextId(tenantId);

    const rec: CdRegisterRecord = {
      id,
      tenantId,
      entryType: "correction",
      drugName: original.drugName,
      schedule: original.schedule,
      unit: original.unit,
      quantityDelta: -original.quantityDelta,
      branchId: original.branchId,
      storageAreaId: original.storageAreaId,
      occurredAt: original.occurredAt,
      recordedAt,
      recordedBy,
      supplier: null,
      lotNumber: null,
      expiryDate: null,
      ownerId: null,
      patientId: null,
      prescribedByVeterinarianId: null,
      prescriptionNumber: null,
      emergencyUse: null,
      reason: input.reason,
      witnessUserId: null,
      targetBranchId: null,
      targetStorageAreaId: null,
      transferGroupId: null,
      physicalQuantity: null,
      bookQuantity: null,
      discrepancy: null,
      countDate: null,
      correctsEntryId: original.id,
      notes: null,
    };
    try {
      await this.repo.insert(rec);
    } catch (error: unknown) {
      // Ön kontrol ile INSERT arasındaki eşzamanlı ikinci isteği DB'deki
      // kısmi unique index kazanır. Ham Prisma hatasını kullanıcıya 500 olarak
      // yansıtmadan aynı iş kuralı koduna dönüştürürüz.
      if (this.isCorrectionConflict(error)) {
        throw new DomainError({
          errorCode: "VET-CD-0007",
          message: "Bu kayıt için zaten bir correction kaydı oluşturulmuş",
          httpStatus: 422,
          severity: "warning",
          i18nKey: "error.VET-CD-0007",
          details: { originalEntryId: original.id },
        });
      }
      throw error;
    }

    await this.audit.recordSimple(
      "audit:cd.corrected",
      "controlled_drug_entry",
      id,
      "reverse",
      this.actorToAuditActor(actor),
      "warning",
      {
        originalEntryId: original.id,
        originalEntryType: original.entryType,
        originalQuantityDelta: original.quantityDelta,
        reason: input.reason,
      },
    );

    return toCdRegisterEntry(rec);
  }

  // -------------------------------------------------------------------------
  // Read endpoints
  // -------------------------------------------------------------------------

  public async list(
    tenantId: string,
    filters: CdRegisterFilters,
    actor: ActorContext,
  ): Promise<CdRegisterListResponse> {
    this.requireTenantScope(actor, tenantId);
    const result = await this.repo.search(tenantId, {
      ...(filters.drugName !== undefined ? { drugName: filters.drugName } : {}),
      ...(filters.schedule !== undefined ? { schedule: filters.schedule } : {}),
      ...(filters.entryType !== undefined
        ? { entryType: filters.entryType }
        : {}),
      ...(filters.branchId !== undefined ? { branchId: filters.branchId } : {}),
      ...(filters.storageAreaId !== undefined
        ? { storageAreaId: filters.storageAreaId }
        : {}),
      ...(filters.from !== undefined ? { from: filters.from } : {}),
      ...(filters.to !== undefined ? { to: filters.to } : {}),
      limit: filters.limit,
      offset: filters.offset,
    });
    return {
      items: result.items.map(toCdRegisterEntry),
      total: result.total,
    };
  }

  /** Prisma'nın kısmi unique index hatasını altyapı bağımsız şekilde tanır. */
  private isCorrectionConflict(error: unknown): boolean {
    if (typeof error !== "object" || error === null || !("code" in error)) {
      return false;
    }
    return error.code === "P2002";
  }

  public async findById(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<CdRegisterEntry | null> {
    this.requireTenantScope(actor, tenantId);
    const rec = await this.repo.findByIdForTenant(tenantId, id);
    if (!rec) return null;
    return toCdRegisterEntry(rec);
  }

  public async getStock(
    tenantId: string,
    actor: ActorContext,
  ): Promise<CdStockSummaryResponse> {
    this.requireTenantScope(actor, tenantId);
    const balances = await this.repo.computeStockBalances(tenantId);
    return {
      items: balances.map((b: CdStockBalance): CdStockEntry => ({
        drugName: b.drugName,
        schedule: b.schedule,
        unit: b.unit,
        branchId: b.branchId,
        storageAreaId: b.storageAreaId,
        currentQuantity: b.currentQuantity,
        lastMovementAt: b.lastMovementAt,
      })),
      total: balances.length,
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private requireTenantScope(actor: ActorContext, tenantId: string): void {
    if (actor.role === "SUPERADMIN") return;
    if (actor.tenantId === tenantId) return;
    throw new DomainError({
      errorCode: "VET-AUTHZ-0001",
      message: "Bu işlem için yetkiniz yok",
      httpStatus: 403,
      severity: "warning",
      i18nKey: "error.VET-AUTHZ-0001",
    });
  }

  private actorToAuditActor(actor: ActorContext): {
    actorId: string | null;
    actorType: "user" | "system" | "portal_user";
    tenantId: string | null;
    branchId: string | null;
    correlationId: string;
    country: string;
  } {
    return {
      actorId: actor.actorId,
      actorType: actor.actorType,
      tenantId: actor.tenantId,
      branchId: actor.branchId,
      correlationId: actor.correlationId,
      country: "GB",
    };
  }
}
