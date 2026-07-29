# Agent Team Yapısı

## 1. Orchestrator / Senior Tech Lead

Sorumluluklar:

- Goal'u alt görevlere ayırmak
- Mimari tutarlılığı korumak
- Ajanlar arası çakışmayı önlemek
- Kabul kriterlerini doğrulamak
- Son entegrasyonu yapmak
- Goal completion report hazırlamak

Bu ajan doğrudan çok fazla kod yazmamalı; kritik entegrasyon ve review işini yürütmelidir.

## 2. Senior Backend Engineer

Odak:

- NestJS modülleri
- Domain/application servisleri
- API
- Queue ve background job
- Entegrasyon adapterleri
- Idempotency
- Transaction yönetimi

Skill:
`skills/SENIOR_BACKEND_NESTJS.md`

## 3. Senior Frontend Engineer

Odak:

- Next.js
- Erişilebilir ve hızlı klinik arayüz
- Formlar
- Yetkiye göre görünürlük
- Hasta sahibi portalı
- Çoklu dil
- Frontend hata yakalama

Skill:
`skills/SENIOR_FRONTEND_NEXTJS.md`

## 4. Database & Multi-Tenancy Engineer

Odak:

- PostgreSQL şeması
- Prisma migration
- RLS
- Index
- Transaction ve concurrency
- Yedek/restore
- Veri bütünlüğü

Skill:
`skills/DATABASE_MULTITENANCY.md`

## 5. QA Automation Engineer

Odak:

- Test planı
- Unit/integration/E2E
- Tenant izolasyon testleri
- Yetki testleri
- Regression
- Test verisi üretimi
- Pilot kabul senaryoları

Skill:
`skills/QA_AUTOMATION.md`

## 6. Observability & Security Engineer

Odak:

- Merkezi hata sistemi
- Audit
- OpenTelemetry
- Güvenlik logları
- PII maskeleme
- Rate limit
- Güvenlik testleri

Skill:
`skills/OBSERVABILITY_SECURITY.md`

## 7. Documentation & Knowledge Engineer

Odak:

- Türkçe kod açıklamaları
- Kullanıcı eğitim dokümanı
- Sayfa ve iş akışı kataloğu
- AI bilgi havuzu
- Doküman-kod uyum testi

Skill:
`skills/DOCUMENTATION_KNOWLEDGE.md`

## 8. Veterinary Product Analyst

Odak:

- Klinik iş akışı
- Alanların anlamı
- Kedi/köpek/kuş süreçleri
- Pilot klinik doğrulaması
- Gereksiz karmaşıklığı engelleme
- Kabul senaryoları

Skill:
`skills/VETERINARY_DOMAIN.md`

## 9. DevOps Engineer

Odak:

- CI/CD
- Ortamlar
- Docker
- Migration deployment
- Backup
- Monitoring
- Release ve rollback

Skill:
`skills/DEVOPS.md`

## Çalışma modeli

Her goal için minimum ajan dizilimi:

1. Orchestrator kapsamı doğrular.
2. Domain analyst iş akışını doğrular.
3. Backend/frontend/database ajanları uygular.
4. Observability ajanı log ve güvenliği kontrol eder.
5. QA ajanı testleri çalıştırır.
6. Documentation ajanı bilgi havuzunu günceller.
7. Orchestrator final review yapar.

Kod üreten ajan kendi kodunu tek başına onaylayamaz.
