/**
 * @file Identity controller.
 * @module apps/api/modules/identity/identity.controller
 *
 * @description Oturum açmış kullanıcının kendi bilgileri ve
 * oturumlarını yönetir. /me, /me/sessions, /me/sessions/:id/revoke.
 *
 * @since GOAL-011 (FAZ-1) kimlik doğrulama
 */

import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";

import { ActorContext } from "../../common/actor/actor-context.service.js";
import { AuthGuard } from "../../common/auth/auth.guard.js";
import { AuthService } from "../../common/auth/auth.service.js";
import { attemptMetaFromRequest } from "../../common/auth/dto.js";

@Controller("me")
@UseGuards(AuthGuard)
export class IdentityController {
  public constructor(private readonly auth: AuthService) {}

  /** GET /me — aktif kullanıcı + session + üyelikler. */
  @Get()
  public async me(
    @Req()
    request: Request & {
      authSession?: { userId: string; sessionId: string };
    },
  ): Promise<unknown> {
    if (!request.authSession) {
      throw new Error("Session bulunamadı");
    }
    return this.auth.me(
      request.authSession.userId,
      request.authSession.sessionId,
    );
  }

  /** GET /me/sessions — kullanıcının tüm session'ları. */
  @Get("sessions")
  public async sessions(
    @Req()
    request: Request & {
      authSession?: { userId: string; sessionId: string };
    },
  ): Promise<unknown> {
    if (!request.authSession) {
      throw new Error("Session bulunamadı");
    }
    return {
      items: await this.auth.listSessions(
        request.authSession.userId,
        request.authSession.sessionId,
      ),
    };
  }

  /** DELETE /me/sessions/:id — belirli bir session'ı iptal et. */
  @Delete("sessions/:id")
  @HttpCode(HttpStatus.OK)
  public async revokeSession(
    @Param("id") sessionId: string,
    @Req() request: Request & { actor?: ActorContext },
  ): Promise<{ revoked: true }> {
    const userId = request.actor?.actorId;
    if (!userId) throw new Error("Actor bulunamadı");
    const meta = attemptMetaFromRequest(
      request as Request & { requestId?: string },
    );
    await this.auth.revokeSessionById(sessionId, userId, meta);
    return { revoked: true };
  }
}
