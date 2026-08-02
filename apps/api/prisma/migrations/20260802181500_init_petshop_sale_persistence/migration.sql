-- Faz 6: petshop POS başlık ve satırları; stok hareketleri source_type/source_id ile bağlanır.
CREATE TABLE petshop_sales (
  id VARCHAR(100) PRIMARY KEY, tenant_id UUID NOT NULL, status VARCHAR(30) NOT NULL,
  customer_owner_id UUID, customer_patient_id UUID, payment_method VARCHAR(30) NOT NULL,
  paid_amount VARCHAR(30) NOT NULL, total_amount VARCHAR(30) NOT NULL,
  global_discount_percent DOUBLE PRECISION NOT NULL, net_amount VARCHAR(30) NOT NULL, notes TEXT,
  completed_at TIMESTAMPTZ(6), completed_by VARCHAR(100), cancelled_at TIMESTAMPTZ(6), cancelled_by VARCHAR(100), cancel_reason TEXT,
  created_at TIMESTAMPTZ(6) NOT NULL, created_by VARCHAR(100) NOT NULL, updated_at TIMESTAMPTZ(6) NOT NULL
);
CREATE TABLE petshop_sale_lines (
  id VARCHAR(100) PRIMARY KEY, tenant_id UUID NOT NULL,
  sale_id VARCHAR(100) NOT NULL REFERENCES petshop_sales(id) ON DELETE RESTRICT,
  product_id VARCHAR(100) NOT NULL, unit VARCHAR(30) NOT NULL, quantity VARCHAR(30) NOT NULL,
  unit_price VARCHAR(30) NOT NULL, discount_percent DOUBLE PRECISION NOT NULL, line_total VARCHAR(30) NOT NULL,
  notes TEXT, created_at TIMESTAMPTZ(6) NOT NULL, updated_at TIMESTAMPTZ(6) NOT NULL
);
CREATE INDEX petshop_sales_tenant_created_idx ON petshop_sales(tenant_id, created_at);
CREATE INDEX petshop_sales_tenant_owner_idx ON petshop_sales(tenant_id, customer_owner_id, created_at);
CREATE INDEX petshop_sale_lines_tenant_sale_idx ON petshop_sale_lines(tenant_id, sale_id);
ALTER TABLE petshop_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE petshop_sale_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY petshop_sales_tenant_isolation ON petshop_sales USING (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true)) WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY petshop_sale_lines_tenant_isolation ON petshop_sale_lines USING (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true)) WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true));
