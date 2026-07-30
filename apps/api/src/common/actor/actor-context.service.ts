/**
 * @file Actor context (FAZ-1 auth placeholder).
 * @module apps/api/common/actor/actor-context
 *
 * @description GOAL-011'e kadar gerçek auth mekanizması yerine, her
 * isteğin actor bilgisini HTTP başlıklarından okur. Bu sınıf:
 * - Header'lardan `X-Actor-Id`, `X-Actor-Role`, `X-Tenant-Id` okur.
 * - Bu başlıklar YOKSA `STAFF` rolünde sanal bir actor üretir
 *   (yalnızca development/test).
 * - `production` ortamında başlıklar YOKSA hata fırlatır (auth olmadan
 *   koruma sağlanmaz; deploy kilidi PR'ye not düşülür).
 *
 * Bu davranış GOAL-011'de (kimlik doğrulama) gerçek JWT/session tabanlı
 * actor extraction ile değiştirilecek. `ActorContext` arayüzü sabit
 * kalacak; migration şeffaf olacak.
 *
 * @security Production'da bu placeholder KAPALI olmalı. Başlık spoofing'e
 *   açıktır. GOAL-011 sonrası bu dosya silinir veya `noop`'a indirgenir.
 *
 * @since GOAL-010 (FAZ-1) tenant ve şube altyapısı
 */

import { Injectable, UnauthorizedException } from "@nestjs/common";

/**
 * Desteklenen actor rolleri. Permission kataloğu ile aynı küme.
 */
export type ActorRole =
  | "SUPERADMIN"
  | "OWNER"
  | "VETERINARIAN"
  | "STAFF"
  | "PET_OWNER_PORTAL"
  | "SYSTEM";

/**
 * Tek bir istek boyunca taşınan actor bilgisi. Tenant context'i de
 * içerir (DB RLS için).
 */
export interface ActorContext {
  /** Actor ID (kullanıcı UUID). SYSTEM için null. */
  actorId: string | null;
  /** Actor tipi (user / system). */
  actorType: "user" | "system";
  /** Aktörün rolü. SUPERADMIN tüm tenantları görebilir. */
  role: ActorRole;
  /** Aktif tenant (varsa). SUPERADMIN tüm tenantları yönetir. */
  tenantId: string | null;
  /** Aktif şube (opsiyonel; bazı endpoint'lerde zorunlu olacak). */
  branchId: string | null;
  /** SUPERADMIN bayrağı (GOAL-012 RBAC). Sistem düzeyinde bypass
   *  yetkisi. Tenant üyeliği olmadan çalışır. */
  isSuperadmin: boolean;
  /** Request ID (correlation). */
  correlationId: string;
  /** Mask'li IP (opsiyonel). */
  ipAddress: string | null;
  /** User agent hash (opsiyonel). */
  userAgentHash: string | null;
  /** Actor'un menşei (auth placeholder'da `header`/`default`,
   *  gerçek auth sonrası `session`, sistem event'lerde `system`). */
  source: "header" | "default" | "session" | "system";
}

const ACTOR_ID_HEADER = "x-actor-id";
const ACTOR_ROLE_HEADER = "x-actor-role";
const ACTOR_TENANT_HEADER = "x-tenant-id";
const ACTOR_BRANCH_HEADER = "x-branch-id";
const ACTOR_IP_HEADER = "x-forwarded-for";
const ACTOR_UA_HEADER = "x-user-agent";

/**
 * ActorContextService. Her istek başında çağrılır; actor bilgisini
 * sağlar. NestJS interceptor veya guard ile birlikte kullanılır.
 */
@Injectable()
export class ActorContextService {
  /**
   * Express request'ten actor bilgisi çıkarır. Header varsa onu kullanır;
   * yoksa default placeholder actor üretir (sadece non-production).
   *
   * @param req Express request veya benzeri (header'a erişim sağlar)
   * @param correlationId Her istek için benzersiz correlation ID
   */
  public fromRequest(
    req: {
      header(name: string): string | undefined;
      ip?: string;
      socket?: { remoteAddress?: string };
    },
    correlationId: string,
  ): ActorContext {
    const env = process.env["NODE_ENV"] ?? "development";
    const actorId = req.header(ACTOR_ID_HEADER);
    const role = req.header(ACTOR_ROLE_HEADER) as ActorRole | undefined;
    const tenantId = req.header(ACTOR_TENANT_HEADER);
    const branchId = req.header(ACTOR_BRANCH_HEADER);
    const ip = req.header(ACTOR_IP_HEADER) ?? req.ip ?? req.socket?.remoteAddress ?? null;
    const ua = req.header(ACTOR_UA_HEADER);

    const hasHeader = actorId || role || tenantId;

    if (hasHeader) {
      return {
        actorId: actorId ?? null,
        actorType: actorId ? "user" : "system",
        role: role ?? "STAFF",
        tenantId: tenantId ?? null,
        branchId: branchId ?? null,
        isSuperadmin: false,
        correlationId,
        ipAddress: ip ? maskIp(ip) : null,
        userAgentHash: ua ? hashUserAgent(ua) : null,
        source: "header",
      };
    }

    if (env === "production") {
      throw new UnauthorizedException({
        errorCode: "VET-AUTH-0001",
        message: "Actor bilgisi eksik; kimlik doğrulama gerekli (GOAL-011).",
        i18nKey: "error.VET-AUTH-0001",
      });
    }

    // Development/test: default STAFF actor.
    return {
      actorId: "usr-dev-placeholder",
      actorType: "user",
      role: "STAFF",
      tenantId: tenantId ?? null,
      branchId: branchId ?? null,
      isSuperadmin: false,
      correlationId,
      ipAddress: ip ? maskIp(ip) : null,
      userAgentHash: ua ? hashUserAgent(ua) : null,
      source: "default",
    };
  }

  /**
   * Sistem actor'ü (background job, internal). Audit event'lerde
   * `actorType: system` olarak işaretlenir.
   */
  public system(correlationId: string): ActorContext {
    return {
      actorId: null,
      actorType: "system",
      role: "SYSTEM",
      tenantId: null,
      branchId: null,
      isSuperadmin: false,
      correlationId,
      ipAddress: null,
      userAgentHash: null,
      source: "system",
    };
  }
}

/**
 * IP adresini mask'ler (son oktet `***` yapılır). Loglanacak
 * actor context için kullanılır.
 */
function maskIp(ip: string): string {
  const cleaned = ip.split(",")[0]?.trim() ?? ip;
  if (cleaned.includes(":")) return "***";
  return cleaned.replace(/\.\d+$/, ".***");
}

/**
 * User agent'i kısa hash'e çevirir (PII masker ile aynı algoritma).
 */
function hashUserAgent(ua: string): string {
  // Node crypto kullanmıyoruz; basit FNV-1a 32-bit (test/prod uyumlu).
  let hash = 2166136261;
  for (let i = 0; i < ua.length; i++) {
    hash ^= ua.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0").slice(0, 16);
}
