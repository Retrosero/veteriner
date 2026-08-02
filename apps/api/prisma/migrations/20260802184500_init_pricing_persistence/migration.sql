-- Faz 7: tenant fiyat listeleri ve append-only fiyat satırı düzeltme zinciri.
CREATE TABLE price_lists (
  id VARCHAR(100) PRIMARY KEY, tenant_id UUID NOT NULL, name VARCHAR(300) NOT NULL, description TEXT,
  type VARCHAR(30) NOT NULL, customer_id UUID, currency VARCHAR(10) NOT NULL, tax_profile VARCHAR(30),
  valid_from TIMESTAMPTZ(6), valid_until TIMESTAMPTZ(6), status VARCHAR(30) NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL, created_by VARCHAR(100) NOT NULL, updated_at TIMESTAMPTZ(6) NOT NULL,
  archived_at TIMESTAMPTZ(6), archived_by VARCHAR(100), archive_reason TEXT
);
CREATE TABLE price_list_items (
  id VARCHAR(100) PRIMARY KEY, tenant_id UUID NOT NULL,
  price_list_id VARCHAR(100) NOT NULL REFERENCES price_lists(id) ON DELETE RESTRICT,
  product_id VARCHAR(100) NOT NULL, price VARCHAR(30) NOT NULL, tax_profile VARCHAR(30),
  valid_from TIMESTAMPTZ(6), valid_until TIMESTAMPTZ(6), status VARCHAR(30) NOT NULL,
  supersedes_id VARCHAR(100), notes TEXT, created_at TIMESTAMPTZ(6) NOT NULL, created_by VARCHAR(100) NOT NULL
);
CREATE INDEX price_lists_tenant_effective_idx ON price_lists(tenant_id, status, valid_from, valid_until);
CREATE INDEX price_list_items_tenant_product_idx ON price_list_items(tenant_id, product_id, status);
CREATE INDEX price_list_items_tenant_list_idx ON price_list_items(tenant_id, price_list_id, status);
ALTER TABLE price_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_list_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY price_lists_tenant_isolation ON price_lists USING (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true)) WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY price_list_items_tenant_isolation ON price_list_items USING (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true)) WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true));
