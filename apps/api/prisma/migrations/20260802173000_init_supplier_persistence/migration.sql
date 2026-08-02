-- Faz 6: tenant kapsamlı tedarikçi kartları ve RLS politikası.
CREATE TABLE suppliers (
  id VARCHAR(100) PRIMARY KEY,
  tenant_id UUID NOT NULL,
  name VARCHAR(300) NOT NULL,
  code VARCHAR(100) NOT NULL,
  type VARCHAR(30) NOT NULL,
  tax_id VARCHAR(100),
  contact_name VARCHAR(300),
  email VARCHAR(320),
  phone VARCHAR(100),
  address TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL,
  created_by VARCHAR(100) NOT NULL,
  updated_at TIMESTAMPTZ(6) NOT NULL,
  archived_at TIMESTAMPTZ(6),
  archived_by VARCHAR(100),
  archive_reason TEXT,
  UNIQUE(tenant_id, code)
);
CREATE INDEX suppliers_tenant_created_idx ON suppliers(tenant_id, created_at);
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY suppliers_tenant_isolation ON suppliers
  USING (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true));
