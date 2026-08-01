# GOAL-105 — Güvenlik Logları ve Alarm Kuralları (Completion Report)

## Faz

FAZ-10 (Hata merkezi)

## Özet

Tüm tenant'ların güvenlik olaylarını (failed_login,
unauthorized_access_attempt, suspicious_export, role_change,
tenant_isolation_breach_attempt) toplayan, fingerprint ile
gruplayan, critical olaylarda pluggable alarm adapter'i
tetikleyen SUPERADMIN görünürlüğünde güvenlik logu.

## Çıktılar

### Core (GOAL-105 core commit paralel)

- `packages/contracts/src/security-event.ts` — 5 type
  (failed_login, unauthorized_access_attempt, suspicious_export,
  role_change, tenant_isolation_breach_attempt) + 3 severity
  (info, warning, error, critical) + 37 module enum +
  clientSecurityEventInputSchema.
- `apps/api/src/common/security-events/security-event.types.ts`
  — SecurityEventRecord + toSecurityEvent dönüşümü.
- `apps/api/src/modules/security-events/security-events.repository.ts`
  — In-memory Map (fingerprint index + search/summary/upsert).
- `apps/api/src/modules/security-events/security-events.service.ts`:
  - `recordSecurityEvent` (5xx + critical hataların
    `tenant_isolation_breach_attempt` karşılığı).
  - `listSecurityEvents`, `getSecurityEventDetail`,
    `getSecurityEventSummary` (SUPERADMIN).
  - `recordClientSecurityEvent` (frontend raporu; System
    namespace).
  - `SecurityAlertAdapter` arayüzü + `NoopSecurityAlertAdapter`
    default + `SECURITY_ALERT_ADAPTER` DI token.
  - `computeSecurityFingerprint` (type + module +
    normalizeMessage) → 16 hex.
  - `defaultSeverityForType` + `defaultErrorCodeForType` map.
  - `fireAlert` (best-effort async; başarısız olursa
    alertSent=false korunur).
- `apps/api/src/modules/security-events/security-events.controller.ts`
  — 3 superadmin + 1 system = 4 endpoint.
- `apps/api/src/modules/security-events/security-events.module.ts`
  — Default NoopSecurityAlertAdapter provider.
- `apps/api/src/app.module.ts` — module register.

### Endpoint'ler (4)

| #   | Method | Path                                         | Yetki            |
| --- | ------ | -------------------------------------------- | ---------------- |
| 1   | GET    | `/api/v1/superadmin/security-events`         | `audit:log:read` |
| 2   | GET    | `/api/v1/superadmin/security-events/summary` | `audit:log:read` |
| 3   | GET    | `/api/v1/superadmin/security-events/{id}`    | `audit:log:read` |
| 4   | POST   | `/api/v1/system/security-events`             | oturum gerekli   |

### Döküman (bu commit)

- 2 API doc (summary, detail).
- `docs/ai/AI_CHUNKS.yaml` — yeni `glossary-security-event` +
  `flow-security-event` chunk'ları v1.0.0.
- `docs/pages/web.superadmin.locale.security-events.yaml` —
  yeni sayfa kataloğu.
- `docs/errors/ERROR_CATALOG.md` + i18n — ek hata kodu yok
  (VET-AUTH-0002, VET-AUTHZ-0002, VET-AUDIT-0002, VET-RBAC-0002,
  VET-TENANT-0002, VET-SEC-0001 zaten mevcut).

## İş Kuralları

- **5 type × 4 severity:** Default `type → severity` map
  (failed_login→warning, unauthorized_access_attempt→warning,
  suspicious_export→error, role_change→info,
  tenant_isolation_breach_attempt→critical).
- **Default errorCode map:** failed_login→VET-AUTH-0002,
  unauthorized_access_attempt→VET-AUTHZ-0002,
  suspicious_export→VET-AUDIT-0002, role_change→VET-RBAC-0002,
  tenant_isolation_breach_attempt→VET-TENANT-0002.
- **Caller override:** severity ve errorCode caller
  tarafından override edilebilir.
- **Fingerprint:** 16 hex (sha256) — type + module +
  normalizeMessage(message). Aynı fingerprint için
  `occurrenceCount` artırılır, `lastSeenAt` güncellenir.
- **Alarm adapter:** `severity === "critical" && !alertSent`
  ise `void this.fireAlert(event)` çağrılır. Adapter
  `success=true` dönerse `markAlertSent` ile `alertSent=true`
  yapılır; `success=false` veya throw ise `alertSent=false`
  korunur.
- **Adapter DI:** `SECURITY_ALERT_ADAPTER` token; default
  `NoopSecurityAlertAdapter` yalnızca log'lar. Production'da
  Slack/PagerDuty/Email adapter'leri ile override edilebilir.
- **PII mask:** Context her zaman PiiMasker'dan geçer; IP
  `192.168.1.***` formatında; userAgent 8 hex hash.
- **Tenant filtresi:** SUPERADMIN cross-tenant görür; tenant
  filtresi opsiyonel.
- **Cross-tenant fingerprint çakışması:** Aynı tip+modül+mesaj
  için farklı tenant'lar farklı fingerprint almaz (aynı
  fingerprint gruplanır). Caller `message` alanına tenant
  ID'sini dahil etmelidir.
- **Audit (plan):** `audit:security_event.*` (info|warning|
  error|critical) — Faz 10+ AuditService entegrasyonu.

## Yapılmayanlar / Bilinçli Atlamalar

- **Prisma migration** → Faz 10+ DB katmanı.
- **Slack/PagerDuty adapter** → Faz 10+ operasyon.
- **Email bildirim** → Faz 10+ alarm.
- **Rate-limit (failed_login flood)** → Faz 10+ performans.
- **AuditService entegrasyonu** → Faz 10+ audit modülü.
- **Coğrafi anomaly detection** → Faz 12+ AI.

## Döküman Uyum

- `pnpm docs:check` → temiz (security-events özgü).
- `pnpm i18n:check` → temiz.

## Testler

- `security-events.service.spec.ts` → 36 unit test.
- Full api regresyon: 1411 yeşil, 9 skipped, 0 hata.

## Commit

- Core: (paralel core) — security-events modülü.
- Docs: (bu commit) — `docs(security-events): GOAL-105 güvenlik logları doküman ve i18n tamamla + FAZ-10 ilerlemesi`
