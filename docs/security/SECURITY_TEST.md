# Güvenlik Testi (GOAL-123)

## Faz

FAZ-12 (Pilot, güvenlik, üretime hazırlık)

## Amaç

OWASP ASVS (Application Security Verification Standard)
yaklaşımıyla kimlik doğrulama, yetkilendirme, IDOR, XSS,
CSRF, SQL injection, dosya yükleme, rate limit ve tenant
izolasyonu testlerini çalıştır. Yüksek riskli açıklar
düzeltilir.

## Test Kategorileri (OWASP ASVS L1-L3)

### V1 — Mimari

- [ ] Mimari diyagram (tenant izolasyon + veri akışı).
- [ ] Trust boundaries tanımlı.
- [ ] Hassas veri sınıflandırması (PII / tıbbi / finansal).

### V2 — Kimlik Doğrulama

- [ ] Şifre politikası: min 12 karakter, büyük/küçük harf +
      rakam + özel karakter.
- [ ] Brute force koruması: 5 başarısız login → 15 dakika
      kilitle (FAZ-11 `brute-force.ts`).
- [ ] Session timeout: 30 dakika inaktif.
- [ ] JWT/refresh token rotation.
- [ ] MFA (multi-factor authentication) — planlanan
      (FAZ-12+).

### V3 — Oturum Yönetimi

- [ ] Session ID güvenliği (HttpOnly + Secure + SameSite
      cookie).
- [ ] Logout tüm aktif session'ları invalidate eder.
- [ ] Session fixation koruması (login sonrası ID
      rotate).

### V4 — Erişim Kontrolü

- [ ] **IDOR (Insecure Direct Object Reference)**
      koruması: tüm kaynak erişiminde tenant + ownership
      kontrolü; cross-tenant → 404 `VET-CLINIC-0001`.
- [ ] **Permission enforcement:** her controller
      `@RequirePermissions(...)` ile korunur.
- [ ] **Role hierarchy:** SUPERADMIN bypass'lı; OWNER
      tenant'ın tümü; VETERINARIAN klinik kayıtlar;
      STAFF sınırlı; PET_OWNER_PORTAL yalnızca kendi
      hayvanları (`self_only`).
- [ ] **Vertical privilege escalation:** STAFF VETERINARIAN
      aksiyonu denerse 403 `VET-AUTHZ-0001`.

### V5 — Validation, Sanitization, Encoding

- [ ] **XSS koruması:** tüm input'lar Zod ile validate
      edilir; output HTML escape edilir.
- [ ] **SQL injection:** tüm sorgular Prisma ORM üzerinden
      (parameterized); raw SQL yok.
- [ ] **NoSQL injection:** Prisma JSONB kullanımı; injection
      için type-check.
- [ ] **Mass assignment:** DTO'larda explicit alan listesi
      (Zod object); `strict()` modunda fazla alan reddedilir.

### V6 — Kriptografi

- [ ] Parolalar: bcrypt/argon2 hash (FAZ-12+); salt per
      user.
- [ ] PII at-rest: tenant export'ta JSON plain (veri
      sahibinin kendi verisi).
- [ ] TLS 1.3+ (production).
- [ ] Token signing: HS256 (FAZ-12+) / RS256 (production).

### V7 — Hata Yönetimi ve Logging

- [ ] Stack trace production'da gösterilmez.
- [ ] Hassas veri log'lanmaz (PII mask'lı).
- [ ] Audit trail append-only (silmeye karşı korumalı).

### V8 — Veri Koruma

- [ ] Tenant izolasyonu: tüm sorgularda `tenantId` filtresi.
- [ ] Cross-tenant attempt → 404 + audit
      `audit:security_event.tenant_isolation_breach_attempt`.
- [ ] KVKK erasure: PII anonimleştirme; tıbbi kayıt
      yasal saklama.

### V9 — İletişim

- [ ] HTTPS only (HSTS, secure cookie).
- [ ] CORS: allowlist origin'ler (production).
- [ ] CSP (Content Security Policy): script-src 'self'.

### V10 — Kötü Amaçlı Kod

- [ ] Dependency audit: `pnpm audit` her release'de.
- [ ] Snyk/Dependabot: otomatik PR.

### V11 — İş Mantığı

- [ ] **Rate limit:** IP + user bazında token bucket.
- [ ] **Brute force:** 5 başarısız login → 15 dk kilit.
- [ ] **Race condition:** tıbbi kayıt imza atomik
      (Prisma transaction).

### V12 — Dosya ve Kaynak

- [ ] **Dosya yükleme:** MIME type doğrulama (magic bytes);
      boyut limit; virus tarama (FAZ-12+).
- [ ] **Path traversal:** dosya adı sanitization; s3 key
      hash'li.
- [ ] **URL injection:** signed URL expire 5 dakika.

### V13 — API

- [ ] **Rate limit per endpoint:** critical POST'lar (login,
      payment) → 10 req/dk per IP.
- [ ] **CORS:** strict.
- [ ] **HTTP method whitelist:** GET/POST/PATCH/DELETE
      sadece; OPTIONS preflight.
- [ ] **Content-Type validation:** application/json only.

### V14 — Konfigürasyon

- [ ] **Debug mode production'da kapalı.**
- [ ] **Default credentials kaldırıldı.**
- [ ] **Error mesajları generic** (stack trace yok).

## Test Araçları

### Otomatik

- **OWASP ZAP** (zaproxy): otomatik tarama.
- **npm audit** + **Snyk**: dependency CVE.
- **Vitest security.spec.ts:** unit test (permission
  enforcement, IDOR, PII mask).

### Manuel

- **Burp Suite:** manuel penetration test.
- **Code review:** PR'da security checklist.

## Severity Sınıflandırması

| Seviye       | Açıklama                                                          | SLA (düzeltme) |
| ------------ | ----------------------------------------------------------------- | -------------- |
| **Critical** | Veri sızıntısı, tenant izolasyonu ihlali, kimlik doğrulama bypass | 24 saat        |
| **High**     | Yetkilendirme bypass, IDOR, SQL injection                         | 7 gün          |
| **Medium**   | XSS (reflected), CSRF, rate limit yok                             | 30 gün         |
| **Low**      | Information disclosure, verbose error                             | 90 gün         |
| **Info**     | Best practice önerisi                                             | Backlog        |

## Yapılmayanlar / Bilinçli Atlamalar

- **External penetration test** → Faz 12+ (production
  öncesi 3rd party).
- **Bug bounty program** → Faz 13+.
- **SAST (Static Application Security Testing)** → Faz 12+
  (Snyk Code entegrasyonu).
- **DAST (Dynamic Application Security Testing)** → Faz 12+
  (OWASP ZAP CI integration).
- **WAF (Web Application Firewall)** → Faz 12+ (Cloudflare
  WAF).

## Commit

- Docs: (bu commit) — `docs(security): GOAL-123 OWASP ASVS güvenlik test dokümanı`
