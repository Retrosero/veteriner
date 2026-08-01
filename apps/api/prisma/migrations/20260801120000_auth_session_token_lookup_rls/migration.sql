-- =============================================================================
-- GOAL-017 — Non-superuser runtime için session token lookup RLS istisnası.
--
-- `user_sessions_self` policy'si write işlemlerini yalnızca transaction-local
-- `app.user_id` bağlamına bırakır. Token doğrulamasında kullanıcı kimliği henüz
-- bilinmediği için burada yalnızca SELECT'e dar, hash eşitliğine bağlı ayrı
-- policy eklenir. Plain token hiçbir zaman veritabanına yazılmaz.
-- =============================================================================

DROP POLICY IF EXISTS user_sessions_token_lookup ON user_sessions;
CREATE POLICY user_sessions_token_lookup ON user_sessions
  FOR SELECT
  USING (
    COALESCE(current_setting('app.session_token_hash', true), '') <> ''
    AND token_hash = current_setting('app.session_token_hash', true)
  );

COMMENT ON POLICY user_sessions_token_lookup ON user_sessions IS
  'GOAL-017: Login sonrasi session token hash lookup icin sadece SELECT; write user_sessions_self ile app.user_id baglamina zorunlu kalir.';
