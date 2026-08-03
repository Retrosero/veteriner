/**
 * @file Guvenlik testi giris modulu.
 * @module @vetniva/security-test
 *
 * @description GOAL-123 (FAZ-12) kapsaminda 9 kategoride
 * (auth, authz, idor, xss, csrf, sql_injection,
 * file_upload, rate_limit, tenant_isolation) OWASP ASVS
 * L1-L3 temelli kontrol katalogu + calistirici + rapor
 * uretici. Tenant izolasyonu, PII mask ve audit
 * kurallarina uyar; placeholder veri kimliksiz.
 *
 * @since GOAL-123 (FAZ-12) guvenlik testi
 */

export type {
  SecurityCheck,
  SecurityControl,
  SecurityAsvsLevel,
  SecuritySeverity,
  SecurityStatus,
  SecurityStep,
  SecurityResult,
  SecurityRunReport,
  SecurityFetch,
  SecurityAuthContext,
} from "./types.js";

export { SECURITY_CHECKS, getCheck, listCheckKeys } from "./config.js";

export { runSecurityChecks, defaultFetch, buildAuthHeaders } from "./runner.js";
export type { RunSecurityOptions } from "./runner.js";

export { reportToMarkdown, reportToJson, describeResult } from "./report.js";
