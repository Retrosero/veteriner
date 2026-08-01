/**
 * @file ClinicalUsage (klinik tüketim) service.
 * @module apps/api/modules/clinical-usages/clinical-usages.service
 * @description GOAL-066 (FAZ-6) klinik tüketimden otomatik stok
 * düşümü iş kuralları. Muayene, aşı, ameliyat, yatış gibi klinik
 * akışlar bu servisi çağırarak kullanılan ürün miktarını
 * `type=clinical_use` hareketi olarak kaydeder.
 *
 * İş kuralları:
 * - `recordUsage`:
 *   - `idempotencyKey` verildiyse (tenantId, key) ikilisi unique.
 *     Aynı key ile 2. çağrıda aynı body ile mevcut kayıt döner
 *     (idempotent); farklı body ile 409 VET-CLINICAL-USE-0005.
 *   - Her satır için ürün varlık + arşiv kontrolü (422
 *     VET-CLINICAL-USE-0003).
 *   - `service` türünde ürün için stok hareketi atlanır
 *     (purchaseTracked=false); 422 VET-CLINICAL-USE-0004.
 *   - `purchaseTracked=true` ürünler için
 *     `StockMovementsService.createSystemMovement(type='clinical_use',
 *     quantity=-N)` çağrılır.
 *   - Audit `audit:clinical_usage.create`.
 * - `listUsages` / `getUsageDetail`: tenant-scoped; cross-tenant
 *   → null.
 * - Append-only: tüketim kayıtları üzerinde update/delete yok.
 * @security Tenant bilgisi yalnızca actor.tenantId'den alınır.
 *
 * @since GOAL-066 (FAZ-6) klinik tüketimden otomatik stok düşümü core
 */

import { Injectable, Logger } from "@nestjs/common";

import { ClinicalUsagesRepository } from "./clinical-usages.repository.js";
import { AuditService } from "../../common/audit/audit.service.js";
import {
  toClinicalUsage,
  toClinicalUsageLine,
  type ClinicalUsageLineRecord,
  type ClinicalUsageRecord,
} from "../../common/clinical-usages/clinical-usage.types.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { ProductsService } from "../products/products.service.js";
import { StockMovementsService } from "../stock-movements/stock-movements.service.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type {
  ClinicalUsageCreateInput,
  ClinicalUsageDetail,
  ClinicalUsageFilters,
  ClinicalUsageListResponse,
} from "@vetniva/contracts";

/**
 * Decimal string'in negatif işaretli kopyası (çıkış).
 * @param value
 */
function toNegativeDecimal(value: string): string {
  return value === "0" || value === "0.00" ? "0" : `-${value}`;
}

@Injectable()
export class ClinicalUsagesService {
  private readonly logger = new Logger(ClinicalUsagesService.name);

  public constructor(
    private readonly repo: ClinicalUsagesRepository,
    private readonly products: ProductsService,
    private readonly stockMovements: StockMovementsService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // recordUsage
  // -------------------------------------------------------------------------

  public async recordUsage(
    tenantId: string,
    input: ClinicalUsageCreateInput,
    actor: ActorContext,
  ): Promise<ClinicalUsageDetail> {
    this.requireTenantScope(actor, tenantId);

    // 1) Idempotency kontrolü.
    if (input.idempotencyKey) {
      const existing = this.repo.findByIdempotencyKey(
        tenantId,
        input.idempotencyKey,
      );
      if (existing) {
        // Aynı body mi? sourceType + sourceId + line count + line
        // productId+quantity eşleşmeli.
        const sameBody =
          existing.sourceType === input.sourceType &&
          existing.sourceId === input.sourceId;
        if (!sameBody) {
          throw new DomainError({
            errorCode: "VET-CLINICAL-USE-0005",
            message:
              "Bu idempotency key farklı bir tüketim kaydı için kullanılmış",
            httpStatus: 409,
            severity: "warning",
            i18nKey: "error.VET-CLINICAL-USE-0005",
            details: { idempotencyKey: input.idempotencyKey },
          });
        }
        // Aynı body: mevcut kaydı döndür.
        const lines = this.repo.listLinesByUsage(tenantId, existing.id);
        return {
          usage: toClinicalUsage(existing),
          lines: lines.map((l) => toClinicalUsageLine(l)),
        };
      }
    }

    // 2) Ürün doğrulama (her satır).
    for (const line of input.lines) {
      const product = await this.products.getProduct(
        tenantId,
        line.productId,
        actor,
      );
      if (!product) {
        throw new DomainError({
          errorCode: "VET-CLINICAL-USE-0003",
          message: "Ürün bulunamadı",
          httpStatus: 422,
          severity: "warning",
          i18nKey: "error.VET-CLINICAL-USE-0003",
          details: { productId: line.productId },
        });
      }
      if (product.archivedAt !== null) {
        throw new DomainError({
          errorCode: "VET-CLINICAL-USE-0003",
          message: "Arşivlenmiş ürün tüketilemez",
          httpStatus: 422,
          severity: "warning",
          i18nKey: "error.VET-CLINICAL-USE-0003",
          details: { productId: line.productId },
        });
      }
      if (product.kind === "service") {
        throw new DomainError({
          errorCode: "VET-CLINICAL-USE-0004",
          message: "Hizmet türünde ürün klinik tüketilemez",
          httpStatus: 422,
          severity: "warning",
          i18nKey: "error.VET-CLINICAL-USE-0004",
          details: { productId: line.productId },
        });
      }
    }

    // 3) Header oluştur (önce insert, sonra lines).
    const nowIso = new Date().toISOString();
    const usageId = this.repo.nextId(tenantId);
    const header: ClinicalUsageRecord = {
      id: usageId,
      tenantId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      idempotencyKey: input.idempotencyKey ?? null,
      notes: input.notes ?? null,
      createdAt: nowIso,
      createdBy: actor.actorId ?? "system",
    };
    this.repo.insert(header);

    // 4) Satırları ekle.
    const lineRecords: ClinicalUsageLineRecord[] = [];
    for (const line of input.lines) {
      const lineId = this.repo.nextLineId(tenantId);
      const rec: ClinicalUsageLineRecord = {
        id: lineId,
        tenantId,
        usageId,
        productId: line.productId,
        unit: line.unit,
        quantity: line.quantity,
        lotId: line.lotId ?? null,
        notes: line.notes ?? null,
        createdAt: nowIso,
      };
      this.repo.insertLine(rec);
      lineRecords.push(rec);
    }

    // 5) Stok hareketleri (purchaseTracked ürünler için).
    for (const line of lineRecords) {
      const product = await this.products.getProduct(
        tenantId,
        line.productId,
        actor,
      );
      if (product?.purchaseTracked) {
        await this.stockMovements.createSystemMovement(
          tenantId,
          {
            type: "clinical_use",
            productId: line.productId,
            quantity: toNegativeDecimal(line.quantity),
            occurredAt: nowIso,
            notes: `clinical_usage:${usageId} (${input.sourceType})`,
          },
          actor,
          {
            systemSourceType: `clinical_usage.${input.sourceType}`,
            systemSourceId: usageId,
          },
        );
      }
    }

    // 6) Audit.
    await this.audit.recordSimple(
      "audit:clinical_usage.create",
      "clinical_usage",
      usageId,
      "create",
      this.actorToAuditActor(actor),
      "info",
      {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        lineCount: lineRecords.length,
        idempotencyKey: input.idempotencyKey ?? null,
      },
    );

    const finalHeader = this.repo.findById(tenantId, usageId);
    if (!finalHeader) {
      throw new DomainError({
        errorCode: "VET-CLINICAL-USE-0001",
        message: "Tüketim kaydı bulunamadı",
        httpStatus: 404,
      });
    }
    return {
      usage: toClinicalUsage(finalHeader),
      lines: lineRecords.map((l) => toClinicalUsageLine(l)),
    };
  }

  // -------------------------------------------------------------------------
  // listUsages
  // -------------------------------------------------------------------------

  public async listUsages(
    tenantId: string,
    filters: ClinicalUsageFilters,
    actor: ActorContext,
  ): Promise<ClinicalUsageListResponse> {
    this.requireTenantScope(actor, tenantId);
    const result = this.repo.search(tenantId, {
      sourceType: filters.sourceType,
      sourceId: filters.sourceId,
      search: filters.search,
      sort: filters.sort,
      limit: filters.limit,
      offset: filters.offset,
    });
    return {
      items: result.items.map((r) => toClinicalUsage(r)),
      total: result.total,
    };
  }

  // -------------------------------------------------------------------------
  // getUsageDetail
  // -------------------------------------------------------------------------

  public async getUsageDetail(
    tenantId: string,
    id: string,
    actor: ActorContext,
  ): Promise<ClinicalUsageDetail | null> {
    this.requireTenantScope(actor, tenantId);
    const header = this.repo.findById(tenantId, id);
    if (!header) return null;
    const lines = this.repo.listLinesByUsage(tenantId, id);
    return {
      usage: toClinicalUsage(header),
      lines: lines.map((l) => toClinicalUsageLine(l)),
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
      country: "TR",
    };
  }
}
