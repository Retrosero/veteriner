/**
 * @file Auth guard + actor extraction.
 * @module apps/api/common/auth/auth.guard
 *
 * @description Her istek için session doğrulaması yapar; başarılıysa
 * `request.actor` üzerinde gerçek `ActorContext` üretir. Bu, GOAL-010
 * header placeholder'ının yerini alır.
 *
 * Akış:
 * 1. Cookie veya `Authorization: Bearer <token>` header'dan token al.
 * 2. AuthService.validateSession ile doğrula.
 * 3. userId, sessionId, role, tenantId, branchId, isSuperadmin'i çıkar.
 * 4. SUPERADMIN bypass: rol "SUPERADMIN" ise tenantId=null
 *    (cross-tenant erişim). isSuperadmin=true döner.
 * 5. Tenant context'i mevcut session'da saklanmaz; her istekte
 *    `UserTenantMembership` üzerinden resolve edilir. Active branch
 *    session'dan okunur.
 *
 * Davranış:
 * - Public endpoint'ler (`@Public()` dekoratörü ile) kontrol
 *   dışıdır; controller'lar bu dekoratörü kullanabilir.
 * - Session yoksa veya geçersizse `UnauthorizedException` (401).
 *
 * @since GOAL-011 (FAZ-1) kimlik doğrulama
 * @updated GOAL-012 (FAZ-1) RBAC ve izin motoru — isSuperadmin + branchId
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
import { Request } from "express";

import {
  ActorContext,
  ActorRole,
} from "../actor/actor-context.service.js";
import { AuthService } from "./auth.service.js";
import { SESSION_COOKIE_NAME } from "@vetniva/contracts";

export const IS_PUBLIC_KEY = "auth:isPublic";
/** Public endpoint işaretleyicisi (auth kontrol dışı). */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);

declare module "express-serve-static-core" {
  interface Request {
    /** AuthService.validateSession sonucu. */
    authSession?: {
      userId: string;
      sessionId: string;
      expiresAt: Date;
    };
  }
}

/**
 * Auth guard. Session doğrular, ActorContext üretir.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  public constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<Request & { actor?: ActorContext }>();

    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException({
        errorCode: "VET-AUTH-0001",
        message: "Kimlik doğrulama gerekli",
        i18nKey: "error.VET-AUTH-0001",
      });
    }

    const session = await this.auth.validateSession(token);
    if (!session) {
      throw new UnauthorizedException({
        errorCode: "VET-AUTH-0001",
        message: "Oturum geçersiz veya süresi dolmuş",
        i18nKey: "error.VET-AUTH-0001",
      });
    }

    request.authSession = {
      userId: session.userId,
      sessionId: session.sessionId,
      expiresAt: session.expiresAt,
    };

    // Tenant + role context'i her istekte resolve et. SUPERADMIN
    // ise tenantId=null + isSuperadmin=true; aksi halde ilk aktif
    // üyelikten.
    const { role, tenantId, isSuperadmin } =
      await this.resolveRoleAndTenant(session.userId);

    // Branch context: session'daki aktif branch. Header override'ı
    // (X-Branch-Id) yalnızca SUPERADMIN için kabul edilir (cross-tenant
    // görünüm). Normal kullanıcılar için session'daki branch bağlamı
    // değiştirilemez.
    let branchId: string | null = session.activeBranchId;
    if (isSuperadmin) {
      const headerBranch = request.header("x-branch-id");
      if (headerBranch) branchId = headerBranch;
    }

    const correlationId =
      (request as Request & { requestId?: string }).requestId ??
      "req-unknown";
    const ipRaw =
      request.header("x-forwarded-for") ??
      request.ip ??
      request.socket?.remoteAddress ??
      null;
    const ip = ipRaw ? maskIp(typeof ipRaw === "string" ? ipRaw : String(ipRaw)) : null;
    const ua = request.header("user-agent") ?? null;
    const userAgentHash = ua ? hashUserAgent(ua) : null;

    request.actor = {
      actorId: session.userId,
      actorType: "user",
      role,
      tenantId,
      branchId,
      isSuperadmin,
      correlationId,
      ipAddress: ip,
      userAgentHash,
      source: "session",
    } as ActorContext & { isSuperadmin: boolean };

    return true;
  }

  private extractToken(request: Request): string | null {
    const cookieToken = (request as Request & { cookies?: Record<string, string> })
      .cookies?.[SESSION_COOKIE_NAME];
    if (cookieToken) return cookieToken;
    const auth = request.header("authorization");
    if (auth?.toLowerCase().startsWith("bearer ")) {
      return auth.substring(7).trim();
    }
    return null;
  }

  /**
   * Kullanıcının rolünü ve aktif tenant'ı çözümler. Birden fazla
   * tenant'a üye ise ilk aktif üyelik döner. SUPERADMIN bypass.
   *
   * Memberships verisi AuthService üzerinden çözümlenir (RLS
   * nedeniyle repository doğrudan erişilmez). GOAL-012 ile birlikte
   * `isSuperadmin` bayrağı user tablosundan okunur.
   */
  private async resolveRoleAndTenant(
    userId: string,
  ): Promise<{
    role: ActorRole;
    tenantId: string | null;
    isSuperadmin: boolean;
  }> {
    const resolved = await (this.auth as unknown as {
      resolveActorContext: (id: string) => Promise<{
        role: ActorRole;
        tenantId: string | null;
        isSuperadmin: boolean;
      }>;
    }).resolveActorContext(userId);
    return resolved;
  }
}

/** IP mask'leme (actor-context ile aynı algoritma). */
function maskIp(ip: string): string {
  const cleaned = ip.split(",")[0]?.trim() ?? ip;
  if (cleaned.includes(":")) return "***";
  return cleaned.replace(/\.\d+$/, ".***");
}

/** User agent kısa hash. */
function hashUserAgent(ua: string): string {
  let hash = 2166136261;
  for (let i = 0; i < ua.length; i++) {
    hash ^= ua.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0").slice(0, 16);
}
