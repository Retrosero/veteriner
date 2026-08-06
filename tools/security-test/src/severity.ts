/**
 * @file OWASP ASVS L1/L2/L3 severity esleme modulu.
 * @module @vetniva/security-test/severity
 *
 * @description GOAL-123 (FAZ-12) kapsaminda guvenlik kontrol
 * kategorilerini OWASP ASVS seviyeleri ile esler. Kategori
 * bazinda onemli ASVS kontrollerini referans olarak tasir;
 * severity (critical/high/medium/low) ile ASVS seviyesinin
 * (L1/L2/L3) tutarliligini dogrular. Tenant izolasyonu, PII
 * ve audit kurallarina uyar; placeholder veri kimliksiz.
 *
 * Not: L1 = tum uygulamalar; L2 = hassas veri; L3 = yuksek
 * riskli / critical. Severity ile ASVS seviyesi ayni sey
 * degildir: kritik bir L1 kontrolu "critical" severity
 * tasir; L3 kontrolu "low" tasimak da mumkundur.
 *
 * @since GOAL-123 (FAZ-12) guvenlik testi
 */

import type {
  SecurityAsvsLevel,
  SecurityControl,
  SecurityResult,
  SecuritySeverity,
} from "./types.js";

/** OWASP ASVS bolum referanslari (kategori -> ASVS V#. */
export const ASVS_REFERENCES: Readonly<
  Record<SecurityControl, ReadonlyArray<string>>
> = {
  auth: ["V2.1", "V2.2", "V2.5", "V2.7"],
  authz: ["V4.1", "V4.2"],
  idor: ["V4.1", "V8.1"],
  xss: ["V5.1", "V5.3", "V5.5"],
  csrf: ["V4.2", "V13.2"],
  sql_injection: ["V5.3", "V5.4"],
  file_upload: ["V12.1", "V12.2", "V12.4"],
  rate_limit: ["V11.1"],
  tenant_isolation: ["V4.1", "V8.1", "V8.3"],
};

/** ASVS seviyesi icin oncelik sirasi (yuksek sayi = yuksek onem). */
export const ASVS_LEVEL_WEIGHT: Readonly<Record<SecurityAsvsLevel, number>> = {
  L1: 1,
  L2: 2,
  L3: 3,
};

/** Severity icin oncelik sirasi (yuksek sayi = yuksek risk). */
export const SEVERITY_WEIGHT: Readonly<Record<SecuritySeverity, number>> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/** Severity SLA gunleri (production gate referansi). */
export const SEVERITY_SLA_DAYS: Readonly<Record<SecuritySeverity, number>> = {
  critical: 1, // 24 saat
  high: 7, // 7 gun
  medium: 30, // 30 gun
  low: 90, // 90 gun
  info: 365, // backlog
};

/** Kontrol kategorisi icin izin verilen minimum ASVS seviyesi. */
export const MIN_ASVS_BY_CONTROL: Readonly<
  Record<SecurityControl, SecurityAsvsLevel>
> = {
  auth: "L2", // brute force, expired token
  authz: "L1", // role escalation temel
  idor: "L1", // cross-tenant kritik
  xss: "L1", // input/output encoding temel
  csrf: "L2", // state-changing token
  sql_injection: "L1", // injection temel
  file_upload: "L2", // MIME/size validation
  rate_limit: "L2", // token bucket
  tenant_isolation: "L1", // list scoping temel
};

/** Severity esleme sonucu. */
export interface SeverityAssessment {
  /** Kontrol kategorisi. */
  control: SecurityControl;
  /** ASVS seviyesi. */
  asvsLevel: SecurityAsvsLevel;
  /** Severity. */
  severity: SecuritySeverity;
  /** Severity tutarli mi (ASVS seviyesi + kontrol kategorisi ile). */
  consistent: boolean;
  /** SLA (gun). */
  slaDays: number;
  /** Insan okur sebep. */
  reason: string;
}

/**
 * Tek bir kontrol sonucu icin severity assessment uretir.
 * ASVS seviyesi ile severity'nin tutarliligini dogrular.
 */
export function assessSeverity(
  control: SecurityControl,
  asvsLevel: SecurityAsvsLevel,
  severity: SecuritySeverity,
): SeverityAssessment {
  const minLevel = MIN_ASVS_BY_CONTROL[control];
  const asvsOk = ASVS_LEVEL_WEIGHT[asvsLevel] >= ASVS_LEVEL_WEIGHT[minLevel];

  // ASVS seviyesine gore beklenen severity araligi.
  // L1: critical/high/medium/low (temel kontrol; output
  //     encoding gibi defense-in-depth kontroller "low"
  //     severity tasir)
  // L2: high/medium (hassas veri)
  // L3: medium/low (yuksek riskli - genellikle opsiyonel)
  let expected: ReadonlyArray<SecuritySeverity>;
  switch (asvsLevel) {
    case "L1":
      expected = ["critical", "high", "medium", "low"];
      break;
    case "L2":
      expected = ["high", "medium"];
      break;
    case "L3":
      expected = ["medium", "low", "info"];
      break;
  }

  // IDOR, authz, sql_injection, tenant_isolation: bunlar
  // her zaman en azindan "high" olmali (cross-tenant/kritik).
  const highRiskControls: ReadonlyArray<SecurityControl> = [
    "idor",
    "authz",
    "sql_injection",
    "tenant_isolation",
  ];
  const highRiskOk =
    !highRiskControls.includes(control) ||
    SEVERITY_WEIGHT[severity] >= SEVERITY_WEIGHT["high"];

  const consistent = asvsOk && expected.includes(severity) && highRiskOk;
  const slaDays = SEVERITY_SLA_DAYS[severity];

  let reason: string;
  if (!asvsOk) {
    reason = `ASVS ${asvsLevel} kontrol kategorisi ${control} icin beklenen minimum ${minLevel} altinda.`;
  } else if (!expected.includes(severity)) {
    reason = `ASVS ${asvsLevel} icin beklenen severity ${expected.join("/")}, bulunan ${severity}.`;
  } else if (!highRiskOk) {
    reason = `Kontrol kategorisi ${control} en azindan 'high' severity gerektirir; bulunan ${severity}.`;
  } else {
    reason = `ASVS ${asvsLevel} + severity ${severity} tutarli; SLA ${slaDays} gun.`;
  }

  return {
    control,
    asvsLevel,
    severity,
    consistent,
    slaDays,
    reason,
  };
}

/** Tum sonuclari severity ile esler ve toplu istatistik uretir. */
export interface SeverityReport {
  /** Toplam kontrol sayisi. */
  total: number;
  /** Tutarli (consistent) kontrol sayisi. */
  consistent: number;
  /** Tutarsiz kontrol sayisi (severity ASVS ile uyumsuz). */
  inconsistent: number;
  /** Tutarsiz kontrollerin listesi. */
  inconsistencies: ReadonlyArray<SeverityAssessment>;
  /** Severity bazli SLA gunleri (en yuksek risk). */
  topSlaDays: number;
}

/** Rapor sonuclarindan severity istatistiklerini cikarir. */
export function buildSeverityReport(
  results: ReadonlyArray<SecurityResult>,
): SeverityReport {
  const assessments = results.map((r) =>
    assessSeverity(r.control, r.asvsLevel, r.severity),
  );
  const consistent = assessments.filter((a) => a.consistent).length;
  const inconsistencies = assessments.filter((a) => !a.consistent);
  const topSlaDays = assessments.reduce(
    (acc, a) => (a.slaDays > acc ? a.slaDays : acc),
    0,
  );
  return {
    total: assessments.length,
    consistent,
    inconsistent: inconsistencies.length,
    inconsistencies,
    topSlaDays,
  };
}
