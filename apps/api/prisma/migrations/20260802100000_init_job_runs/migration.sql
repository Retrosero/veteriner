-- GOAL-102: Background job ve adapter denemeleri için kalıcı, tenant RLS korumalı kayıt.
CREATE TABLE job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_name VARCHAR(128) NOT NULL, job_name VARCHAR(128) NOT NULL,
  job_key VARCHAR(256) NOT NULL, source VARCHAR(20) NOT NULL, status VARCHAR(20) NOT NULL,
  attempt INTEGER NOT NULL, max_attempts INTEGER NOT NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  correlation_id VARCHAR(128) NOT NULL, request_id VARCHAR(128), actor_id VARCHAR(100),
  actor_type VARCHAR(20) NOT NULL, input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB NOT NULL DEFAULT '{}'::jsonb, error_code VARCHAR(64),
  error_message VARCHAR(2000), error_stack TEXT, started_at TIMESTAMPTZ(6) NOT NULL,
  finished_at TIMESTAMPTZ(6), duration_ms INTEGER, parent_run_id UUID REFERENCES job_runs(id) ON DELETE RESTRICT,
  triggered_by VARCHAR(20) NOT NULL, country VARCHAR(10) NOT NULL, release VARCHAR(64) NOT NULL,
  CONSTRAINT job_runs_source_check CHECK (source IN ('queue','adapter','cron','system')),
  CONSTRAINT job_runs_status_check CHECK (status IN ('pending','running','succeeded','failed','dead_letter')),
  CONSTRAINT job_runs_actor_type_check CHECK (actor_type IN ('user','system','portal_user')),
  CONSTRAINT job_runs_triggered_by_check CHECK (triggered_by IN ('user','system','manual_retry','integration')),
  CONSTRAINT job_runs_country_check CHECK (country IN ('TR','GB','SYSTEM')),
  CONSTRAINT job_runs_attempt_check CHECK (attempt >= 1 AND max_attempts >= 1),
  CONSTRAINT job_runs_duration_check CHECK (duration_ms IS NULL OR duration_ms >= 0),
  CONSTRAINT job_runs_finish_check CHECK ((status IN ('pending','running') AND finished_at IS NULL AND duration_ms IS NULL) OR (status IN ('succeeded','failed','dead_letter') AND finished_at IS NOT NULL AND duration_ms IS NOT NULL)),
  CONSTRAINT job_runs_branch_tenant_pair_check CHECK ((tenant_id IS NULL AND branch_id IS NULL) OR tenant_id IS NOT NULL)
);
CREATE INDEX job_runs_tenant_started_idx ON job_runs (tenant_id, started_at DESC);
CREATE INDEX job_runs_job_key_started_idx ON job_runs (job_key, started_at ASC);
CREATE INDEX job_runs_status_started_idx ON job_runs (status, started_at DESC);
CREATE INDEX job_runs_queue_status_started_idx ON job_runs (queue_name, status, started_at DESC);
CREATE INDEX job_runs_correlation_idx ON job_runs (correlation_id);
CREATE OR REPLACE FUNCTION job_runs_branch_tenant_consistency() RETURNS TRIGGER AS $$
DECLARE branch_tenant_id UUID;
BEGIN
  IF NEW.branch_id IS NULL THEN RETURN NEW; END IF;
  SELECT tenant_id INTO branch_tenant_id FROM branches WHERE id = NEW.branch_id;
  IF branch_tenant_id IS DISTINCT FROM NEW.tenant_id THEN RAISE EXCEPTION 'job_runs: branch tenant uyuşmazlığı' USING ERRCODE = 'check_violation'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_job_runs_branch_tenant_check BEFORE INSERT OR UPDATE OF tenant_id, branch_id ON job_runs FOR EACH ROW EXECUTE FUNCTION job_runs_branch_tenant_consistency();
ALTER TABLE job_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY job_runs_tenant_isolation ON job_runs
  USING (COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true' OR (tenant_id IS NOT NULL AND COALESCE(current_setting('app.tenant_id', true), '') <> '' AND tenant_id::text = current_setting('app.tenant_id', true)) OR (tenant_id IS NULL AND COALESCE(current_setting('app.system_write', true), 'false') = 'true'))
  WITH CHECK (COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true' OR (tenant_id IS NOT NULL AND COALESCE(current_setting('app.tenant_id', true), '') <> '' AND tenant_id::text = current_setting('app.tenant_id', true)) OR (tenant_id IS NULL AND COALESCE(current_setting('app.system_write', true), 'false') = 'true'));
COMMENT ON TABLE job_runs IS 'GOAL-102 kalıcı BullMQ/adapter denemeleri; tenant RLS ve retry parent zinciri.';
