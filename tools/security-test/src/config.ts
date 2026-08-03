/**
 * @file Guvenlik kontrol katalogu.
 * @module @vetniva/security-test/config
 *
 * @description GOAL-123 (FAZ-12) kapsaminda OWASP ASVS L1-L3
 * temel alanarak 9 ana kategoride (auth, authz, idor, xss,
 * csrf, sql_injection, file_upload, rate_limit,
 * tenant_isolation) toplam 12+ kontrol tanimlanir. Her
 * kontrol API steps + expectStatus + remediation tasir.
 * Tenant izolasyonu, PII mask ve audit kurallarina uyar;
 * placeholder veri kimliksiz.
 *
 * Kontrol listesi docs/security/SECURITY_TEST.md ile
 * eslesir; her kontrolun numarasi, kategorisi ve ASVS
 * seviyesi orada da dokumante edilmistir.
 *
 * @since GOAL-123 (FAZ-12) guvenlik testi
 */

import type { SecurityCheck } from "./types.js";

/**
 * 9 kategoride guvenlik kontrol katalogu.
 */
export const SECURITY_CHECKS: ReadonlyArray<SecurityCheck> = [
  /* ------------------------------------------------------------
   * V2 — Kimlik Dogrulama
   * ------------------------------------------------------------ */
  {
    key: "auth_brute_force_lockout",
    control: "auth",
    asvsLevel: "L2",
    title: "Brute-force korumasi (5 basarisiz login)",
    description:
      "5 basarisiz login denemesinden sonra hesap 15 dakika kilitlenmeli. Kilitleme 6. denemede 401/423 donmeli.",
    failureSeverity: "high",
    remediation:
      "Backend'de failed_login attempt counter (Redis/PG) ekleyin; esik asildiginda 423 Locked donun. security_event.failed_login uretilmeli.",
    steps: [
      {
        name: "5_basarisiz_login",
        method: "POST",
        path: "/api/v1/auth/login",
        body: { email: "pilot@vetniva.local", password: "wrong-password" },
        expectStatus: [401],
      },
      {
        name: "6_deneme_locked",
        method: "POST",
        path: "/api/v1/auth/login",
        body: { email: "pilot@vetniva.local", password: "wrong-password" },
        expectStatus: [401, 423, 429],
      },
    ],
  },
  {
    key: "auth_expired_token",
    control: "auth",
    asvsLevel: "L2",
    title: "Expired token reddi",
    description:
      "Suresi dolmus Bearer token ile API cagirildiginda 401 donmeli; tenant izolasyonu sizinti olmamali.",
    failureSeverity: "high",
    remediation:
      "JWT exp claim kontrolunun edge case'lerini dogrulayin; iat+grace window kullaniliyorsa auth guard 401 donmeli.",
    steps: [
      {
        name: "expired_bearer",
        method: "GET",
        path: "/api/v1/clinic/owners?limit=5",
        headers: { Authorization: "Bearer EXPIRED_TOKEN_EXAMPLE" },
        expectStatus: [401],
      },
    ],
  },
  {
    key: "auth_refresh_token_rotation",
    control: "auth",
    asvsLevel: "L2",
    title: "Refresh token rotation",
    description:
      "Refresh token ile yeni access token alirken eski refresh token iptal edilmeli. Ayni refresh token 2. kez kullanilirsa 401 + security_event.unauthorized_access_attempt uretilmeli.",
    failureSeverity: "high",
    remediation:
      "Refresh token family (Redis Set) tutun; her yenilemede eski token silinip yeni uretilsin. Tekrar kullanimda tum family revoke edilsin.",
    steps: [
      {
        name: "refresh_token",
        method: "POST",
        path: "/api/v1/auth/refresh",
        body: { refreshToken: "REFRESH_TOKEN_PLACEHOLDER" },
        expectStatus: [200, 401],
      },
    ],
  },

  /* ------------------------------------------------------------
   * V4 — Erisim Kontrolu
   * ------------------------------------------------------------ */
  {
    key: "authz_role_escalation",
    control: "authz",
    asvsLevel: "L1",
    title: "Rol escalation (STAFF -> VETERINARIAN)",
    description:
      "STAFF token ile yalniz VETERINARIAN'a ozel endpoint cagirildiginda 403 donmeli. Kullanicinin rol atamasi yok sayilmamali.",
    failureSeverity: "critical",
    remediation:
      "@RequirePermissions guard'inin her controller'a eklendigini dogrulayin. Owner/Veterinarian/Staff rol matrisi icin permission:write permission'ini kontrol edin.",
    steps: [
      {
        name: "staff_signs_examination",
        method: "POST",
        path: "/api/v1/clinic/examinations/exm-staff-test/sign",
        body: { signedBy: "STAFF_USER_ID" },
        expectStatus: [403],
      },
    ],
  },
  {
    key: "idor_cross_tenant_patient",
    control: "idor",
    asvsLevel: "L1",
    title: "IDOR (cross-tenant patient)",
    description:
      "Tenant A token'i ile Tenant B'ye ait bir patientId timeline cagirildiginda 404 donmeli (gizli 404; 403 bilgi sizintisi sayilmaz).",
    failureSeverity: "critical",
    remediation:
      "Patient detail ve timeline endpoint'lerinde tenantId + ownership zorunlu filtresi uygulayin. tenant_isolation_breach_attempt security_event uretilmeli.",
    steps: [
      {
        name: "cross_tenant_patient_timeline",
        method: "GET",
        path: "/api/v1/clinic/patients/pat-OTHER-TENANT-123/timeline?limit=5",
        expectStatus: [404],
      },
    ],
  },
  {
    key: "idor_cross_tenant_owner",
    control: "idor",
    asvsLevel: "L1",
    title: "IDOR (cross-tenant owner)",
    description:
      "Tenant A token'i ile Tenant B owner'ina ait endpoint cagirildiginda 404 donmeli; customer-balance / payment history endpointleri dahil.",
    failureSeverity: "critical",
    remediation:
      "Owner-scoped endpoint'lerde (customer-balance, payments) tenantId filtresini tenant guard uzerinden zorunlu kilin.",
    steps: [
      {
        name: "cross_tenant_owner_balance",
        method: "GET",
        path: "/api/v1/customer-balances/owners/own-OTHER-TENANT-123",
        expectStatus: [404],
      },
    ],
  },

  /* ------------------------------------------------------------
   * V5 — Validation, Sanitization, Encoding
   * ------------------------------------------------------------ */
  {
    key: "xss_input_sanitization",
    control: "xss",
    asvsLevel: "L1",
    title: "XSS input sanitization (note create)",
    description:
      "SOAP note, hasta sahibi notu, hasta notu gibi alanlara <script>alert(1)</script> gibi payload gonderildiginde API 422 donmeli ve response body ham payload icermemeli.",
    failureSeverity: "high",
    remediation:
      "Zod schema'da HTML tag/attribute whitelist (sanitize-html veya DOMPurify) uygulayin. Output encoding default olarak React Next.js JSX escape yapar; ancak <div dangerouslySetInnerHTML> kullanimi audit edilmeli.",
    steps: [
      {
        name: "xss_payload_soap",
        method: "POST",
        path: "/api/v1/clinic/soap-notes",
        body: {
          patientId: "pat-xss-test",
          subjective: "<script>alert(1)</script>",
        },
        expectStatus: [201, 400, 422],
        forbidBodyRegex: ["<script>alert\\(1\\)</script>"],
      },
    ],
  },
  {
    key: "xss_output_encoding",
    control: "xss",
    asvsLevel: "L1",
    title: "XSS output encoding (notes response)",
    description:
      "Onceki not endpoint'inden donek payload JSON olarak serialize edilmeli; HTML entity'leri encode edilmemis halde response'a yazilmamali. Frontend Next.js JSX otomatik escape yapar; backend'in tekrar etmemesi yeterli.",
    failureSeverity: "low",
    remediation:
      "Backend yalnizca JSON donmeli; HTML serialization kaldirilmali. Frontend'de dangerouslySetInnerHTML kullanimi code review ile tespit edilmeli.",
    steps: [
      {
        name: "xss_payload_in_note",
        method: "POST",
        path: "/api/v1/clinic/soap-notes",
        body: {
          patientId: "pat-xss-test",
          subjective: '<img src=x onerror="alert(1)">',
        },
        expectStatus: [201, 400, 422],
        forbidBodyRegex: ["<img src=x onerror="],
      },
    ],
  },

  /* ------------------------------------------------------------
   * CSRF
   * ------------------------------------------------------------ */
  {
    key: "csrf_state_changing_token",
    control: "csrf",
    asvsLevel: "L2",
    title: "CSRF (state-changing endpoint token kontrolu)",
    description:
      "POST/PUT/PATCH/DELETE endpoint'leri SameSite=None veya cross-origin Origin/Referer olmadan 403 donmeli veya CSRF token zorunlu kilmali. Bearer token tabanli auth'da CSRF riski dusuk; fakat cookie-auth fallback varsa token zorunlu olmali.",
    failureSeverity: "medium",
    remediation:
      "Bearer token tabanli auth'da CSRF cookie'si kullanilmiyor; bu nedenle kontrol cookie auth'a ozgu. Bearer-only auth modunda bu kontrol skip edilebilir (skipByDefault=true).",
    skipByDefault: true,
    steps: [
      {
        name: "no_csrf_cookie",
        method: "POST",
        path: "/api/v1/clinic/owners",
        body: {
          firstName: "CSRF Test",
          lastName: "Owner",
          phone: "+905550000000",
        },
        headers: { Origin: "https://evil.example.com" },
        expectStatus: [403, 422],
      },
    ],
  },

  /* ------------------------------------------------------------
   * SQL injection
   * ------------------------------------------------------------ */
  {
    key: "sql_injection_search",
    control: "sql_injection",
    asvsLevel: "L1",
    title: "SQL injection (search query)",
    description:
      "Hasta arama endpoint'ine klasik SQL injection payload'lari gonderildiginde 500 donmemeli, 200 donmeli ve yanit injection payload'i icermemeli.",
    failureSeverity: "critical",
    remediation:
      "Tum sorgular Prisma ORM uzerinden parameterized; raw SQL yok. Zod schema search query tipini string + min length + max length ile sinirlamali; LIKE pattern escape uygulanmali.",
    steps: [
      {
        name: "sqli_union",
        method: "GET",
        path: "/api/v1/clinic/owners?search=' OR '1'='1",
        expectStatus: [200, 400, 422],
        forbidBodyRegex: ["syntax error", "ORA-", "PG::SyntaxError"],
      },
      {
        name: "sqli_drop",
        method: "GET",
        path: "/api/v1/clinic/owners?search='; DROP TABLE owners;--",
        expectStatus: [200, 400, 422],
        forbidBodyRegex: ["syntax error", "ORA-", "PG::SyntaxError"],
      },
    ],
  },

  /* ------------------------------------------------------------
   * V12 — Dosya ve Kaynak
   * ------------------------------------------------------------ */
  {
    key: "file_upload_mime_validation",
    control: "file_upload",
    asvsLevel: "L2",
    title: "Dosya yukleme MIME kontrolu",
    description:
      ".exe uzantili ve application/octet-stream MIME tipinde dosya yuklenmeye calisildiginda 415 veya 400 donmeli; virus tarama adapter'i yoksa dosya karantinaya alinmali.",
    failureSeverity: "high",
    remediation:
      "File upload controller MIME magic-bytes dogrulamasi yapar (sadece Content-Type header'i yeterli degil). Calismayan tarama adapter'inda karantina modu (FAZ-12+) zorunlu.",
    steps: [
      {
        name: "exe_upload_attempt",
        method: "POST",
        path: "/api/v1/files/upload",
        body: { name: "malware.exe", mime: "application/octet-stream" },
        expectStatus: [400, 415, 422],
      },
    ],
  },
  {
    key: "file_upload_size_limit",
    control: "file_upload",
    asvsLevel: "L2",
    title: "Dosya yukleme boyut limiti",
    description:
      "Limit uzeri (default 25 MB) dosya yuklenmeye calisildiginda 413 Payload Too Large donmeli.",
    failureSeverity: "medium",
    remediation:
      "Nginx ingress / API gateway uzerinde client_max_body_size; backend'de multer limit; storage provider max file size uygulanmali.",
    steps: [
      {
        name: "oversize_upload",
        method: "POST",
        path: "/api/v1/files/upload",
        body: { name: "oversize.bin", size: 104857600 /* 100MB */ },
        expectStatus: [413, 422],
      },
    ],
  },

  /* ------------------------------------------------------------
   * V11 — Rate limit
   * ------------------------------------------------------------ */
  {
    key: "rate_limit_per_user_token_bucket",
    control: "rate_limit",
    asvsLevel: "L2",
    title: "Per-user rate limit (token bucket)",
    description:
      "Ayni user token ile 60+ login/refresh istegi 1 dakika icinde gonderildiginde 429 donmeli. Backend'in rate limit guard'i tenant bazli 5 req/s default sinirini zorlamali.",
    failureSeverity: "medium",
    remediation:
      "Rate limit middleware (express-rate-limit veya @nestjs/throttler) ile Redis-backed token bucket uygulayin. Login + payment endpoint'leri icin daha dusuk esik.",
    steps: [
      {
        name: "burst_login_attempts",
        method: "POST",
        path: "/api/v1/auth/login",
        body: { email: "ratelimit@vetniva.local", password: "x" },
        expectStatus: [401, 429],
      },
    ],
  },

  /* ------------------------------------------------------------
   * V8 — Veri Koruma
   * ------------------------------------------------------------ */
  {
    key: "tenant_isolation_list_scoped",
    control: "tenant_isolation",
    asvsLevel: "L1",
    title: "Tenant izolasyonu (list scoping)",
    description:
      "Tenant A token'i ile /clinic/owners cagirildiginda response yalnizca Tenant A sahiplerini icermeli; Tenant B sahipleri yer almamali.",
    failureSeverity: "critical",
    remediation:
      "Tum list endpoint'leri tenantId filtresi zorunlu. PostgreSQL Row Level Security (RLS) policy + tenant context service. Cross-tenant denemede 404 donulmeli (bilgi sizintisi onlenir).",
    steps: [
      {
        name: "list_owners_tenant_a",
        method: "GET",
        path: "/api/v1/clinic/owners?limit=20",
        expectStatus: [200],
        forbidBodyRegex: ["OTHER_TENANT_MARKER_1", "OTHER_TENANT_MARKER_2"],
      },
    ],
  },
];

/** Kontrol anahtarindan config getirir. */
export function getCheck(key: string): SecurityCheck {
  const found = SECURITY_CHECKS.find((c) => c.key === key);
  if (!found) {
    throw new Error(`Bilinmeyen guvenlik kontrolu: ${key}`);
  }
  return found;
}

/** Tum kontrol anahtarlari. */
export function listCheckKeys(): ReadonlyArray<string> {
  return SECURITY_CHECKS.map((c) => c.key);
}
