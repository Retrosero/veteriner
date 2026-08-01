# GOAL-017 Completion Report — PostgreSQL RLS runtime hardening

## Goal

- Goal no: GOAL-017
- Faz: FAZ-1 yeniden açılımı
- Durum: Tamamlandı
- Tarih: 2026-08-01

## Teslim edilenler

- Migration işlemleri için `DATABASE_MIGRATOR_URL`, uygulama işlemleri için
  sınırlı `DATABASE_URL` ayrımı uygulandı.
- Tekrar çalıştırılabilir PostgreSQL bootstrap betiği `vetniva_app` rolünü
  `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEDB` ve `NOCREATEROLE` olarak kurar;
  public şema `CREATE` yetkisini vermez.
- Auth/session, invitation, password-reset, Branch, RBAC membership,
  FileMeta, AuditEvent ve Controlled Drugs erişimleri transaction-yerel RLS
  bağlamına taşındı.
- Controlled Drugs kaydı için tenant izolasyonu ve append-only kuralı gerçek
  PostgreSQL üzerinde doğrulandı.
- CI, API başlamadan önce `db:verify-runtime-role` ile runtime veritabanı
  rolünün ayrıcalıklarını doğrular.
- E2E smoke, dış URL verilirse CI API'sini kullanır; verilmezse derlenmiş API'yi
  rastgele yerel portta başlatır. Böylece yerel kalite kapısı dış süreç
  yönetimine bağımlı değildir.

## Kabul kriteri kanıtı

| Kriter                                                                 | Kanıt                                                                                                                                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sınırlı rol altında health, login, session, branch ve Controlled Drugs | `runtime-role.http.e2e-spec.ts` 2/2 ve `app.e2e-spec.ts` 7/7 geçti.                                                                                          |
| Migrator/runtime rol ayrımı                                            | Temiz PostgreSQL'de 9 migration yalnız `DATABASE_MIGRATOR_URL` ile uygulandı; `db:verify-runtime-role` `vetniva_app` için geçti, migrator hesabını reddetti. |
| Transaction-yerel, fail-closed RLS erişimi                             | Repository RLS E2E'si 10/10 geçti.                                                                                                                           |
| İki tenant, negatif yollar ve append-only kayıt                        | `controlled-drugs.rls.e2e-spec.ts` 10/10 geçti.                                                                                                              |
| Node 20 kalite kapıları                                                | lint, type-check, test, build, docs:check, i18n:check, format:check, diff check ve kök E2E smoke geçti.                                                      |

## Son doğrulama

- `pnpm lint` — geçti.
- `pnpm type-check` — geçti.
- `pnpm test` — geçti (API: 1.499 başarılı, 7 atlama).
- `pnpm build` — geçti.
- `pnpm docs:check` — 0 hata, mevcut 405 bilgi uyarısı.
- `pnpm i18n:check` — geçti.
- `pnpm e2e:smoke` — temiz PostgreSQL'de 19/19 geçti.

## Controlled Drugs stabilizasyonu

Append-only `correction` hareketlerinin stok bakiyesinden yanlışlıkla
dışlandığı saptandı ve giderildi. Correction artık ters miktarı stok toplamına
uygular; birim testinde ve sınırlı PostgreSQL runtime rolü altında çalışan RLS
E2E testinde doğrulandı.

Aynı orijinal kayda ikinci correction oluşturulması servis katmanında
`VET-CD-0007` ile reddedilir. `20260801124000` migration'ındaki kısmi unique
index ve bütünlük trigger'ı, paralel istek veya doğrudan veritabanı yazımı
durumunda da bu kuralı zorunlu kılar.

- `pnpm format:check` ve `git diff --check` — geçti.

## Operasyon notu

Dağıtım ortamında uygulama `DATABASE_URL` değerini yalnız `vetniva_app` veya
aynı sınırlı ayrıcalıklara sahip uygulama rolüne vermelidir. Migration ve
şema yönetimi yalnız güvenli secret yönetimiyle sağlanan
`DATABASE_MIGRATOR_URL` üzerinden yürütülmelidir.
