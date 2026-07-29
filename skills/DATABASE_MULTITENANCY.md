# Skill: PostgreSQL, Prisma ve Multi-Tenancy

## Temel kurallar

- Tenant verisi taşıyan her tabloda `tenant_id NOT NULL`.
- Şubeye bağlı verilerde `branch_id`.
- Tüm foreign key ilişkileri tenant bütünlüğünü korumalıdır.
- Unique indexler `(tenant_id, alan)` biçiminde tasarlanır.
- RLS policy uygulanır.
- Request başında doğrulanmış tenant context veritabanı oturumuna set edilir.
- Superadmin bağlantıları ayrı rol/policy üzerinden yürütülür.
- Soft delete yalnızca uygun domainlerde kullanılır.
- Klinik kayıt ve finans hareketlerinde append-only/versiyonlama tercih edilir.
- Para alanlarında `numeric`.
- Zaman alanlarında `timestamptz`.
- Tüm tablolar `created_at`, `updated_at` ve gerektiğinde `created_by` içerir.
- Kritik tablolarda optimistic concurrency/version alanı kullanılır.

## Performans

- Randevu, hasta arama, stok ve log sorguları için hedef indexler yazılır.
- N+1 sorgular test edilir.
- Büyük log tabloları partition/retention planına sahip olur.
- Migration önce staging üzerinde veri hacmiyle test edilir.

## Zorunlu doğrulamalar

- Cross-tenant sorgu başarısız olmalı.
- Yanlış tenant ID ile insert başarısız olmalı.
- Tenant silme işlemi doğrudan fiziksel silme yapmamalı.
- Restore senaryosu test edilmelidir.
