-- GOAL-102: Prisma create/update RETURNING ifadesi sistem job satırını aynı
-- transaction içinde yeniden okur. system_write bu dar işlem bağlamında
-- USING tarafında da görünür olmalıdır; tenant veya bağlamsız okuma açılmaz.
DROP POLICY IF EXISTS job_runs_tenant_isolation ON job_runs;
CREATE POLICY job_runs_tenant_isolation ON job_runs
  USING (
    COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true'
    OR (tenant_id IS NOT NULL AND COALESCE(current_setting('app.tenant_id', true), '') <> '' AND tenant_id::text = current_setting('app.tenant_id', true))
    OR (tenant_id IS NULL AND COALESCE(current_setting('app.system_write', true), 'false') = 'true')
  )
  WITH CHECK (
    COALESCE(current_setting('app.is_superadmin', true), 'false') = 'true'
    OR (tenant_id IS NOT NULL AND COALESCE(current_setting('app.tenant_id', true), '') <> '' AND tenant_id::text = current_setting('app.tenant_id', true))
    OR (tenant_id IS NULL AND COALESCE(current_setting('app.system_write', true), 'false') = 'true')
  );
