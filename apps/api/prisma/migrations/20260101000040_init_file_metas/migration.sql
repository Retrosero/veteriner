-- =============================================================================
-- @file GOAL-014 — Dosya ve medya servisi (file_metas).
-- @module apps/api/prisma/migrations/20260101000040_init_file_metas
--
-- @description Bu migration GOAL-014 kapsamında dosya metadata altyapısını
--   ekler. Storage (S3-uyumlu) ayrı bir backend'te tutulur; bu tablo
--   yalnızca metadata + audit + erişim kontrolü içindir.
--
--   Eklenenler:
--   1. `file_scan_status` enum: tarama durum makinesi (pending/clean/
--      infected/skipped/error).
--   2. `file_visibility` enum: erişim kapsamı (private/branch/tenant/
--      portal).
--   3. `file_metas` tablosu: storage_key (unique), orijinal ad, MIME, boyut,
--      SHA-256 checksum, scan durumu, görünürlük, related entity, arşiv
--      bilgisi.
--   4. Index'ler: tenant+created, tenant+related_entity, branch+created,
--      uploader, scan_status, archivedAt.
--   5. RLS: tenant-scoped (cross-tenant dosya erişimi fiziksel olarak
--      engellenir). SUPERADMIN bypass.
--   6. updated_at otomatik trigger.
--
-- @security
--   - `storage_key` unique: aynı dosya iki kez yazılamaz (idempotent
--     upload için referans).
--   - `tenant_id + checksum_sha256` unique: aynı tenant içinde aynı
--     içerikten ikinci kopya yasak (duplicate tespiti).
--   - RLS: SUPERADMIN bypass + `tenant_id = current_setting('app.tenant_id')`.
--   - `archived_at` soft delete: fiziksel DELETE yok.
--
-- @since GOAL-014 (FAZ-1) dosya ve medya servisi
-- @see docs/permissions/PERMISSION_CATALOG.yaml (file:file:*)
-- @see docs/errors/AUDIT_LOG_STANDARD.md
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ENUM tipleri
-- -----------------------------------------------------------------------------

CREATE TYPE file_scan_status AS ENUM (
  'pending',   -- tarama kuyrukta
  'clean',     -- temiz; indirilebilir
  'infected',  -- zararlı içerik; erişim reddedilir
  'skipped',   -- tarama atlandı (dev noop adapter)
  'error'      -- tarama hata verdi
);

CREATE TYPE file_visibility AS ENUM (
  'private',   -- yalnızca yükleyen
  'branch',    -- yükleyen şubenin personeli
  'tenant',    -- tenant'taki tüm yetkili personel
  'portal'     -- hasta sahibi portalı dahil
);

-- -----------------------------------------------------------------------------
-- file_metas tablosu
-- -----------------------------------------------------------------------------

CREATE TABLE file_metas (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  branch_id            UUID REFERENCES branches(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  uploader_id          UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,

  -- Storage metadata (S3-uyumlu key)
  storage_key          VARCHAR(512) NOT NULL UNIQUE,
  original_name        VARCHAR(255) NOT NULL,
  mime_type            VARCHAR(100) NOT NULL,
  size_bytes           BIGINT NOT NULL,
  checksum_sha256      VARCHAR(64) NOT NULL,

  -- Zararlı içerik tarama sonucu
  scan_status          file_scan_status NOT NULL DEFAULT 'pending',
  scan_result          VARCHAR(255),
  scanned_at           TIMESTAMPTZ(6),

  -- Erişim kontrolü + bağlam
  visibility           file_visibility NOT NULL DEFAULT 'branch',
  related_entity_type  VARCHAR(50),
  related_entity_id    VARCHAR(100),
  description          VARCHAR(500),

  -- Arşiv (soft delete; fiziksel silme YOK)
  archived_at          TIMESTAMPTZ(6),
  archived_by          UUID,
  archive_reason       VARCHAR(500),

  -- Zaman damgaları
  created_at           TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  -- Tenant bazında duplicate tespiti (aynı tenant + aynı içerik)
  CONSTRAINT file_meta_tenant_checksum_unique UNIQUE (tenant_id, checksum_sha256),

  -- Boyut sınırı: 100 MB hard cap (yumuşak limit service'te 25 MB).
  CONSTRAINT file_meta_size_positive CHECK (size_bytes > 0 AND size_bytes <= 104857600),

  -- SHA-256 format (64 hex karakter).
  CONSTRAINT file_meta_checksum_format CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),

  -- Arşiv tutarlılığı: archived_at varsa archived_by + archive_reason zorunlu.
  CONSTRAINT file_meta_archive_consistency
    CHECK (
      (archived_at IS NULL AND archived_by IS NULL AND archive_reason IS NULL)
      OR
      (archived_at IS NOT NULL AND archived_by IS NOT NULL AND archive_reason IS NOT NULL)
    ),

  -- Branch bağlamı: branch_id verildiyse branch.tenant_id = tenant_id
  -- olmalı. Trigger ile doğrulanır (aşağıda).

  -- relatedEntity birlikteliği: type varsa id de olmalı, ya da ikisi de null.
  CONSTRAINT file_meta_related_entity_pair
    CHECK (
      (related_entity_type IS NULL AND related_entity_id IS NULL)
      OR
      (related_entity_type IS NOT NULL AND related_entity_id IS NOT NULL)
    )
);

CREATE INDEX file_metas_tenant_created_idx ON file_metas (tenant_id, created_at);
CREATE INDEX file_metas_tenant_related_idx ON file_metas (tenant_id, related_entity_type, related_entity_id);
CREATE INDEX file_metas_branch_created_idx ON file_metas (branch_id, created_at);
CREATE INDEX file_metas_uploader_idx ON file_metas (uploader_id);
CREATE INDEX file_metas_scan_status_idx ON file_metas (scan_status);
CREATE INDEX file_metas_archived_at_idx ON file_metas (archived_at);

COMMENT ON TABLE file_metas IS
  'Dosya metadata. Storage (S3-uyumlu) ayrı backend''te; bu tablo yalnızca metadata + audit + erişim kontrolü. Fiziksel silme YOK; archivedAt soft delete.';

COMMENT ON COLUMN file_metas.storage_key IS
  'S3-uyumlu key (örn. tenants/<uuid>/files/<uuid>). Tenant bazında path şeması file_service tarafından üretilir.';
COMMENT ON COLUMN file_metas.checksum_sha256 IS
  'SHA-256 hex digest. Duplicate tespiti + bütünlük doğrulaması.';
COMMENT ON COLUMN file_metas.scan_status IS
  'Zararlı içerik tarama durumu. pending iken indirme reddedilebilir; infected ise dosya karantinada.';
COMMENT ON COLUMN file_metas.visibility IS
  'Erişim kapsamı: private (yükleyen), branch (şube personeli), tenant (tüm yetkili), portal (hasta sahibi dahil).';
COMMENT ON COLUMN file_metas.related_entity_type IS
  'Bağlı varlık tipi (owner/patient/examination/lab/imaging/surgery vb.).';
COMMENT ON COLUMN file_metas.archived_at IS
  'Arşiv zamanı (soft delete). Null = aktif. Fiziksel DELETE uygulanmaz; depolama alanı için ayrı bir retention job çalışır (GOAL-014 sonrası).';

-- -----------------------------------------------------------------------------
-- updated_at otomatik güncelleme
-- -----------------------------------------------------------------------------

CREATE TRIGGER trg_file_metas_touch_updated
  BEFORE UPDATE ON file_metas
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- -----------------------------------------------------------------------------
-- Branch tenant tutarlılığı trigger'ı
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION file_metas_branch_tenant_consistency()
RETURNS TRIGGER AS $$
DECLARE
  branch_tenant UUID;
BEGIN
  IF NEW.branch_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT tenant_id INTO branch_tenant FROM branches WHERE id = NEW.branch_id;
  IF branch_tenant IS NULL THEN
    RAISE EXCEPTION 'file_metas: branch % bulunamadı', NEW.branch_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF branch_tenant <> NEW.tenant_id THEN
    RAISE EXCEPTION 'file_metas: branch.tenant_id (%) dosya tenant_id (%) ile eşleşmiyor',
      branch_tenant, NEW.tenant_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_file_metas_branch_tenant_check
  BEFORE INSERT OR UPDATE OF branch_id, tenant_id ON file_metas
  FOR EACH ROW EXECUTE FUNCTION file_metas_branch_tenant_consistency();

-- -----------------------------------------------------------------------------
-- RLS: file_metas — tenant-scoped, SUPERADMIN bypass.
-- Service katmanı tenant context'i set eder; aksi halde RLS tüm
-- satırları gizler (defense-in-depth).
-- -----------------------------------------------------------------------------

ALTER TABLE file_metas ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_metas FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS file_metas_tenant ON file_metas;
CREATE POLICY file_metas_tenant ON file_metas
  USING (
    COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true'
    OR
    (
      COALESCE(current_setting('app.tenant_id', true), '') <> ''
      AND tenant_id::text = current_setting('app.tenant_id', true)
    )
  )
  WITH CHECK (
    COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true'
    OR
    (
      COALESCE(current_setting('app.tenant_id', true), '') <> ''
      AND tenant_id::text = current_setting('app.tenant_id', true)
    )
  );

COMMENT ON POLICY file_metas_tenant ON file_metas IS
  'Dosyalar tenant-scoped. SUPERADMIN bypass. Cross-tenant dosya erişimi hem RLS hem service katmanı tarafından engellenir. file_service tarafından enforce edilir.';
