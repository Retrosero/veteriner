/**
 * @file Bildirim controller.
 * @module apps/api/modules/notifications/notifications.controller
 *
 * @description Manuel bildirim gönderim + in-app inbox endpoint'leri.
 * FAZ-0: test amaçlı; Faz 11+'da domain event'lerden otomatik
 * tetiklenen notification'lar bu service'i kullanır.
 *
 * Endpoint'ler:
 * - POST /api/v1/notifications       — manuel bildirim gönder
 * - GET  /api/v1/notifications/inbox — kullanıcının in-app listesi
 *
 * @since GOAL-015 (FAZ-2) bildirim altyapısı temeli
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  type InboxResponse,
  type NotificationRecord,
  type NotificationRequest,
  notificationRequestSchema,
  inboxResponseSchema,
} from "@vetniva/contracts";

import { NotificationsService } from "./notifications.service.js";
import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator.js";
import { PermissionsGuard } from "../../common/guards/permissions.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";

import type { ActorContext } from "../../common/actor/actor-context.service.js";

@Controller("api/v1/notifications")
@UseGuards(PermissionsGuard)
export class NotificationsController {
  public constructor(private readonly service: NotificationsService) {}

  /**
   * POST /api/v1/notifications — manuel bildirim gönder.
   * Tenant scope: actor.tenantId zorunlu.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions("common:notification:manage")
  public async send(
    @Body(new ZodValidationPipe(notificationRequestSchema))
    body: NotificationRequest,
    @CurrentUser() actor: ActorContext,
  ): Promise<NotificationRecord> {
    return this.service.send(body, actor);
  }

  /**
   * GET /api/v1/notifications/inbox — kullanıcının in-app listesi.
   */
  @Get("inbox")
  @RequirePermissions("common:notification:read")
  public async inbox(
    @Query("userId") userId: string | undefined,
    @CurrentUser() actor: ActorContext,
  ): Promise<InboxResponse> {
    const targetUser = userId ?? actor.actorId ?? "";
    const tenantId = actor.tenantId ?? "";
    const items = await this.service.inbox(targetUser, tenantId, actor);
    return inboxResponseSchema.parse({ items });
  }
}
