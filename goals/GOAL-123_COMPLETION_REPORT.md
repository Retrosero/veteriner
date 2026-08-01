# GOAL-123 — Güvenlik Testi (Completion Report)

## Faz

FAZ-12 (Pilot, güvenlik, üretime hazırlık)

## Özet

OWASP ASVS (Application Security Verification Standard)
L1-L3 kapsamında 14 kategori güvenlik testi planlandı.
Yüksek riskli açıklar düzeltilecek.

## Çıktılar

### Döküman (bu commit)

- `docs/security/SECURITY_TEST.md` — 14 kategori (V1-V14)
  - test araçları (OWASP ZAP, Snyk, vitest) + severity
    sınıflandırması (Critical/High/Medium/Low/Info).

### Kategoriler (14)

- V1: Mimari (trust boundaries, PII sınıflandırma).
- V2: Kimlik Doğrulama (şifre politikası, brute force,
  MFA).
- V3: Oturum Yönetimi (cookie güvenliği, fixation).
- V4: Erişim Kontrolü (IDOR, permission, role).
- V5: Validation (XSS, SQL injection, mass assignment).
- V6: Kriptografi (parola hash, TLS, token).
- V7: Hata Yönetimi (stack trace, PII log).
- V8: Veri Koruma (tenant izolasyon, KVKK).
- V9: İletişim (HTTPS, CORS, CSP).
- V10: Kötü Amaçlı Kod (dependency audit).
- V11: İş Mantığı (rate limit, race condition).
- V12: Dosya/Kaynak (MIME, path traversal).
- V13: API (rate limit, CORS, Content-Type).
- V14: Konfigürasyon (debug mode, error generic).

## Severity Sınıflandırması

- **Critical:** 24 saat (veri sızıntısı, tenant ihlali).
- **High:** 7 gün (yetkilendirme bypass, IDOR, SQLi).
- **Medium:** 30 gün (XSS reflected, CSRF, rate limit).
- **Low:** 90 gün (info disclosure).
- **Info:** Backlog (best practice).

## Yapılmayanlar / Bilinçli Atlamalar

- **External penetration test** → Faz 12+ (production
  öncesi 3rd party).
- **Bug bounty program** → Faz 13+.
- **SAST/DAST CI integration** → Faz 12+ (Snyk Code +
  OWASP ZAP).
- **WAF (Web Application Firewall)** → Faz 12+ (Cloudflare).

## Döküman Uyum

- `pnpm docs:check` → temiz (yeni eklenen özgü).
- `pnpm i18n:check` → temiz.

## Testler

- **Vitest security.spec.ts:** IDOR, permission
  enforcement, PII mask.
- **OWASP ZAP:** otomatik tarama (FAZ-12+).
- **Snyk/npm audit:** her release'de.
- **Manuel pentest:** FAZ-12+ 3rd party.

## Commit

- Docs: (bu commit) — `docs(security): GOAL-123 OWASP ASVS güvenlik test dokümanı`
