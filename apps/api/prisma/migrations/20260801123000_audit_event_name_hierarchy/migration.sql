-- =============================================================================
-- GOAL-017 — Audit event adları için hiyerarşik sözleşme düzeltmesi.
-- Uygulama ve API katalogları `audit:auth.login.success` gibi nokta-ayrımlı
-- alt olaylar yayımlar. Eski regex yalnız iki `:` segmentini kabul ederek bu
-- geçerli append-only kayıtları reddediyordu.
-- =============================================================================

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS chk_audit_event_name;

ALTER TABLE audit_events
  ADD CONSTRAINT chk_audit_event_name
  CHECK (event_name ~ '^audit:[a-z_]+(?:[.:][a-z_]+)+$');

COMMENT ON CONSTRAINT chk_audit_event_name ON audit_events IS
  'audit:<domain>.<action>[.<detail>] veya legacy audit:<domain>:<action> hiyerarşik event adı.';
