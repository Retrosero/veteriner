# AGENTS.md — VetNiva Project Memory

> Proje kök kuralları, komutlar ve ajan rehberi. Bu dosya ajanlar ve insanlar
> tarafından okunur. Tüm kök kurallar için önce `AGENT_RULES.md` dosyasına
> bakılmalıdır. Bu dosya, o kuralları uygulama komutları ve hızlı rehber ile
> tamamlar.

## Hızlı başlangıç

```powershell
# 1. Node 20 LTS
nvm use 20   # veya nvm install 20

# 2. pnpm 9 (corepack ile)
corepack enable
corepack prepare pnpm@9.15.9 --activate

# 3. .env hazırla
Copy-Item .env.example .env

# 4. Bağımlılıkları kur
pnpm install

# 5. Local stack'i ayağa kaldır (postgres + redis + mailhog)
pnpm docker:up

# 6. Tüm app'leri geliştirme modunda çalıştır
pnpm dev
```

URL'ler:

- Web: http://localhost:3000
- API: http://localhost:3001
- Swagger: http://localhost:3001/api/docs
- Mailhog: http://localhost:8025
- Postgres: localhost:5432 (user/pw: vetniva/vetniva)
- Redis: localhost:6379

## Kök komutlar

| Komut               | Ne yapar                                                 |
| ------------------- | -------------------------------------------------------- |
| `pnpm dev`          | Tüm app'leri paralel geliştirme modunda başlatır (Turbo) |
| `pnpm build`        | Tüm app'leri production için derler                      |
| `pnpm lint`         | Tüm app'lerde ESLint çalıştırır                          |
| `pnpm type-check`   | Tüm app'lerde TypeScript tip kontrolü                    |
| `pnpm test`         | Tüm app'lerde unit + integration testleri                |
| `pnpm e2e:smoke`    | Playwright smoke testleri                                |
| `pnpm format`       | Prettier ile tüm dosyaları formatla                      |
| `pnpm format:check` | Format uyumluluğunu doğrula (CI kapısı)                  |
| `pnpm docs:check`   | Doküman-kod uyumu (route/permission/error code)          |
| `pnpm i18n:check`   | tr-TR/en-GB i18n key parity                              |
| `pnpm db:generate`  | Prisma Client üretir                                     |
| `pnpm db:migrate`   | Migration'ları uygular                                   |
| `pnpm clean`        | Build artefaktlarını ve node_modules temizler            |
| `pnpm docker:up`    | docker-compose ile local stack'i başlatır                |
| `pnpm docker:down`  | Local stack'i durdurur                                   |

## Mimari özet

- **Modüler monolit** (başlangıç): domain sınırları açık, modüller arası
  iletişim servis sözleşmesi veya domain event ile.
- **Multi-tenant**: PostgreSQL Row Level Security + uygulama katmanı
  `TenantContext`. Tenant bilgisi yalnızca doğrulanmış oturumdan gelir;
  request body/query'den güvenilmez.
- **Klinik & finansal kayıtlar** append-only / versiyonlama ile korunur.
  Fiziksel silme yasak; düzeltme amendment/ters kayıt ile yapılır.
- **Hata standardı**: sabit error code + request-id + fingerprint + PII
  maskeleme. Frontend ve backend aynı request-id ile ilişkilendirilir.
- **Çoklu dil** çekirdek: tr-TR varsayılan, en-GB iskelet.
- **Türkiye/İngiltere** kuralları country adapter üzerinden; koşullu ifade
  dağılımı yasak.

## Kod yazım standartları (kısa)

- **TypeScript strict** her paket için. `any` istisna + yorum gerektirir.
- **Türkçe yorum standardı**: her kaynak dosyanın başında
  `/** ... */` Türkçe blok (dosyanın amacı, modülü, iş kuralları,
  tenant/güvenlik etkisi, bağımlılıklar). Public sınıf ve karmaşık
  metotlarda JSDoc `@description` Türkçe.
- **Kod isimleri İngilizce**, yorumlar Türkçe.
- **DTO + validation** her API endpoint'inde zorunlu.
- **Repository pattern** ile Prisma erişimi infrastructure katmanında.
- **Idempotency** gerektiren endpoint'lerde `Idempotency-Key` header.
- **Transaction** sınırları açıkça tanımlı.
- **Para alanları** `numeric` (Prisma `Decimal`).
- **Zaman alanları** `timestamptz` (Prisma `DateTime`).
- **Soft delete** yalnızca uygun domainlerde (ör. dosya meta). Klinik
  kayıt ve finansal hareketlerde append-only.

## Test standartları

Her PR'da aşağıdakiler zorunludur:

- Unit test (her domain servisi)
- Integration test (her repository, Prisma test DB)
- API authorization test
- Tenant isolation test
- Duplicate/idempotency test (gereken endpoint'lerde)
- Transaction rollback test
- Negative path test (sadece happy-path yeterli değil)

## Dizin yapısı (özet)

```
apps/
  api/          NestJS — controller, service, repository katmanları
  web/          Next.js 14 App Router — server + client components
  worker/       BullMQ — background jobs (hatırlatma, rapor, vb.)
packages/
  contracts/    Paylaşılan Zod şemaları + tipler
  i18n/         i18next config + tr-TR / en-GB
  ui/           Tailwind + shadcn primitive'leri
  config/       Ortak tsconfig, eslint, prettier, tailwind
docs/
  pages/        Sayfa bilgi kayıtları (YAML)
  workflows/    İş akışları (Markdown)
  errors/       Hata kataloğu
  permissions/  Yetki matrisi
  user-education/ Kullanıcı eğitimi (Türkçe)
tools/
  docs-check/   Doküman-kod uyum doğrulayıcı
  i18n-check/   Çoklu-dil anahtar parity denetleyicisi
```

## CI

GitHub Actions `.github/workflows/ci.yml` üzerinden PR ve main branch
üzerinde tam kapılar çalışır: install → lint → type-check → unit →
integration → docs-check → i18n-check → build → e2e smoke.

## Ajan çalışma modeli

`AGENT_TEAM.md` üzerinden tanımlı ajanlar:

1. Orchestrator (Mavis) — planlama, koordinasyon, review
2. Senior Backend Engineer
3. Senior Frontend Engineer
4. Database & Multi-Tenancy Engineer
5. QA Automation Engineer
6. Observability & Security Engineer
7. Documentation & Knowledge Engineer
8. Veterinary Product Analyst
9. DevOps Engineer

Kod üreten ajan kendi kodunu tek başına onaylayamaz. Her goal
orchestrator review'ından geçer.

## Bilinen kısıtlamalar

- Repo OneDrive altında. pnpm'in `node-linker=isolated` modu OneDrive
  ile bazen yavaşlar; semlink hatası olursa `node-linker=hoisted` denenir.
- Node 24 lokalde yüklü; CI Node 20 pinli. `engines` `>=20`.
- Faz 0 kapsamında gerçek tenant/auth/audit bağlamı yok; bu altyapı
  GOAL-001+ birlikte gelir.

## Sık yapılan hatalar

- ❌ `tenant_id`'yi request body'den okumak → her zaman oturumdan
- ❌ Tıbbi kaydı doğrudan `UPDATE` ile değiştirmek → amendment/versiyon
- ❌ Stok miktarını doğrudan yazmak → stok hareketiyle türet
- ❌ Para değerini `float` ile tutmak → `Decimal` kullan
- ❌ Frontend'de yetki gizlemekle yetinmek → backend hatasını da yönet
- ❌ PII/loglanabilir alanı console.log'a yazmak → merkezi logger üzerinden
- ❌ Yeni route'u dokümansız bırakmak → CI `docs:check` patlar

## Daha fazla bilgi

- Kök kurallar: `AGENT_RULES.md`
- Ajan rolleri: `AGENT_TEAM.md`
- Proje bağlamı: `PROJECT_CONTEXT.md`
- Faz ve goal planı: `PHASE_PLAN.md`
- Goal çalışma akışı: `GOAL_WORKFLOW.md`
- Skill'ler: `skills/`
- Şablonlar: `templates/`
