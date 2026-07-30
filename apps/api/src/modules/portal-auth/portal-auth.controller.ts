/**
 * @file Portal kimlik doğrulama controller.
 * @module apps/api/modules/portal-auth/portal-auth.controller
 *
 * @description GOAL-033 hasta sahibi portal hesap kayıt ve giriş
 * HTTP endpoint'leri. Personel auth'undan ayrı route'lar; cookie
 * adı `vetniva_portal_session`. Tüm endpoint'ler JSON döner.
 *
 * Endpoint'ler:
 * - POST /api/v1/portal-auth/register     — public (KVKK onayı + parola)
 * - POST /api/v1/portal-auth/login        — public
 * - POST /api/v1/portal-auth/logout       — public (cookie'den token alır)
 * - POST /api/v1/portal-auth/forgot-password — public
 * - POST /api/v1/portal-auth/reset-password  — public (token ile)
 *
 * Tenant bağlamı: pilot tek tenant olduğundan istek header'ından
 * (`x-tenant-slug` veya `x-tenant-id`) okunur. Üretimde
 * domain-based tenant çözümleme (TenantResolver) ile değişecek.
 *
 * @security
 * - Login response her zaman genel mesaj döner (VET-AUTH-0002).
 * - Forgot password response her durumda OK (email enumeration
 *   koruması).
 * - Cookie httpOnly + SameSite=Lax + secure (prod).
 * - Personel AuthGuard kullanılmaz (portal session ayrı path);
 *   logout cookie'den okunan token ile idempotent çalışır.
 *
 * @since GOAL-033 (FAZ-3) hasta sahibi portal hesap kayıt ve giriş
 */

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";

import { Public } from "../../common/decorators/public.decorator.js";
import {
  PORTAL_SESSION_COOKIE_NAME,
  PORTAL_SESSION_TTL_SECONDS,
} from "@vetniva/contracts";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import {
  portalForgotPasswordRequestSchema,
  portalLoginRequestSchema,
  portalRegisterRequestSchema,
  portalResetPasswordRequestSchema,
  type PortalForgotPasswordRequest,
  type PortalLoginRequest,
  type PortalMessageResponse,
  type PortalRegisterRequest,
  type PortalResetPasswordRequest,
  type PortalSessionResponse,
} from "@vetniva/contracts";

import { PortalAuthService } from "./portal-auth.service.js";
import { attemptMetaFromRequest } from "../../common/auth/dto.js";

@Controller("api/v1/portal-auth")
export class PortalAuthController {
  public constructor(private readonly service: PortalAuthService) {}

  /**
   * POST /api/v1/portal-auth/register — public.
   * Body: { email, password, ownerId, consentKvkk, displayName?, locale? }
   */
  @Public()
  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  public async register(
    @Body(new ZodValidationPipe(portalRegisterRequestSchema))
    body: PortalRegisterRequest,
    @Req() request: Request & { requestId?: string },
  ): Promise<{ user: unknown }> {
    const ctx = attemptMetaFromRequest(request);
    const tenantId = this.resolveTenant(request);
    if (!tenantId) throw this.tenantRequired();
    const user = await this.service.register(
      tenantId,
      {
        email: body.email,
        password: body.password,
        ownerId: body.ownerId,
        consentKvkk: body.consentKvkk,
        ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
        ...(body.locale !== undefined ? { locale: body.locale } : {}),
      },
      ctx,
    );
    return { user };
  }

  /**
   * POST /api/v1/portal-auth/login — public.
   * Body: { email, password, tenantSlug? }
   * Response: { user, sessionToken, expiresAt }; cookie set.
   */
  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  public async login(
    @Body(new ZodValidationPipe(portalLoginRequestSchema))
    body: PortalLoginRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PortalSessionResponse> {
    const tenantId = this.resolveTenant(request) ?? "tenant-default";
    const ipRaw =
      request.header("x-forwarded-for") ?? request.ip ?? null;
    const ip = ipRaw ? String(ipRaw).split(",")[0]?.trim() ?? null : null;
    const ua = request.header("user-agent") ?? null;

    const loginInput = {
      email: body.email,
      password: body.password,
      ...(body.tenantSlug !== undefined ? { tenantSlug: body.tenantSlug } : {}),
    };
    const result = await this.service.login(tenantId, loginInput, ip, ua);
    this.setSessionCookie(response, result.session.token, result.session.expiresAt);
    return {
      sessionToken: result.session.token,
      expiresAt: result.session.expiresAt,
      portalUser: {
        id: result.user.id,
        email: result.user.email,
        displayName: null,
        locale: "tr-TR",
        ownerId: result.user.ownerId,
        patientIds: [],
      },
      tenant: {
        id: tenantId,
        slug: tenantId.slice(0, 8),
        name: "Klinik",
        country: "TR",
      },
    };
  }

  /**
   * POST /api/v1/portal-auth/logout — public.
   * Cookie'den token alır; yoksa idempotent 200. Session
   * bulunmasa bile 200 döner (güvenli logout).
   */
  @Public()
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  public async logout(
    @Req()
    request: Request & {
      cookies?: Record<string, string>;
    },
    @Res({ passthrough: true }) response: Response,
  ): Promise<PortalMessageResponse> {
    const token =
      request.cookies?.[PORTAL_SESSION_COOKIE_NAME] ??
      (request.header("authorization")?.startsWith("Bearer ")
        ? (request.header("authorization") as string).substring(7).trim()
        : null);
    if (token) {
      const ctx = attemptMetaFromRequest(request);
      await this.service.logout(token, ctx);
    }
    this.clearSessionCookie(response);
    return { message: "Oturum kapatıldı" };
  }

  /** POST /api/v1/portal-auth/forgot-password — public. */
  @Public()
  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  public async forgotPassword(
    @Body(new ZodValidationPipe(portalForgotPasswordRequestSchema))
    body: PortalForgotPasswordRequest,
    @Req() request: Request & { requestId?: string },
  ): Promise<{ message: string; resetToken?: string }> {
    const ctx = attemptMetaFromRequest(request);
    const tenantId = this.resolveTenant(request) ?? "tenant-default";
    return this.service.requestPasswordReset(tenantId, body.email, ctx);
  }

  /** POST /api/v1/portal-auth/reset-password — public. */
  @Public()
  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  public async resetPassword(
    @Body(new ZodValidationPipe(portalResetPasswordRequestSchema))
    body: PortalResetPasswordRequest,
    @Req() request: Request & { requestId?: string },
  ): Promise<PortalMessageResponse> {
    const ctx = attemptMetaFromRequest(request);
    const result = await this.service.confirmPasswordReset(
      body.token,
      body.newPassword,
      ctx,
    );
    return { message: result.message };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private resolveTenant(request: Request): string | null {
    const slug = request.header("x-tenant-slug");
    if (slug) return slug;
    const id = request.header("x-tenant-id");
    if (id) return id;
    return null;
  }

  private tenantRequired(): Error {
    const err = new Error("Tenant bağlamı zorunlu");
    (err as Error & { code?: string }).code = "VET-TENANT-0001";
    return err;
  }

  private setSessionCookie(
    response: Response,
    token: string,
    expiresAt: string,
  ): void {
    const isProd = process.env["NODE_ENV"] === "production";
    response.cookie(PORTAL_SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      expires: new Date(expiresAt),
      maxAge: PORTAL_SESSION_TTL_SECONDS * 1000,
    });
  }

  private clearSessionCookie(response: Response): void {
    response.clearCookie(PORTAL_SESSION_COOKIE_NAME, { path: "/" });
  }
}
