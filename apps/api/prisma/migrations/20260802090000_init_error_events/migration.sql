-- =============================================================================
-- @file GOAL-100 — Merkezi hata olaylarının kalıcı deposu.
-- @description NestJS exception filter tarafından üretilen hata olaylarını
-- PostgreSQL'de saklar. Kayıtlar tenant-scoped RLS ile korunur; aynı tenant ve
-- fingerprint için tek aggregate satırında tekrar sayısı tutulur.
--
-- @security Tenant bağlamı olmayan runtime rolü tenant kaydı okuyamaz/yazamaz.
-- Sistem (tenant_id NULL) olayları yalnız explicit system-write bağlamı ile
-- yazılır ve yalnız SUPERADMIN tarafından okunur. Context alanı uygulama
-- katmanında PII maskelenmiş olmalıdır.
-- =============================================================================

CREATE TABLE error_events (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  branch_id            UUID REFERENCES branches(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  user_id              UUID REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  request_id           VARCHAR(100) NOT NULL,
  actor_type           VARCHAR(20) NOT NULL,
  module               VARCHAR(50) NOT NULL,
  route                VARCHAR(500) NOT NULL,
  release              VARCHAR(100) NOT NULL,
  severity             VARCHAR(10) NOT NULL,
  fingerprint          CHAR(16) NOT NULL,
  error_code           VARCHAR(64) NOT NULL,
  message              VARCHAR(2000) NOT NULL,
  status_code          INTEGER NOT NULL,
  stack                TEXT,
  context              JSONB NOT NULL DEFAULT '{}'::jsonb,
  country              VARCHAR(10) NOT NULL,
  occurred_at          TIMESTAMPTZ(6) NOT NULL,
  first_seen_at        TIMESTAMPTZ(6) NOT NULL,
  last_seen_at         TIMESTAMPTZ(6) NOT NULL,
  occurrence_count     INTEGER NOT NULL DEFAULT 1,
  status               VARCHAR(20) NOT NULL DEFAULT 'new',
  assigned_to_user_id  UUID REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT error_events_actor_type_check CHECK (actor_type IN ('user', 'system', 'portal_user')),
  CONSTRAINT error_events_severity_check CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  CONSTRAINT error_events_country_check CHECK (country IN ('TR', 'GB', 'SYSTEM')),
  CONSTRAINT error_events_status_check CHECK (status IN ('new', 'investigating', 'resolved', 'reopened')),
  CONSTRAINT error_events_fingerprint_format_check CHECK (fingerprint ~ '^[0-9a-f]{16}$'),
  CONSTRAINT error_events_occurrence_count_check CHECK (occurrence_count >= 1),
  CONSTRAINT error_events_seen_order_check CHECK (first_seen_at <= last_seen_at),
  CONSTRAINT error_events_branch_tenant_pair_check CHECK (
    (tenant_id IS NULL AND branch_id IS NULL) OR tenant_id IS NOT NULL
  )
);

CREATE UNIQUE INDEX error_events_tenant_fingerprint_unique
  ON error_events (tenant_id, fingerprint)
  WHERE tenant_id IS NOT NULL;
CREATE UNIQUE INDEX error_events_system_fingerprint_unique
  ON error_events (fingerprint)
  WHERE tenant_id IS NULL;
CREATE INDEX error_events_tenant_last_seen_idx ON error_events (tenant_id, last_seen_at DESC);
CREATE INDEX error_events_branch_last_seen_idx ON error_events (branch_id, last_seen_at DESC);
CREATE INDEX error_events_severity_last_seen_idx ON error_events (severity, last_seen_at DESC);
CREATE INDEX error_events_status_last_seen_idx ON error_events (status, last_seen_at DESC);

CREATE OR REPLACE FUNCTION error_events_branch_tenant_consistency()
RETURNS TRIGGER AS $$
DECLARE
  branch_tenant_id UUID;
BEGIN
  IF NEW.branch_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT tenant_id INTO branch_tenant_id FROM branches WHERE id = NEW.branch_id;
  IF branch_tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'error_events: branch tenant uyuşmazlığı'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_error_events_branch_tenant_check
  BEFORE INSERT OR UPDATE OF tenant_id, branch_id ON error_events
  FOR EACH ROW EXECUTE FUNCTION error_events_branch_tenant_consistency();

ALTER TABLE error_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_events FORCE ROW LEVEL SECURITY;

CREATE POLICY error_events_tenant_isolation ON error_events
  USING (
    COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true'
    OR (
      tenant_id IS NOT NULL
      AND COALESCE(current_setting('app.tenant_id', true), '') <> ''
      AND tenant_id::text = current_setting('app.tenant_id', true)
    )
  )
  WITH CHECK (
    COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true'
    OR (
      tenant_id IS NOT NULL
      AND COALESCE(current_setting('app.tenant_id', true), '') <> ''
      AND tenant_id::text = current_setting('app.tenant_id', true)
    )
    OR (
      tenant_id IS NULL
      AND COALESCE(current_setting('app.system_write', true), 'false') = 'true'
    )
  );

COMMENT ON TABLE error_events IS
  'GOAL-100 merkezi hata olayları. Tenant RLS ile korunur; context PII maskelenmiş olmalıdır.';
