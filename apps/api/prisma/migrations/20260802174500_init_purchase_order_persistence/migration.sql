-- Faz 6: satın alma siparişi başlık/satırları, tenant RLS ile korunur.
CREATE TABLE purchase_orders (
  id VARCHAR(100) PRIMARY KEY, tenant_id UUID NOT NULL, supplier_id VARCHAR(100) NOT NULL,
  branch_id UUID, status VARCHAR(30) NOT NULL, currency VARCHAR(10) NOT NULL,
  expected_at TIMESTAMPTZ(6), total_amount VARCHAR(30) NOT NULL, notes TEXT,
  approved_at TIMESTAMPTZ(6), approved_by VARCHAR(100), received_at TIMESTAMPTZ(6), received_by VARCHAR(100),
  cancelled_at TIMESTAMPTZ(6), cancelled_by VARCHAR(100), cancel_reason TEXT,
  created_at TIMESTAMPTZ(6) NOT NULL, created_by VARCHAR(100) NOT NULL, updated_at TIMESTAMPTZ(6) NOT NULL
);
CREATE TABLE purchase_order_lines (
  id VARCHAR(100) PRIMARY KEY, tenant_id UUID NOT NULL,
  purchase_order_id VARCHAR(100) NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  product_id VARCHAR(100) NOT NULL, unit VARCHAR(30) NOT NULL, ordered_quantity VARCHAR(30) NOT NULL,
  unit_price VARCHAR(30) NOT NULL, line_total VARCHAR(30) NOT NULL, received_quantity VARCHAR(30) NOT NULL,
  unit_cost VARCHAR(30), notes TEXT, created_at TIMESTAMPTZ(6) NOT NULL, updated_at TIMESTAMPTZ(6) NOT NULL
);
CREATE INDEX purchase_orders_tenant_supplier_created_idx ON purchase_orders(tenant_id, supplier_id, created_at);
CREATE INDEX purchase_order_lines_tenant_order_idx ON purchase_order_lines(tenant_id, purchase_order_id);
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchase_orders_tenant_isolation ON purchase_orders USING (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true)) WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY purchase_order_lines_tenant_isolation ON purchase_order_lines USING (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true)) WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true));
