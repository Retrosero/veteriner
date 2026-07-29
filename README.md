# Veteriner SaaS — MiniMax Agent Team Çalışma Paketi

Bu klasör, Türkiye merkezli başlayacak ve ileride İngiltere'ye açılabilecek çok kiracılı veteriner klinik + petshop SaaS projesinin MiniMax Agent Team ile sürdürülebilir biçimde geliştirilmesi için hazırlanmıştır.

## Pilot işletme

- 1 şube
- 2 işletme sahibi
- 2 çalışan
- Hayvan türleri: kedi, köpek, kuş
- Klinik hizmetleri: muayene, aşı, ameliyat, yatış, laboratuvar, görüntüleme
- Petshop satışı mevcut
- Mevcut yazılım/veri aktarımı yok
- İlk sürümde e-SMM entegrasyonu zorunlu değil
- Hasta sahibi portalı MVP kapsamındadır
- White-label kapsam dışıdır

## Teknoloji kararı

- Monorepo: pnpm workspace + Turborepo
- Web: Next.js + TypeScript
- API: NestJS + TypeScript
- Veritabanı: PostgreSQL
- ORM: Prisma
- Tenant güvenliği: PostgreSQL Row Level Security + uygulama katmanı kontrolü
- Queue/worker: Redis + BullMQ
- Dosya depolama: S3 uyumlu object storage
- API sözleşmesi: OpenAPI
- Test: Vitest/Jest, Supertest, Playwright
- Gözlemlenebilirlik: OpenTelemetry + merkezi hata kaydı
- Dokümantasyon: Markdown/YAML tabanlı bilgi havuzu

## Kullanım sırası

1. `PROJECT_CONTEXT.md` dosyasını tüm ajanlara bağlam olarak verin.
2. `AGENT_RULES.md` kurallarını repository kök kuralları olarak tanımlayın.
3. Ajan rollerini `AGENT_TEAM.md` üzerinden atayın.
4. Her iş için `templates/GOAL_TEMPLATE.md` kullanın.
5. Fazları `PHASE_PLAN.md` sırasıyla ilerletin.
6. Her goal bitiminde `templates/GOAL_COMPLETION_REPORT.md` zorunlu olsun.
7. Kod, test, log ve dokümantasyon birlikte tamamlanmadan goal kapatılmasın.

## Temel prensip

Bir goal yalnızca kod yazıldığında tamamlanmış sayılmaz. Aşağıdaki dört çıktı birlikte tamamlanmalıdır:

1. Çalışan kod
2. Otomatik test
3. Log/audit/gözlemlenebilirlik
4. Kullanıcı ve AI bilgi havuzu dokümantasyonu
