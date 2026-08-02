-- Owner ve patient kimlik kayıtlarının tenant-RLS ile kalıcılaştırılması.
CREATE TABLE "owners" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  "first_name" varchar(100) NOT NULL, "last_name" varchar(100) NOT NULL,
  "phone" varchar(32) NOT NULL, "email" varchar(200), "tax_id" varchar(20),
  "address" jsonb, "consents" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(), "archived_at" timestamptz,
  UNIQUE ("tenant_id", "phone")
);
CREATE INDEX "owners_tenant_id_created_at_idx" ON "owners"("tenant_id", "created_at");

CREATE TABLE "patients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  "owner_id" uuid NOT NULL REFERENCES "owners"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  "name" varchar(100) NOT NULL, "species" varchar(20) NOT NULL, "breed" varchar(100),
  "birth_date" date, "gender" varchar(20) NOT NULL, "microchip" varchar(15),
  "color" varchar(100), "neutered" boolean NOT NULL, "notes" varchar(2000),
  "created_at" timestamptz NOT NULL DEFAULT now(), "archived_at" timestamptz,
  UNIQUE ("tenant_id", "microchip")
);
CREATE INDEX "patients_tenant_id_owner_id_created_at_idx" ON "patients"("tenant_id", "owner_id", "created_at");

ALTER TABLE "owners" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "patients" ENABLE ROW LEVEL SECURITY;
CREATE POLICY owners_tenant_isolation ON "owners" USING (current_setting('app.is_superadmin', true) = 'true' OR "tenant_id"::text = current_setting('app.tenant_id', true)) WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR "tenant_id"::text = current_setting('app.tenant_id', true));
CREATE POLICY patients_tenant_isolation ON "patients" USING (current_setting('app.is_superadmin', true) = 'true' OR "tenant_id"::text = current_setting('app.tenant_id', true)) WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR "tenant_id"::text = current_setting('app.tenant_id', true));
