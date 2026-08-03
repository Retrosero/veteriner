-- =============================================================================
-- @file GOAL-105/106 — Güvenlik olayları ve log retention kalıcılığı.
-- @description PII maskelenmiş güvenlik olayları, SUPERADMIN retention
-- policy'leri ve append-only retention sweep geçmişini PostgreSQL'e taşır.
-- @security Tablolar FORCE RLS kullanır. Tenant olayları yalnız transaction
-- yerel tenant bağlamında, sistem olayları yalnız explicit system_write ile
-- yazılır. Retention yönetimi yalnız SUPERADMIN rolüne açıktır.
-- =============================================================================

CREATE TABLE security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id VARCHAR(100) NOT NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  actor_type VARCHAR(20) NOT NULL,
  type VARCHAR(50) NOT NULL,
  module VARCHAR(50) NOT NULL,
  route VARCHAR(500) NOT NULL,
  release VARCHAR(100) NOT NULL,
  severity VARCHAR(10) NOT NULL,
  fingerprint CHAR(16) NOT NULL,
  error_code VARCHAR(64),
  message VARCHAR(2000) NOT NULL,
  status_code INTEGER,
  ip_address VARCHAR(64),
  user_agent_hash CHAR(16),
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  country VARCHAR(10) NOT NULL,
  occurred_at TIMESTAMPTZ(6) NOT NULL,
  first_seen_at TIMESTAMPTZ(6) NOT NULL,
  last_seen_at TIMESTAMPTZ(6) NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  alert_sent BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT security_events_actor_type_check CHECK (actor_type IN ('user', 'system', 'portal_user')),
  CONSTRAINT security_events_severity_check CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  CONSTRAINT security_events_country_check CHECK (country IN ('TR', 'GB', 'SYSTEM')),
  CONSTRAINT security_events_fingerprint_check CHECK (fingerprint ~ '^[0-9a-f]{16}$'),
  CONSTRAINT security_events_occurrence_check CHECK (occurrence_count >= 1),
  CONSTRAINT security_events_seen_order_check CHECK (first_seen_at <= last_seen_at),
  CONSTRAINT security_events_branch_tenant_pair_check CHECK ((tenant_id IS NULL AND branch_id IS NULL) OR tenant_id IS NOT NULL)
);

CREATE UNIQUE INDEX security_events_tenant_fingerprint_unique
  ON security_events (tenant_id, fingerprint) WHERE tenant_id IS NOT NULL;
CREATE UNIQUE INDEX security_events_system_fingerprint_unique
  ON security_events (fingerprint) WHERE tenant_id IS NULL;
CREATE INDEX security_events_tenant_last_seen_idx ON security_events (tenant_id, last_seen_at DESC);
CREATE INDEX security_events_type_last_seen_idx ON security_events (type, last_seen_at DESC);

CREATE OR REPLACE FUNCTION security_events_branch_tenant_consistency()
RETURNS TRIGGER AS $$
DECLARE branch_tenant_id UUID;
BEGIN
  IF NEW.branch_id IS NULL THEN RETURN NEW; END IF;
  SELECT tenant_id INTO branch_tenant_id FROM branches WHERE id = NEW.branch_id;
  IF branch_tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'security_events: branch tenant uyuşmazlığı' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_security_events_branch_tenant_check
  BEFORE INSERT OR UPDATE OF tenant_id, branch_id ON security_events
  FOR EACH ROW EXECUTE FUNCTION security_events_branch_tenant_consistency();

ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events FORCE ROW LEVEL SECURITY;
CREATE POLICY security_events_tenant_isolation ON security_events
  USING (
    COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true'
    OR (tenant_id IS NOT NULL AND COALESCE(current_setting('app.tenant_id', true), '') <> ''
      AND tenant_id::text = current_setting('app.tenant_id', true))
  )
  WITH CHECK (
    COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true'
    OR (tenant_id IS NOT NULL AND COALESCE(current_setting('app.tenant_id', true), '') <> ''
      AND tenant_id::text = current_setting('app.tenant_id', true))
    OR (tenant_id IS NULL AND COALESCE(current_setting('app.system_write', true), 'false') = 'true')
  );

CREATE TABLE log_retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE ON UPDATE CASCADE,
  log_type VARCHAR(30) NOT NULL,
  severity VARCHAR(10) NOT NULL,
  retention_days INTEGER NOT NULL,
  archive_after_days INTEGER NOT NULL,
  archive_storage VARCHAR(10) NOT NULL,
  redact_pii BOOLEAN NOT NULL DEFAULT true,
  created_by_id VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL,
  updated_by_id VARCHAR(100) NOT NULL,
  updated_at TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT log_retention_policies_type_check CHECK (log_type IN ('audit_log', 'error_event', 'security_event', 'job_run', 'notification', 'request_log')),
  CONSTRAINT log_retention_policies_severity_check CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  CONSTRAINT log_retention_policies_storage_check CHECK (archive_storage IN ('hot', 'cold', 'none')),
  CONSTRAINT log_retention_policies_days_check CHECK (retention_days > 0 AND archive_after_days >= 0 AND archive_after_days <= retention_days),
  CONSTRAINT log_retention_policies_pii_check CHECK (redact_pii = true)
);

CREATE UNIQUE INDEX log_retention_policies_tenant_key_unique
  ON log_retention_policies (tenant_id, log_type, severity) WHERE tenant_id IS NOT NULL;
CREATE UNIQUE INDEX log_retention_policies_global_key_unique
  ON log_retention_policies (log_type, severity) WHERE tenant_id IS NULL;

CREATE TABLE log_retention_sweeps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by VARCHAR(20) NOT NULL,
  triggered_by_id VARCHAR(100),
  started_at TIMESTAMPTZ(6) NOT NULL,
  finished_at TIMESTAMPTZ(6) NOT NULL,
  total_scanned INTEGER NOT NULL,
  total_archived INTEGER NOT NULL,
  total_deleted INTEGER NOT NULL,
  total_errors INTEGER NOT NULL,
  buckets JSONB NOT NULL DEFAULT '[]'::jsonb,
  dry_run BOOLEAN NOT NULL DEFAULT false,
  note TEXT,
  CONSTRAINT log_retention_sweeps_triggered_by_check CHECK (triggered_by IN ('manual', 'scheduled', 'system')),
  CONSTRAINT log_retention_sweeps_counts_check CHECK (total_scanned >= 0 AND total_archived >= 0 AND total_deleted >= 0 AND total_errors >= 0),
  CONSTRAINT log_retention_sweeps_time_check CHECK (started_at <= finished_at)
);
CREATE INDEX log_retention_sweeps_started_idx ON log_retention_sweeps (started_at DESC);

ALTER TABLE log_retention_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE log_retention_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY log_retention_policies_superadmin_only ON log_retention_policies
  USING (COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true')
  WITH CHECK (COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true');

ALTER TABLE log_retention_sweeps ENABLE ROW LEVEL SECURITY;
ALTER TABLE log_retention_sweeps FORCE ROW LEVEL SECURITY;
CREATE POLICY log_retention_sweeps_superadmin_only ON log_retention_sweeps
  USING (COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true')
  WITH CHECK (
    COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true'
    OR COALESCE(current_setting('app.system_write', true), 'false') = 'true'
  );

COMMENT ON TABLE security_events IS 'GOAL-105 PII maskelenmiş güvenlik olayları; tenant RLS ile korunur.';
COMMENT ON TABLE log_retention_policies IS 'GOAL-106 SUPERADMIN retention override politikaları.';
COMMENT ON TABLE log_retention_sweeps IS 'GOAL-106 append-only retention sweep geçmişi.';
