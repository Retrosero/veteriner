/**
 * @file Auth controller.
 * @module apps/api/common/auth/auth.controller
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
 * - POST /api/v1/auth/switch-tenant   — aktif tenant değişimi.
 * @security Login response her zaman genel mesaj döner; email
 * enumeration'a karşı koruma. Cookie httpOnly + secure (prod) +
 * SameSite=Lax. CSRF: aynı-origin + SameSite cookie ile.
 * @since GOAL-011 (FAZ-1) kimlik doğrulama
 */

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  acceptInvitationRequestSchema,
  changePasswordRequestSchema,
  forgotPasswordRequestSchema,
  inviteUserRequestSchema,
  loginRequestSchema,
  resetPasswordRequestSchema,
  switchTenantRequestSchema,
  type AcceptInvitationRequest,
  type ChangePasswordRequest,
  type ForgotPasswordRequest,
  type InviteUserRequest,
  type LoginRequest,
  type ResetPasswordRequest,
  type SwitchTenantRequest,
} from "@vetniva/contracts";

import { AuthGuard, Public } from "./auth.guard.js";
import { AuthService } from "./auth.service.js";
import { attemptMetaFromRequest } from "./dto.js";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe.js";

import type { ActorContext } from "../actor/actor-context.service.js";
import type { Request, Response } from "express";

@Controller("auth")
export class AuthController {
  public constructor(private readonly auth: AuthService) {}

  /**
   * POST /auth/login — public.
   * @param body
   * @param request
   * @param response
   */
  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  public async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Req() request: Request & { requestId?: string },
    @Res({ passthrough: true }) response: Response,
  ): Promise<unknown> {
    const meta = attemptMetaFromRequest(request);
    const result = await this.auth.login(body, meta);
    this.setSessionCookie(response, result.sessionToken, result.expiresAt);
    return result;
  }

  /**
   * POST /auth/logout — auth gerekli.
   * @param request
   * @param response
   */
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

  /**
   * POST /auth/refresh — auth gerekli.
   * @param request
   * @param response
   */
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

  /**
   * POST /auth/forgot — public.
   * @param body
   * @param request
   */
  @Public()
  @Post("forgot")
  @HttpCode(HttpStatus.OK)
  public async forgot(
    @Body(new ZodValidationPipe(forgotPasswordRequestSchema))
    body: ForgotPasswordRequest,
    @Req() request: Request & { requestId?: string },
  ): Promise<{ message: string }> {
    const meta = attemptMetaFromRequest(request);
    return this.auth.forgotPassword(body, meta);
  }

  /**
   * POST /auth/reset — public.
   * @param body
   * @param request
   * @param response
   */
  @Public()
  @Post("reset")
  @HttpCode(HttpStatus.OK)
  public async reset(
    @Body(new ZodValidationPipe(resetPasswordRequestSchema))
    body: ResetPasswordRequest,
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

  /**
   * POST /auth/change-password — auth gerekli.
   * @param body
   * @param request
   */
  @UseGuards(AuthGuard)
  @Post("change-password")
  @HttpCode(HttpStatus.OK)
  public async changePassword(
    @Body(new ZodValidationPipe(changePasswordRequestSchema))
    body: ChangePasswordRequest,
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

  /**
   * POST /auth/invitations — auth gerekli (tenant admin).
   * @param body
   * @param request
   */
  @UseGuards(AuthGuard)
  @Post("invitations")
  @HttpCode(HttpStatus.CREATED)
  public async invite(
    @Body(new ZodValidationPipe(inviteUserRequestSchema))
    body: InviteUserRequest,
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
    return this.auth.inviteUser(
      actor.tenantId,
      body,
      actor.actorId ?? "system",
      meta,
    );
  }

  /**
   * POST /auth/invitations/accept — public.
   * @param body
   * @param request
   * @param response
   */
  @Public()
  @Post("invitations/accept")
  @HttpCode(HttpStatus.OK)
  public async accept(
    @Body(new ZodValidationPipe(acceptInvitationRequestSchema))
    body: AcceptInvitationRequest,
    @Req() request: Request & { requestId?: string },
    @Res({ passthrough: true }) response: Response,
  ): Promise<unknown> {
    const meta = attemptMetaFromRequest(request);
    const result = await this.auth.acceptInvitation(body, meta);
    this.setSessionCookie(response, result.sessionToken, result.expiresAt);
    return result;
  }

  /**
   * POST /auth/switch-tenant — auth gerekli.
   * @param body
   * @param request
   */
  @UseGuards(AuthGuard)
  @Post("switch-tenant")
  @HttpCode(HttpStatus.OK)
  public async switchTenant(
    @Body(new ZodValidationPipe(switchTenantRequestSchema))
    body: SwitchTenantRequest,
    @Req() request: Request & { actor?: ActorContext },
  ): Promise<{ tenantId: string; role: string }> {
    const userId = request.actor?.actorId;
    if (!userId) throw new Error("Actor bulunamadı");
    return this.auth.switchTenant(userId, body);
  }

  /**
   * POST /auth/switch-branch/:branchId — Aktif branch'ı değiştirir
   * (multi-branch tenant). GOAL-012 RBAC. Kullanıcı yalnızca kendi
   * tenant'ının branch'larına geçebilir; SUPERADMIN herhangi bir
   * tenant'ın branch'ına geçebilir.
   * @param branchId
   * @param request
   */
  @UseGuards(AuthGuard)
  @Post("switch-branch/:branchId")
  @HttpCode(HttpStatus.OK)
  public async switchBranch(
    @Param("branchId", new ParseUUIDPipe()) branchId: string,
    @Req()
    request: Request & {
      actor?: ActorContext & { isSuperadmin?: boolean };
      authSession?: { sessionId: string; userId: string };
    },
  ): Promise<{ branchId: string }> {
    const userId = request.actor?.actorId;
    const session = request.authSession;
    if (!userId || !session) throw new Error("Actor veya session bulunamadı");
    const isSuperadmin = request.actor?.isSuperadmin === true;
    const meta = attemptMetaFromRequest(
      request as Request & { requestId?: string },
    );
    return this.auth.setActiveBranch(
      userId,
      session.sessionId,
      branchId,
      isSuperadmin,
      meta,
    );
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
