-- =============================================================================
-- @file KvkkErasureRequest — GOAL-126 (FAZ-12) KVKK ve veri yaşam döngüsü.
-- @module apps/api/prisma/migrations/20260805120000_init_kvkk_erasure_requests
--
-- @description KVKK silme (erasure) taleplerinin tenant-scoped
--   kalıcılaştırılması. Tıbbi/finansal kayıtlar append-only kalsa
--   da erasure talebinin durumu (pending → in_progress →
--   completed/rejected) güncellenebilir. Bu nedenle tablo
--   `trigger-protected append-only` DEĞİLDİR; durum geçişleri
--   uygulama katmanında `KvkkService` üzerinden yapılır.
--
--   RLS: SUPERADMIN bypass; aksi halde `app.tenant_id` GUC değerine
--   eşit `tenant_id` satırları görünür. Yazım/okuma aynı policy.
-- =============================================================================

CREATE TABLE "kvkk_erasure_requests" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL REFERENCES "tenants"("id")
        ON UPDATE CASCADE ON DELETE RESTRICT,
    "owner_id" UUID NOT NULL,
    "requested_by" UUID,
    "reason" VARCHAR(1000) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "completed_by" UUID,
    "redacted_fields" JSONB,
    "retained_medical_records" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kvkk_erasure_requests_status_check"
        CHECK ("status" IN ('pending', 'in_progress', 'completed', 'rejected'))
);

CREATE INDEX "kvkk_erasure_requests_tenant_status_requested_idx"
    ON "kvkk_erasure_requests"("tenant_id", "status", "requested_at" DESC);

CREATE INDEX "kvkk_erasure_requests_tenant_owner_requested_idx"
    ON "kvkk_erasure_requests"("tenant_id", "owner_id", "requested_at" DESC);

ALTER TABLE "kvkk_erasure_requests" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kvkk_erasure_requests_tenant_isolation"
    ON "kvkk_erasure_requests"
    USING (
        current_setting('app.is_superadmin', true) = 'true'
        OR "tenant_id"::text = current_setting('app.tenant_id', true)
    )
    WITH CHECK (
        current_setting('app.is_superadmin', true) = 'true'
        OR "tenant_id"::text = current_setting('app.tenant_id', true)
    );

-- Yorum: status update'leri append-only trigger ile kısıtlanmaz
-- çünkü erasure uygulandığında durum geçişi zorunludur. Bu tablo
-- KVKK compliance kaydıdır; klinik/finansal kayıt koruması
-- burada UYGULANMAZ (bkz. examinations/aşılar/reçeteler yine
-- append-only). Cross-tenant UPDATE/DELETE uygulama katmanında
-- `KvkkService` üzerinden engellenir (requireTenantScope).
