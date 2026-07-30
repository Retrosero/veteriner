/**
 * @file Auth HTTP endpoint'leri için DTO yardımcıları.
 * @module apps/api/common/auth/dto
 *
 * @description Request'ten DTO ve meta veri (IP, UA, correlation) çıkar.
 * Service katmanı için ortak bir `AttemptContext` üretir.
 *
 * @since GOAL-011 (FAZ-1) kimlik doğrulama
 */

import { Request } from "express";

/** Login denemesi / parola sıfırlama / davet için gerekli meta. */
export interface AttemptMeta {
  ipAddress: string | null;
  userAgentHash: string | null;
  correlationId: string;
}

/** Express request'ten AttemptContext üretir. */
export function attemptMetaFromRequest(
  request: Request & { requestId?: string },
): AttemptMeta {
  const ipRaw =
    request.header("x-forwarded-for") ??
    request.ip ??
    request.socket?.remoteAddress ??
    null;
  const ip = ipRaw ? maskIp(typeof ipRaw === "string" ? ipRaw : String(ipRaw)) : null;
  const ua = request.header("user-agent") ?? null;
  const userAgentHash = ua ? hashUserAgent(ua) : null;
  return {
    ipAddress: ip,
    userAgentHash,
    correlationId: request.requestId ?? "req-unknown",
  };
}

function maskIp(ip: string): string {
  const cleaned = ip.split(",")[0]?.trim() ?? ip;
  if (cleaned.includes(":")) return "***";
  return cleaned.replace(/\.\d+$/, ".***");
}

function hashUserAgent(ua: string): string {
  let hash = 2166136261;
  for (let i = 0; i < ua.length; i++) {
    hash ^= ua.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0").slice(0, 16);
}
