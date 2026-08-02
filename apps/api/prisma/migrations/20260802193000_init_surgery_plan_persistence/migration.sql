CREATE TABLE "surgery_plans" (
  "id" VARCHAR(100) PRIMARY KEY, "tenant_id" UUID NOT NULL,
  "patient_id" UUID NOT NULL, "lead_surgeon_user_id" VARCHAR(100) NOT NULL,
  "operation_type" VARCHAR(300) NOT NULL, "scheduled_at" TIMESTAMPTZ NOT NULL,
  "appointment_id" VARCHAR(100), "status" VARCHAR(30) NOT NULL, "notes" TEXT,
  "started_at" TIMESTAMPTZ, "started_by" VARCHAR(100), "completed_at" TIMESTAMPTZ,
  "completed_by" VARCHAR(100), "cancelled_at" TIMESTAMPTZ, "cancelled_by" VARCHAR(100),
  "cancel_reason" TEXT, "created_at" TIMESTAMPTZ NOT NULL, "created_by" VARCHAR(100) NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL
);
CREATE INDEX "surgery_plans_tenant_patient_scheduled_idx" ON "surgery_plans" ("tenant_id", "patient_id", "scheduled_at");
CREATE INDEX "surgery_plans_tenant_surgeon_scheduled_idx" ON "surgery_plans" ("tenant_id", "lead_surgeon_user_id", "scheduled_at");
ALTER TABLE "surgery_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "surgery_plans" FORCE ROW LEVEL SECURITY;
CREATE POLICY "surgery_plans_tenant_isolation" ON "surgery_plans" USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
