# GOAL-017 — PostgreSQL RLS runtime hardening

## Faz

FAZ-1 (GOAL-010/011/012/014 yeniden açılımı)

## Durum

Completed

## Amaç

Uygulamanın PostgreSQL'e superuser yerine sınırlı bir uygulama rolüyle
bağlanmasını sağlamak ve RLS politikalarının gerçek runtime akışlarında
transaction-yerel bağlamla çalıştığını kanıtlamak.

## Kapsam

- Migration çalıştıran rol ile uygulama rolünü ayırmak; uygulama rolü
  `NOSUPERUSER NOBYPASSRLS` olmalıdır.
- Docker/CI geliştirme ortamında bu rolü ve yalnızca gereken `GRANT`leri
  güvenli, tekrar çalıştırılabilir şekilde kurmak.
- Auth/session, invitation ve password-reset erişimlerinin kimlik doğrulama
  öncesi ihtiyaçlarını dar policy + transaction bağlamıyla çözmek.
- Login sırasında yapılan branch ve membership çözümlemelerini non-superuser
  rol altında çalışır kılmak.
- Tenant-scoped Branch, RBAC, FileMeta ve Controlled Drugs repository'lerinin
  transaction bağlamını ortak bir sözleşmeye taşımak.
- İki tenantlı gerçek PostgreSQL E2E'de; RLS bağlamsız red, cross-tenant red,
  oturum doğrulama ve ilgili write/update negatif yollarını kanıtlamak.

## Kapsam dışı

- Faz 2+ domain tablolarına RLS eklemek.
- Production secret yönetimi veya canlı altyapı sağlayıcısı kurulumu.
- DB kimlik bilgisine sahip saldırgana karşı SQL injection dışı ek savunma
  katmanları; bu goal yine de parametrik raw SQL ve fail-closed bağlamı
  zorunlu tutar.

## Kabul kriterleri

1. API, `NOBYPASSRLS` uygulama rolüyle health, login, session doğrulama,
   branch/membership çözümleme ve Controlled Drugs akışını çalıştırır.
2. `prisma migrate deploy` yalnızca ayrı migrator rolüyle çalışır; uygulama
   rolü DDL veya role yönetimi yapamaz.
3. Her RLS repository sorguyu GUC bağlamıyla aynı transaction client'ında
   yürütür; bağlam kurulum hatası fail-closed olur.
4. PostgreSQL E2E testleri non-superuser rol altında en az iki tenant için
   read/write izolasyonunu, auth/session negatif yollarını ve append-only
   controlled-drug kuralını doğrular.
5. Node 20 altında lint, type-check, test, build, docs/i18n ve e2e smoke
   kapıları geçer.

## Mevcut kanıt

- Controlled Drugs, Branch, RBAC membership, FileMeta, auth session,
  invitation ve password-reset tokenları için non-superuser PostgreSQL RLS
  E2E kapsamı mevcut; 10 senaryo geçmektedir.
- Branch, RBAC `listMemberships` ve FileMeta repository'leri transaction
  yerel parametrik GUC kullanımına geçirilmiştir.
- Auth session repository'sinin token doğrulama, oluşturma, güncelleme,
  iptal ve listeleme yolları kullanıcı/token bazlı transaction bağlamına
  taşınmıştır. Token hash ile sınırlandırılmış session SELECT policy'si
  migration ile eklenmiştir.
- Idempotent role bootstrap betiği `vetniva_app` rolünü `NOSUPERUSER`
  `NOBYPASSRLS`, `NOCREATEDB` ve `NOCREATEROLE` özellikleriyle kurar.
  `db:migrate` zorunlu `DATABASE_MIGRATOR_URL` üzerinden çalışır; CI E2E
  runtime bağlantısını bu uygulama rolüne ayırır.
- Temiz PostgreSQL'de yedi migration migrator ile uygulanmış; gerçek runtime
  rolü altında 9 RLS E2E senaryosu geçmiştir. Bu kapsam session yanında login
  üyelik/varsayılan şube, branch-switch ile invitation/reset token çözümünü de
  doğrular. AuthService'te bu tablolar için doğrudan Prisma sorgusu kalmadı.
- CI E2E runtime bağlantısı `vetniva_app` kullanır. Eski yerel `.env` dosyası
  kullanıcıya ait olduğundan otomatik değiştirilmedi; deployment öncesi gerçek
  runtime `DATABASE_URL` değerinin uygulama rolüne çevrildiği ayrıca kanıtlanır.
- Derlenmiş NestJS runtime'ını kullanan HTTP E2E, `vetniva_app` ile health,
  login, session üzerinden tenant-switch ve STAFF Controlled Drugs reddini
  doğrular. Login'in tenant audit kaydı da migrator ile okunan DB'de kanıtlanır.
- AuditEvent yazımı tenant-bağlamlı transaction'a taşınmıştır. Hiyerarşik
  `audit:auth.login.success` gibi katalogdaki event adlarını kabul eden check
  constraint migration'ı uygulanmıştır.
- `db:verify-runtime-role`, runtime `DATABASE_URL` hesabının superuser,
  `BYPASSRLS` ve public şemada `CREATE` yetkisi taşımadığını CI'da zorunlu
  kılar. Temiz PostgreSQL'de `vetniva_app` için başarılı, migrator hesabı için
  beklenen şekilde başarısız olduğu doğrulanmıştır.
- Controlled Drugs correction bütünlüğü için dokuzuncu migration eklenmiştir:
  aynı orijinal kayıt yalnız bir ters kayıtla eşleşir; hedef tenant, entry türü
  ve ters miktar veritabanı trigger'ı tarafından doğrulanır.

## Teslimatlar

- Ayrı rol ve bağlantı yapılandırması.
- Auth RLS transaction erişim katmanı.
- Non-superuser runtime E2E senaryoları.
- Migration/rollback ve operasyon dokümantasyonu.
- `GOAL-017_COMPLETION_REPORT.md`.
