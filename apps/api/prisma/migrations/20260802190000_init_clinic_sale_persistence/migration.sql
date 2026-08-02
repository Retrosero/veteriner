-- Faz 7: klinik satış/fatura taslağı ve satırları. Tahsilat kayıtları ayrı append-only deftere bağlanır.
CREATE TABLE clinic_sales (
 id VARCHAR(100) PRIMARY KEY, tenant_id UUID NOT NULL, status VARCHAR(30) NOT NULL,
 customer_owner_id UUID NOT NULL, customer_patient_id UUID NOT NULL, source_type VARCHAR(50) NOT NULL, source_id VARCHAR(100) NOT NULL,
 currency VARCHAR(10) NOT NULL, total_amount VARCHAR(30) NOT NULL, global_discount_percent DOUBLE PRECISION NOT NULL, net_amount VARCHAR(30) NOT NULL, notes TEXT,
 completed_at TIMESTAMPTZ(6), completed_by VARCHAR(100), cancelled_at TIMESTAMPTZ(6), cancelled_by VARCHAR(100), cancel_reason TEXT,
 created_at TIMESTAMPTZ(6) NOT NULL, created_by VARCHAR(100) NOT NULL, updated_at TIMESTAMPTZ(6) NOT NULL
);
CREATE TABLE clinic_sale_lines (
 id VARCHAR(100) PRIMARY KEY, tenant_id UUID NOT NULL, sale_id VARCHAR(100) NOT NULL REFERENCES clinic_sales(id) ON DELETE RESTRICT,
 product_id VARCHAR(100) NOT NULL, unit VARCHAR(30) NOT NULL, quantity VARCHAR(30) NOT NULL, unit_price VARCHAR(30) NOT NULL,
 discount_percent DOUBLE PRECISION NOT NULL, line_total VARCHAR(30) NOT NULL, notes TEXT,
 created_at TIMESTAMPTZ(6) NOT NULL, updated_at TIMESTAMPTZ(6) NOT NULL
);
CREATE INDEX clinic_sales_tenant_source_idx ON clinic_sales(tenant_id, source_type, source_id);
CREATE INDEX clinic_sales_tenant_owner_created_idx ON clinic_sales(tenant_id, customer_owner_id, created_at);
CREATE INDEX clinic_sale_lines_tenant_sale_idx ON clinic_sale_lines(tenant_id, sale_id);
ALTER TABLE clinic_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_sale_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY clinic_sales_tenant_isolation ON clinic_sales USING (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true)) WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY clinic_sale_lines_tenant_isolation ON clinic_sale_lines USING (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true)) WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true));
