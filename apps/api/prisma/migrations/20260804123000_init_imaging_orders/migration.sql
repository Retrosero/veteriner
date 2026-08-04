-- =============================================================================
-- W1.2d: Görüntüleme isteği (imaging_orders) DB persistence.
-- GOAL-093 (FAZ-9) — in-memory Map'ten DB'ye taşıma.
--
-- İş kuralları:
-- - State machine: ordered → scheduled → performed → reported → completed;
--   ordered|scheduled → cancelled; reported → amended (yeni revision).
-- - Katalog snapshot'ı (code/name/modality/bodyPart/price) order üzerinde
--   dondurulur.
-- - `reportRevisions` JSONB: append-only rapor revizyonları.
-- - `attachments` PostgreSQL native String[] (dosya ID listesi).
-- - Append-only: fiziksel silme YOKTUR (DB trigger).
-- =============================================================================

CREATE TABLE imaging_orders (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  imaging_test_id UUID NOT NULL,
  imaging_test_code VARCHAR(64) NOT NULL,
  imaging_test_name VARCHAR(200) NOT NULL,
  modality VARCHAR(20) NOT NULL,
  body_part VARCHAR(100),
  price VARCHAR(30) NOT NULL,
  source_type VARCHAR(20) NOT NULL,
  source_id UUID,
  priority VARCHAR(10) NOT NULL DEFAULT 'routine',
  status VARCHAR(20) NOT NULL DEFAULT 'ordered',
  scheduled_at TIMESTAMPTZ(6),
  scheduled_location VARCHAR(200),
  performed_at TIMESTAMPTZ(6),
  performed_by_user_id UUID,
  contrast_use VARCHAR(10),
  clinical_info VARCHAR(4000),
  attachments TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  report_revisions JSONB NOT NULL DEFAULT '[]'::jsonb,
  cancelled_at TIMESTAMPTZ(6),
  cancelled_by VARCHAR(100),
  cancel_reason VARCHAR(2000),
  notes VARCHAR(2000),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100) NOT NULL,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Performans indeksleri.
CREATE INDEX imaging_orders_tenant_status_idx ON imaging_orders(tenant_id, status);
CREATE INDEX imaging_orders_tenant_patient_created_idx ON imaging_orders(tenant_id, patient_id, created_at);
CREATE INDEX imaging_orders_tenant_modality_created_idx ON imaging_orders(tenant_id, modality, created_at);
CREATE INDEX imaging_orders_tenant_source_idx ON imaging_orders(tenant_id, source_type, source_id);
CREATE INDEX imaging_orders_tenant_created_idx ON imaging_orders(tenant_id, created_at);

-- Row Level Security.
ALTER TABLE imaging_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY imaging_orders_tenant_isolation ON imaging_orders
  USING (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true));

-- Append-only güvence.
CREATE OR REPLACE FUNCTION imaging_orders_block_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'imaging_orders rows are append-only; cancel via status=cancelled instead';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER imaging_orders_no_delete
  BEFORE DELETE ON imaging_orders
  FOR EACH ROW
  EXECUTE FUNCTION imaging_orders_block_delete();
