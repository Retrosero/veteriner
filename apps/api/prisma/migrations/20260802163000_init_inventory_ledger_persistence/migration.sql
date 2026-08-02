-- Kalıcı ürün/depo/lot katalogları ve append-only stok/klinik tüketim defteri.
CREATE TABLE products (id VARCHAR(100) PRIMARY KEY, tenant_id UUID NOT NULL, kind VARCHAR(30) NOT NULL, sku VARCHAR(100), barcode VARCHAR(100), name VARCHAR(300) NOT NULL, category VARCHAR(150), unit VARCHAR(30) NOT NULL, tax_profile VARCHAR(30) NOT NULL, purchase_price VARCHAR(30), sale_price VARCHAR(30), currency VARCHAR(10) NOT NULL, clinic_usage BOOLEAN NOT NULL, petshop_usage BOOLEAN NOT NULL, sale_available BOOLEAN NOT NULL, purchase_tracked BOOLEAN NOT NULL, vaccine_protocol_id VARCHAR(100), requires_prescription BOOLEAN NOT NULL, controlled_drug BOOLEAN NOT NULL, low_stock_threshold VARCHAR(30), notes TEXT, active BOOLEAN NOT NULL, created_at TIMESTAMPTZ(6) NOT NULL, created_by VARCHAR(100) NOT NULL, updated_at TIMESTAMPTZ(6) NOT NULL, archived_at TIMESTAMPTZ(6), archived_by VARCHAR(100), archive_reason TEXT);
CREATE UNIQUE INDEX products_tenant_sku_unique ON products(tenant_id, sku) WHERE sku IS NOT NULL;
CREATE UNIQUE INDEX products_tenant_barcode_unique ON products(tenant_id, barcode) WHERE barcode IS NOT NULL;
CREATE INDEX products_tenant_created_idx ON products(tenant_id, created_at);

CREATE TABLE warehouses (id VARCHAR(100) PRIMARY KEY, tenant_id UUID NOT NULL, name VARCHAR(300) NOT NULL, code VARCHAR(100) NOT NULL, type VARCHAR(30) NOT NULL, address TEXT, notes TEXT, active BOOLEAN NOT NULL, created_at TIMESTAMPTZ(6) NOT NULL, created_by VARCHAR(100) NOT NULL, updated_at TIMESTAMPTZ(6) NOT NULL, archived_at TIMESTAMPTZ(6), archived_by VARCHAR(100), archive_reason TEXT, UNIQUE(tenant_id, code));
CREATE TABLE shelves (id VARCHAR(100) PRIMARY KEY, tenant_id UUID NOT NULL, warehouse_id VARCHAR(100) NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT, name VARCHAR(300) NOT NULL, code VARCHAR(100), temperature_zone VARCHAR(30) NOT NULL, notes TEXT, active BOOLEAN NOT NULL, created_at TIMESTAMPTZ(6) NOT NULL, created_by VARCHAR(100) NOT NULL, updated_at TIMESTAMPTZ(6) NOT NULL, archived_at TIMESTAMPTZ(6), archived_by VARCHAR(100), archive_reason TEXT);
CREATE UNIQUE INDEX shelves_warehouse_code_unique ON shelves(warehouse_id, code) WHERE code IS NOT NULL;
CREATE INDEX shelves_tenant_warehouse_idx ON shelves(tenant_id, warehouse_id);

CREATE TABLE stock_lots (id VARCHAR(100) PRIMARY KEY, tenant_id UUID NOT NULL, product_id VARCHAR(100) NOT NULL REFERENCES products(id) ON DELETE RESTRICT, lot_number VARCHAR(150) NOT NULL, expiry_date TIMESTAMPTZ(6) NOT NULL, manufactured_at TIMESTAMPTZ(6), received_at TIMESTAMPTZ(6) NOT NULL, supplier_name VARCHAR(300), shelf_id VARCHAR(100) REFERENCES shelves(id) ON DELETE RESTRICT, quantity VARCHAR(30), notes TEXT, active BOOLEAN NOT NULL, created_at TIMESTAMPTZ(6) NOT NULL, created_by VARCHAR(100) NOT NULL, updated_at TIMESTAMPTZ(6) NOT NULL, archived_at TIMESTAMPTZ(6), archived_by VARCHAR(100), archive_reason TEXT, UNIQUE(product_id, lot_number));
CREATE INDEX stock_lots_tenant_product_idx ON stock_lots(tenant_id, product_id);

CREATE TABLE stock_movements (id VARCHAR(100) PRIMARY KEY, tenant_id UUID NOT NULL, type VARCHAR(30) NOT NULL, product_id VARCHAR(100) NOT NULL REFERENCES products(id) ON DELETE RESTRICT, lot_id VARCHAR(100) REFERENCES stock_lots(id) ON DELETE RESTRICT, quantity VARCHAR(30) NOT NULL, unit_cost VARCHAR(30), unit_price VARCHAR(30), source_type VARCHAR(80), source_id VARCHAR(100), reverses_movement_id VARCHAR(100), reason TEXT, occurred_at TIMESTAMPTZ(6) NOT NULL, notes TEXT, created_at TIMESTAMPTZ(6) NOT NULL, created_by VARCHAR(100) NOT NULL);
CREATE INDEX stock_movements_tenant_product_occurred_idx ON stock_movements(tenant_id, product_id, occurred_at);
CREATE INDEX stock_movements_tenant_lot_occurred_idx ON stock_movements(tenant_id, lot_id, occurred_at);
CREATE INDEX stock_movements_tenant_source_idx ON stock_movements(tenant_id, source_type, source_id);
CREATE INDEX stock_movements_tenant_reversal_idx ON stock_movements(tenant_id, reverses_movement_id);

CREATE TABLE clinical_consumptions (id VARCHAR(100) PRIMARY KEY, tenant_id UUID NOT NULL, context VARCHAR(40) NOT NULL, context_ref_id VARCHAR(100) NOT NULL, patient_id UUID REFERENCES patients(id) ON DELETE RESTRICT, lines JSONB NOT NULL, notes TEXT, status VARCHAR(30) NOT NULL, occurred_at TIMESTAMPTZ(6) NOT NULL, created_at TIMESTAMPTZ(6) NOT NULL, created_by VARCHAR(100) NOT NULL, cancelled_at TIMESTAMPTZ(6), cancelled_by VARCHAR(100), cancel_reason TEXT, stock_movement_ids JSONB NOT NULL);
CREATE INDEX clinical_consumptions_tenant_context_idx ON clinical_consumptions(tenant_id, context_ref_id, occurred_at);
CREATE INDEX clinical_consumptions_tenant_patient_idx ON clinical_consumptions(tenant_id, patient_id, occurred_at);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE shelves ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_consumptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY products_tenant_isolation ON products USING (current_setting('app.is_superadmin',true)='true' OR tenant_id::text=current_setting('app.tenant_id',true)) WITH CHECK (current_setting('app.is_superadmin',true)='true' OR tenant_id::text=current_setting('app.tenant_id',true));
CREATE POLICY warehouses_tenant_isolation ON warehouses USING (current_setting('app.is_superadmin',true)='true' OR tenant_id::text=current_setting('app.tenant_id',true)) WITH CHECK (current_setting('app.is_superadmin',true)='true' OR tenant_id::text=current_setting('app.tenant_id',true));
CREATE POLICY shelves_tenant_isolation ON shelves USING (current_setting('app.is_superadmin',true)='true' OR tenant_id::text=current_setting('app.tenant_id',true)) WITH CHECK (current_setting('app.is_superadmin',true)='true' OR tenant_id::text=current_setting('app.tenant_id',true));
CREATE POLICY stock_lots_tenant_isolation ON stock_lots USING (current_setting('app.is_superadmin',true)='true' OR tenant_id::text=current_setting('app.tenant_id',true)) WITH CHECK (current_setting('app.is_superadmin',true)='true' OR tenant_id::text=current_setting('app.tenant_id',true));
CREATE POLICY stock_movements_tenant_isolation ON stock_movements USING (current_setting('app.is_superadmin',true)='true' OR tenant_id::text=current_setting('app.tenant_id',true)) WITH CHECK (current_setting('app.is_superadmin',true)='true' OR tenant_id::text=current_setting('app.tenant_id',true));
CREATE POLICY clinical_consumptions_tenant_isolation ON clinical_consumptions USING (current_setting('app.is_superadmin',true)='true' OR tenant_id::text=current_setting('app.tenant_id',true)) WITH CHECK (current_setting('app.is_superadmin',true)='true' OR tenant_id::text=current_setting('app.tenant_id',true));
