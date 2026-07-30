/**
 * @file Branch controller.
 * @module apps/api/modules/branch/branch.controller
 *
 * @description Branch REST API. CRUD + archive endpoint'leri. Tenant
 * ID URL path'inde taşınır; body'de alınmaz (cross-tenant IDOR
 * saldırısına karşı).
 *
 * Endpoint'ler:
 * - `GET    /api/v1/tenants/:tenantId/branches` — Tenant'ın branch listesi
 * - `POST   /api/v1/tenants/:tenantId/branches` — Yeni branch
 * - `GET    /api/v1/branches/:id`               — Detay
 * - `PATCH  /api/v1/branches/:id`               — Güncelle
 * - `POST   /api/v1/branches/:id/archive`       — Arşivle
 *
 * @security Tenant ID URL'den gelir; actor.tenantId ile eşleşmeli
 *   veya actor SUPERADMIN olmalı. Cross-tenant denemesi → 404.
 *
 * @since GOAL-010 (FAZ-1) tenant ve şube altyapısı
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
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

import { CurrentActor } from "../../common/actor/actor.decorator.js";
import type { ActorContext } from "../../common/actor/actor-context.service.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
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
@Controller("api/v1")
export class BranchController {
  public constructor(private readonly service: BranchService) {}

  /**
   * Tenant'ın branch'lerini listeler.
   */
  @Get("tenants/:tenantId/branches")
  @ApiOperation({
    operationId: "branchListByTenant",
    summary: "Tenant şube listesi",
    description:
      "Belirli bir tenant'ın şubelerini listeler. Tenant kullanıcısı yalnızca kendi tenant'ını görebilir.",
  })
  @ApiResponse({ status: 200, description: "Liste döner." })
  public async list(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Query(new ZodValidationPipe(listBranchesQuerySchema))
    query: ListBranchesQuery,
    @CurrentActor() actor: ActorContext,
  ): Promise<BranchListResponse> {
    // exactOptionalPropertyTypes uyumu: yalnızca set edilmiş alanları
    // service'e geçir.
    const args: { actor: ActorContext; tenantId: string; status?: "active" | "inactive" | "closed" } = {
      actor,
      tenantId,
    };
    if (query.status !== undefined) args.status = query.status;
    return this.service.list(args);
  }

  /**
   * Yeni branch oluşturur.
   */
  @Post("tenants/:tenantId/branches")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "branchCreate",
    summary: "Yeni şube oluşturma",
    description:
      "Belirtilen tenant altında yeni şube oluşturur. SUPERADMIN veya tenant OWNER.",
  })
  @ApiResponse({ status: 201, description: "Şube oluşturuldu." })
  @ApiResponse({ status: 409, description: "Şube kodu zaten kayıtlı." })
  public async create(
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
    @Body(new ZodValidationPipe(createBranchRequestSchema))
    body: CreateBranchRequest,
    @CurrentActor() actor: ActorContext,
  ): Promise<BranchResponse> {
    return this.service.create(tenantId, body, actor);
  }

  /**
   * Branch detayı.
   */
  @Get("branches/:id")
  @ApiOperation({
    operationId: "branchGetById",
    summary: "Şube detayı",
    description:
      "ID'ye göre şube getirir. Cross-tenant denemesi 404 döner.",
  })
  @ApiResponse({ status: 200, description: "Şube döner." })
  public async findById(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<BranchResponse> {
    return this.service.findById(id, actor);
  }

  /**
   * Branch güncelleme.
   */
  @Patch("branches/:id")
  @ApiOperation({
    operationId: "branchUpdate",
    summary: "Şube güncelleme",
    description:
      "Şube ad, iletişim veya durum alanlarını günceller. SUPERADMIN veya tenant OWNER.",
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
   * Branch arşivleme (soft delete).
   */
  @Post("branches/:id/archive")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "branchArchive",
    summary: "Şube arşivleme",
    description:
      "Şubeyi arşivler. Fiziksel silme yok; status=closed ve archivedAt set edilir.",
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
