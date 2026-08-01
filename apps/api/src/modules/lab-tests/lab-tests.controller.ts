/**
 * @file Lab test kataloğu controller.
 * @module apps/api/modules/lab-tests/lab-tests.controller
 *
 * @description GOAL-090 (FAZ-9) laboratuvar test kataloğu REST
 * API. Tenant ID URL'de taşınmaz; actor.tenantId'den alınır.
 *
 * Endpoint'ler:
 * - `POST   /api/v1/clinic/lab-tests`        — Yeni katalog girdisi
 * - `GET    /api/v1/clinic/lab-tests`        — Arama / filtre
 * - `GET    /api/v1/clinic/lab-tests/:id`    — Detay
 * - `PATCH  /api/v1/clinic/lab-tests/:id`    — Kısmi güncelleme / arşiv
 *
 * @since GOAL-090 (FAZ-9) laboratuvar test kataloğu core
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
import {
  labTestCreateInputSchema,
  labTestFiltersSchema,
  labTestUpdateInputSchema,
  type LabTest,
  type LabTestCreateInput,
  type LabTestFilters,
  type LabTestListResponse,
  type LabTestUpdateInput,
} from "@vetniva/contracts";

import { LabTestsService } from "./lab-tests.service.js";
import { CurrentActor } from "../../common/actor/actor.decorator.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";

@ApiTags("clinic/lab-tests")
@UseGuards(PermissionsGuard)
@Controller("api/v1/clinic/lab-tests")
export class LabTestsController {
  public constructor(private readonly service: LabTestsService) {}

  @Post()
  @RequirePermissions("clinic:lab:order")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: "labTestCreate",
    summary: "Yeni laboratuvar test kataloğu girdisi",
    description: "code tenant-scoped unique. Aynı kod 409 VET-LABTEST-0002.",
  })
  @ApiResponse({ status: 201, description: "Oluşturuldu." })
  public async create(
    @Body(new ZodValidationPipe(labTestCreateInputSchema))
    body: LabTestCreateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<LabTest> {
    const tenantId = this.requireTenant(actor);
    return this.service.createLabTest(tenantId, body, actor);
  }

  @Get()
  @RequirePermissions("clinic:lab:read")
  @ApiOperation({
    operationId: "labTestList",
    summary: "Laboratuvar test kataloğu arama",
    description:
      "Tenant-scoped arama. sampleType/active/search/sort filtreleri.",
  })
  public async list(
    @Query(new ZodValidationPipe(labTestFiltersSchema))
    query: LabTestFilters,
    @CurrentActor() actor: ActorContext,
  ): Promise<LabTestListResponse> {
    const tenantId = this.requireTenant(actor);
    return this.service.listLabTests(tenantId, query, actor);
  }

  @Get(":id")
  @RequirePermissions("clinic:lab:read")
  @ApiOperation({
    operationId: "labTestGetById",
    summary: "Laboratuvar test kataloğu detayı",
    description: "Cross-tenant → 404.",
  })
  public async findById(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<LabTest> {
    const tenantId = this.requireTenant(actor);
    const t = await this.service.getLabTestDetail(tenantId, id, actor);
    if (!t) {
      throw new DomainError({
        errorCode: "VET-LABTEST-0001",
        message: "Laboratuvar testi bulunamadı",
        httpStatus: 404,
        severity: "warning",
        i18nKey: "error.VET-LABTEST-0001",
      });
    }
    return t;
  }

  @Patch(":id")
  @RequirePermissions("clinic:lab:order")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: "labTestUpdate",
    summary: "Laboratuvar test kataloğu kısmi güncelleme",
    description:
      "code değiştirilemez. active=false ile arşivlenir. " +
      "Bulunamadı 404 VET-LABTEST-0001.",
  })
  public async update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(labTestUpdateInputSchema))
    body: LabTestUpdateInput,
    @CurrentActor() actor: ActorContext,
  ): Promise<LabTest> {
    const tenantId = this.requireTenant(actor);
    return this.service.updateLabTest(tenantId, id, body, actor);
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
