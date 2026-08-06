-- =============================================================================
-- W1.2e: Lab adapter export/import ledger (lab_adapter_exports, lab_adapter_imports).
-- GOAL-094 (FAZ-9) — in-memory Map'ten DB'ye taşıma.
--
-- İş kuralları:
-- - Export: order → provider (pending → accepted | rejected | failed | cancelled).
-- - Import: provider → result (received → mapped | failed).
-- - Idempotency: (tenantId, idempotencyKey) unique.
-- - Append-only: fiziksel silme YOKTUR (DB trigger).
-- - payload / rawPayload: JSONB.
-- =============================================================================

CREATE TABLE lab_adapter_exports (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  lab_order_id UUID NOT NULL,
  adapter_type VARCHAR(30) NOT NULL,
  provider_name VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  idempotency_key VARCHAR(100) NOT NULL,
  provider_reference VARCHAR(200),
  provider_message VARCHAR(2000),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ(6),
  last_error VARCHAR(2000),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes VARCHAR(2000),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100) NOT NULL,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, idempotency_key)
);

CREATE INDEX lab_adapter_exports_tenant_order_idx ON lab_adapter_exports(tenant_id, lab_order_id, created_at);
CREATE INDEX lab_adapter_exports_tenant_status_idx ON lab_adapter_exports(tenant_id, status);
CREATE INDEX lab_adapter_exports_tenant_adapter_idx ON lab_adapter_exports(tenant_id, adapter_type, created_at);

ALTER TABLE lab_adapter_exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY lab_adapter_exports_tenant_isolation ON lab_adapter_exports
  USING (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true));

CREATE OR REPLACE FUNCTION lab_adapter_exports_block_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'lab_adapter_exports rows are append-only; cancel via status=cancelled instead';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER lab_adapter_exports_no_delete
  BEFORE DELETE ON lab_adapter_exports
  FOR EACH ROW
  EXECUTE FUNCTION lab_adapter_exports_block_delete();

-- ---------------------------------------------------------------------------

CREATE TABLE lab_adapter_imports (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  lab_order_id UUID NOT NULL,
  adapter_type VARCHAR(30) NOT NULL,
  provider_name VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'received',
  provider_reference VARCHAR(200) NOT NULL,
  raw_payload JSONB NOT NULL,
  mapped_result_id UUID,
  mapped_at TIMESTAMPTZ(6),
  mapped_by VARCHAR(100),
  error_message VARCHAR(2000),
  received_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX lab_adapter_imports_tenant_order_idx ON lab_adapter_imports(tenant_id, lab_order_id, received_at);
CREATE INDEX lab_adapter_imports_tenant_status_idx ON lab_adapter_imports(tenant_id, status);
CREATE INDEX lab_adapter_imports_tenant_ref_idx ON lab_adapter_imports(tenant_id, provider_reference);

ALTER TABLE lab_adapter_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY lab_adapter_imports_tenant_isolation ON lab_adapter_imports
  USING (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true));

CREATE OR REPLACE FUNCTION lab_adapter_imports_block_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'lab_adapter_imports rows are append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER lab_adapter_imports_no_delete
  BEFORE DELETE ON lab_adapter_imports
  FOR EACH ROW
  EXECUTE FUNCTION lab_adapter_imports_block_delete();
