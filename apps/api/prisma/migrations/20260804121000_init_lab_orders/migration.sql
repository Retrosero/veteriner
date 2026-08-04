-- =============================================================================
-- W1.2b: Laboratuvar isteği (lab_orders) DB persistence.
-- GOAL-091 (FAZ-9) — in-memory Map'ten DB'ye taşıma.
--
-- İş kuralları:
-- - Append-only: fiziksel silme YOKTUR. İptal `cancelled` durumuna
--   geçiş ile yapılır; status UPDATE append-only kuralıyla uyumlu.
-- - Katalog snapshot'ı (code/name/sampleType/unit/referenceRange/price)
--   order üzerinde dondurulur; katalog sonradan değişse bile order
--   kendi anlık görüntüsünü korur.
-- - `patientId` → patients (ON DELETE RESTRICT).
-- - `labTestId` → lab_tests (ON DELETE RESTRICT) — katalog snapshot'ına rağmen
--   izlenebilirlik için referans korunur.
-- - Tenant RLS zorunlu; aynı kalıp diğer modüllerle (GOAL-017).
-- - Audit: `audit:laborder.create` + `audit:laborder.collect` + `audit:laborder.start` +
--   `audit:laborder.complete` + `audit:laborder.cancel` zaten service'te var.
-- =============================================================================

CREATE TABLE lab_orders (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  lab_test_id UUID NOT NULL REFERENCES lab_tests(id) ON DELETE RESTRICT,
  lab_test_code VARCHAR(64) NOT NULL,
  lab_test_name VARCHAR(200) NOT NULL,
  sample_type VARCHAR(20) NOT NULL,
  unit VARCHAR(32) NOT NULL,
  reference_range VARCHAR(200),
  price VARCHAR(30) NOT NULL,
  source_type VARCHAR(20) NOT NULL,
  source_id UUID,
  priority VARCHAR(10) NOT NULL DEFAULT 'routine',
  status VARCHAR(20) NOT NULL DEFAULT 'ordered',
  collected_at TIMESTAMPTZ(6),
  collected_by_user_id UUID,
  sample_quality VARCHAR(20),
  processing_started_at TIMESTAMPTZ(6),
  completed_at TIMESTAMPTZ(6),
  cancelled_at TIMESTAMPTZ(6),
  cancelled_by VARCHAR(100),
  cancel_reason VARCHAR(2000),
  notes VARCHAR(2000),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100) NOT NULL,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Performans indeksleri (tenant-scoped).
CREATE INDEX lab_orders_tenant_status_idx ON lab_orders(tenant_id, status);
CREATE INDEX lab_orders_tenant_patient_created_idx ON lab_orders(tenant_id, patient_id, created_at);
CREATE INDEX lab_orders_tenant_source_idx ON lab_orders(tenant_id, source_type, source_id);
CREATE INDEX lab_orders_tenant_created_idx ON lab_orders(tenant_id, created_at);
CREATE INDEX lab_orders_tenant_labtest_idx ON lab_orders(tenant_id, lab_test_id);

-- Row Level Security.
ALTER TABLE lab_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY lab_orders_tenant_isolation ON lab_orders
  USING (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true));

-- Append-only güvence: fiziksel DELETE engellenir. İptal `cancelled`
-- status'una UPDATE ile yapılır (klinik kayıt kurallarıyla tutarlı).
CREATE OR REPLACE FUNCTION lab_orders_block_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'lab_orders rows are append-only; cancel via status=cancelled instead';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER lab_orders_no_delete
  BEFORE DELETE ON lab_orders
  FOR EACH ROW
  EXECUTE FUNCTION lab_orders_block_delete();
