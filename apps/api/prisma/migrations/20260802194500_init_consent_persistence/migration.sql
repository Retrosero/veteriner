CREATE TABLE "consents" ("id" VARCHAR(100) PRIMARY KEY,"tenant_id" UUID NOT NULL,"template_type" VARCHAR(100) NOT NULL,"template_version" VARCHAR(100) NOT NULL,"patient_id" UUID NOT NULL,"owner_id" UUID NOT NULL,"source_type" VARCHAR(100),"source_id" VARCHAR(100),"locale" VARCHAR(20) NOT NULL,"status" VARCHAR(30) NOT NULL,"signature_method" VARCHAR(50),"signature_provider" VARCHAR(200),"signature_reference" VARCHAR(300),"signed_at" TIMESTAMPTZ,"notes" TEXT,"revoked_at" TIMESTAMPTZ,"revoked_by" VARCHAR(100),"revoke_reason" TEXT,"created_at" TIMESTAMPTZ NOT NULL,"created_by" VARCHAR(100) NOT NULL,"updated_at" TIMESTAMPTZ NOT NULL);
CREATE INDEX "consents_tenant_patient_created_idx" ON "consents" ("tenant_id","patient_id","created_at");
CREATE INDEX "consents_tenant_owner_created_idx" ON "consents" ("tenant_id","owner_id","created_at");
ALTER TABLE "consents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "consents" FORCE ROW LEVEL SECURITY;
CREATE POLICY "consents_tenant_isolation" ON "consents" USING ("tenant_id"=current_setting('app.tenant_id',true)::uuid) WITH CHECK ("tenant_id"=current_setting('app.tenant_id',true)::uuid);
