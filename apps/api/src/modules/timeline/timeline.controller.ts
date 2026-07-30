/**
 * @file Timeline controller.
 * @module apps/api/modules/timeline/timeline.controller
 *
 * @description GOAL-024 hayvan zaman çizelgesi REST API.
 *
 * Endpoint'ler:
 * - `GET /api/v1/clinic/patients/:patientId/timeline?from=&to=&types=&limit=&offset=`
 *   — Birleşik timeline (`clinic:patient:read` izni yeterlidir;
 *   hayvan detayının bir parçasıdır). Tarih ve tip filtreleri
 *   opsiyoneldir. Pagination limit/offset ile sağlanır.
 *
 * @since GOAL-024 (FAZ-2) hayvan zaman çizelgesi core
 */

import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";

import { CurrentActor } from "../../common/actor/actor.decorator.js";
import type { ActorContext } from "../../common/actor/actor-context.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import {
  timelineListQuerySchema,
  timelineEventTypeSchema,
  type TimelineEventType,
  type TimelineListQuery,
  type TimelineListResponse,
} from "@vetniva/contracts";

import { TimelineService } from "./timeline.service.js";

@ApiTags("timeline")
@UseGuards(PermissionsGuard)
@Controller("api/v1/clinic/patients/:patientId/timeline")
export class TimelineController {
  public constructor(private readonly service: TimelineService) {}

  @Get()
  @RequirePermissions("clinic:patient:read")
  @ApiOperation({
    operationId: "patientTimeline",
    summary: "Hayvan zaman çizelgesi",
    description:
      "Bir hayvana ait tüm klinik, petshop, dosya, uyarı ve sahiplik " +
      "olaylarını birleşik timeline olarak döner. Tarih ve tip " +
      "filtreleri opsiyoneldir.",
  })
  @ApiResponse({ status: 200, description: "Timeline listelendi." })
  @ApiResponse({ status: 404, description: "Hayvan bulunamadı." })
  public async list(
    @Param("patientId", new ParseUUIDPipe()) patientId: string,
    @Query(new ZodValidationPipe(timelineListQuerySchema))
    query: TimelineListQuery,
    @CurrentActor() actor: ActorContext,
  ): Promise<TimelineListResponse> {
    const tenantId = this.requireTenant(actor);

    // `types` raw string olarak gelir; burada virgülle split edip
    // enum'a karşı parse ediyoruz (ZodValidationPipe generic uyumu
    // için transform schema'da değil burada uygulanır).
    let types: TimelineEventType[] | undefined;
    if (query.types && query.types.length > 0) {
      const candidates = query.types
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const parsed: TimelineEventType[] = [];
      for (const c of candidates) {
        const result = timelineEventTypeSchema.safeParse(c);
        if (result.success) parsed.push(result.data);
      }
      types = parsed.length > 0 ? parsed : undefined;
    }

    const result = await this.service.listForPatient(
      tenantId,
      patientId,
      {
        ...(query.from !== undefined && { from: query.from }),
        ...(query.to !== undefined && { to: query.to }),
        ...(types !== undefined && { types }),
        limit: query.limit,
        offset: query.offset,
      },
      actor,
    );
    return { items: result.items, total: result.total };
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
