/**
 * @file Guvenlik testi temel tipleri.
 * @module @vetniva/security-test/types
 *
 * @description GOAL-123 (FAZ-12) kapsaminda OWASP ASVS L1-L3
 * kontrollerinin tip sozlesmesi. Kontrol katalogu, senaryo
 * tanimlari, severity ve run sonucu modelleri burada toplanir.
 * Tenant izolasyonu, PII mask ve audit kurallarina uyar.
 *
 * @since GOAL-123 (FAZ-12) guvenlik testi
 */

/** Desteklenen guvenlik kontrol kategorileri (OWASP ASVS temelli). */
export type SecurityControl =
  | "auth"
  | "authz"
  | "idor"
  | "xss"
  | "csrf"
  | "sql_injection"
  | "file_upload"
  | "rate_limit"
  | "tenant_isolation";

/** OWASP ASVS seviyesi. */
export type SecurityAsvsLevel = "L1" | "L2" | "L3";

/** Severity seviyesi. */
export type SecuritySeverity = "critical" | "high" | "medium" | "low" | "info";

/** Tek bir kontrolun calistirilma durumu. */
export type SecurityStatus = "pass" | "fail" | "skip";

/**
 * Tek bir kontrol tanimi. Calistirici tarafindan okunur;
 * PASS/FAIL/SKIP + severity + remediation ile sonuclanir.
 */
export interface SecurityCheck {
  /** Benzersiz kontrol anahtari. */
  key: string;
  /** OWASP ASVS kontrol kategorisi. */
  control: SecurityControl;
  /** OWASP ASVS seviyesi (L1/L2/L3). */
  asvsLevel: SecurityAsvsLevel;
  /** Insan okur baslik. */
  title: string;
  /** Aciklama (ne kontrol ediliyor). */
  description: string;
  /** En az bir test adimi (method, path, body, expectStatus). */
  steps: ReadonlyArray<SecurityStep>;
  /**
   * Kontrol basarisiz oldugunda atanacak severity.
   * Remediation SLA'sini belirler (bkz. SECURITY_TEST.md).
   */
  failureSeverity: SecuritySeverity;
  /** Onerilen remediation. */
  remediation: string;
  /** Kapsam disi ise true; runner SKIP uretir. */
  skipByDefault?: boolean;
}

/** Tek bir test adimi. */
export interface SecurityStep {
  name: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Ornek: "/api/v1/auth/login". */
  path: string;
  /** Govde (POST/PUT/PATCH). */
  body?: unknown;
  /** Ek header'lar. */
  headers?: Record<string, string>;
  /**
   * Beklenen HTTP status listesi. Ornek: 401 (kimlik
   * dogrulama basarisiz), 403 (yetkisiz), 404 (cross-tenant
   * gizli 404). Birden fazla kabul edilir.
   */
  expectStatus: ReadonlyArray<number>;
  /**
   * Yanit govdesinde olmamasi gereken PII / XSS
   * patternleri. Ilk bulundugunda FAIL uretilir.
   */
  forbidBodyRegex?: ReadonlyArray<string>;
  /**
   * Yanitta olmamasi gereken header (ornek: X-Tenant-Id
   * cross-tenant test icin). Varsa FAIL uretilir.
   */
  forbidHeader?: string;
}

/** Tek bir kontrolun sonucu. */
export interface SecurityResult {
  check: string;
  control: SecurityControl;
  asvsLevel: SecurityAsvsLevel;
  title: string;
  status: SecurityStatus;
  severity: SecuritySeverity;
  /** Ihlal varsa severity burada yukseltilebilir. */
  observedStatus?: number;
  /** Beklenen durum. */
  expectedStatuses?: ReadonlyArray<number>;
  /** Aciklayici mesaj (PII icermez). */
  message: string;
  /** Ihlal varsa remediation hatirlatmasi. */
  remediation?: string;
}

/** Tum sonuclarin toplu paketi. */
export interface SecurityRunReport {
  runAt: string;
  baseUrl: string;
  /** Tenant izolasyonu testinde kullanilan cross-tenant kimlik. */
  crossTenantId?: string;
  results: ReadonlyArray<SecurityResult>;
  passCount: number;
  failCount: number;
  skipCount: number;
  /** Severity bazli toplam. */
  bySeverity: Readonly<Record<SecuritySeverity, number>>;
  /** Genel gecme durumu: fail=0 ise true. */
  allPassed: boolean;
}

/**
 * Calistirici tarafindan injection edilen fetch implementasyonu.
 * Testlerde mocklanir; uretimde Node 20+ global fetch kullanilir.
 */
export type SecurityFetch = (
  method: SecurityStep["method"],
  url: string,
  init: { body?: unknown; headers?: Record<string, string> },
) => Promise<{ status: number; headers: Record<string, string>; body: string }>;

/** Runner auth baglami. */
export interface SecurityAuthContext {
  /** Bearer token. */
  token: string;
  /** Tenant id (X-Tenant-Id). */
  tenantId: string;
  /** Branch id (X-Branch-Id). */
  branchId: string;
}
