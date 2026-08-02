-- Faz 6: petshop satış iadesi başlık/satırları. Stok girişleri source bağlantısıyla ayrı append-only defterde tutulur.
CREATE TABLE petshop_sale_returns (
  id VARCHAR(100) PRIMARY KEY, tenant_id UUID NOT NULL, status VARCHAR(30) NOT NULL,
  original_sale_id VARCHAR(100) NOT NULL, customer_owner_id UUID, customer_patient_id UUID,
  refund_method VARCHAR(30) NOT NULL, total_amount VARCHAR(30) NOT NULL,
  global_discount_percent DOUBLE PRECISION NOT NULL, refund_amount VARCHAR(30) NOT NULL,
  reason TEXT NOT NULL, notes TEXT, completed_at TIMESTAMPTZ(6), completed_by VARCHAR(100),
  cancelled_at TIMESTAMPTZ(6), cancelled_by VARCHAR(100), cancel_reason TEXT,
  created_at TIMESTAMPTZ(6) NOT NULL, created_by VARCHAR(100) NOT NULL, updated_at TIMESTAMPTZ(6) NOT NULL
);
CREATE TABLE petshop_sale_return_lines (
  id VARCHAR(100) PRIMARY KEY, tenant_id UUID NOT NULL,
  return_id VARCHAR(100) NOT NULL REFERENCES petshop_sale_returns(id) ON DELETE RESTRICT,
  original_line_id VARCHAR(100) NOT NULL, product_id VARCHAR(100) NOT NULL, lot_id VARCHAR(100),
  unit VARCHAR(30) NOT NULL, quantity VARCHAR(30) NOT NULL, unit_price VARCHAR(30) NOT NULL,
  discount_percent DOUBLE PRECISION NOT NULL, line_total VARCHAR(30) NOT NULL, reason TEXT,
  created_at TIMESTAMPTZ(6) NOT NULL, updated_at TIMESTAMPTZ(6) NOT NULL
);
CREATE INDEX petshop_sale_returns_tenant_sale_created_idx ON petshop_sale_returns(tenant_id, original_sale_id, created_at);
CREATE INDEX petshop_sale_return_lines_tenant_return_idx ON petshop_sale_return_lines(tenant_id, return_id);
CREATE INDEX petshop_sale_return_lines_tenant_original_idx ON petshop_sale_return_lines(tenant_id, original_line_id);
ALTER TABLE petshop_sale_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE petshop_sale_return_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY petshop_sale_returns_tenant_isolation ON petshop_sale_returns USING (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true)) WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY petshop_sale_return_lines_tenant_isolation ON petshop_sale_return_lines USING (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true)) WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true));
