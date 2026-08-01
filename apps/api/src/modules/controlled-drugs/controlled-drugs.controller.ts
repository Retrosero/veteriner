/**
 * @file ControlledDrugs controller.
 * @module apps/api/modules/controlled-drugs/controlled-drugs.controller
 * @description GOAL-143 (FAZ-14) İngiltere kontrollü ilaç defteri
 * REST API. Tenant ID URL'de taşınmaz; actor.tenantId'den alınır
 * (cross-tenant IDOR koruması).
 *
 * Endpoint'ler:
 * - `POST /api/v1/cd/receipts`                  — İlaç alımı (received)
 * - `POST /api/v1/cd/dispensings`               — Kullanım (dispensed)
 * - `POST /api/v1/cd/wastages`                  — İmha (wasted)
 * - `POST /api/v1/cd/returns`                   — Sahibine iade (returned)
 * - `POST /api/v1/cd/transfers`                 — Transfer (out + in)
 * - `POST /api/v1/cd/stock-count`               — Yıllık fiziksel sayım
 * - `POST /api/v1/cd/corrections`               — Düzeltme (correction)
 * - `GET  /api/v1/cd/register`                  — Liste (filtre + sayfalama)
 * - `GET  /api/v1/cd/register/:id`              — Detay
 * - `GET  /api/v1/cd/stock`                     — Güncel stok bakiyesi.
 * @since GOAL-143 (FAZ-14) İngiltere kontrollü ilaç defteri core
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  cdCorrectionInputSchema,
  cdDispensingInputSchema,
  cdReceiptInputSchema,
  cdRegisterFiltersSchema,
  cdReturnInputSchema,
  cdStockCountInputSchema,
  cdTransferInputSchema,
  cdWastageInputSchema,
} from "@vetniva/contracts";

import { ControlledDrugsService } from "./controlled-drugs.service.js";
import { CurrentActor } from "../../common/actor/actor.decorator.js";
import { AuthGuard } from "../../common/auth/auth.guard.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type {
  CdCorrectionInput,
  CdDispensingInput,
  CdReceiptInput,
  CdRegisterEntry,
  CdRegisterFilters,
  CdRegisterListResponse,
  CdReturnInput,
  CdStockCountInput,
  CdStockSummaryResponse,
  CdTransferInput,
  CdWastageInput,
} from "@vetniva/contracts";

@ApiTags("controlled-drugs")
@UseGuards(AuthGuard, PermissionsGuard)
@Controller("api/v1/cd")
export class ControlledDrugsController {
  public constructor(private readonly service: ControlledDrugsService) {}

  // -------------------------------------------------------------------------
  // Write endpoints
  // -------------------------------------------------------------------------

  @Post("receipts")
  @RequirePermissions("clinic:prescription:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "cdReceiptCreate",
    summary: "Kontrollü ilaç alımı (received)",
    description:
      "Dışarıdan alınan (üretici, toptancı) ilaç kaydı. " +
      "Stok +quantity artırır. Append-only. Audit " +
      "`audit:cd.stock_received` (info).",
  })
  @ApiResponse({ status: 201, description: "Oluşturuldu." })
  @ApiResponse({
    status: 422,
    description: "Alan doğrulaması başarısız (VET-CD-*).",
  })
  public async createReceipt(
    @Body(new ZodValidationPipe(cdReceiptInputSchema))
    body: CdReceiptInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<CdRegisterEntry> {
    const tenantId = this.requireTenant(actor);
    return this.service.recordReceipt(tenantId, body, actor);
  }

  @Post("dispensings")
  @RequirePermissions("clinic:prescription:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "cdDispensingCreate",
    summary: "Kontrollü ilaç kullanımı (dispensed)",
    description:
      "Bir hayvan için reçeteli kullanım kaydı. Stok -quantity " +
      "azaltır. Acil kullanım (emergencyUse=true) dışında " +
      "ownerId/patientId zorunlu. Append-only. Audit " +
      "`audit:cd.dispensed` (info).",
  })
  public async createDispensing(
    @Body(new ZodValidationPipe(cdDispensingInputSchema))
    body: CdDispensingInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<CdRegisterEntry> {
    const tenantId = this.requireTenant(actor);
    return this.service.recordDispensing(tenantId, body, actor);
  }

  @Post("wastages")
  @RequirePermissions("clinic:prescription:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "cdWastageCreate",
    summary: "Kontrollü ilaç imhası (wasted)",
    description:
      "Bozuk, süresi geçmiş, geri çekilen vb. ilaç imhası. " +
      "S2-S3 için witness (tanık) zorunlu; witness işlemi " +
      "yapan kişiden farklı olmalı. Stok -quantity azaltır. " +
      "Append-only. Audit `audit:cd.wasted` (warning).",
  })
  public async createWastage(
    @Body(new ZodValidationPipe(cdWastageInputSchema))
    body: CdWastageInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<CdRegisterEntry> {
    const tenantId = this.requireTenant(actor);
    return this.service.recordWastage(tenantId, body, actor);
  }

  @Post("returns")
  @RequirePermissions("clinic:prescription:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "cdReturnCreate",
    summary: "Kontrollü ilaç sahibine iadesi (returned)",
    description:
      "Sahibine iade edilen ilaç. Stok +quantity artırır. " +
      "Append-only. Audit `audit:cd.returned` (info).",
  })
  public async createReturn(
    @Body(new ZodValidationPipe(cdReturnInputSchema))
    body: CdReturnInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<CdRegisterEntry> {
    const tenantId = this.requireTenant(actor);
    return this.service.recordReturn(tenantId, body, actor);
  }

  @Post("transfers")
  @RequirePermissions("clinic:prescription:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "cdTransferCreate",
    summary: "Kontrollü ilaç transferi (out + in)",
    description:
      "Şube/saklama alanı arası transfer. Aynı `transferGroupId` " +
      "ile bağlanan iki kayıt oluşturur (kaynak out, hedef in). " +
      "Stok kaynaktan düşer, hedefe eklenir. Append-only. " +
      "Audit `audit:cd.transferred` (info).",
  })
  public async createTransfer(
    @Body(new ZodValidationPipe(cdTransferInputSchema))
    body: CdTransferInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<{ out: CdRegisterEntry; in: CdRegisterEntry }> {
    const tenantId = this.requireTenant(actor);
    return this.service.recordTransfer(tenantId, body, actor);
  }

  @Post("stock-count")
  @RequirePermissions("clinic:stock:adjust")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "cdStockCountCreate",
    summary: "Yıllık fiziksel stok sayımı (count)",
    description:
      "Yıllık 1 Ocak sayımı. witness (tanık) zorunlu; " +
      "witness işlemi yapan kişiden farklı olmalı. " +
      "Miktar etkisiz (count=0); `physicalQuantity` ve " +
      "`bookQuantity` ile sapma raporlanır. " +
      "Append-only. Audit `audit:cd.stock_count` (info).",
  })
  public async createStockCount(
    @Body(new ZodValidationPipe(cdStockCountInputSchema))
    body: CdStockCountInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<CdRegisterEntry> {
    const tenantId = this.requireTenant(actor);
    return this.service.recordStockCount(tenantId, body, actor);
  }

  @Post("corrections")
  @RequirePermissions("clinic:prescription:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "cdCorrectionCreate",
    summary: "Mevcut kaydı düzelt (correction)",
    description:
      "Orijinal kayıt immutable kalır; ters işaretli bir " +
      "correction entry'si eklenir. Yeni doğru kayıt " +
      "(örn. yeni dispensing/receipt) caller tarafından " +
      "ayrıca eklenir. Append-only. Audit `audit:cd.corrected` " +
      "(warning).",
  })
  public async createCorrection(
    @Body(new ZodValidationPipe(cdCorrectionInputSchema))
    body: CdCorrectionInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<CdRegisterEntry> {
    const tenantId = this.requireTenant(actor);
    return this.service.correctEntry(tenantId, body, actor);
  }

  // -------------------------------------------------------------------------
  // Read endpoints
  // -------------------------------------------------------------------------

  @Get("register")
  @RequirePermissions("clinic:prescription:read")
  @ApiOperation({
    operationId: "cdRegisterList",
    summary: "Kontrollü ilaç register listesi",
    description:
      "drugName / schedule / entryType / branchId / storageAreaId " +
      "/ from / to filtreleri ile tenant-scoped kronolojik arama. " +
      "En eski kayıt üstte (defter sırası). Sayfalama limit/offset.",
  })
  public async list(
    @Query(new ZodValidationPipe(cdRegisterFiltersSchema))
    query: CdRegisterFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<CdRegisterListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.list(tenantId, query, actor);
  }

  @Get("register/:id")
  @RequirePermissions("clinic:prescription:read")
  @ApiOperation({
    operationId: "cdRegisterGetById",
    summary: "Kontrollü ilaç register kaydı detayı",
    description:
      "ID'ye göre tek kayıt getirir. Cross-tenant → null " +
      "(controller 404 fırlatır).",
  })
  public async getOne(
    @Param("id") id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<CdRegisterEntry> {
    const tenantId = this.requireTenant(actor);
    const entry = await this.service.findById(tenantId, id, actor);
    if (!entry) {
      throw new DomainError({
        errorCode: "VET-CD-0006",
        message: "Register kaydı bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CD-0006",
      });
    }
    return entry;
  }

  @Get("stock")
  @RequirePermissions("clinic:prescription:read")
  @ApiOperation({
    operationId: "cdStockSummary",
    summary: "Güncel stok bakiyesi özeti",
    description:
      "İlaç + şube + saklama alanı başına güncel miktarı " +
      "döner. Transfer (in/out), received, dispensed, wasted, " +
      "returned ve correction kayıtları üzerinden hesaplanır; " +
      "count kayıtları miktarı etkilemez (sadece sayım amaçlı).",
  })
  public async stock(
    @CurrentActor() actor: ActorContext,
  ): Promise<CdStockSummaryResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.getStock(tenantId, actor);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private requireTenant(actor: ActorContext): string {
    if (actor.tenantId) return actor.tenantId;
    throw new DomainError({
      errorCode: "VET-TENANT-0001",
      message: "Tenant bağlamı zorunlu",
      httpStatus: 400,
      severity: "warning",
      i18nKey: "error.VET-TENANT-0001",
    });
  }
}
