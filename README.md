# VetNiva

VetNiva, veteriner klinikleri ve petshop işletmeleri için geliştirilen çok
kiracılı (multi-tenant) bir SaaS platformudur. İlk hedef Türkiye'deki pilot
kliniklerdir; ülke kuralları adapter yaklaşımıyla İngiltere paketi için de
genişletilebilir.

## Kapsam

- Hasta sahibi ve hayvan kayıtları, sahiplik geçmişi ve uyarılar
- Randevu, bekleme listesi, muayene, SOAP, vital, teşhis ve reçete akışları
- Aşı, stok, satın alma, petshop satışları, tahsilat ve kasa işlemleri
- Ameliyat, anestezi, yatış, laboratuvar ve görüntüleme süreçleri
- Hasta sahibi portalı, bildirimler, raporlar ve superadmin araçları
- Controlled Drugs kayıt defteri: append-only hareketler, stok mutabakatı,
  düzeltme bütünlüğü ve tenant izolasyonu

## Mimari

- Monorepo: pnpm workspace + Turborepo
- Web: Next.js 14 ve TypeScript
- API: NestJS, Prisma ve PostgreSQL
- Güvenlik: PostgreSQL RLS, tenant bağlamı, RBAC, audit izi ve PII maskeleme
- Altyapı: Redis/BullMQ, S3 uyumlu nesne depolama ve ClamAV tarama
- Sözleşmeler: Zod, OpenAPI, tr-TR/en-GB i18n ve Markdown/YAML dokümantasyon

## Hızlı başlangıç

Gereksinimler: Node.js 20 LTS, Corepack ve Docker.

```powershell
nvm use 20
corepack enable
corepack prepare pnpm@9.15.9 --activate
Copy-Item .env.example .env
pnpm install
pnpm docker:up
pnpm dev
```

Yerel servisler:

- Web: <http://localhost:3000>
- API / Swagger: <http://localhost:3001/api/docs>
- MailHog: <http://localhost:8025>
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

## Kalite kapıları

```powershell
pnpm lint
pnpm type-check
pnpm test
pnpm build
pnpm docs:check
pnpm i18n:check
pnpm e2e:smoke
```

## Üretim notları

Production ortamında dosya yükleme için `STORAGE_DRIVER=s3` ve zararlı içerik
taraması için `SCAN_DRIVER=clamav` zorunludur; güvenli olmayan yerel/noop
sürücüler uygulamanın başlamasını engeller. Ortam değişkenlerinin tamamı
[.env.example](.env.example) içinde bulunur.

Üretime çıkış için yerel kalite kapılarına ek olarak gerçek S3/ClamAV
bağlantısı, CI, pilot kabul, performans/güvenlik ve backup-restore kanıtları
gereklidir.

## Dokümantasyon ve geliştirme modeli

- [PHASE_PLAN.md](PHASE_PLAN.md): fazlar ve ürün yol haritası
- [AGENT_RULES.md](AGENT_RULES.md): mimari, güvenlik ve kodlama kuralları
- [goals/EXECUTION_ROADMAP.md](goals/EXECUTION_ROADMAP.md): güncel yürütme durumu
- [docs/](docs): API, iş akışları, yetkiler, hata kataloğu ve kullanıcı eğitimi

Her goal; kod, otomatik test, gözlemlenebilirlik ve dokümantasyon birlikte
tamamlanmadan kapatılmaz.
