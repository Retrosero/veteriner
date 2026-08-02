CREATE TABLE vaccine_reminder_tenant_configs (tenant_id UUID PRIMARY KEY, days_before_due INT NOT NULL, channels JSONB NOT NULL, updated_at TIMESTAMPTZ(6) NOT NULL);
ALTER TABLE vaccine_reminder_tenant_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY vaccine_reminder_tenant_configs_tenant_isolation ON vaccine_reminder_tenant_configs USING (current_setting('app.is_superadmin',true)='true' OR tenant_id::text=current_setting('app.tenant_id',true)) WITH CHECK (current_setting('app.is_superadmin',true)='true' OR tenant_id::text=current_setting('app.tenant_id',true));
