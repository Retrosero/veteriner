-- =============================================================================
-- W1.2c: Laboratuvar sonuçları (lab_results) DB persistence.
-- GOAL-092 (FAZ-9) — in-memory Map'ten DB'ye taşıma.
--
-- İş kuralları:
-- - State machine: draft → pending_review → approved; approved → amended
--   (yeni revision oluşur, eski `amended` işaretlenir).
-- - (tenantId, labOrderId, revision) unique — aynı order için tek bir
--   revision numarası.
-- - Onaylanmış (approved) sonuç değiştirilemez; düzeltme amendment
--   ile yeni revision olarak yapılır.
-- - Append-only: fiziksel silme YOKTUR (DB trigger).
-- - attachments: PostgreSQL native String[] (dosya ID listesi).
-- =============================================================================

CREATE TABLE lab_results (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  lab_order_id UUID NOT NULL REFERENCES lab_orders(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL,
  value VARCHAR(200) NOT NULL,
  value_numeric VARCHAR(30),
  unit VARCHAR(32) NOT NULL,
  reference_range VARCHAR(200),
  abnormal_flag VARCHAR(20) NOT NULL DEFAULT 'normal',
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  attachments TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  notes VARCHAR(2000),
  entered_by VARCHAR(100) NOT NULL,
  entered_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by VARCHAR(100),
  reviewed_at TIMESTAMPTZ(6),
  review_notes VARCHAR(2000),
  amends_result_id UUID,
  amendment_reason VARCHAR(2000),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, lab_order_id, revision)
);

-- Performans indeksleri.
CREATE INDEX lab_results_tenant_order_revision_idx ON lab_results(tenant_id, lab_order_id, revision);
CREATE INDEX lab_results_tenant_status_idx ON lab_results(tenant_id, status);
CREATE INDEX lab_results_tenant_created_idx ON lab_results(tenant_id, created_at);

-- Row Level Security.
ALTER TABLE lab_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY lab_results_tenant_isolation ON lab_results
  USING (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true));

-- Append-only güvence.
CREATE OR REPLACE FUNCTION lab_results_block_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'lab_results rows are append-only; use amendment flow instead';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER lab_results_no_delete
  BEFORE DELETE ON lab_results
  FOR EACH ROW
  EXECUTE FUNCTION lab_results_block_delete();
