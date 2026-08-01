/**
 * @file Owner controller.
 * @module apps/api/modules/owners/owners.controller
 *
 * @description Owner REST API. Tenant ID URL'de taşınmaz;
 *   actor.tenantId'den alınır (cross-tenant IDOR koruması).
 *
 * Endpoint'ler:
 * - `POST   /api/v1/clinic/owners`         — Yeni owner
 * - `GET    /api/v1/clinic/owners/:id`     — Detay
 * - `GET    /api/v1/clinic/owners`         — Arama + pagination
 * - `DELETE /api/v1/clinic/owners/:id`     — Arşivle (soft delete)
 *
 * @since GOAL-020 (FAZ-2) hasta sahibi core
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  ownerCreateInputSchema,
  ownerSearchQuerySchema,
  type OwnerCreateInput,
  type OwnerSearchQuery,
} from "@vetniva/contracts";

import { OwnersService } from "./owners.service.js";
import { CurrentActor } from "../../common/actor/actor.decorator.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";
import type { Owner } from "../../common/owners/owner.types.js";

@ApiTags("owners")
@UseGuards(PermissionsGuard)
@Controller("api/v1/clinic/owners")
export class OwnersController {
  public constructor(private readonly service: OwnersService) {}

  @Post()
  @RequirePermissions("clinic:owner:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "ownerCreate",
    summary: "Yeni hasta sahibi",
    description: "Hasta sahibi (owner) kaydı oluşturur.",
  })
  @ApiResponse({ status: 201, description: "Oluşturuldu." })
  @ApiResponse({ status: 409, description: "Duplicate telefon." })
  @ApiResponse({ status: 422, description: "Validation hatası." })
  public async create(
    @Body(new ZodValidationPipe(ownerCreateInputSchema))
    body: OwnerCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<Owner> {
    const tenantId = this.requireTenant(actor);
    return this.service.create(tenantId, body, actor);
  }

  @Get(":id")
  @RequirePermissions("clinic:owner:read")
  @ApiOperation({
    operationId: "ownerGetById",
    summary: "Owner detayı",
    description: "ID'ye göre owner getirir. Cross-tenant → 404.",
  })
  public async findById(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<Owner> {
    const tenantId = this.requireTenant(actor);
    const owner = await this.service.findById(tenantId, id, actor);
    if (!owner) {
      throw new DomainError({
        errorCode: "VET-CLINIC-0001",
        message: "Hasta sahibi bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-CLINIC-0001",
      });
    }
    return owner;
  }

  @Get()
  @RequirePermissions("clinic:owner:read")
  @ApiOperation({
    operationId: "ownerSearch",
    summary: "Owner arama",
    description:
      "Tenant-scoped arama. search ad/soyad/telefon/email/taxId, " +
      "phone/city ek filtre olarak kullanılır.",
  })
  public async search(
    @Query(new ZodValidationPipe(ownerSearchQuerySchema))
    query: OwnerSearchQuery,
    @CurrentActor() actor: ActorContext,
  ): Promise<{ items: Owner[]; total: number }> {
    const tenantId = this.requireTenant(actor);
    return this.service.search(tenantId, query, actor);
  }

  @Delete(":id")
  @RequirePermissions("clinic:owner:archive")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "ownerArchive",
    summary: "Owner arşivleme",
    description: "Soft delete: archivedAt set edilir, PII korunur.",
  })
  public async archive(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<Owner> {
    const tenantId = this.requireTenant(actor);
    return this.service.archive(tenantId, id, actor);
  }

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
