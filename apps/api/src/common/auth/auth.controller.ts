/**
 * @file Auth controller.
 * @module apps/api/common/auth/auth.controller
 *
 * @description Personel paneli kimlik doğrulama endpoint'leri.
 * Tüm endpoint'ler JSON döner; session token httpOnly cookie olarak
 * da set edilir. Public endpoint'ler (login, forgot, reset, accept)
 * `@Public()` dekoratörü ile AuthGuard dışında tutulur.
 *
 * Endpoint'ler:
 * - POST /auth/login                  — email + parola ile giriş
 * - POST /auth/logout                 — mevcut oturumu sona erdir
 * - POST /auth/refresh                — token rotation
 * - POST /auth/forgot                 — parola sıfırlama talebi
 * - POST /auth/reset                  — token + yeni parola
 * - POST /auth/change-password        — oturum açıkken parola değişimi
 * - POST /auth/invitations            — tenant admin davet oluşturur
 * - POST /auth/invitations/accept     — davet kabul
 * - POST /api/v1/auth/switch-tenant   — aktif tenant değişimi
 *
 * @security Login response her zaman genel mesaj döner; email
 * enumeration'a karşı koruma. Cookie httpOnly + secure (prod) +
 * SameSite=Lax. CSRF: aynı-origin + SameSite cookie ile.
 *
 * @since GOAL-011 (FAZ-1) kimlik doğrulama
 */

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  type AcceptInvitationRequest,
  type ChangePasswordRequest,
  type ForgotPasswordRequest,
  type InviteUserRequest,
  type LoginRequest,
  type ResetPasswordRequest,
  type SwitchTenantRequest,
} from "@vetniva/contracts";

import type { ActorContext } from "../actor/actor-context.service.js";

import { AuthGuard, Public } from "./auth.guard.js";
import { AuthService } from "./auth.service.js";
import { attemptMetaFromRequest } from "./dto.js";

@Controller("auth")
export class AuthController {
  public constructor(private readonly auth: AuthService) {}

  /** POST /auth/login — public. */
  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  public async login(
    @Body() body: LoginRequest,
    @Req() request: Request & { requestId?: string },
    @Res({ passthrough: true }) response: Response,
  ): Promise<unknown> {
    const meta = attemptMetaFromRequest(request);
    const result = await this.auth.login(body, meta);
    this.setSessionCookie(response, result.sessionToken, result.expiresAt);
    return result;
  }

  /** POST /auth/logout — auth gerekli. */
  @UseGuards(AuthGuard)
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  public async logout(
    @Req()
    request: Request & {
      authSession?: { sessionId: string; userId: string };
      actor?: ActorContext;
    },
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ revokedAt: string }> {
    if (!request.authSession) {
      throw new Error("Session bulunamadı");
    }
    const meta = attemptMetaFromRequest(request);
    const result = await this.auth.logout(
      request.authSession.sessionId,
      request.authSession.userId,
      meta,
    );
    this.clearSessionCookie(response);
    return result;
  }

  /** POST /auth/refresh — auth gerekli. */
  @UseGuards(AuthGuard)
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  public async refresh(
    @Req()
    request: Request & {
      authSession?: { sessionId: string; userId: string };
    },
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ sessionToken: string; expiresAt: string }> {
    if (!request.authSession) {
      throw new Error("Session bulunamadı");
    }
    const meta = attemptMetaFromRequest(request);
    const result = await this.auth.refresh(
      request.authSession.sessionId,
      request.authSession.userId,
      meta,
    );
    this.setSessionCookie(response, result.sessionToken, result.expiresAt);
    return result;
  }

  /** POST /auth/forgot — public. */
  @Public()
  @Post("forgot")
  @HttpCode(HttpStatus.OK)
  public async forgot(
    @Body() body: ForgotPasswordRequest,
    @Req() request: Request & { requestId?: string },
  ): Promise<{ message: string }> {
    const meta = attemptMetaFromRequest(request);
    return this.auth.forgotPassword(body, meta);
  }

  /** POST /auth/reset — public. */
  @Public()
  @Post("reset")
  @HttpCode(HttpStatus.OK)
  public async reset(
    @Body() body: ResetPasswordRequest,
    @Req() request: Request & { requestId?: string },
    @Res({ passthrough: true }) response: Response,
  ): Promise<unknown> {
    const meta = attemptMetaFromRequest(request);
    const result = await this.auth.resetPassword(body, meta);
    if (result.sessionToken && result.expiresAt) {
      this.setSessionCookie(response, result.sessionToken, result.expiresAt);
    }
    return result;
  }

  /** POST /auth/change-password — auth gerekli. */
  @UseGuards(AuthGuard)
  @Post("change-password")
  @HttpCode(HttpStatus.OK)
  public async changePassword(
    @Body() body: ChangePasswordRequest,
    @Req() request: Request & { actor?: ActorContext },
  ): Promise<{ message: string }> {
    const userId = request.actor?.actorId;
    if (!userId) {
      throw new Error("Actor bulunamadı");
    }
    const meta = attemptMetaFromRequest(
      request as Request & { requestId?: string },
    );
    return this.auth.changePassword(userId, body, meta);
  }

  /** POST /auth/invitations — auth gerekli (tenant admin). */
  @UseGuards(AuthGuard)
  @Post("invitations")
  @HttpCode(HttpStatus.CREATED)
  public async invite(
    @Body() body: InviteUserRequest,
    @Req() request: Request & { actor?: ActorContext },
  ): Promise<unknown> {
    const actor = request.actor;
    if (!actor) throw new Error("Actor bulunamadı");
    if (!actor.tenantId) {
      throw new Error("Tenant bağlamı zorunlu");
    }
    const meta = attemptMetaFromRequest(
      request as Request & { requestId?: string },
    );
    return this.auth.inviteUser(actor.tenantId, body, actor.actorId ?? "system", meta);
  }

  /** POST /auth/invitations/accept — public. */
  @Public()
  @Post("invitations/accept")
  @HttpCode(HttpStatus.OK)
  public async accept(
    @Body() body: AcceptInvitationRequest,
    @Req() request: Request & { requestId?: string },
    @Res({ passthrough: true }) response: Response,
  ): Promise<unknown> {
    const meta = attemptMetaFromRequest(request);
    const result = await this.auth.acceptInvitation(body, meta);
    this.setSessionCookie(response, result.sessionToken, result.expiresAt);
    return result;
  }

  /** POST /auth/switch-tenant — auth gerekli. */
  @UseGuards(AuthGuard)
  @Post("switch-tenant")
  @HttpCode(HttpStatus.OK)
  public async switchTenant(
    @Body() body: SwitchTenantRequest,
    @Req() request: Request & { actor?: ActorContext },
  ): Promise<{ tenantId: string; role: string }> {
    const userId = request.actor?.actorId;
    if (!userId) throw new Error("Actor bulunamadı");
    return this.auth.switchTenant(userId, body);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private setSessionCookie(
    response: Response,
    token: string,
    expiresAt: string,
  ): void {
    const isProd = process.env["NODE_ENV"] === "production";
    response.cookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      expires: new Date(expiresAt),
      maxAge: SESSION_TTL_SECONDS * 1000,
    });
  }

  private clearSessionCookie(response: Response): void {
    response.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
  }
}
