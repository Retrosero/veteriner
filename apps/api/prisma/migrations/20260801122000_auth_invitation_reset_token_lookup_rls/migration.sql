-- =============================================================================
-- GOAL-017 — Davet ve password-reset token doğrulamasında dar SELECT RLS.
-- Public akışlarda kullanıcı/tenant kimliği token çözülmeden önce bilinmez.
-- Bu politikalar yalnız token hash eşitliğine SELECT açar; mutation işlemleri
-- repository tarafından tokenın sahipliği çözüldükten sonra user/tenant GUC
-- bağlamında yürütülmeye devam eder.
-- =============================================================================

DROP POLICY IF EXISTS user_invitations_token_lookup ON user_invitations;
CREATE POLICY user_invitations_token_lookup ON user_invitations
  FOR SELECT
  USING (
    COALESCE(current_setting('app.invitation_token_hash', true), '') <> ''
    AND token_hash = current_setting('app.invitation_token_hash', true)
  );

DROP POLICY IF EXISTS password_reset_tokens_token_lookup ON password_reset_tokens;
CREATE POLICY password_reset_tokens_token_lookup ON password_reset_tokens
  FOR SELECT
  USING (
    COALESCE(current_setting('app.password_reset_token_hash', true), '') <> ''
    AND token_hash = current_setting('app.password_reset_token_hash', true)
  );

COMMENT ON POLICY user_invitations_token_lookup ON user_invitations IS
  'GOAL-017: Public invite kabulunde yalnız token hash eşitliğiyle SELECT; yazma tenant bağlamı gerektirir.';
COMMENT ON POLICY password_reset_tokens_token_lookup ON password_reset_tokens IS
  'GOAL-017: Public password reset doğrulamasında yalnız token hash eşitliğiyle SELECT; yazma user bağlamı gerektirir.';
