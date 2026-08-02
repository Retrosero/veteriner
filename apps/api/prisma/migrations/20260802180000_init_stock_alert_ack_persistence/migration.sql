-- Faz 6: hesaplanan stok/SKT uyarıları için kalıcı kullanıcı acknowledge durumu.
CREATE TABLE stock_alert_acks (
  id VARCHAR(100) PRIMARY KEY, tenant_id UUID NOT NULL, alert_key VARCHAR(200) NOT NULL,
  alert_type VARCHAR(30) NOT NULL, target_id VARCHAR(100) NOT NULL,
  acknowledged_at TIMESTAMPTZ(6) NOT NULL, acknowledged_by VARCHAR(100) NOT NULL, note TEXT,
  UNIQUE(tenant_id, alert_key)
);
CREATE INDEX stock_alert_acks_tenant_target_idx ON stock_alert_acks(tenant_id, alert_type, target_id);
ALTER TABLE stock_alert_acks ENABLE ROW LEVEL SECURITY;
CREATE POLICY stock_alert_acks_tenant_isolation ON stock_alert_acks USING (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true)) WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true));
