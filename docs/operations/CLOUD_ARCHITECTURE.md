# VetNiva Pilot — Cloud Altyapı Önerisi (Hostinger + Coolify → Hetzner production)

> **Tarih:** 4 Ağustos 2026 (rev. 12:24 — Hostinger/Coolify pilot ortamı eklendi)
> **Durum:** Pilot test ortamı kesin (Hostinger + Coolify). Production kararı pilot sonrası.
> **Kapsam:** Pilot (1 klinik, 1 şube) — Faz 12

## 1) İki aşamalı mimari

| Aşama                                    | Ortam                              | Amaç                                                                             |
| ---------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------- |
| **Aşama A — Pilot test (ilk 4-6 hafta)** | **Hostinger VPS + Coolify**        | Klinik tarafında canlıya benzer koşullarda test; kullanıcı kabulü, geri bildirim |
| **Aşama B — Production (pilot sonrası)** | **Hetzner Cloud + Object Storage** | AB KVKK, managed PG, daha düşük maliyet, ölçeklenebilirlik                       |

## 2) Aşama A — Hostinger + Coolify (pilot)

| Katman         | Tercih                                                        | Not                                                |
| -------------- | ------------------------------------------------------------- | -------------------------------------------------- |
| VPS            | **Hostinger KVM 2** veya **KVM 4** (4-8 GB RAM)               | Coolify için ≥4 GB önerilir                        |
| PaaS           | **Coolify v4** (self-hosted)                                  | Docker compose deploy, otomatik SSL, reverse proxy |
| PostgreSQL     | Coolify "PostgreSQL" resource'u veya harici container         | PG 15; non-superuser `vetniva_app` rolü ayrılır    |
| Object storage | **Hetzner Object Storage** (S3-uyumlu, AB) veya **Wasabi EU** | Hostinger native S3 yok; AB lokasyon şart (KVKK)   |
| Domain + DNS   | Hostinger domain/DNS (ücretsiz)                               | `pilot.klinikadi.com.tr`                           |
| SSL            | **Let's Encrypt** (Coolify otomatik)                          | Ücretsiz, otomatik yenileme                        |
| Reverse proxy  | **Traefik** (Coolify default)                                 | Otomatik                                           |
| Antivirüs      | **ClamAV daemon** (ayrı container)                            | Faz 14 zorunluluğu                                 |
| Monitoring     | **Sentry** (free) + **Grafana Cloud** (free)                  |                                                    |
| SMTP           | **Mailgun EU** (sandbox 5k/ay) veya Hostinger relay           | Davet, parola sıfırlama, hatırlatma, KVKK          |
| Backup         | `pg_dump` cron → Hetzner Object Storage                       | RPO ≤ 24 saat                                      |

> **Maliyet (Hostinger pilot):**
>
> - KVM 4 (~~€20-25/ay) + Domain (~~€10/yıl) + Object Storage (~€3/ay) + SMTP (ücretsiz tier) + Monitoring (ücretsiz)
> - **Toplam: ~€25-30/ay** + domain yıllık

## 3) Aşama B — Hetzner (production, pilot sonrası)

| Katman             | Tercih                                            | Neden                                      |
| ------------------ | ------------------------------------------------- | ------------------------------------------ |
| VPS                | **Hetzner Cloud CCX13** (4 vCPU, 8 GB, dedicated) | AB veri merkezi, daha düşük maliyet, ölçek |
| Managed PostgreSQL | **Hetzner Cloud Database** (PG 15, 2 vCPU / 4 GB) | Otomatik backup, PITR, non-superuser rol   |
| Object storage     | **Hetzner Object Storage** veya **Wasabi EU**     | S3-uyumlu, AB lokasyon                     |
| Domain + DNS       | Mevcut domain Hetzner DNS / Cloudflare            |                                            |
| SSL                | Let's Encrypt (Caddy ile)                         |                                            |
| Reverse proxy      | **Caddy**                                         | Otomatik HTTPS                             |
| Antivirüs          | ClamAV (VPS üzerinde)                             |                                            |
| Monitoring         | Sentry + Grafana Cloud                            |                                            |
| SMTP               | Mailgun EU production plan                        |                                            |
| Backup             | Hetzner snapshot + Object Storage                 | RPO ≤ 24 saat, RTO ≤ 4 saat                |

> **Maliyet (Hetzner production):** ~€40-50/ay

## 4) Mimari diyagram (Aşama A — Hostinger + Coolify)

```
                    ┌──────────────────────┐
   Kullanıcı ──────►│  Traefik (Coolify)   │
                    │  otomatik Let's Enc. │
                    │  Hostinger VPS       │
                    └──────────┬───────────┘
                               │
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
       ┌─────────┐       ┌──────────┐       ┌──────────┐
       │  Web    │       │   API    │       │  Worker  │
       │ Next.js │       │  NestJS  │       │  BullMQ  │
       │ coolify │       │ coolify  │       │ coolify  │
       └────┬────┘       └─────┬────┘       └────┬─────┘
            │                  │                  │
            └────────►┌────────┴────────┐◄───────┘
                     │  PostgreSQL 15   │
                     │  (coolify PG    │
                     │  veya harici)   │
                     └────────┬────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │Object    │   │ ClamAV   │   │SMTP      │
        │Storage   │   │(container)│ │Mailgun   │
        │(Hetzner/ │   │:3310     │   │EU        │
        │ Wasabi)  │   │          │   │          │
        └──────────┘   └──────────┘   └──────────┘
```

## 2) Mimari diyagram (metinsel)

```
                    ┌──────────────┐
   Kullanıcı ──────►│  Caddy (TLS) │
                    │  VPS CCX13   │
                    │  Frankfurt   │
                    └──────┬───────┘
                           │
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
       ┌─────────┐   ┌──────────┐   ┌──────────┐
       │  Web    │   │   API    │   │  Worker  │
       │ Next.js │   │  NestJS  │   │  BullMQ  │
       │ :3000   │   │  :3001   │   │  :3002   │
       └────┬────┘   └─────┬────┘   └────┬─────┘
            │              │              │
            │       ┌──────┴──────┐       │
            └──────►│  Postgres   │◄──────┘
                    │  (managed)  │
                    │  Hetzner DB │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │Object    │ │ ClamAV   │ │SMTP      │
        │Storage   │ │(yerel)   │ │Mailgun   │
        │(dosya,   │ │:3310     │ │EU        │
        │ yedek)   │ │          │ │          │
        └──────────┘ └──────────┘ └──────────┘
```

## 3) Non-superuser app role (GOAL-017 kanıtı)

Hetzner managed DB'de `vetniva_app` rolü oluşturulur; `BYPASSRLS` yok. Tenant bağlamı `set_config('app.tenant_id', ..., true)` ile transaction-yerel uygulanır. Faz 1'de bu mekanizma 6/6 non-superuser E2E testiyle kanıtlandı; üretimde de aynı yapı kullanılacak.

## 4) KVKK ve veri konumu

- Tüm veri **AB (Frankfurt / Nuremberg / Amsterdam)** sınırları içinde.
- Yedekleme AB dışına çıkmaz.
- Kişisel veri işleme sözleşmesi (klinik ile) pilot başlangıcında imzalanır.
- Tenant export + anonymize (GOAL-126) zaten mevcut.

## 5) RPO / RTO hedefleri

- **RPO:** 24 saat (günlük snapshot + 6 saatte bir incremental dump)
- **RTO:** 4 saat (managed DB'nin son yedeğinden restore + Object Storage yeniden çekme)
- Backup testi W2'de senaryo olarak çalıştırılır (GOAL-124 core).

## 6) Açık sorular (kullanıcıya)

1. **Domain** — klinik kendi domainini verecek mi (örn. `vetniva.klinikadi.com.tr`) yoksa sen misin alacaksın?
2. **SMTP** — Mailgun EU ücretsiz 5k/ay pilot için yeterli mi, yoksa kendi SMTP relay mi?
3. **Klinik lokasyonu** — TR dışından hasta verisi olacak mı? (KVKK kapsamı için)
4. **Tahmini eşzamanlı kullanıcı** — pilot klinik kaç kişi aynı anda çalışacak? (VPS boyutu için)
5. **Yedek saklama** — 30 gün mü 90 gün mü? (KVKK + maliyet)

## 7) Uygulama adımları (Hafta 2, sıra)

1. Hetzner Cloud hesabı açılır, CX22/CCX13 + Postgres + Object Storage oluşturulur.
2. DNS + domain yönlendirilir.
3. VPS'e Caddy + Node 20 LTS kurulur.
4. Repo clone + `pnpm install` + `.env` (Hetzner secret'lar) + `pnpm db:generate` + `prisma migrate deploy`.
5. API/Web/Worker systemd service olarak kurulur.
6. ClamAV + SMTP relay + Sentry DSN bağlanır.
7. `pnpm e2e:smoke` üretimde koşulur.
8. Backup script + cron + restore testi.
9. `docs/operations/PRODUCTION_RELEASE.md` + `BACKUP_RESTORE.md` canlı linklerle güncellenir.
