/**
 * @file Portal kimlik doğrulama controller.
 * @module apps/api/modules/portal-auth/portal-auth.controller
 *
 * @description GOAL-033 hasta sahibi portal hesap kayıt ve giriş
 * HTTP endpoint'leri. Personel auth'undan ayrı route'lar; cookie
 * adı `vetniva_portal_session`. Tüm endpoint'ler JSON döner.
 *
 * Endpoint'ler:
 * - POST /api/v1/portal-auth/register             — public (KVKK + parola)
 * - POST /api/v1/portal-auth/register-by-invitation — public (davet + parola)
 * - POST /api/v1/portal-auth/login                — public
 * - POST /api/v1/portal-auth/logout               — public (cookie'den token alır)
 * - POST /api/v1/portal-auth/forgot-password      — public
 * - POST /api/v1/portal-auth/reset-password       — public (token ile)
 * - POST /api/v1/portal-auth/verify-email         — public (token ile)
 * - GET  /api/v1/portal-auth/me                   — portal-session guard
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
 *   `PortalSessionGuard` yalnızca authenticated portal
 *   endpoint'lerinde (örn. /me) devreye girer.
 *
 * @since GOAL-033 (FAZ-3) hasta sahibi portal hesap kayıt ve giriş
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  PORTAL_SESSION_COOKIE_NAME,
  PORTAL_SESSION_TTL_SECONDS,
} from "@vetniva/contracts";
import {
  portalForgotPasswordRequestSchema,
  portalLoginRequestSchema,
  portalRegisterByInvitationRequestSchema,
  portalRegisterRequestSchema,
  portalResetPasswordRequestSchema,
  portalVerifyEmailRequestSchema,
  type PortalForgotPasswordRequest,
  type PortalLoginRequest,
  type PortalMessageResponse,
  type PortalRegisterByInvitationRequest,
  type PortalRegisterRequest,
  type PortalResetPasswordRequest,
  type PortalSessionResponse,
  type PortalVerifyEmailRequest,
} from "@vetniva/contracts";

import { PortalAuthService } from "./portal-auth.service.js";
import { PortalSessionGuard } from "./portal-session.guard.js";
import { attemptMetaFromRequest } from "../../common/auth/dto.js";
import { Public } from "../../common/decorators/public.decorator.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";

import type { Request, Response } from "express";

@Public()
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
  ): Promise<{ user: unknown; emailVerificationToken: string }> {
    const ctx = attemptMetaFromRequest(request);
    const tenantId = this.resolveTenant(request);
    if (!tenantId) throw this.tenantRequired();
    const result = await this.service.register(
      tenantId,
      {
        email: body.email,
        password: body.password,
        ownerId: body.ownerId,
        consentKvkk: body.consentKvkk,
        ...(body.displayName !== undefined
          ? { displayName: body.displayName }
          : {}),
        ...(body.locale !== undefined ? { locale: body.locale } : {}),
      },
      ctx,
    );
    return {
      user: result.user,
      emailVerificationToken: result.emailVerificationToken,
    };
  }

  /**
   * POST /api/v1/portal-auth/register-by-invitation — public.
   * Davet üzerinden portal hesabı oluşturur. Davet token'ı
   * `PortalService` üzerinden doğrulanır; pending + expired değilse
   * PortalUser oluşturulur ve davet `accepted` işaretlenir.
   * Body: { token, email, password, consentKvkk, displayName?, locale? }
   */
  @Public()
  @Post("register-by-invitation")
  @HttpCode(HttpStatus.CREATED)
  public async registerByInvitation(
    @Body(new ZodValidationPipe(portalRegisterByInvitationRequestSchema))
    body: PortalRegisterByInvitationRequest,
    @Req() request: Request & { requestId?: string },
  ): Promise<{ user: unknown; emailVerificationToken: string }> {
    const ctx = attemptMetaFromRequest(request);
    const result = await this.service.registerByInvitation(
      body.token,
      body.password,
      {
        email: body.email,
        consentKvkk: body.consentKvkk,
        ...(body.displayName !== undefined
          ? { displayName: body.displayName }
          : {}),
        ...(body.locale !== undefined ? { locale: body.locale } : {}),
      },
      ctx,
    );
    return {
      user: result.user,
      emailVerificationToken: result.emailVerificationToken,
    };
  }

  /**
   * POST /api/v1/portal-auth/verify-email — public.
   * Body: { token }
   */
  @Public()
  @Post("verify-email")
  @HttpCode(HttpStatus.OK)
  public async verifyEmail(
    @Body(new ZodValidationPipe(portalVerifyEmailRequestSchema))
    body: PortalVerifyEmailRequest,
    @Req() request: Request & { requestId?: string },
  ): Promise<{ message: string; email: string }> {
    const ctx = attemptMetaFromRequest(request);
    return this.service.verifyEmail(body.token, ctx);
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
    const ipRaw = request.header("x-forwarded-for") ?? request.ip ?? null;
    const ip = ipRaw ? (String(ipRaw).split(",")[0]?.trim() ?? null) : null;
    const ua = request.header("user-agent") ?? null;

    const loginInput = {
      email: body.email,
      password: body.password,
      ...(body.tenantSlug !== undefined ? { tenantSlug: body.tenantSlug } : {}),
    };
    const result = await this.service.login(tenantId, loginInput, ip, ua);
    this.setSessionCookie(
      response,
      result.session.token,
      result.session.expiresAt,
    );
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
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PortalMessageResponse> {
    const cookieBag: unknown = Reflect.get(
      request as object,
      "cookies",
    ) as unknown;
    const cookieToken: unknown =
      typeof cookieBag === "object" && cookieBag !== null
        ? (Reflect.get(cookieBag, PORTAL_SESSION_COOKIE_NAME) as unknown)
        : null;
    const authorization = request.header("authorization");
    const bearerToken = authorization?.startsWith("Bearer ")
      ? authorization.substring(7).trim()
      : null;
    const token = typeof cookieToken === "string" ? cookieToken : bearerToken;
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

  /**
   * GET /api/v1/portal-auth/me — portal-session guard'lı.
   * Cookie'den portal session token alır; yoksa 401. Authenticated
   * portal kullanıcısının bilgilerini döner.
   */
  @UseGuards(PortalSessionGuard)
  @Get("me")
  public async me(
    @Req()
    request: Request & {
      portalSession?: {
        portalUserId: string;
        tenantId: string;
        sessionToken: string;
        expiresAt: string;
      };
    },
  ): Promise<{
    portalUserId: string;
    tenantId: string;
    email: string;
    status: string;
    ownerId: string;
    expiresAt: string;
  }> {
    const session = request.portalSession;
    if (!session) {
      // Guard 401 fırlatır; bu satıra ulaşılmaz.
      throw new Error("Portal session context missing");
    }
    const user = await this.service.validateSession(session.sessionToken);
    if (!user) {
      throw new Error("Portal session invalid");
    }
    return {
      portalUserId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      status: user.status,
      ownerId: user.ownerId,
      expiresAt: session.expiresAt,
    };
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
