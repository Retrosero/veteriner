CREATE TABLE anesthesias (
  id VARCHAR(100) PRIMARY KEY,
  tenant_id UUID NOT NULL,
  surgery_plan_id VARCHAR(100) NOT NULL,
  patient_id UUID NOT NULL,
  protocol VARCHAR(300) NOT NULL,
  protocol_notes TEXT,
  status VARCHAR(30) NOT NULL,
  induction_at TIMESTAMPTZ,
  recovery_at TIMESTAMPTZ,
  finalized_at TIMESTAMPTZ,
  finalized_by VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  created_by VARCHAR(100) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (tenant_id, surgery_plan_id)
);

CREATE TABLE anesthesia_medications (
  id VARCHAR(100) PRIMARY KEY, tenant_id UUID NOT NULL, anesthesia_id VARCHAR(100) NOT NULL REFERENCES anesthesias(id),
  medication_name VARCHAR(300) NOT NULL, dose VARCHAR(100) NOT NULL, route VARCHAR(30) NOT NULL,
  administered_at TIMESTAMPTZ NOT NULL, administered_by_user_id VARCHAR(100) NOT NULL, notes TEXT, created_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE anesthesia_vitals (
  id VARCHAR(100) PRIMARY KEY, tenant_id UUID NOT NULL, anesthesia_id VARCHAR(100) NOT NULL REFERENCES anesthesias(id),
  kind VARCHAR(50) NOT NULL, value VARCHAR(100) NOT NULL, unit VARCHAR(50) NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL, observed_by_user_id VARCHAR(100) NOT NULL, notes TEXT, created_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE anesthesia_complications (
  id VARCHAR(100) PRIMARY KEY, tenant_id UUID NOT NULL, anesthesia_id VARCHAR(100) NOT NULL REFERENCES anesthesias(id),
  description TEXT NOT NULL, severity VARCHAR(30) NOT NULL, occurred_at TIMESTAMPTZ NOT NULL, resolved_at TIMESTAMPTZ,
  reported_by_user_id VARCHAR(100) NOT NULL, action TEXT, created_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE anesthesia_staff (
  id VARCHAR(100) PRIMARY KEY, tenant_id UUID NOT NULL, anesthesia_id VARCHAR(100) NOT NULL REFERENCES anesthesias(id),
  user_id VARCHAR(100) NOT NULL, role VARCHAR(50) NOT NULL, assigned_at TIMESTAMPTZ NOT NULL, ended_at TIMESTAMPTZ,
  notes TEXT, created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX anesthesias_tenant_patient_status_idx ON anesthesias(tenant_id, patient_id, status);
CREATE INDEX anesthesia_medications_tenant_anesthesia_time_idx ON anesthesia_medications(tenant_id, anesthesia_id, administered_at);
CREATE INDEX anesthesia_vitals_tenant_anesthesia_time_idx ON anesthesia_vitals(tenant_id, anesthesia_id, observed_at);
CREATE INDEX anesthesia_complications_tenant_anesthesia_time_idx ON anesthesia_complications(tenant_id, anesthesia_id, occurred_at);
CREATE INDEX anesthesia_staff_tenant_anesthesia_time_idx ON anesthesia_staff(tenant_id, anesthesia_id, assigned_at);

ALTER TABLE anesthesias ENABLE ROW LEVEL SECURITY; ALTER TABLE anesthesias FORCE ROW LEVEL SECURITY;
ALTER TABLE anesthesia_medications ENABLE ROW LEVEL SECURITY; ALTER TABLE anesthesia_medications FORCE ROW LEVEL SECURITY;
ALTER TABLE anesthesia_vitals ENABLE ROW LEVEL SECURITY; ALTER TABLE anesthesia_vitals FORCE ROW LEVEL SECURITY;
ALTER TABLE anesthesia_complications ENABLE ROW LEVEL SECURITY; ALTER TABLE anesthesia_complications FORCE ROW LEVEL SECURITY;
ALTER TABLE anesthesia_staff ENABLE ROW LEVEL SECURITY; ALTER TABLE anesthesia_staff FORCE ROW LEVEL SECURITY;

CREATE POLICY anesthesias_tenant ON anesthesias USING (tenant_id = current_setting('app.tenant_id', true)::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY anesthesia_medications_tenant ON anesthesia_medications USING (tenant_id = current_setting('app.tenant_id', true)::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY anesthesia_vitals_tenant ON anesthesia_vitals USING (tenant_id = current_setting('app.tenant_id', true)::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY anesthesia_complications_tenant ON anesthesia_complications USING (tenant_id = current_setting('app.tenant_id', true)::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY anesthesia_staff_tenant ON anesthesia_staff USING (tenant_id = current_setting('app.tenant_id', true)::uuid) WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
