# @file Audit Log Standardı.

# @module docs/errors/AUDIT_LOG_STANDARD

#

# @description VetNiva'da hangi olayların audit kaydı

# oluşturacağını, zorunlu alanları, retention ve

# sorgulama kurallarını tanımlar. Klinik ve finansal

# kayıtlar için append-only audit trail.

#

# @author GOAL-004 (FAZ-0) audit + log + hata standardı

# @since 2026-07-30

# @security Audit kayıtları değiştirilemez / silinemez.

# Append-only. PII maskelenir (bkz. PII_MASKING.md).

# =============================================================================

# Audit Log Standardı

VetNiva'da **audit log** ("kim, ne zaman, neyi, nasıl
değiştirdi?") ile **sistem logu** ("uygulama ne yaptı?")
ayrı tutulur. Bu döküman audit log tarafını tanımlar.

## 1. Audit vs. Sistem Logu

| Boyut                | Audit log                      | Sistem logu                |
| -------------------- | ------------------------------ | -------------------------- |
| Amaç                 | "Kim ne yaptı?" sorusuna cevap | Uygulama / hata ayıklama   |
| Kime sorulur?        | Superadmin + tenant OWNER      | Geliştirici / SRE          |
| Retention            | 7 yıl (TR ticari kayıt)        | 90 gün                     |
| Değiştirilebilir mi? | **Hayır** (append-only)        | Hayır (immutable)          |
| PII                  | Mask'li                        | Mask'li (PII_MASKING)      |
| Örnekler             | "Veteriner X aşıyı uyguladı"   | "DB bağlantısı 50ms sürdü" |

## 2. Audit Event İsimlendirme

Format: `audit:<entity>:<action>`

**Örnekler:**

- `audit:owner.create`
- `audit:owner.update`
- `audit:owner.archive`
- `audit:owner.erase` (KVKK silme)
- `audit:patient.create`
- `audit:patient.transfer`
- `audit:appointment.create`
- `audit:appointment.cancel`
- `audit:examination.create`
- `audit:examination.amend`
- `audit:examination.sign`
- `audit:vaccination.create`
- `audit:prescription.dispense`
- `audit:surgery.complete`
- `audit:hospitalization.admit`
- `audit:hospitalization.discharge`
- `audit:lab.enter_result`
- `audit:imaging.report`
- `audit:stock.receive`
- `audit:stock.adjust`
- `audit:sale.create`
- `audit:sale.refund`
- `audit:payment.create`
- `audit:payment.reverse`
- `audit:consent.sign`
- `audit:user.invite`
- `audit:user.assign_role`
- `audit:branch.create`
- `audit:tenant.update`
- `audit:adapter.format_currency` (ülke adaptörü)
- `audit:integration.e_invoice_send` (dış servis)

Tüm liste: [`AUDIT_EVENTS.yaml`](./AUDIT_EVENTS.yaml).

## 3. Zorunlu Alanlar

Her audit event aşağıdaki alanları içerir:

| Alan             | Tür         | Zorunlu | Açıklama                                                                                                                                                                                                                                                           |
| ---------------- | ----------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `event_id`       | uuid        | evet    | Benzersiz event ID.                                                                                                                                                                                                                                                |
| `event_name`     | string      | evet    | `audit:owner.create` veya `audit:auth.login.success` biçiminde hiyerarşik ad.                                                                                                                                                                                      |
| `tenant_id`      | uuid        | evet    | Tenant context. SYSTEM eventlerde null.                                                                                                                                                                                                                            |
| `branch_id`      | uuid/null   | hayır   | Şube (multi-branch tenant için).                                                                                                                                                                                                                                   |
| `actor_id`       | uuid/null   | evet    | İşlemi yapan kullanıcı. SYSTEM eventlerde null.                                                                                                                                                                                                                    |
| `actor_type`     | enum        | evet    | `user` / `system` / `integration` / `job`.                                                                                                                                                                                                                         |
| `target_type`    | string      | evet    | Etkilenen varlık tipi (örn. `owner`, `patient`).                                                                                                                                                                                                                   |
| `target_id`      | uuid/string | evet    | Varlık ID.                                                                                                                                                                                                                                                         |
| `action`         | enum        | evet    | `create` / `read` / `update` / `archive` / `restore` / `erase` / `export` / `sign` / `amend` / `complete` / `cancel` / `reverse` / `transfer` / `adjust` / `dispense` / `admit` / `discharge` / `invite` / `assign_role` / `format_currency` / `send` / `receive`. |
| `before`         | jsonb/null  | hayır   | Değişiklik öncesi varlık durumu (mask'li).                                                                                                                                                                                                                         |
| `after`          | jsonb/null  | hayır   | Değişiklik sonrası varlık durumu (mask'li).                                                                                                                                                                                                                        |
| `diff`           | jsonb/null  | hayır   | Alan-bazlı fark (sadece değişen alanlar).                                                                                                                                                                                                                          |
| `correlation_id` | string      | evet    | `req-...` / `job-...` / `int-...` (bkz. CORRELATION_ID.md).                                                                                                                                                                                                        |
| `ip_address`     | string      | hayır   | Mask'li (`192.168.1.***`).                                                                                                                                                                                                                                         |
| `user_agent`     | string      | hayır   | Hash.                                                                                                                                                                                                                                                              |
| `country`        | enum        | evet    | Tenant ülkesi (`TR` / `GB`).                                                                                                                                                                                                                                       |
| `severity`       | enum        | evet    | `info` / `warning` / `error` / `critical`.                                                                                                                                                                                                                         |
| `timestamp`      | timestamptz | evet    | ISO 8601, UTC.                                                                                                                                                                                                                                                     |
| `metadata`       | jsonb       | hayır   | Ek bağlam (örn. `idempotency_key`, `reason`).                                                                                                                                                                                                                      |

## 4. Severity

| Severity   | Kullanım                                                 |
| ---------- | -------------------------------------------------------- |
| `info`     | Rutin create / read / update.                            |
| `warning`  | Beklenen ancak dikkat gereken (iptal, iade).             |
| `error`    | Yetkisiz erişim, validation hatası.                      |
| `critical` | PII silme, KVKK talebi, rol değişikliği, tenant kapatma. |

## 5. Veri Yapısı (PostgreSQL)

```sql
-- apps/api/prisma/schema.prisma
model AuditEvent {
  id              String   @id @default(uuid()) @db.Uuid
  event_name      String   @db.VarChar(100)
  tenant_id       String?  @db.Uuid
  branch_id       String?  @db.Uuid
  actor_id        String?  @db.Uuid
  actor_type      String   @db.VarChar(20)  -- user|system|integration|job
  target_type     String   @db.VarChar(50)
  target_id       String   @db.VarChar(100)
  action          String   @db.VarChar(30)
  before          Json?
  after           Json?
  diff            Json?
  correlation_id  String   @db.VarChar(100)
  ip_address      String?  @db.VarChar(50)
  user_agent_hash String?  @db.VarChar(64)
  country         String   @db.Char(2)
  severity        String   @db.VarChar(10)
  metadata        Json?
  created_at      DateTime @default(now()) @db.Timestamptz

  @@index([tenant_id, created_at])
  @@index([actor_id, created_at])
  @@index([target_type, target_id])
  @@index([event_name, created_at])
  @@index([correlation_id])
  @@map("audit_events")
}
```

**Önemli:** `before` / `after` / `diff` her zaman PII
mask'li halde yazılır. Raw veri DB satırındadır;
audit event varlık değişikliğinin **kaydı** değil,
**kanıtıdır**.

## 6. Append-Only Garantisi

- INSERT-only. UPDATE / DELETE yok.
- DB trigger: `audit_events` tablosunda UPDATE
  veya DELETE denemesi → exception.
- 7 yıl retention (TR ticari kayıt, KVKK Madde 7).
- Tenant silinse bile audit kayıtları kalır
  (FK yok; `tenant_id` sadece referans).

## 7. Erişim

- **Superadmin:** Tüm tenant'ların audit log'u
  (Faz 16 — Superadmin ekranı).
- **Tenant OWNER / VETERINARIAN (kendi scope):**
  `audit:log:read` izni ile.
- **API:** `GET /api/audit/events?from=&to=&actor=&target=`
  (Faz 11+).

## 8. Sorgulama Örnekleri

**Son 24 saat içinde hasta sahibi silinen kayıtlar:**

```sql
SELECT * FROM audit_events
WHERE event_name = 'audit:owner.erase'
  AND tenant_id = $1
  AND created_at > now() - interval '1 day';
```

**Bir aşının tüm yaşam döngüsü:**

```sql
SELECT * FROM audit_events
WHERE target_type = 'vaccination' AND target_id = $1
ORDER BY created_at;
```

**Belirli bir request'in tüm iz bıraktığı event'ler:**

```sql
SELECT * FROM audit_events
WHERE correlation_id = $1
ORDER BY created_at;
```

**KVKK silme talebinde tüm izleri bulma** (PII alanı
NULL'lanır, audit event'ler korunur):

```sql
SELECT * FROM audit_events
WHERE (metadata->>'pii_hash') = $1;
-- Veya doğrudan target_id = $1
```

## 9. Uygulama (TypeScript)

```ts
// apps/api/src/common/audit/audit.types.ts
export type AuditAction =
  | "create"
  | "read"
  | "update"
  | "archive"
  | "restore"
  | "erase"
  | "export"
  | "sign"
  | "amend"
  | "complete"
  | "cancel"
  | "reverse"
  | "transfer"
  | "adjust"
  | "dispense"
  | "admit"
  | "discharge"
  | "invite"
  | "assign_role"
  | "format_currency"
  | "send"
  | "receive";

export type AuditActorType = "user" | "system" | "integration" | "job";

export type AuditSeverity = "info" | "warning" | "error" | "critical";

export interface AuditEvent {
  eventId: string;
  eventName: string; // "audit:owner.create"
  tenantId: string | null;
  branchId: string | null;
  actorId: string | null;
  actorType: AuditActorType;
  targetType: string;
  targetId: string;
  action: AuditAction;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  diff?: Record<string, unknown> | null;
  correlationId: string;
  ipAddress?: string | null;
  userAgentHash?: string | null;
  country: string;
  severity: AuditSeverity;
  metadata?: Record<string, unknown> | null;
  timestamp: string; // ISO 8601
}
```

## 10. CI Doğrulama

`pnpm docs:check` şunları doğrular:

1. **Event isimlendirme:** Tüm `audit.record()`
   çağrılarında `eventName` `^audit:[a-z_]+:[a-z_]+$`
   regex'ine uyar.
2. **Katalog senkronizasyonu:** Kullanılan tüm event
   isimleri `AUDIT_EVENTS.yaml`'da tanımlı.
3. **Zorunlu alanlar:** TypeScript derlemesi sırasında
   `AuditEvent` tipi ile uyumsuz kullanım varsa hata.
4. **PII maskeleme:** `before` / `after` payload'larında
   PII alanı yok (`PiiMasker` zorunlu).
5. **Severity:** Her event için uygun severity.

## 11. Operasyonel Notlar

- **Yüksek hacim:** 5-10k event/gün × tenant. BullMQ
  queue + batch INSERT (1000 event/batch).
- **Arşivleme:** 1 yıldan eski event'ler S3 cold
  storage'a taşınır (sorgulama yavaşlar).
- **Alert:** Critical event'ler (PII silme, tenant
  kapatma) için anlık PagerDuty.

## İlgili dokümanlar

- [`LOG_STANDARD.md`](./LOG_STANDARD.md) — sistem
  logları (audit'ten ayrı).
- [`PII_MASKING.md`](./PII_MASKING.md) — PII maskeleme
  kuralları.
- [`CORRELATION_ID.md`](./CORRELATION_ID.md) — log
  ilişkilendirme.
- [`AUDIT_EVENTS.yaml`](./AUDIT_EVENTS.yaml) — tüm
  audit event kataloğu.
- [`ERROR_CODE_STANDARD.md`](./ERROR_CODE_STANDARD.md) —
  hata kodu formatı (audit event'lerde de kullanılır).
