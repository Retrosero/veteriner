-- =============================================================================
-- @file GOAL-012 — RBAC ve izin motoru.
-- @module apps/api/prisma/migrations/20260101000030_rbac_superadmin_and_active_branch
--
-- @description Bu migration GOAL-012 kapsamında RBAC altyapısının veritabanı
--   yansımasını ekler:
--   1. `users.is_superadmin` (boolean, default false) — sistem düzeyinde
--      SUPERADMIN ayrıcalıklı erişim tanımlayan bayrak. Tenant üyeliği
--      olmadan çalışır; yalnızca veritabanı seeder/admin tarafından set
--      edilir (audit iziyle birlikte GOAL-016 superadmin paneli).
--   2. `user_sessions.active_branch_id` (uuid, nullable) — kullanıcının
--      oturum başına aktif branch bağlamı (multi-branch tenant senaryosu).
--      Branch scope kullanan endpoint'lerde `actor.branchId` bu alandan
--      çözümlenir.
--   3. Index'ler:
--      - `users(is_superadmin)` — SUPERADMIN listeleme / platform yönetimi
--        sorguları.
--      - `user_sessions(active_branch_id)` — branch context çözümlemesi
--        (bir branch'a bağlı aktif oturumların hızlı sayımı).
--   4. RLS: Yeni sütunlar RLS policy'lerini değiştirmez (mevcut
--      `user_sessions` user-scoped RLS korunur; `active_branch_id`
--      eklenmesi yetkileri değiştirmez).
--
-- @since  GOAL-012 (FAZ-1) RBAC ve izin motoru
-- @see    docs/permissions/PERMISSION_CATALOG.yaml
-- @see    docs/permissions/ROLE_DESCRIPTIONS.md
-- =============================================================================

-- 1. users tablosuna is_superadmin ekle.
ALTER TABLE "users"
  ADD COLUMN "is_superadmin" BOOLEAN NOT NULL DEFAULT FALSE;

-- Index: SUPERADMIN listeleme / platform yönetimi.
CREATE INDEX "users_is_superadmin_idx" ON "users" ("is_superadmin");

-- 2. user_sessions tablosuna active_branch_id ekle.
ALTER TABLE "user_sessions"
  ADD COLUMN "active_branch_id" UUID NULL;

-- Index: branch context çözümlemesi.
CREATE INDEX "user_sessions_active_branch_id_idx"
  ON "user_sessions" ("active_branch_id");

-- 3. active_branch_id FK (branches.id). ON DELETE SET NULL — branch
-- silinirse session'lar açık kalır, branch bağlamı null olur.
ALTER TABLE "user_sessions"
  ADD CONSTRAINT "user_sessions_active_branch_id_fkey"
  FOREIGN KEY ("active_branch_id") REFERENCES "branches"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
