CREATE TABLE "appointments" (
  "id" VARCHAR(80) NOT NULL,
  "tenant_id" UUID NOT NULL,
  "patient_id" UUID NOT NULL,
  "owner_id" UUID NOT NULL,
  "veterinarian_id" VARCHAR(100) NOT NULL,
  "branch_id" UUID,
  "type" VARCHAR(40) NOT NULL,
  "status" VARCHAR(30) NOT NULL,
  "start" TIMESTAMPTZ(6) NOT NULL,
  "end" TIMESTAMPTZ(6) NOT NULL,
  "notes" VARCHAR(2000),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID,
  CONSTRAINT "appointments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "appointments_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "appointments_tenant_id_veterinarian_id_start_end_idx" ON "appointments"("tenant_id", "veterinarian_id", "start", "end");
CREATE INDEX "appointments_tenant_id_patient_id_start_idx" ON "appointments"("tenant_id", "patient_id", "start");
ALTER TABLE "appointments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "appointments_tenant_isolation" ON "appointments" USING (current_setting('app.is_superadmin', true) = 'true' OR "tenant_id"::text = current_setting('app.tenant_id', true)) WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR "tenant_id"::text = current_setting('app.tenant_id', true));
