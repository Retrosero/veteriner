/**
 * @file Branch controller.
 * @module apps/api/modules/branch/branch.controller
 *
 * @description Branch REST API. CRUD + archive endpoint'leri. Tenant
 * ID URL path'inde taÅŸÄ±nÄ±r; body'de alÄ±nmaz (cross-tenant IDOR
 * saldÄ±rÄ±sÄ±na karÅŸÄ±).
 *
 * Endpoint'ler:
 * - `GET    /api/v1/tenants/:tenantId/branches` â€” Tenant'Ä±n branch listesi
 * - `POST   /api/v1/tenants/:tenantId/branches` â€” Yeni branch
 * - `GET    /api/v1/branches/:id`               â€” Detay
 * - `PATCH  /api/v1/branches/:id`               â€” GÃ¼ncelle
 * - `POST   /api/v1/branches/:id/archive`       â€” ArÅŸivle
 *
 * @security Tenant ID URL'den gelir; actor.tenantId ile eÅŸleÅŸmeli
 *   veya actor SUPERADMIN olmalÄ±. Cross-tenant denemesi â†’ 404.
 *   GOAL-012: `@RequirePermissions()` dekoratÃ¶rÃ¼ ile her endpoint'te
 *   aÃ§Ä±k yetki kontrolÃ¼ uygulanÄ±r; PermissionsGuard RBAC motorunu
 *   Ã§alÄ±ÅŸtÄ±rÄ±r.
 *
 * @since GOAL-010 (FAZ-1) tenant ve ÅŸube altyapÄ±sÄ±
 * @updated GOAL-012 (FAZ-1) RBAC ve izin motoru â€” explicit @RequirePermission
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

import { CurrentActor } from "../../common/actor/actor.decorator.js";
import type { ActorContext } from "../../common/actor/actor-context.service.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import type {
  ArchiveBranchRequest,
  BranchListResponse,
  BranchResponse,
  CreateBranchRequest,
  ListBranchesQuery,
  UpdateBranchRequest,
} from "@vetniva/contracts";
import {
  archiveBranchRequestSchema,
  createBranchRequestSchema,
  listBranchesQuerySchema,
  updateBranchRequestSchema,
} from "@vetniva/contracts";

import { BranchService } from "./branch.service.js";

@ApiTags("branches")
@UseGuards(PermissionsGuard)
@Controller("api/v1")
export class BranchController {
  public constructor(private readonly service: BranchService) {}


  /**
   * Tenant'Ä±n branch'lerini listeler.
   */
  @Get("tenants/:tenantId/branches")
  @RequirePermissions("branch:branch:read")
  @ApiOperation({
    operationId: "branchListByTenant",
    summary: "Tenant ÅŸube listesi",
    description:
      "Belirli bir tenant'Ä±n ÅŸubelerini listeler. Tenant kullanÄ±cÄ±sÄ± yalnÄ±zca kendi tenant'Ä±nÄ± gÃ¶rebilir.",
  })
  @ApiResponse({ status: 200, description: "Liste dÃ¶ner." })
  public async list(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Query(new ZodValidationPipe(listBranchesQuerySchema))
    query: ListBranchesQuery,
    @CurrentActor() actor: ActorContext,
  ): Promise<BranchListResponse> {
    // exactOptionalPropertyTypes uyumu: yalnÄ±zca set edilmiÅŸ alanlarÄ±
    // service'e geÃ§ir.
    const args: { actor: ActorContext; tenantId: string; status?: "active" | "inactive" | "closed" } = {
      actor,
      tenantId,
    };
    if (query.status !== undefined) args.status = query.status;
    return this.service.list(args);
  }

  /**
   * Yeni branch oluÅŸturur.
   */
  @Post("tenants/:tenantId/branches")
  @RequirePermissions("branch:branch:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "branchCreate",
    summary: "Yeni ÅŸube oluÅŸturma",
    description:
      "Belirtilen tenant altÄ±nda yeni ÅŸube oluÅŸturur. SUPERADMIN veya tenant OWNER.",
  })
  @ApiResponse({ status: 201, description: "Åube oluÅŸturuldu." })
  @ApiResponse({ status: 409, description: "Åube kodu zaten kayÄ±tlÄ±." })
  public async create(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Body(new ZodValidationPipe(createBranchRequestSchema))
    body: CreateBranchRequest,
    @CurrentActor() actor: ActorContext,
  ): Promise<BranchResponse> {
    return this.service.create(tenantId, body, actor);
  }

  /**
   * Branch detayÄ±.
   */
  @Get("branches/:id")
  @RequirePermissions("branch:branch:read")
  @ApiOperation({
    operationId: "branchGetById",
    summary: "Åube detayÄ±",
    description:
      "ID'ye gÃ¶re ÅŸube getirir. Cross-tenant denemesi 404 dÃ¶ner.",
  })
  @ApiResponse({ status: 200, description: "Åube dÃ¶ner." })
  public async findById(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<BranchResponse> {
    return this.service.findById(id, actor);
  }

  /**
   * Branch gÃ¼ncelleme.
   */
  @Patch("branches/:id")
  @RequirePermissions("branch:branch:update")
  @ApiOperation({
    operationId: "branchUpdate",
    summary: "Åube gÃ¼ncelleme",
    description:
      "Åube ad, iletiÅŸim veya durum alanlarÄ±nÄ± gÃ¼nceller. SUPERADMIN veya tenant OWNER.",
  })
  public async update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateBranchRequestSchema))
    body: UpdateBranchRequest,
    @CurrentActor() actor: ActorContext,
  ): Promise<BranchResponse> {
    return this.service.update(id, body, actor);
  }

  /**
   * Branch arÅŸivleme (soft delete).
   */
  @Post("branches/:id/archive")
  @RequirePermissions("branch:branch:archive")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "branchArchive",
    summary: "Åube arÅŸivleme",
    description:
      "Åubeyi arÅŸivler. Fiziksel silme yok; status=closed ve archivedAt set edilir.",
  })
  public async archive(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(archiveBranchRequestSchema))
    body: ArchiveBranchRequest,
    @CurrentActor() actor: ActorContext,
  ): Promise<BranchResponse> {
    return this.service.archive(id, body, actor);
  }
}
