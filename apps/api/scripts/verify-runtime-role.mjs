/**
 * @file Runtime PostgreSQL rolü doğrulayıcısı.
 * @description `DATABASE_URL` ile bağlanan uygulama rolünün superuser, RLS
 * bypass veya public schema CREATE yetkisine sahip olmadığını doğrular.
 * @security Bağlantı URL'sini veya parola bilgisini loglamaz. Hata durumunda
 * deployment/CI kapısını durdurur; migrator URL ile çalıştırılması başarısızdır.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT
      current_user AS role_name,
      current_setting('is_superuser') = 'on' AS is_superuser,
      r.rolbypassrls AS bypasses_rls,
      has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_public
    FROM pg_roles r
    WHERE r.rolname = current_user
  `);

  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error("Runtime PostgreSQL rolü çözümlenemedi.");
  }

  const row = rows[0];
  if (
    typeof row !== "object" ||
    row === null ||
    Array.isArray(row) ||
    !("role_name" in row) ||
    !("is_superuser" in row) ||
    !("bypasses_rls" in row) ||
    !("can_create_public" in row)
  ) {
    throw new Error("Runtime PostgreSQL rolü beklenen şekle sahip değil.");
  }

  const role = row;
  if (
    typeof role.role_name !== "string" ||
    role.is_superuser !== false ||
    role.bypasses_rls !== false ||
    role.can_create_public !== false
  ) {
    throw new Error(
      "DATABASE_URL sınırlı runtime rolünü göstermiyor; superuser/RLS bypass/schema CREATE yasaktır.",
    );
  }

  console.log(`Runtime PostgreSQL rolü doğrulandı: ${role.role_name}`);
} finally {
  await prisma.$disconnect();
}
