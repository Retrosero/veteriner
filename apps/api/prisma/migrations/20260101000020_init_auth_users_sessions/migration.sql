-- =============================================================================
-- GOAL-011 — Kimlik doğrulama ve oturum yönetimi.
--
-- Bu migration Faz 1 platform çekirdeğinin auth katmanını ekler:
-- - users: platform kullanıcıları (parola hash, kilit, başarısız giriş sayacı).
-- - user_sessions: aktif oturumlar (cookie bearer token, sha256 hash).
-- - user_invitations: tenant'a kullanıcı davetleri (tek kullanımlık token).
-- - password_reset_tokens: parola sıfırlama token'ları.
-- - user_tenant_memberships.user_id artık gerçek FK (GOAL-010'da string idi).
--
-- Güvenlik:
-- - password_hash bcrypt cost 12 (uygulama katmanı zorunlu).
-- - Token'lar sadece SHA-256 hash olarak DB'de. Plain token sadece
--   login/reset response'unda kullanıcıya döner.
-- - Failed login + locked_until brute-force koruması için.
-- - user_sessions revokedAt ile soft-revoke; append-only değil.
-- - RLS: user_sessions yalnızca kendi userId'sini görür.
--   user_invitations tenant admin kendi tenant'ını görür.
--   password_reset_tokens yalnızca kendi userId'sini görür.
--   users global okunabilir (login akışı için email aranır); service
--     katmanı ek kontrol uygular.
--
-- Sıralama: enum → tablolar → indexler → RLS policy.
-- @see docs/domain/DOMAIN_GLOSSARY.md (user varlık tanımı)
-- @see docs/errors/AUDIT_LOG_STANDARD.md
-- @see skills/DATABASE_MULTITENANCY.md
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ENUM tipleri
-- -----------------------------------------------------------------------------

CREATE TYPE user_status AS ENUM ('active', 'suspended', 'disabled');

CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'expired', 'cancelled');

-- -----------------------------------------------------------------------------
-- users tablosu
-- -----------------------------------------------------------------------------

CREATE TABLE users (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                VARCHAR(200) NOT NULL UNIQUE,
  password_hash        VARCHAR(200) NOT NULL,
  status               user_status NOT NULL DEFAULT 'active',
  display_name         VARCHAR(200) NOT NULL,
  locale               VARCHAR(10) NOT NULL DEFAULT 'tr-TR',
  password_changed_at  TIMESTAMPTZ(6),
  failed_login_count   INTEGER NOT NULL DEFAULT 0,
  locked_until         TIMESTAMPTZ(6),
  last_login_at        TIMESTAMPTZ(6),
  created_at           TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  archived_at          TIMESTAMPTZ(6),
  CONSTRAINT chk_users_email CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  CONSTRAINT chk_users_failed_login_count CHECK (failed_login_count >= 0)
);

CREATE INDEX idx_users_status ON users (status);
CREATE INDEX idx_users_locked_until ON users (locked_until);

COMMENT ON TABLE users IS
  'Platform kullanıcıları. Personel paneli girişi + tenant üyelikleri için temel. SUPERADMIN dahil tüm kullanıcılar bu tabloda.';

-- -----------------------------------------------------------------------------
-- user_sessions tablosu
-- -----------------------------------------------------------------------------

CREATE TABLE user_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  token_hash      VARCHAR(128) NOT NULL UNIQUE,
  expires_at      TIMESTAMPTZ(6) NOT NULL,
  last_used_at    TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  ip_address      VARCHAR(50),
  user_agent_hash VARCHAR(64),
  created_at      TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  replaced_by_id  UUID,
  revoked_at      TIMESTAMPTZ(6),
  revoked_reason  VARCHAR(50)
);

CREATE INDEX idx_sessions_user ON user_sessions (user_id);
CREATE INDEX idx_sessions_expires ON user_sessions (expires_at);
CREATE INDEX idx_sessions_revoked ON user_sessions (revoked_at);

COMMENT ON TABLE user_sessions IS
  'Aktif kullanıcı oturumları. Token SHA-256 hash; plain token sadece response''da. Rotation logout_admin ile yapılır.';

-- -----------------------------------------------------------------------------
-- user_invitations tablosu
-- -----------------------------------------------------------------------------

CREATE TABLE user_invitations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE ON UPDATE CASCADE,
  email       VARCHAR(200) NOT NULL,
  role        VARCHAR(32) NOT NULL,
  token_hash  VARCHAR(128) NOT NULL UNIQUE,
  invited_by  UUID,
  status      invitation_status NOT NULL DEFAULT 'pending',
  expires_at  TIMESTAMPTZ(6) NOT NULL,
  accepted_at TIMESTAMPTZ(6),
  created_at  TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_invitation_role CHECK (role IN ('OWNER', 'VETERINARIAN', 'STAFF'))
);

CREATE INDEX idx_invitations_tenant_status ON user_invitations (tenant_id, status);
CREATE INDEX idx_invitations_email ON user_invitations (email);
CREATE INDEX idx_invitations_expires ON user_invitations (expires_at);

COMMENT ON TABLE user_invitations IS
  'Tenant''a kullanıcı davetleri. Tek kullanımlık; 7 gün geçerli. Kabul edildiğinde User oluşturulur + membership atanır.';

-- -----------------------------------------------------------------------------
-- password_reset_tokens tablosu
-- -----------------------------------------------------------------------------

CREATE TABLE password_reset_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ(6) NOT NULL,
  used_at    TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_resets_user ON password_reset_tokens (user_id);
CREATE INDEX idx_resets_expires ON password_reset_tokens (expires_at);

COMMENT ON TABLE password_reset_tokens IS
  'Parola sıfırlama token''ları. Tek kullanımlık; 1 saat geçerli. Rotation için kullanılmış token rotate edilir.';

-- -----------------------------------------------------------------------------
-- user_tenant_memberships.user_id artık gerçek FK.
-- GOAL-010'da string olarak bırakılmıştı; şimdi users tablosuna bağlanır.
-- -----------------------------------------------------------------------------

ALTER TABLE user_tenant_memberships
  ADD CONSTRAINT fk_memberships_user
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- updated_at otomatik güncelleme (users)
-- -----------------------------------------------------------------------------

CREATE TRIGGER trg_users_touch_updated
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- -----------------------------------------------------------------------------
-- RLS: user_sessions — kullanıcı yalnızca kendi session'larını görür.
-- Auth akışı service katmanında superadmin bypass ile yapılır.
-- -----------------------------------------------------------------------------

ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_sessions_self ON user_sessions;
CREATE POLICY user_sessions_self ON user_sessions
  USING (
    COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true'
    OR
    (
      COALESCE(current_setting('app.user_id', true), '') <> ''
      AND user_id::text = current_setting('app.user_id', true)
    )
  )
  WITH CHECK (
    COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true'
    OR
    (
      COALESCE(current_setting('app.user_id', true), '') <> ''
      AND user_id::text = current_setting('app.user_id', true)
    )
  );

COMMENT ON POLICY user_sessions_self ON user_sessions IS
  'Kullanıcı yalnızca kendi oturumlarını görebilir. SUPERADMIN bypass. Token rotation service katmanında yapılır.';

-- -----------------------------------------------------------------------------
-- RLS: user_invitations — tenant admin kendi tenant'ının davetlerini görür.
-- SUPERADMIN bypass.
-- -----------------------------------------------------------------------------

ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_invitations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_invitations_tenant ON user_invitations;
CREATE POLICY user_invitations_tenant ON user_invitations
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

COMMENT ON POLICY user_invitations_tenant ON user_invitations IS
  'Davetler tenant-scoped. Tenant admin kendi tenant''ının davetlerini görür. SUPERADMIN bypass.';

-- -----------------------------------------------------------------------------
-- RLS: password_reset_tokens — kullanıcı yalnızca kendi reset token'larını
-- görür. Auth akışı service katmanında user_id doğrular.
-- -----------------------------------------------------------------------------

ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS password_resets_self ON password_reset_tokens;
CREATE POLICY password_resets_self ON password_reset_tokens
  USING (
    COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true'
    OR
    (
      COALESCE(current_setting('app.user_id', true), '') <> ''
      AND user_id::text = current_setting('app.user_id', true)
    )
  )
  WITH CHECK (
    COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true'
    OR
    (
      COALESCE(current_setting('app.user_id', true), '') <> ''
      AND user_id::text = current_setting('app.user_id', true)
    )
  );

COMMENT ON POLICY password_resets_self ON password_reset_tokens IS
  'Parola sıfırlama token''ları yalnızca sahibine görünür. Service katmanı token doğrulaması yapar.';

-- -----------------------------------------------------------------------------
-- RLS: users — login akışı email araması yapar; bu nedenle RLS YOK.
-- Sadece service katmanı yetki kontrolü uygular. status=suspended/disabled
-- kullanıcılar login sırasında filtrelenir.
-- -----------------------------------------------------------------------------

COMMENT ON TABLE users IS
  'Platform kullanıcıları. RLS YOK — email ile global lookup gerekiyor (login, davet kabul). Service katmanı status kontrolü yapar.';

-- -----------------------------------------------------------------------------
-- membership_tenant_status check: invited_by nullable (sistem davetleri).
-- (Yapısal kısıt ekleme — opsiyonel.)
-- -----------------------------------------------------------------------------
