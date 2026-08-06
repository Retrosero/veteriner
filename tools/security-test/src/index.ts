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
  SecurityAsvsLevel,
  SecurityAuthContext,
  SecurityCheck,
  SecurityControl,
  SecurityFetch,
  SecurityResult,
  SecurityRunReport,
  SecuritySeverity,
  SecurityStatus,
  SecurityStep,
} from "./types.js";

export { SECURITY_CHECKS, getCheck, listCheckKeys } from "./config.js";

export { defaultFetch, runSecurityChecks, buildAuthHeaders } from "./runner.js";
export type { RunSecurityOptions } from "./runner.js";

export { describeResult, reportToJson, reportToMarkdown } from "./report.js";

export {
  ASVS_LEVEL_WEIGHT,
  ASVS_REFERENCES,
  MIN_ASVS_BY_CONTROL,
  SEVERITY_SLA_DAYS,
  SEVERITY_WEIGHT,
  assessSeverity,
  buildSeverityReport,
} from "./severity.js";
export type { SeverityAssessment, SeverityReport } from "./severity.js";
