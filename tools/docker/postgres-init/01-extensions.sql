-- GOAL-000: Local postgres başlangıç betiği.
-- Gerekli extension'lar burada oluşturulur; tenant yapıları GOAL-001
-- migration'larında gelecektir.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";
