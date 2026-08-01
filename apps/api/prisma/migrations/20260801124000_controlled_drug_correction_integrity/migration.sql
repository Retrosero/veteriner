-- =============================================================================
-- @file Controlled Drugs correction integrity.
-- @description Append-only correction satırlarının aynı orijinal kaydı yalnız
--   bir kez terslemesini; hedefin aynı tenant içinde, correction dışı ve tam
--   ters miktarlı olmasını veritabanı düzeyinde zorunlu tutar.
-- @security Uygulama ön kontrolü yarış koşullarına karşı yeterli değildir.
--   Kısmi unique index ve trigger, sınırlı runtime rolü altında da son savunma
--   katmanıdır.
-- =============================================================================

CREATE UNIQUE INDEX controlled_drug_entries_one_correction_per_entry_idx
  ON controlled_drug_entries (tenant_id, corrects_entry_id)
  WHERE entry_type = 'correction';

CREATE OR REPLACE FUNCTION controlled_drug_entries_correction_integrity()
RETURNS TRIGGER AS $$
DECLARE
  original_tenant_id UUID;
  original_entry_type controlled_drug_entry_type;
  original_quantity_delta NUMERIC(18, 4);
BEGIN
  IF NEW.entry_type <> 'correction' THEN
    RETURN NEW;
  END IF;

  SELECT tenant_id, entry_type, quantity_delta
    INTO original_tenant_id, original_entry_type, original_quantity_delta
    FROM controlled_drug_entries
   WHERE id = NEW.corrects_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'controlled_drug_entries: correction target bulunamadı'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF original_tenant_id <> NEW.tenant_id THEN
    RAISE EXCEPTION 'controlled_drug_entries: correction target tenant uyuşmazlığı'
      USING ERRCODE = 'check_violation';
  END IF;
  IF original_entry_type = 'correction' THEN
    RAISE EXCEPTION 'controlled_drug_entries: correction kaydı yeniden düzeltilemez'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.quantity_delta <> -original_quantity_delta THEN
    RAISE EXCEPTION 'controlled_drug_entries: correction miktarı orijinalin tersi olmalıdır'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_controlled_drug_entries_correction_integrity
  BEFORE INSERT ON controlled_drug_entries
  FOR EACH ROW EXECUTE FUNCTION controlled_drug_entries_correction_integrity();
