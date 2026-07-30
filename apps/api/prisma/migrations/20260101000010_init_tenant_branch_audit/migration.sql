-- =============================================================================
-- GOAL-010 — Tenant, branch, audit event tabloları + RLS policy.
--
-- Bu migration Faz 1 platform çekirdeğinin temelini atar:
-- - tenants: kök tenant tablosu (slug unique, status enum).
-- - branches: tenant'a bağlı şubeler ((tenant_id, code) unique).
-- - user_tenant_memberships: tenant-scoped kullanıcı üyelikleri
--   (GOAL-011 ile doldurulacak).
-- - audit_events: append-only audit log (trigger + RLS).
--
-- Güvenlik:
-- - RLS audit_events tablosunda etkinleştirilir. SUPERADMIN bypass; tenant
--   kullanıcıları yalnızca kendi tenant'ının event'lerini görür.
-- - audit_events UPDATE/DELETE trigger ile engellenir (append-only).
--
-- Sıralama: enum'lar → tablolar → indexler → trigger → RLS policy.
-- @see docs/domain/DOMAIN_GLOSSARY.md
-- @see docs/errors/AUDIT_LOG_STANDARD.md
-- @see skills/DATABASE_MULTITENANCY.md
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ENUM tipleri
-- -----------------------------------------------------------------------------

CREATE TYPE tenant_status AS ENUM ('active', 'suspended', 'closed');

CREATE TYPE branch_status AS ENUM ('active', 'inactive', 'closed');

CREATE TYPE membership_status AS ENUM ('active', 'suspended', 'revoked');

-- -----------------------------------------------------------------------------
-- tenants tablosu
-- -----------------------------------------------------------------------------

CREATE TABLE tenants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            VARCHAR(64) NOT NULL UNIQUE,
  name            VARCHAR(200) NOT NULL,
  country         CHAR(2) NOT NULL,
  default_locale  VARCHAR(10) NOT NULL DEFAULT 'tr-TR',
  timezone        VARCHAR(64) NOT NULL DEFAULT 'Europe/Istanbul',
  status          tenant_status NOT NULL DEFAULT 'active',
  tax_id          VARCHAR(20),
  tax_id_type     VARCHAR(20),
  contact_email   VARCHAR(200),
  created_at      TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  archived_at     TIMESTAMPTZ(6),
  archived_reason VARCHAR(500),
  CONSTRAINT chk_tenants_slug CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$'),
  CONSTRAINT chk_tenants_country CHECK (country IN ('TR', 'GB'))
);

CREATE INDEX idx_tenants_status_created ON tenants (status, created_at);
CREATE INDEX idx_tenants_country ON tenants (country);

COMMENT ON TABLE tenants IS
  'Kök tenant tablosu. Multi-tenant izolasyonun kökü. Fiziksel silme yok.';

-- -----------------------------------------------------------------------------
-- branches tablosu
-- -----------------------------------------------------------------------------

CREATE TABLE branches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  code          VARCHAR(64) NOT NULL,
  name          VARCHAR(200) NOT NULL,
  city          VARCHAR(100),
  address_json  JSONB,
  phone         VARCHAR(32),
  status        branch_status NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  archived_at   TIMESTAMPTZ(6),
  CONSTRAINT uq_branches_tenant_code UNIQUE (tenant_id, code),
  CONSTRAINT chk_branches_code CHECK (code ~ '^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$')
);

CREATE INDEX idx_branches_tenant_status ON branches (tenant_id, status);
CREATE INDEX idx_branches_city ON branches (city);

COMMENT ON TABLE branches IS
  'Tenant şubesi. (tenant_id, code) unique. Pilot tek şube ile başlar.';

-- -----------------------------------------------------------------------------
-- user_tenant_memberships tablosu
-- -----------------------------------------------------------------------------

CREATE TABLE user_tenant_memberships (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  role        VARCHAR(32) NOT NULL,
  status      membership_status NOT NULL DEFAULT 'active',
  assigned_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ(6),
  CONSTRAINT uq_user_tenant UNIQUE (user_id, tenant_id),
  CONSTRAINT chk_membership_role CHECK (
    role IN ('OWNER', 'VETERINARIAN', 'STAFF', 'PET_OWNER_PORTAL')
  )
);

CREATE INDEX idx_memberships_tenant_status ON user_tenant_memberships (tenant_id, status);
CREATE INDEX idx_memberships_user ON user_tenant_memberships (user_id);

COMMENT ON TABLE user_tenant_memberships IS
  'Kullanıcının tenant üyeliği. GOAL-011 ile birlikte User tablosuna FK eklenecek.';

-- -----------------------------------------------------------------------------
-- audit_events tablosu (append-only)
-- -----------------------------------------------------------------------------

CREATE TABLE audit_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name      VARCHAR(100) NOT NULL,
  tenant_id       UUID,
  branch_id       UUID,
  actor_id        UUID,
  actor_type      VARCHAR(20) NOT NULL,
  target_type     VARCHAR(50) NOT NULL,
  target_id       VARCHAR(100) NOT NULL,
  action          VARCHAR(30) NOT NULL,
  before          JSONB,
  after           JSONB,
  diff            JSONB,
  correlation_id  VARCHAR(100) NOT NULL,
  ip_address      VARCHAR(50),
  user_agent_hash VARCHAR(64),
  country         CHAR(2) NOT NULL,
  severity        VARCHAR(10) NOT NULL,
  metadata        JSONB,
  created_at      TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_audit_actor_type CHECK (
    actor_type IN ('user', 'system', 'integration', 'job')
  ),
  CONSTRAINT chk_audit_severity CHECK (
    severity IN ('info', 'warning', 'error', 'critical')
  ),
  CONSTRAINT chk_audit_event_name CHECK (event_name ~ '^audit:[a-z_]+:[a-z_]+$'),
  CONSTRAINT chk_audit_country CHECK (country IN ('TR', 'GB'))
);

CREATE INDEX idx_audit_tenant_created ON audit_events (tenant_id, created_at);
CREATE INDEX idx_audit_branch_created ON audit_events (branch_id, created_at);
CREATE INDEX idx_audit_actor_created ON audit_events (actor_id, created_at);
CREATE INDEX idx_audit_target ON audit_events (target_type, target_id);
CREATE INDEX idx_audit_event_created ON audit_events (event_name, created_at);
CREATE INDEX idx_audit_correlation ON audit_events (correlation_id);
CREATE INDEX idx_audit_severity_created ON audit_events (severity, created_at);

COMMENT ON TABLE audit_events IS
  'Append-only audit log. UPDATE/DELETE trigger ile engellenir. 7 yıl retention.';

-- -----------------------------------------------------------------------------
-- Append-only trigger: audit_events UPDATE/DELETE engellenir.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION audit_events_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'VET-AUDIT-0001: audit_events tablosu append-only; UPDATE/DELETE yasak (event_id=%.% hedef:%.%)',
    COALESCE(OLD.id, NEW.id), TG_OP, COALESCE(OLD.target_id, NEW.target_id)
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_events_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION audit_events_append_only();

-- -----------------------------------------------------------------------------
-- updated_at otomatik güncelleme (tenants, branches)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenants_touch_updated
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER trg_branches_touch_updated
  BEFORE UPDATE ON branches
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- -----------------------------------------------------------------------------
-- RLS: audit_events tenant izolasyonu.
-- Uygulama her sorgu öncesi `set_config('app.tenant_id', '<uuid>')` ile
-- bağlam belirler. SUPERADMIN rolleri için `app.is_superadmin = 'true'`
-- set edilir (RLS bypass).
-- -----------------------------------------------------------------------------

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_events_tenant_isolation ON audit_events;
CREATE POLICY audit_events_tenant_isolation ON audit_events
  USING (
    -- SUPERADMIN tüm audit log'u görebilir.
    COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true'
    OR
    -- Tenant context set edilmişse yalnızca o tenant'ın event'leri.
    (
      COALESCE(current_setting('app.tenant_id', true), '') <> ''
      AND tenant_id::text = current_setting('app.tenant_id', true)
    )
    OR
    -- Sistem olayları (tenant_id null) SUPERADMIN ve uygulama tarafından
    -- okunabilir; context set edilmemişse uygulama katmanı sınırlar.
    tenant_id IS NULL
  )
  WITH CHECK (
    COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true'
    OR
    (
      COALESCE(current_setting('app.tenant_id', true), '') <> ''
      AND tenant_id::text = current_setting('app.tenant_id', true)
    )
    OR
    tenant_id IS NULL
  );

COMMENT ON POLICY audit_events_tenant_isolation ON audit_events IS
  'Tenant izolasyonu: uygulama her sorguda set_config ile context belirler. SUPERADMIN bypass eder. tenant_id null olan sistem olayları tenant-scope dışı sayılır.';

-- -----------------------------------------------------------------------------
-- RLS: branches tenant izolasyonu.
-- Uygulama `app.tenant_id` set eder; branch sorguları otomatik filtrelenir.
-- -----------------------------------------------------------------------------

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS branches_tenant_isolation ON branches;
CREATE POLICY branches_tenant_isolation ON branches
  USING (
    COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true'
    OR
    (
      COALESCE(current_setting('app.tenant_id', true), '') <> ''
      AND tenant_id::text = current_setting('app.tenant_id', true)
    )
  )
  WITH CHECK (
    COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true'
    OR
    (
      COALESCE(current_setting('app.tenant_id', true), '') <> ''
      AND tenant_id::text = current_setting('app.tenant_id', true)
    )
  );

COMMENT ON POLICY branches_tenant_isolation ON branches IS
  'Tenant izolasyonu: SUPERADMIN tüm branchleri, tenant kullanıcıları yalnızca kendi tenant''larındaki branchları görür.';

-- -----------------------------------------------------------------------------
-- RLS: user_tenant_memberships tenant izolasyonu.
-- Bir kullanıcı kendi üyeliklerini görebilir; tenant admin kendi
-- tenant'ının üyeliklerini yönetir. SUPERADMIN bypass.
-- -----------------------------------------------------------------------------

ALTER TABLE user_tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tenant_memberships FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS memberships_tenant_isolation ON user_tenant_memberships;
CREATE POLICY memberships_tenant_isolation ON user_tenant_memberships
  USING (
    COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true'
    OR
    (
      COALESCE(current_setting('app.tenant_id', true), '') <> ''
      AND tenant_id::text = current_setting('app.tenant_id', true)
    )
    OR
    (
      COALESCE(current_setting('app.user_id', true), '') <> ''
      AND user_id::text = current_setting('app.user_id', true)
    )
  )
  WITH CHECK (
    COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true'
    OR
    (
      COALESCE(current_setting('app.tenant_id', true), '') <> ''
      AND tenant_id::text = current_setting('app.tenant_id', true)
    )
  );

-- -----------------------------------------------------------------------------
-- Initial seed: SUPERADMIN bypass için uygulama DB rolü ayrımı.
-- Bu migration çalıştığı DB kullanıcısı SUPERADMIN olarak kabul edilir.
-- Production'da `vetniva_app` (tenant kullanıcıları için) ve
-- `vetniva_admin` (SUPERADMIN) ayrı DB rolleri ile çalışılır; bu
-- migration'ı yalnızca admin rolü uygulayabilir (deploy notu).
-- -----------------------------------------------------------------------------
