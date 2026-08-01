/**
 * @file Lab adapter service.
 * @module apps/api/modules/lab-adapters/lab-adapters.service
 *
 * @description GOAL-094 (FAZ-9) cihaz ve dış laboratuvar adapter
 *   iş kuralları.
 *
 * İş kuralları:
 *
 * - `exportOrder`:
 *   - Lab order varlık + tenant kontrolü (404 VET-LABADAPTER-0003).
 *   - Lab order cancelled ise 422 VET-LABADAPTER-0004.
 *   - Lab order'da henüz accepted bir export yoksa yeni export
 *     kaydı açar; varsa ve status pending/failed/rejected ise
 *     retry (aynı idempotencyKey ile); accepted ise yeni export'a
 *     izin vermez (409 VET-LABADAPTER-0006).
 *   - Adapter'a exportOrder çağrısı. Mock provider aynı key ile
 *     duplicate üretmez.
 *   - Yanıta göre status güncellenir (accepted/rejected/failed).
 *   - Audit `audit:lab_adapter_export.create`.
 * - `retryExport`: yalnızca `failed` veya `rejected` durumdaki
 *   export'lar retry edilebilir (409 VET-LABADAPTER-0007). Aynı
 *   idempotencyKey kullanılır; attemptCount artar.
 *   Audit `audit:lab_adapter_export.retry`.
 * - `cancelExport`: `pending` veya `failed` durumdaki export'lar
 *   iptal edilebilir. `accepted` (provider kabul etti) iptal
 *   edilemez (409 VET-LABADAPTER-0008). `cancelled`/`rejected`
 *   için idempotent no-op.
 *   Audit `audit:lab_adapter_export.cancel`.
 * - `importResult`:
 *   - Lab order varlık + tenant kontrolü.
 *   - Lab order cancelled ise 422 VET-LABADAPTER-0009.
 *   - Adapter'dan importResult çağrısı (idempotent).
 *   - Status='received' olarak kayıt açar. Eğer order status
 *     processing/completed ise ve rawPayload bir `readings` dizisi
 *     içeriyorsa mapping otomatik yapılır: ilk reading için
 *     `LabResultsService.createLabResult` çağrılır; başarıda
 *     status='applied' + mappedResultId set; aksi 'rejected'.
 *   - Audit `audit:lab_adapter_import.create`.
 * - `listExports` / `listImports` / `getExport` / `getImport`:
 *   tenant-scoped read.
 * - `listAdapters`: tenant-bazlı UI için kullanılacak statik
 *   adapter listesi (MVP'de iki mock).
 *
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *   Cross-tenant IDOR → null/404. Cross-tenant create → 403
 *   VET-AUTHZ-0001. Fiziksel silme YOKTUR; düzeltme `status` alanı
 *   ile yapılır. Idempotency: aynı `idempotencyKey` ile tekrar
 *   export adapter tarafında aynı yanıtı üretmeli.
 *
 * @since GOAL-094 (FAZ-9) cihaz ve dış laboratuvar adapter altyapısı core
 */

import { Inject, Injectable, Logger } from "@nestjs/common";

import { LabAdaptersRepository } from "./lab-adapters.repository.js";
import { AuditService } from "../../common/audit/audit.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import {
  EXTERNAL_LAB_ADAPTER,
  LAB_DEVICE_ADAPTER,
  toLabAdapterExport,
  toLabAdapterImport,
  type LabAdapter,
  type LabAdapterExportRecord,
  type LabAdapterImportRecord,
} from "../../common/lab-adapters/lab-adapter.types.js";
import { LabOrdersService } from "../lab-orders/lab-orders.service.js";
import { LabResultsService } from "../lab-results/lab-results.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type {
  LabAdapterExport,
  LabAdapterExportCancelInput,
  LabAdapterExportCreateInput,
  LabAdapterExportFilters,
  LabAdapterExportListResponse,
  LabAdapterImport,
  LabAdapterImportCreateInput,
  LabAdapterImportFilters,
  LabAdapterImportListResponse,
  LabAdapterInfo,
  LabAdapterType,
  LabResultCreateInput,
} from "@vetniva/contracts";

@Injectable()
export class LabAdaptersService {
  private readonly logger = new Logger(LabAdaptersService.name);

  public constructor(
    private readonly repo: LabAdaptersRepository,
    private readonly labOrders: LabOrdersService,
    private readonly labResults: LabResultsService,
    @Inject(LAB_DEVICE_ADAPTER)
    private readonly deviceAdapter: LabAdapter,
    @Inject(EXTERNAL_LAB_ADAPTER)
    private readonly externalLabAdapter: LabAdapter,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // Adapter selection
  // -------------------------------------------------------------------------

  /**
   * Adapter türüne göre provider adapter'ı döner.
   */
  private pickAdapter(adapterType: LabAdapterType): LabAdapter {
    if (adapterType === "in_clinic_device") return this.deviceAdapter;
    if (adapterType === "external_lab") return this.externalLabAdapter;
    throw new DomainError({
      errorCode: "VET-LABADAPTER-0002",
      message: "Bilinmeyen adapter türü",
      httpStatus: 422,
      severity: "warning",
      i18nKey: "error.VET-LABADAPTER-0002",
      details: { adapterType },
    });
  }

  // -------------------------------------------------------------------------
  // exportOrder
  // -------------------------------------------------------------------------

  public async exportOrder(
    tenantId: string,
    labOrderId: string,
    input: LabAdapterExportCreateInput,
    actor: ActorContext,
  ): Promise<LabAdapterExport> {
    this.requireTenantScope(actor, tenantId);

    // Lab order varlık + durum kontrolü.
    const order = await this.labOrders.getLabOrderDetail(
      tenantId,
      labOrderId,
      actor,
    );
    if (!order) {
      throw new DomainError({
        errorCode: "VET-LABADAPTER-0003",
        message: "Lab order bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-LABADAPTER-0003",
        details: { labOrderId },
      });
    }
    if (order.status === "cancelled") {
      throw new DomainError({
        errorCode: "VET-LABADAPTER-0004",
        message: "İptal edilmiş lab order export edilemez",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-LABADAPTER-0004",
        details: { labOrderId, orderStatus: order.status },
      });
    }

    // Idempotency: aynı `idempotencyKey` ile daha önce export
    // yapılmışsa mevcut kaydı döner (HTTP idempotency).
    const existingByKey = this.repo.findExportByIdempotencyKey(
      tenantId,
      labOrderId,
      input.idempotencyKey,
    );
    if (existingByKey) {
      return toLabAdapterExport(existingByKey);
    }

    // Son accepted export kontrolü: farklı key ile yeni deneme
    // reddedilir.
    const latest = this.repo.findLatestExportByOrder(tenantId, labOrderId);
    if (latest && latest.adapterType === input.adapterType) {
      if (latest.status === "accepted") {
        throw new DomainError({
          errorCode: "VET-LABADAPTER-0006",
          message: "Bu lab order zaten kabul edilmiş bir export kaydına sahip",
          httpStatus: 409,
          severity: "warning",
          i18nKey: "error.VET-LABADAPTER-0006",
          details: { labOrderId, exportId: latest.id },
        });
      }
    }

    const adapter = this.pickAdapter(input.adapterType);
    const nowIso = new Date().toISOString();
    const payload: Record<string, unknown> = {
      tenantId,
      patientId: order.patientId,
      labTestId: order.labTestId,
      labTestCode: order.labTestCode,
      labTestName: order.labTestName,
      sampleType: order.sampleType,
      unit: order.unit,
      referenceRange: order.referenceRange,
      priority: order.priority,
      sourceType: order.sourceType,
      sourceId: order.sourceId,
      collectedAt: order.collectedAt,
      processingStartedAt: order.processingStartedAt,
      // Test/ops bayrağı: mock adapter'lar için; gerçek
      // provider'lar görmezden gelir.
      simulateFailure: input.simulateFailure === true,
    };

    // Adapter'a gönder.
    const response = await adapter.exportOrder({
      orderId: `lad-${tenantId.slice(0, 8)}-${Date.now()}`,
      labOrderId,
      idempotencyKey: input.idempotencyKey,
      adapterType: input.adapterType,
      payload,
    });

    const id = this.repo.nextExportId(tenantId);
    const record: LabAdapterExportRecord = {
      id,
      tenantId,
      labOrderId,
      adapterType: input.adapterType,
      providerName: adapter.providerName,
      status: response.status,
      idempotencyKey: input.idempotencyKey,
      providerReference: response.providerReference,
      providerMessage: response.providerMessage,
      attemptCount: 1,
      lastAttemptAt: nowIso,
      lastError:
        response.status === "rejected" || response.status === "failed"
          ? response.providerMessage
          : null,
      payload,
      notes: input.notes ?? null,
      createdAt: nowIso,
      createdBy: actor.actorId ?? "system",
      updatedAt: nowIso,
    };
    this.repo.insertExport(record);

    await this.audit.recordSimple(
      "audit:lab_adapter_export.create",
      "lab_adapter_export",
      id,
      "create",
      this.actorToAuditActor(actor),
      response.status === "accepted" ? "info" : "warning",
      {
        labOrderId,
        adapterType: input.adapterType,
        providerName: adapter.providerName,
        providerStatus: response.status,
        providerReference: response.providerReference,
        idempotencyKey: input.idempotencyKey,
      },
    );

    return toLabAdapterExport(record);
  }

  // -------------------------------------------------------------------------
  // retryExport
  // -------------------------------------------------------------------------

  public async retryExport(
    tenantId: string,
    exportId: string,
    actor: ActorContext,
  ): Promise<LabAdapterExport> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.requireExport(tenantId, exportId);
    if (existing.status !== "failed" && existing.status !== "rejected") {
      throw new DomainError({
        errorCode: "VET-LABADAPTER-0007",
        message: "Yalnızca başarısız/reddedilmiş export'lar tekrar denenebilir",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-LABADAPTER-0007",
        details: { exportId, currentStatus: existing.status },
      });
    }

    const adapter = this.pickAdapter(existing.adapterType);
    const nowIso = new Date().toISOString();
    // Retry'da idempotencyKey'e attempt sayısı eklenir: aynı
    // kayıt için yeni deneme yeni bir provider call üretir (mock
    // cache miss). Orijinal anahtar DB'de korunur.
    const retryKey = `${existing.idempotencyKey}#r${existing.attemptCount + 1}`;
    // simulateFailure retry'da temizlenir (test/ops bayrağı; bir
    // kez denenmiş ve başarısız olmuşsa, yeniden denemede
    // kaldırılır).
    const retryPayload: Record<string, unknown> = { ...existing.payload };
    delete retryPayload["simulateFailure"];
    const response = await adapter.exportOrder({
      orderId: `lad-retry-${tenantId.slice(0, 8)}-${Date.now()}`,
      labOrderId: existing.labOrderId,
      idempotencyKey: retryKey,
      adapterType: existing.adapterType,
      payload: retryPayload,
    });

    this.repo.updateExport(tenantId, exportId, {
      status: response.status,
      providerReference: response.providerReference,
      providerMessage: response.providerMessage,
      attemptCount: existing.attemptCount + 1,
      lastAttemptAt: nowIso,
      lastError:
        response.status === "rejected" || response.status === "failed"
          ? response.providerMessage
          : null,
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:lab_adapter_export.retry",
      "lab_adapter_export",
      exportId,
      "update",
      this.actorToAuditActor(actor),
      response.status === "accepted" ? "info" : "warning",
      {
        attemptCount: existing.attemptCount + 1,
        providerStatus: response.status,
      },
    );

    return this.fetchUpdatedExport(tenantId, exportId);
  }

  // -------------------------------------------------------------------------
  // cancelExport
  // -------------------------------------------------------------------------

  public async cancelExport(
    tenantId: string,
    exportId: string,
    input: LabAdapterExportCancelInput,
    actor: ActorContext,
  ): Promise<LabAdapterExport> {
    this.requireTenantScope(actor, tenantId);
    const existing = this.requireExport(tenantId, exportId);
    if (existing.status === "accepted") {
      throw new DomainError({
        errorCode: "VET-LABADAPTER-0008",
        message:
          "Provider kabul etmiş bir export iptal edilemez; yeni bir export açın",
        httpStatus: 409,
        severity: "warning",
        i18nKey: "error.VET-LABADAPTER-0008",
        details: { exportId, currentStatus: existing.status },
      });
    }
    if (existing.status === "cancelled") {
      // Idempotent no-op.
      return toLabAdapterExport(existing);
    }

    const nowIso = new Date().toISOString();
    this.repo.updateExport(tenantId, exportId, {
      status: "cancelled",
      lastError: input.reason,
      updatedAt: nowIso,
    });

    await this.audit.recordSimple(
      "audit:lab_adapter_export.cancel",
      "lab_adapter_export",
      exportId,
      "update",
      this.actorToAuditActor(actor),
      "warning",
      {
        previousStatus: existing.status,
        reason: input.reason,
      },
    );

    return this.fetchUpdatedExport(tenantId, exportId);
  }

  // -------------------------------------------------------------------------
  // importResult
  // -------------------------------------------------------------------------

  public async importResult(
    tenantId: string,
    labOrderId: string,
    input: LabAdapterImportCreateInput,
    actor: ActorContext,
  ): Promise<LabAdapterImport> {
    this.requireTenantScope(actor, tenantId);

    const order = await this.labOrders.getLabOrderDetail(
      tenantId,
      labOrderId,
      actor,
    );
    if (!order) {
      throw new DomainError({
        errorCode: "VET-LABADAPTER-0003",
        message: "Lab order bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-LABADAPTER-0003",
        details: { labOrderId },
      });
    }
    if (order.status === "cancelled") {
      throw new DomainError({
        errorCode: "VET-LABADAPTER-0009",
        message: "İptal edilmiş lab order için sonuç import edilemez",
        httpStatus: 422,
        severity: "warning",
        i18nKey: "error.VET-LABADAPTER-0009",
        details: { labOrderId },
      });
    }

    const adapter = this.pickAdapter(input.adapterType);
    // simulatePayload verildiyse adapter'a ham payload olarak gönder;
    // yoksa adapter kendi kayıtlarından döner (mock).
    const fetched = await adapter.importResult({
      providerReference: input.providerReference,
      receivedAt: new Date().toISOString(),
      rawPayload: input.simulatePayload ?? {},
    });
    const nowIso = new Date().toISOString();

    // Mapping: eğer order processing/completed ise ve readings varsa
    // otomatik labResult oluştur.
    let mappedResultId: string | null = null;
    let mappedAt: string | null = null;
    let status: "received" | "applied" | "rejected" = "received";
    let errorMessage: string | null = null;
    const readings = Array.isArray(
      (fetched.rawPayload as { readings?: unknown }).readings,
    )
      ? (fetched.rawPayload as { readings: unknown[] }).readings
      : [];

    if (
      readings.length > 0 &&
      (order.status === "processing" || order.status === "completed")
    ) {
      const first = readings[0] as Record<string, unknown> | undefined;
      const value = first ? toPrimitiveString(first["value"], "") : "";
      const unit =
        first && typeof first["unit"] === "string" ? first["unit"] : order.unit;
      const referenceRange =
        first && typeof first["referenceRange"] === "string"
          ? first["referenceRange"]
          : order.referenceRange;
      if (value.length > 0) {
        const createInput: LabResultCreateInput = {
          value,
          abnormalFlag: "normal",
          notes:
            `auto-imported via ${adapter.providerName} (ref=${input.providerReference}); ` +
            `unit=${unit}; referenceRange=${referenceRange ?? "-"}`,
        };
        try {
          const result = await this.labResults.createLabResult(
            tenantId,
            labOrderId,
            createInput,
            actor,
          );
          mappedResultId = result.id;
          mappedAt = nowIso;
          status = "applied";
        } catch (e) {
          status = "rejected";
          errorMessage = e instanceof Error ? e.message : "mapping başarısız";
        }
      } else {
        status = "rejected";
        errorMessage = "rawPayload içinde value bulunamadı";
      }
    } else if (order.status !== "processing" && order.status !== "completed") {
      // Order henüz processing/completed değilse; sadece received
      // olarak sakla. Mapping daha sonra yeniden denenebilir
      // (sonraki tick).
      status = "received";
    }

    const id = this.repo.nextImportId(tenantId);
    const record: LabAdapterImportRecord = {
      id,
      tenantId,
      labOrderId,
      adapterType: input.adapterType,
      providerName: adapter.providerName,
      status,
      providerReference: input.providerReference,
      rawPayload: fetched.rawPayload,
      mappedResultId,
      mappedAt,
      mappedBy: mappedResultId ? (actor.actorId ?? "system") : null,
      errorMessage,
      receivedAt: fetched.receivedAt,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    this.repo.insertImport(record);

    await this.audit.recordSimple(
      "audit:lab_adapter_import.create",
      "lab_adapter_import",
      id,
      "create",
      this.actorToAuditActor(actor),
      status === "applied"
        ? "info"
        : status === "rejected"
          ? "warning"
          : "info",
      {
        labOrderId,
        adapterType: input.adapterType,
        providerName: adapter.providerName,
        providerReference: input.providerReference,
        status,
        mappedResultId,
        errorMessage,
      },
    );

    return toLabAdapterImport(record);
  }

  // -------------------------------------------------------------------------
  // Read API
  // -------------------------------------------------------------------------

  public async listExports(
    tenantId: string,
    filters: LabAdapterExportFilters,
    actor: ActorContext,
  ): Promise<LabAdapterExportListResponse> {
    this.requireTenantScope(actor, tenantId);
    const result = this.repo.searchExports(tenantId, {
      labOrderId: filters.labOrderId,
      adapterType: filters.adapterType,
      status: filters.status,
      sort: filters.sort,
      limit: filters.limit,
      offset: filters.offset,
    });
    return {
      items: result.items.map((r) => toLabAdapterExport(r)),
      total: result.total,
    };
  }

  public async listImports(
    tenantId: string,
    filters: LabAdapterImportFilters,
    actor: ActorContext,
  ): Promise<LabAdapterImportListResponse> {
    this.requireTenantScope(actor, tenantId);
    const result = this.repo.searchImports(tenantId, {
      labOrderId: filters.labOrderId,
      adapterType: filters.adapterType,
      status: filters.status,
      sort: filters.sort,
      limit: filters.limit,
      offset: filters.offset,
    });
    return {
      items: result.items.map((r) => toLabAdapterImport(r)),
      total: result.total,
    };
  }

  public async getExport(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<LabAdapterExport | null> {
    this.requireTenantScope(actor, tenantId);
    const rec = this.repo.findExportById(tenantId, id);
    return rec ? toLabAdapterExport(rec) : null;
  }

  public async getImport(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<LabAdapterImport | null> {
    this.requireTenantScope(actor, tenantId);
    const rec = this.repo.findImportById(tenantId, id);
    return rec ? toLabAdapterImport(rec) : null;
  }

  /**
   * Tenant'a tanımlı adapter listesi. MVP'de iki mock; Faz 13+'da
   * gerçek provider'lar eklenecek (konfigürasyondan okunur).
   */
  public listAdapters(): LabAdapterInfo[] {
    return [
      {
        type: "in_clinic_device",
        providerName: this.deviceAdapter.providerName,
        description:
          "Klinik içi cihaz (kan sayımı, biyokimya analizörü vb.) mock adapter",
        enabled: true,
      },
      {
        type: "external_lab",
        providerName: this.externalLabAdapter.providerName,
        description: "Dış laboratuvar mock adapter",
        enabled: true,
      },
    ];
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private requireExport(tenantId: string, id: string): LabAdapterExportRecord {
    const rec = this.repo.findExportById(tenantId, id);
    if (!rec) {
      throw new DomainError({
        errorCode: "VET-LABADAPTER-0001",
        message: "Export kaydı bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-LABADAPTER-0001",
        details: { id },
      });
    }
    return rec;
  }

  private fetchUpdatedExport(tenantId: string, id: string): LabAdapterExport {
    const updated = this.repo.findExportById(tenantId, id);
    if (!updated) {
      throw new DomainError({
        errorCode: "VET-LABADAPTER-0001",
        message: "Export kaydı bulunamadı",
        httpStatus: 404,
      });
    }
    return toLabAdapterExport(updated);
  }

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
      country: "TR",
    };
  }
}

/** Harici adapter payloadundaki primitive sonucu metne cevirir. */
function toPrimitiveString(value: unknown, fallback: string): string {
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  return fallback;
}
