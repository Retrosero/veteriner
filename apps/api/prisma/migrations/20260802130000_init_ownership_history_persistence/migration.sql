CREATE TABLE "ownership_history" (
  "id" VARCHAR(80) NOT NULL,
  "tenant_id" UUID NOT NULL,
  "patient_id" UUID NOT NULL,
  "owner_id" UUID NOT NULL,
  "start_date" TIMESTAMPTZ(6) NOT NULL,
  "end_date" TIMESTAMPTZ(6),
  "reason" VARCHAR(30) NOT NULL,
  "other_note" VARCHAR(1000),
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ownership_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ownership_history_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ownership_history_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ownership_history_tenant_id_patient_id_start_date_idx" ON "ownership_history"("tenant_id", "patient_id", "start_date");
CREATE INDEX "ownership_history_tenant_id_owner_id_start_date_idx" ON "ownership_history"("tenant_id", "owner_id", "start_date");
CREATE UNIQUE INDEX "ownership_history_one_active_per_patient" ON "ownership_history"("tenant_id", "patient_id") WHERE "end_date" IS NULL;
ALTER TABLE "ownership_history" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ownership_history_tenant_isolation" ON "ownership_history" USING (current_setting('app.is_superadmin', true) = 'true' OR "tenant_id"::text = current_setting('app.tenant_id', true)) WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR "tenant_id"::text = current_setting('app.tenant_id', true));
