/**
 * @file Portal session guard.
 * @module apps/api/modules/portal-auth/portal-session.guard
 *
 * @description GOAL-033 hasta sahibi portal hesap kayıt ve giriş
 * için personel auth'undan tamamen ayrı bir session guard. Personel
 * `AuthGuard`'ı SESSION_COOKIE_NAME (`vetniva_session`) cookie'sini
 * okurken, bu guard PORTAL_SESSION_COOKIE_NAME
 * (`vetniva_portal_session`) cookie'sini okur. Personel paneli ve
 * portal paneli aynı tarayıcıda aynı anda oturum açabilir; iki
 * session birbirine karışmaz.
 *
 * Davranış:
 * 1. `@Public()` ile işaretlenmiş endpoint'leri atlar.
 * 2. Cookie veya `Authorization: Bearer <token>` header'dan portal
 *    session token alır.
 * 3. `PortalAuthService.validateSession` ile user'ı doğrular.
 * 4. Süresi geçmiş session otomatik temizlenir.
 * 5. `request.portalSession` üzerinde `{ portalUserId, tenantId,
 *    sessionToken, expiresAt }` set eder; controller `@PortalUser()`
 *    decorator ile okur.
 *
 * Tenant izolasyonu: yalnızca portal user'ın kendi tenantId'si
 * kabul edilir. SUPERADMIN bu guard'dan geçemez (personel guard
 * gerekir).
 *
 * @security
 * - Token yoksa veya geçersizse 401 VET-AUTH-0001.
 * - 5 başarısız deneme sonrası hesap kilidi personel guard'dan
 *   bağımsız olarak çalışır (brute-force Service içinde).
 * - Audit `audit:portal.session.validate_failure` (uyarı) sadece
 *   süresi geçmiş session'da atılır; bulunamayan token'lar PII
 *   sızıntısı riski nedeniyle loglanmaz.
 *
 * @since GOAL-033 (FAZ-3) hasta sahibi portal hesap kayıt ve giriş
 */

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";

import { PORTAL_SESSION_COOKIE_NAME } from "@vetniva/contracts";

import { PortalAuthService } from "./portal-auth.service.js";

/** Public portal endpoint işaretleyicisi. Bu guard atlanır. */
export const IS_PORTAL_PUBLIC_KEY = "portal:isPublic";
export const PortalPublic = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PORTAL_PUBLIC_KEY, true);

declare module "express-serve-static-core" {
  interface Request {
    /** PortalSessionGuard sonrası set edilen context. */
    portalSession?: {
      portalUserId: string;
      tenantId: string;
      sessionToken: string;
      expiresAt: string;
    };
  }
}

/**
 * Portal session guard. Personel auth'undan tamamen ayrı çalışır;
 * portal cookie + header üzerinden session doğrular.
 */
@Injectable()
export class PortalSessionGuard implements CanActivate {
  private readonly logger = new Logger(PortalSessionGuard.name);

  public constructor(
    private readonly auth: PortalAuthService,
    private readonly reflector: Reflector,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PORTAL_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();

    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException({
        errorCode: "VET-AUTH-0001",
        message: "Portal oturumu gerekli",
        i18nKey: "error.VET-AUTH-0001",
      });
    }

    const user = await this.auth.validateSession(token);
    if (!user) {
      throw new UnauthorizedException({
        errorCode: "VET-AUTH-0001",
        message: "Portal oturumu geçersiz veya süresi dolmuş",
        i18nKey: "error.VET-AUTH-0001",
      });
    }

    // Session meta'sını bul (cookie token → expiresAt eşlemesi).
    // validateSession user döndürüyor; expiresAt için audit'e
    // güvenmek yerine PortalAuthService'e ek bir API ekleyebiliriz
    // fakat tenant + portalUserId yeterli. expiresAt'ı burada
    // PortalAuthService.validateSessionAndGetSession ile alıyoruz.
    const sessionInfo = await this.auth.getSessionMeta(token);
    if (!sessionInfo) {
      throw new UnauthorizedException({
        errorCode: "VET-AUTH-0001",
        message: "Portal oturumu geçersiz veya süresi dolmuş",
        i18nKey: "error.VET-AUTH-0001",
      });
    }

    request.portalSession = {
      portalUserId: user.id,
      tenantId: user.tenantId,
      sessionToken: token,
      expiresAt: sessionInfo.expiresAt,
    };
    return true;
  }

  private extractToken(request: Request): string | null {
    const cookieToken = (request as Request & { cookies?: Record<string, string> })
      .cookies?.[PORTAL_SESSION_COOKIE_NAME];
    if (cookieToken) return cookieToken;
    const auth = request.header("authorization");
    if (auth?.toLowerCase().startsWith("bearer ")) {
      return auth.substring(7).trim();
    }
    return null;
  }
}
