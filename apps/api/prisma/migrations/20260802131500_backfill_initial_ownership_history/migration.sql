-- Owner/patient kalıcılığı ownership_history'den önce devreye alındığı için
-- eski aktif hasta kimlikleri için deterministik ilk sahiplik kaydı açılır.
-- Partial unique index aynı hasta için mevcut aktif kaydı korur.
INSERT INTO "ownership_history" (
  "id", "tenant_id", "patient_id", "owner_id", "start_date", "end_date",
  "reason", "other_note", "created_by", "created_at"
)
SELECT
  'own-backfill-' || replace(p."id"::text, '-', ''),
  p."tenant_id", p."id", p."owner_id", p."created_at", NULL,
  'initial', NULL, NULL, p."created_at"
FROM "patients" p
WHERE NOT EXISTS (
  SELECT 1 FROM "ownership_history" h
  WHERE h."tenant_id" = p."tenant_id"
    AND h."patient_id" = p."id"
    AND h."end_date" IS NULL
);
