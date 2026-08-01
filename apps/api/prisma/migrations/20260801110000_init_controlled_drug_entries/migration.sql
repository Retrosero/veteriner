-- =============================================================================
-- @file GOAL-143 — Controlled Drugs append-only register persistence.
-- @module apps/api/prisma/migrations/20260801110000_init_controlled_drug_entries
--
-- @description İngiltere controlled-drug defteri için kalıcı, tenant-scoped
--   ve append-only kayıt altyapısı. Miktarlar numeric tutulur, tarih alanları
--   timestamptz/date ayrımıyla saklanır. UPDATE/DELETE hem RLS hem trigger ile
--   engellenir; düzeltmeler yeni `correction` satırıdır.
--
-- @security RLS tenant context olmadan satır göstermez/yazdırmaz. SUPERADMIN
--   bypassı mevcut platform RLS standardıyla aynıdır. Kayıt silinemez veya
--   değiştirilemez; DB katmanı uygulama hatasına karşı son savunmadır.
-- =============================================================================

CREATE TYPE controlled_drug_entry_type AS ENUM (
  'received', 'dispensed', 'wasted', 'returned', 'transferred', 'count', 'correction'
);

CREATE TYPE controlled_drug_schedule AS ENUM ('S1', 'S2', 'S3', 'S4', 'S5');
CREATE TYPE controlled_drug_unit AS ENUM ('mg', 'ml');

CREATE TABLE controlled_drug_entries (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                       UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  entry_type                      controlled_drug_entry_type NOT NULL,
  drug_name                       VARCHAR(200) NOT NULL,
  schedule                        controlled_drug_schedule NOT NULL,
  unit                            controlled_drug_unit NOT NULL,
  quantity_delta                  NUMERIC(18, 4) NOT NULL,
  branch_id                       UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  storage_area_id                 VARCHAR(100) NOT NULL,
  occurred_at                     TIMESTAMPTZ(6) NOT NULL,
  recorded_at                     TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  recorded_by                     VARCHAR(100) NOT NULL,
  supplier                        VARCHAR(200),
  lot_number                      VARCHAR(100),
  expiry_date                     DATE,
  owner_id                        VARCHAR(100),
  patient_id                      VARCHAR(100),
  prescribed_by_veterinarian_id   VARCHAR(100),
  prescription_number             VARCHAR(100),
  emergency_use                   BOOLEAN,
  reason                          VARCHAR(2000),
  witness_user_id                 VARCHAR(100),
  target_branch_id                UUID REFERENCES branches(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  target_storage_area_id          VARCHAR(100),
  transfer_group_id               VARCHAR(100),
  physical_quantity               NUMERIC(18, 4),
  book_quantity                   NUMERIC(18, 4),
  discrepancy                     NUMERIC(18, 4),
  count_date                      DATE,
  corrects_entry_id               UUID REFERENCES controlled_drug_entries(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  notes                           VARCHAR(2000),

  CONSTRAINT controlled_drug_entries_drug_name_not_blank CHECK (length(btrim(drug_name)) > 0),
  CONSTRAINT controlled_drug_entries_storage_area_not_blank CHECK (length(btrim(storage_area_id)) > 0),
  CONSTRAINT controlled_drug_entries_delta_by_type CHECK (
    (entry_type IN ('received', 'returned') AND quantity_delta > 0)
    OR (entry_type IN ('dispensed', 'wasted') AND quantity_delta < 0)
    OR (entry_type = 'transferred' AND quantity_delta <> 0)
    OR (entry_type = 'count' AND quantity_delta = 0)
    -- Fiziksel count kaydının düzeltmesinde stok etkisi sıfır kalabilir.
    OR entry_type = 'correction'
  ),
  CONSTRAINT controlled_drug_entries_transfer_pair CHECK (
    (entry_type <> 'transferred' AND target_branch_id IS NULL AND target_storage_area_id IS NULL AND transfer_group_id IS NULL)
    OR (
      entry_type = 'transferred'
      AND transfer_group_id IS NOT NULL
      AND (
        (target_branch_id IS NOT NULL AND target_storage_area_id IS NOT NULL)
        OR (target_branch_id IS NULL AND target_storage_area_id IS NULL)
      )
    )
  ),
  CONSTRAINT controlled_drug_entries_count_fields CHECK (
    (entry_type <> 'count' AND physical_quantity IS NULL AND book_quantity IS NULL AND discrepancy IS NULL AND count_date IS NULL)
    OR (entry_type = 'count' AND physical_quantity IS NOT NULL AND book_quantity IS NOT NULL AND discrepancy IS NOT NULL AND count_date IS NOT NULL
        AND discrepancy = physical_quantity - book_quantity)
  ),
  CONSTRAINT controlled_drug_entries_correction_target CHECK (
    (entry_type = 'correction' AND corrects_entry_id IS NOT NULL)
    OR (entry_type <> 'correction' AND corrects_entry_id IS NULL)
  )
);

CREATE INDEX controlled_drug_entries_tenant_occurred_idx
  ON controlled_drug_entries (tenant_id, occurred_at, id);
CREATE INDEX controlled_drug_entries_stock_lookup_idx
  ON controlled_drug_entries (tenant_id, drug_name, schedule, unit, branch_id, storage_area_id, occurred_at);
CREATE INDEX controlled_drug_entries_tenant_type_idx
  ON controlled_drug_entries (tenant_id, entry_type, occurred_at);
CREATE INDEX controlled_drug_entries_transfer_idx
  ON controlled_drug_entries (tenant_id, transfer_group_id);
CREATE INDEX controlled_drug_entries_correction_idx
  ON controlled_drug_entries (tenant_id, corrects_entry_id);

CREATE OR REPLACE FUNCTION controlled_drug_entries_branch_tenant_consistency()
RETURNS TRIGGER AS $$
DECLARE
  source_tenant UUID;
  target_tenant UUID;
BEGIN
  SELECT tenant_id INTO source_tenant FROM branches WHERE id = NEW.branch_id;
  IF source_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'controlled_drug_entries: branch tenant uyuşmazlığı'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.target_branch_id IS NOT NULL THEN
    SELECT tenant_id INTO target_tenant FROM branches WHERE id = NEW.target_branch_id;
    IF target_tenant IS DISTINCT FROM NEW.tenant_id THEN
      RAISE EXCEPTION 'controlled_drug_entries: hedef branch tenant uyuşmazlığı'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_controlled_drug_entries_branch_tenant_check
  BEFORE INSERT ON controlled_drug_entries
  FOR EACH ROW EXECUTE FUNCTION controlled_drug_entries_branch_tenant_consistency();

CREATE OR REPLACE FUNCTION controlled_drug_entries_reject_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'controlled_drug_entries append-only: UPDATE ve DELETE yasaktır'
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_controlled_drug_entries_no_update
  BEFORE UPDATE ON controlled_drug_entries
  FOR EACH ROW EXECUTE FUNCTION controlled_drug_entries_reject_mutation();
CREATE TRIGGER trg_controlled_drug_entries_no_delete
  BEFORE DELETE ON controlled_drug_entries
  FOR EACH ROW EXECUTE FUNCTION controlled_drug_entries_reject_mutation();

ALTER TABLE controlled_drug_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE controlled_drug_entries FORCE ROW LEVEL SECURITY;

CREATE POLICY controlled_drug_entries_tenant ON controlled_drug_entries
  USING (
    COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true'
    OR (
      COALESCE(current_setting('app.tenant_id', true), '') <> ''
      AND tenant_id::text = current_setting('app.tenant_id', true)
    )
  )
  WITH CHECK (
    COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true'
    OR (
      COALESCE(current_setting('app.tenant_id', true), '') <> ''
      AND tenant_id::text = current_setting('app.tenant_id', true)
    )
  );

COMMENT ON TABLE controlled_drug_entries IS
  'GB controlled-drug register. Append-only: UPDATE/DELETE trigger ile yasaktır; correction yeni kayıt olarak eklenir.';
