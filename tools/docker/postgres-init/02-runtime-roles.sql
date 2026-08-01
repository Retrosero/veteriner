-- GOAL-017: Yerel/CI PostgreSQL rol ayrımı.
--
-- Bu betik yalnızca migrator rolü (`vetniva`) ile çalıştırılmalıdır. Uygulama
-- rolü DDL, rol yönetimi ve RLS bypass yapamaz; migration'ların oluşturacağı
-- mevcut ve gelecek public şema nesnelerinde yalnızca runtime izinlerini alır.
-- Yerel geliştirme parolası kasıtlı olarak sabittir. Production ortamı aynı
-- rol özelliklerini secret manager üzerinden, farklı bir parola ile kurar.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vetniva_app') THEN
    CREATE ROLE vetniva_app LOGIN PASSWORD 'vetniva_app';
  END IF;
END
$$;

ALTER ROLE vetniva_app
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOREPLICATION
  NOBYPASSRLS
  NOINHERIT;

GRANT USAGE ON SCHEMA public TO vetniva_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO vetniva_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO vetniva_app;

ALTER DEFAULT PRIVILEGES FOR ROLE vetniva IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO vetniva_app;
ALTER DEFAULT PRIVILEGES FOR ROLE vetniva IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO vetniva_app;

REVOKE CREATE ON SCHEMA public FROM vetniva_app;

COMMENT ON ROLE vetniva_app IS
  'GOAL-017 runtime role: NOSUPERUSER, NOBYPASSRLS; migrations vetniva ile çalışır.';
