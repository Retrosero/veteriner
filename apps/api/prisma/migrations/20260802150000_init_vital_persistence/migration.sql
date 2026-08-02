CREATE TABLE vital_records (id VARCHAR(80) PRIMARY KEY, tenant_id UUID NOT NULL, examination_id VARCHAR(80) NOT NULL REFERENCES examinations(id) ON DELETE RESTRICT, patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT, veterinarian_id VARCHAR(100) NOT NULL, vital_signs JSONB NOT NULL, taken_at TIMESTAMPTZ(6) NOT NULL, recorded_by UUID NOT NULL);
CREATE INDEX vital_records_tenant_exam_taken_idx ON vital_records(tenant_id, examination_id, taken_at);
CREATE INDEX vital_records_tenant_patient_taken_idx ON vital_records(tenant_id, patient_id, taken_at);
ALTER TABLE vital_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY vital_records_tenant_isolation ON vital_records USING (current_setting('app.is_superadmin',true)='true' OR tenant_id::text=current_setting('app.tenant_id',true)) WITH CHECK (current_setting('app.is_superadmin',true)='true' OR tenant_id::text=current_setting('app.tenant_id',true));
