-- =============================================================================
-- W1.2a: Laboratuvar test kataloğu (lab_tests) DB persistence.
-- GOAL-090 (FAZ-9) — in-memory Map'ten DB'ye taşıma.
--
-- İş kuralları:
-- - `code` tenant-scoped unique (aynı kod farklı tenantlarda olabilir).
-- - Tenant RLS zorunlu (uygulama non-superuser rolünde çalışır).
-- - Append-only: fiziksel silme YOKTUR; arşivleme `active=false` ile yapılır.
-- - `price` decimal string (4 ondalık); floating point kullanılmaz.
-- - Audit: `audit:labtest.create` ve `audit:labtest.update` zaten service'te var.
--
-- Sıralama: Vaccination (20260802170000) sonrası, ErrorEvent'ten önce.
-- =============================================================================

CREATE TABLE lab_tests (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(200) NOT NULL,
  sample_type VARCHAR(20) NOT NULL,
  unit VARCHAR(32) NOT NULL,
  reference_range VARCHAR(200),
  conditional_ranges VARCHAR(8000),
  price VARCHAR(30) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  notes VARCHAR(2000),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100) NOT NULL,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Tenant-scoped unique code (case-insensitive). LOWER() fonksiyonel indeks;
-- "CBC" ile "cbc" aynı tenant için çakışır. Prisma sorgu tarafında
-- `mode: 'insensitive'` kullanılarak aynı normalizasyon uygulanır.
CREATE UNIQUE INDEX lab_tests_tenant_code_unique ON lab_tests(tenant_id, LOWER(code));

-- Listeleme performansı için tenant bazlı indeksler.
CREATE INDEX lab_tests_tenant_active_idx ON lab_tests(tenant_id, active);
CREATE INDEX lab_tests_tenant_created_idx ON lab_tests(tenant_id, created_at);

-- Row Level Security: SUPERADMIN bypass + tenant context zorunlu.
-- GOAL-017 (RLS hardening) ile uyumlu; aynı `app.is_superadmin` / `app.tenant_id`
-- GUC parametreleri kullanılır.
ALTER TABLE lab_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY lab_tests_tenant_isolation ON lab_tests
  USING (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (current_setting('app.is_superadmin', true) = 'true' OR tenant_id::text = current_setting('app.tenant_id', true));

-- Append-only güvence: fiziksel DELETE engellenir. Düzeltme yalnızca UPDATE
-- ile (active=false arşivleme dahil). Bu, klinik kayıtların append-only
-- kuralıyla tutarlıdır.
CREATE OR REPLACE FUNCTION lab_tests_block_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'lab_tests rows are append-only; archive via active=false instead';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER lab_tests_no_delete
  BEFORE DELETE ON lab_tests
  FOR EACH ROW
  EXECUTE FUNCTION lab_tests_block_delete();
