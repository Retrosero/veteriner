/**
 * @file Guvenlik testi calistirici (runner).
 * @module @vetniva/security-test/runner
 *
 * @description GOAL-123 (FAZ-12) kapsaminda SecurityCheck
 * listesini alip API uzerinde sirayla calistirir. Her
 * kontrol icin beklenen status, body regex yasaklari,
 * header yasaklari kontrol edilir; sonuc SecurityResult
 * olarak toplanir. Cross-tenant test icin farkli tenant
 * kimlik bilgisi kullanilir.
 *
 * PII mask: kontrol mesajlari PII icermez; tenant
 * izolasyonu kurali uygulanir; audit log uretmek icin
 * olaylar SECURITY_EVENTS.yaml formatinda toplanir.
 *
 * @since GOAL-123 (FAZ-12) guvenlik testi
 */

import type {
  SecurityAuthContext,
  SecurityCheck,
  SecurityFetch,
  SecurityResult,
  SecurityRunReport,
  SecurityStatus,
  SecurityStep,
} from "./types.js";

/** Runner secenekleri. */
export interface RunSecurityOptions {
  /** Calistirilacak kontroller (default: SECURITY_CHECKS). */
  checks?: ReadonlyArray<SecurityCheck>;
  /** API base URL. */
  baseUrl: string;
  /** Auth/header bilgisi (Tenant A — ana tenant). */
  auth: SecurityAuthContext;
  /**
   * Cross-tenant test icin ikinci tenant bilgisi.
   * Verilmezse cross-tenant kontroller skip uretir.
   */
  crossTenantAuth?: SecurityAuthContext;
  /** Skip default olarak isaretlenmis kontrolleri de calistir. */
  includeSkipped?: boolean;
  /** Fetch implementasyonu (testte inject). */
  fetchFn?: SecurityFetch;
  /** Su anki zaman (testte inject). */
  now?: () => Date;
}

/** Varsayilan fetch (Node 20+ global fetch). */
export async function defaultFetch(
  method: SecurityStep["method"],
  url: string,
  init: { body?: unknown; headers?: Record<string, string> },
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.headers ?? {}),
  };
  let body: string | undefined;
  if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.body);
  }
  const res = await fetch(url, {
    method,
    headers,
    ...(body !== undefined ? { body } : {}),
  });
  const text = await res.text();
  const headerObj: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    headerObj[k.toLowerCase()] = v;
  });
  return { status: res.status, headers: headerObj, body: text };
}

/** Auth header'larini olusturur. */
export function buildAuthHeaders(
  auth: SecurityAuthContext,
  extra?: Record<string, string>,
): Record<string, string> {
  const h: Record<string, string> = { ...(extra ?? {}) };
  if (auth.token) h["Authorization"] = `Bearer ${auth.token}`;
  if (auth.tenantId) h["X-Tenant-Id"] = auth.tenantId;
  if (auth.branchId) h["X-Branch-Id"] = auth.branchId;
  return h;
}

/** Status listede mi. */
function statusMatches(
  actual: number,
  expected: ReadonlyArray<number>,
): boolean {
  return expected.includes(actual);
}

/** Body'de yasakli regex var mi. */
function bodyHasForbidden(
  body: string,
  patterns: ReadonlyArray<string>,
): string | null {
  for (const p of patterns) {
    const re = new RegExp(p, "i");
    if (re.test(body)) return p;
  }
  return null;
}

/** Header yasakli mi. */
function headerForbidden(
  headers: Record<string, string>,
  key: string,
): string | null {
  const v = headers[key.toLowerCase()];
  return v !== undefined && v !== null ? v : null;
}

/** Tek bir adimi calistirir. */
async function runStep(
  step: SecurityStep,
  baseUrl: string,
  auth: SecurityAuthContext,
  fetchFn: SecurityFetch,
): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  const fullUrl = `${baseUrl.replace(/\/$/, "")}${step.path}`;
  const merged = buildAuthHeaders(auth, step.headers);
  return await fetchFn(step.method, fullUrl, {
    body: step.body,
    headers: merged,
  });
}

/** Tek bir kontrolu calistirir. */
async function runCheck(
  check: SecurityCheck,
  baseUrl: string,
  auth: SecurityAuthContext,
  crossAuth: SecurityAuthContext | undefined,
  fetchFn: SecurityFetch,
  now: () => Date,
): Promise<SecurityResult> {
  // IDOR / cross-tenant kontrolleri: cross-tenant auth ile calistir.
  const isCrossTenant =
    check.control === "idor" || check.key === "tenant_isolation_list_scoped";
  const stepAuth = isCrossTenant && crossAuth ? crossAuth : auth;

  // Cross-tenant auth yoksa bu kontrol skip uretir.
  if (isCrossTenant && !crossAuth) {
    return {
      check: check.key,
      control: check.control,
      asvsLevel: check.asvsLevel,
      title: check.title,
      status: "skip",
      severity: check.failureSeverity,
      message:
        "Cross-tenant auth context saglanmamis; IDOR/tenant_isolation kontrolu atlandi.",
      remediation: check.remediation,
    };
  }

  const stepResults: Array<{
    name: string;
    status: number;
    body: string;
    headers: Record<string, string>;
  }> = [];
  for (const step of check.steps) {
    const r = await runStep(step, baseUrl, stepAuth, fetchFn);
    stepResults.push({ name: step.name, ...r });
  }

  // Degerlendirme: en az bir step FAIL uretirse check FAIL.
  let status: SecurityStatus = "pass";
  let failReason: string | null = null;
  let observedStatus: number | undefined;
  let expectedStatuses: ReadonlyArray<number> | undefined;
  let firstForbiddenBody: string | null = null;
  let firstForbiddenHeader: { key: string; value: string } | null = null;

  for (const step of check.steps) {
    const r = stepResults.find((x) => x.name === step.name);
    if (!r) continue;

    // Status kontrolu
    if (!statusMatches(r.status, step.expectStatus)) {
      status = "fail";
      failReason = `step=${step.name} beklenen status ${step.expectStatus.join("|")} alinan ${r.status}`;
      observedStatus = r.status;
      expectedStatuses = step.expectStatus;
      break;
    }

    // Body yasaklari
    if (step.forbidBodyRegex && step.forbidBodyRegex.length > 0) {
      const hit = bodyHasForbidden(r.body, step.forbidBodyRegex);
      if (hit !== null) {
        status = "fail";
        firstForbiddenBody = hit;
        failReason = `step=${step.name} yasakli regex yakalandi: ${hit}`;
        observedStatus = r.status;
        break;
      }
    }

    // Header yasaklari
    if (step.forbidHeader) {
      const v = headerForbidden(r.headers, step.forbidHeader);
      if (v !== null) {
        status = "fail";
        firstForbiddenHeader = { key: step.forbidHeader, value: v };
        failReason = `step=${step.name} yasakli header ${step.forbidHeader}=${v} dondu`;
        break;
      }
    }
  }

  void now;
  void firstForbiddenBody;
  void firstForbiddenHeader;

  if (status === "pass") {
    return {
      check: check.key,
      control: check.control,
      asvsLevel: check.asvsLevel,
      title: check.title,
      status: "pass",
      severity: check.failureSeverity,
      message: `Tum ${check.steps.length} adim beklenen status/regex kosullarini karsiladi.`,
      ...(observedStatus !== undefined ? { observedStatus } : {}),
      ...(expectedStatuses ? { expectedStatuses } : {}),
    };
  }

  return {
    check: check.key,
    control: check.control,
    asvsLevel: check.asvsLevel,
    title: check.title,
    status: "fail",
    severity: check.failureSeverity,
    message: failReason ?? "Bilinmeyen nedenle basarisiz",
    ...(observedStatus !== undefined ? { observedStatus } : {}),
    ...(expectedStatuses ? { expectedStatuses } : {}),
    remediation: check.remediation,
  };
}

/**
 * Tum kontrolleri calistirir ve toplu rapor uretir.
 */
export async function runSecurityChecks(
  options: RunSecurityOptions,
): Promise<SecurityRunReport> {
  const {
    checks,
    baseUrl,
    auth,
    crossTenantAuth,
    includeSkipped = false,
    fetchFn = defaultFetch,
    now = () => new Date(),
  } = options;

  const all = checks ?? (await import("./config.js")).SECURITY_CHECKS;
  const results: SecurityResult[] = [];
  for (const check of all) {
    if (check.skipByDefault && !includeSkipped) {
      results.push({
        check: check.key,
        control: check.control,
        asvsLevel: check.asvsLevel,
        title: check.title,
        status: "skip",
        severity: check.failureSeverity,
        message: "skipByDefault; --include-skipped ile dahil edilebilir.",
        remediation: check.remediation,
      });
      continue;
    }
    const r = await runCheck(
      check,
      baseUrl,
      auth,
      crossTenantAuth,
      fetchFn,
      now,
    );
    results.push(r);
  }

  const passCount = results.filter((r) => r.status === "pass").length;
  const failCount = results.filter((r) => r.status === "fail").length;
  const skipCount = results.filter((r) => r.status === "skip").length;
  const bySeverity = {
    critical: results.filter(
      (r) => r.status === "fail" && r.severity === "critical",
    ).length,
    high: results.filter((r) => r.status === "fail" && r.severity === "high")
      .length,
    medium: results.filter(
      (r) => r.status === "fail" && r.severity === "medium",
    ).length,
    low: results.filter((r) => r.status === "fail" && r.severity === "low")
      .length,
    info: results.filter((r) => r.status === "fail" && r.severity === "info")
      .length,
  } as const;

  const report: SecurityRunReport = {
    runAt: now().toISOString(),
    baseUrl,
    results,
    passCount,
    failCount,
    skipCount,
    bySeverity,
    allPassed: failCount === 0,
  };
  if (crossTenantAuth?.tenantId !== undefined) {
    report.crossTenantId = crossTenantAuth.tenantId;
  }
  return report;
}
