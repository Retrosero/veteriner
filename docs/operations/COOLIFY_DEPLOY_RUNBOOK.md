# Coolify Deploy Runbook — VetNiva Pilot (Hostinger KVM 4)

> **Hedef kitle:** Serhan (pilot kurulumu), DevOps
> **Kapsam:** Hafta 2 — api / web / worker Coolify deploy prosedürü
> **Coolify sürümü:** 4.x (self-hosted, Traefik reverse proxy)
> **Pilot VPS:** Hostinger KVM 4 (4-8 GB RAM, ≥4 GB önerilir)
> **Production VPS:** Hetzner Cloud CCX13 (Faz 12 sonrası, farklar Bölüm 9'da)
> **Repo:** `https://github.com/vetniva/vetniva` (Public veya Private — Bölüm 2'de seçim)
> **Son güncelleme:** Bu runbook, mevcut Dockerfile'lar ve `.env.example`
> ile birebir uyumludur. `.env.example`'a yeni değişken eklenirse bu
> doküman güncellenmelidir (`pnpm docs:check` bunu doğrular).

## 1. Genel bakış

### 1.1 Pilot ortamı

| Öğe            | Değer                                                                               |
| -------------- | ----------------------------------------------------------------------------------- |
| VPS            | Hostinger KVM 4 (4 vCPU, 8 GB RAM, 200 GB NVMe)                                     |
| OS             | Ubuntu 22.04 LTS veya 24.04 LTS (Coolify uyumlu)                                    |
| PaaS           | Coolify v4 (self-hosted, kendi VPS'imizde)                                          |
| Reverse proxy  | Traefik (Coolify default, otomatik Let's Encrypt)                                   |
| Uygulamalar    | 3 (api, web, worker) + 2 yardımcı servis (Postgres, Redis)                          |
| Domain         | `pilot.<klinik-domain>.com.tr` (klinik kendi domaini) veya geçici Coolify subdomain |
| SMTP           | Mailgun EU sandbox (5k/ay, pilot için yeterli)                                      |
| Object Storage | Hetzner Object Storage (S3-uyumlu, AB lokasyon — KVKK)                              |
| Backup hedefi  | Günlük `pg_dump` → Hetzner Object Storage (RPO ≤ 24 saat)                           |

### 1.2 Varsayımlar

- Repo `main` branch'i production-ready, pilot için stabil.
- Coolify VPS'te kurulu, admin erişimi var (root veya `sudo`).
- DNS yönetimi yapılabilir (klinik domaini veya Cloudflare/Hetzner DNS).
- Hetzner Object Storage bucket'ı önceden oluşturulmuş (`vetniva-pilot`).
- Mailgun EU hesabı aktif, API key alınmış.
- `AUTH_JWT_SECRET` en az 32 karakter rastgele üretilmiş (örn.
  `openssl rand -base64 48`).

### 1.3 Gereksinimler

| Gereksinim                    | Neden                                 |
| ----------------------------- | ------------------------------------- |
| GitHub deploy key veya PAT    | Coolify private repo için             |
| Hetzner Object Storage access | S3 dosya + yedek                      |
| Mailgun API key               | SMTP kimlik bilgisi                   |
| Domain (klinik kendi verisi)  | SSL + kullanıcı erişimi               |
| Coolify lisansı               | Self-hosted: ücretsiz; Cloud: ücretli |

### 1.4 Mimari diyagram (metinsel)

```
                 ┌──────────────────────────────┐
   Kullanıcı ───►│  Traefik (Coolify built-in)  │
                 │  otomatik Let's Encrypt      │
                 │  pilot.klinik.com.tr         │
                 │  Hostinger KVM 4             │
                 └──────────┬───────────────────┘
                            │
        ┌───────────────────┼─────────────────────┐
        ▼                   ▼                     ▼
   ┌─────────┐         ┌──────────┐         ┌──────────┐
   │  Web    │         │   API    │         │  Worker  │
   │ Next.js │         │  NestJS  │         │  BullMQ  │
   │ :3000   │         │  :3001   │         │ (no port)│
   └────┬────┘         └─────┬────┘         └────┬─────┘
        │                   │                   │
        └──────►┌────────────┴──────────┐◄──────┘
                 │  PostgreSQL 15        │
                 │  (Coolify Service)    │
                 │  + Redis 7            │
                 └────────────┬──────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │ Hetzner  │   │ Mailgun  │   │ Sentry   │
        │ Object   │   │ EU SMTP  │   │ (free)   │
        │ Storage  │   │          │   │          │
        └──────────┘   └──────────┘   └──────────┘
```

## 2. Coolify Uygulama şablonları

Coolify'da her app bir **Resource**'tur. Üç tip kullanacağız:

- **Application (Dockerfile)** → api, web, worker
- **Application (Private/Public GitHub repo)** → git üzerinden kaynak
- **Service (Docker Image)** → Postgres, Redis
- **Database (One-click)** → Postgres, Redis (Coolify v4'te bu kısayol)

Coolify v4'te her uygulama aynı domain'de veya ayrı subdomain'de
yayınlanabilir. Bu runbook'ta:

- `pilot.klinik.com.tr` → web
- `api.pilot.klinik.com.tr` → api
- worker → public endpoint yok, internal network

### 2.1 Paylaşılan Coolify ayarları

Tüm uygulamalar için geçerli:

- **Build pack:** Dockerfile
- **Branch:** `main` (pilot başlangıcında kararlı)
- **Build context:** `/` (repo kökü; pnpm workspace root'tan çözülür)
- **Watch paths:** boş (manual redeploy, push-to-deploy opsiyonel)
- **Auto deploy:** pilot başlangıcında **kapalı** (Serhan manuel tetikler)
- **Health check:** Coolify, container içindeki `HEALTHCHECK` direktifi ile
  30 sn'de bir yoklama yapar. 3 başarısızlıkta restart.
- **Restart policy:** `unless-stopped`
- **Persistent disk:** yok (stateless)
- **Memory limit:** 512 MB (api, web); 256 MB (worker)

> **Coolify Secret:** Hassas env değişkenlerini UI'da düz metin
> girmek yerine **Environment Variables** bölümünde `is_secret=true`
> işaretleyin. Coolify bunları `/run/secrets/<name>` üzerinden
> container'a mount eder; container env olarak görür.

### 2.2 API uygulaması (NestJS)

| Alan                  | Değer                                            |
| --------------------- | ------------------------------------------------ |
| Coolify Resource adı  | `vetniva-api`                                    |
| Tip                   | Application → Public/Private GitHub Repository   |
| Repo URL              | `https://github.com/vetniva/vetniva`             |
| Branch                | `main`                                           |
| Build pack            | Dockerfile                                       |
| **Dockerfile path**   | `apps/api/Dockerfile`                            |
| **Build context**     | `/` (repo kökü)                                  |
| **Port**              | `3001`                                           |
| **Health check path** | `/api/v1/health` (Dockerfile'da tanımlı)         |
| Domain                | `api.pilot.klinik.com.tr` (HTTPS, Let's Encrypt) |
| Memory limit          | 512 MB                                           |
| CPU limit             | 1                                                |

**Environment Variables (Coolify Secret):**

| Değişken                      | Değer (örnek)                                                                          | Secret   | Pilot zorunlu | Açıklama                             |
| ----------------------------- | -------------------------------------------------------------------------------------- | -------- | ------------- | ------------------------------------ |
| `NODE_ENV`                    | `production`                                                                           | hayır    | ✓             | Zorunlu (env.ts)                     |
| `APP_VERSION`                 | `0.1.0`                                                                                | hayır    | ✓             | Sürüm etiketi                        |
| `APP_NAME`                    | `vetniva-api`                                                                          | hayır    | ✓             | Log/observability                    |
| `LOG_LEVEL`                   | `info`                                                                                 | hayır    | ✓             | Pino log seviyesi                    |
| `PORT_API`                    | `3001`                                                                                 | hayır    | ✓             | API dinleme portu                    |
| `WEB_BASE_URL`                | `https://pilot.klinik.com.tr`                                                          | hayır    | ✓             | CORS origin                          |
| `API_BASE_URL`                | `https://api.pilot.klinik.com.tr`                                                      | hayır    | ✓             | Swagger/HATEOAS referans             |
| `DATABASE_URL`                | `postgresql://vetniva_app:<PWD>@<coolify-postgres-host>:5432/vetniva?schema=public`    | evet     | ✓             | App rolü, BYPASSRLS yok              |
| `DATABASE_SHADOW_URL`         | `postgresql://vetniva:<PWD>@<coolify-postgres-host>:5432/vetniva_shadow?schema=public` | evet     | opsiyonel     | Prisma shadow DB                     |
| `REDIS_URL`                   | `redis://<coolify-redis-host>:6379`                                                    | evet     | ✓             | BullMQ + cache                       |
| `DEFAULT_LOCALE`              | `tr-TR`                                                                                | hayır    | ✓             | Pilot dili                           |
| `SUPPORTED_LOCALES`           | `tr-TR,en-GB`                                                                          | hayır    | ✓             | i18n                                 |
| `AUTH_JWT_SECRET`             | `<openssl rand -base64 48>`                                                            | **evet** | ✓             | ≥32 karakter; imzalama anahtarı      |
| `AUTH_JWT_ACCESS_TTL`         | `900`                                                                                  | hayır    | ✓             | 15 dakika                            |
| `AUTH_JWT_REFRESH_TTL`        | `2592000`                                                                              | hayır    | ✓             | 30 gün                               |
| `AUTH_PASSWORD_MIN_LENGTH`    | `10`                                                                                   | hayır    | ✓             | Politikası                           |
| `AUTH_INVITE_TTL`             | `86400`                                                                                | hayır    | ✓             | 1 gün davet linki                    |
| `STORAGE_DRIVER`              | `s3`                                                                                   | hayır    | ✓             | pilot'ta s3 zorunlu                  |
| `S3_BUCKET`                   | `vetniva-pilot`                                                                        | hayır    | ✓             | Hetzner Object Storage               |
| `S3_REGION`                   | `eu-central-1`                                                                         | hayır    | ✓             | Hetzner FS1                          |
| `S3_ENDPOINT`                 | `https://fsn1.your-objectstorage.com`                                                  | hayır    | ✓             | Hetzner S3 endpoint                  |
| `S3_ACCESS_KEY_ID`            | `<Hetzner access key>`                                                                 | **evet** | ✓             |                                      |
| `S3_SECRET_ACCESS_KEY`        | `<Hetzner secret key>`                                                                 | **evet** | ✓             |                                      |
| `S3_FORCE_PATH_STYLE`         | `true`                                                                                 | hayır    | ✓             | Hetzner path-style                   |
| `STORAGE_PUBLIC_BASE_URL`     | `https://pilot.klinik.com.tr/api/v1/files`                                             | hayır    | ✓             | İmzalı URL'ler için                  |
| `STORAGE_SIGNING_KEY`         | `<openssl rand -base64 32>`                                                            | **evet** | ✓             |                                      |
| `SCAN_DRIVER`                 | `clamav`                                                                               | hayır    | opsiyonel     | Pilot'ta ClamAV yoksa `noop` yapılır |
| `CLAMAV_HOST`                 | (ClamAV container adı)                                                                 | hayır    | opsiyonel     |                                      |
| `CLAMAV_PORT`                 | `3310`                                                                                 | hayır    | opsiyonel     |                                      |
| `SMTP_HOST`                   | `smtp.eu.mailgun.org`                                                                  | hayır    | ✓             |                                      |
| `SMTP_PORT`                   | `587`                                                                                  | hayır    | ✓             | STARTTLS                             |
| `SMTP_USER`                   | `<Mailgun SMTP user>`                                                                  | **evet** | ✓             |                                      |
| `SMTP_PASSWORD`               | `<Mailgun SMTP password>`                                                              | **evet** | ✓             |                                      |
| `SMTP_FROM`                   | `no-reply@pilot.klinik.com.tr`                                                         | hayır    | ✓             | Verified sender                      |
| `SMTP_SECURE`                 | `false`                                                                                | hayır    | ✓             | STARTTLS için                        |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | (boş, pilot'ta OTel yok)                                                               | hayır    | opsiyonel     |                                      |
| `SENTRY_DSN`                  | `<Sentry DSN>`                                                                         | **evet** | opsiyonel     | Hata raporlama                       |
| `ERROR_REPORTING_SAMPLE_RATE` | `1.0`                                                                                  | hayır    | opsiyonel     |                                      |
| `FEATURE_VACCINATION`         | `true`                                                                                 | hayır    | ✓             | Pilot senaryo 4                      |
| `FEATURE_PETSHOP`             | `true`                                                                                 | hayır    | ✓             | Pilot senaryo 5                      |
| `FEATURE_SURGERY`             | `true`                                                                                 | hayır    | ✓             | Pilot senaryo 7                      |
| `FEATURE_LAB`                 | `true`                                                                                 | hayır    | ✓             | Pilot senaryo 9                      |
| `FEATURE_PORTAL`              | `true`                                                                                 | hayır    | ✓             | Pilot senaryo 10                     |

> **Coolify Internal Network:** `DATABASE_URL` ve `REDIS_URL`'deki
> host adları Coolify'ın oluşturduğu internal DNS'ten gelir.
> Postgres için `<resource-uuid>-postgres`, Redis için
> `<resource-uuid>-redis` formunda olur. UI'da **Connected Networks**
> bölümünden web/api/worker aynı `vetniva-net` ağına bağlanmalı.

### 2.3 Web uygulaması (Next.js 14 standalone)

| Alan                  | Değer                                            |
| --------------------- | ------------------------------------------------ |
| Coolify Resource adı  | `vetniva-web`                                    |
| Tip                   | Application → Public/Private GitHub Repository   |
| Repo URL              | `https://github.com/vetniva/vetniva`             |
| Branch                | `main`                                           |
| Build pack            | Dockerfile                                       |
| **Dockerfile path**   | `apps/web/Dockerfile`                            |
| **Build context**     | `/` (repo kökü)                                  |
| **Port**              | `3000`                                           |
| **Health check path** | `/` (Dockerfile'da tanımlı; ana sayfa 200 döner) |
| Domain                | `pilot.klinik.com.tr` (HTTPS, Let's Encrypt)     |
| Memory limit          | 512 MB                                           |
| CPU limit             | 1                                                |

**Environment Variables:**

| Değişken                  | Değer (örnek)                     | Secret | Pilot zorunlu | Açıklama                         |
| ------------------------- | --------------------------------- | ------ | ------------- | -------------------------------- |
| `NODE_ENV`                | `production`                      | hayır  | ✓             |                                  |
| `APP_VERSION`             | `0.1.0`                           | hayır  | ✓             |                                  |
| `APP_NAME`                | `vetniva`                         | hayır  | ✓             | next.config.mjs                  |
| `NEXT_TELEMETRY_DISABLED` | `1`                               | hayır  | ✓             | Build sırasında telemetry kapalı |
| `PORT`                    | `3000`                            | hayır  | ✓             | Dockerfile'da sabit              |
| `HOSTNAME`                | `0.0.0.0`                         | hayır  | ✓             | Tüm interface'lerden dinle       |
| `API_BASE_URL`            | `https://api.pilot.klinik.com.tr` | hayır  | ✓             | Server-side fetch base           |
| `NEXT_PUBLIC_APP_VERSION` | `0.1.0`                           | hayır  | ✓             | Client-side override             |

> **Not:** Web Dockerfile `API_BASE_URL`'i build sırasında gömmez
> (server runtime'da `process.env["API_BASE_URL"]` okur). Ancak
> `next.config.mjs` bazı değerleri build-time alıyor olabilir; bu
> yüzden env Coolify UI'da **build** ve **runtime** için ayrı ayrı
> tanımlanmalıdır. Coolify v4 "Build Time Variables" ayrı bir
> bölüm sunar; oraya da aynı `API_BASE_URL` eklenir.

### 2.4 Worker uygulaması (BullMQ)

| Alan                     | Değer                                                  |
| ------------------------ | ------------------------------------------------------ |
| Coolify Resource adı     | `vetniva-worker`                                       |
| Tip                      | Application → Public/Private GitHub Repository         |
| Repo URL                 | `https://github.com/vetniva/vetniva`                   |
| Branch                   | `main`                                                 |
| Build pack               | Dockerfile                                             |
| **Dockerfile path**      | `apps/worker/Dockerfile`                               |
| **Build context**        | `/` (repo kökü)                                        |
| **Port**                 | yok (public endpoint yok, internal process)            |
| **Health check**         | Dockerfile'da fs-access tabanlı (dist/main.js varlığı) |
| Domain                   | yok                                                    |
| Memory limit             | 256 MB                                                 |
| CPU limit                | 0.5                                                    |
| Coolify **port mapping** | boş bırakılır veya `3002` (iç kullanım)                |

**Environment Variables:**

| Değişken        | Değer (örnek)                                                                       | Secret   | Pilot zorunlu | Açıklama                     |
| --------------- | ----------------------------------------------------------------------------------- | -------- | ------------- | ---------------------------- |
| `NODE_ENV`      | `production`                                                                        | hayır    | ✓             |                              |
| `APP_VERSION`   | `0.1.0`                                                                             | hayır    | ✓             |                              |
| `LOG_LEVEL`     | `info`                                                                              | hayır    | ✓             |                              |
| `REDIS_URL`     | `redis://<coolify-redis-host>:6379`                                                 | evet     | ✓             |                              |
| `DATABASE_URL`  | `postgresql://vetniva_app:<PWD>@<coolify-postgres-host>:5432/vetniva?schema=public` | evet     | ✓             |                              |
| `PORT_WORKER`   | `3002`                                                                              | hayır    | opsiyonel     | İleride health endpoint için |
| `SMTP_HOST`     | `smtp.eu.mailgun.org`                                                               | hayır    | ✓             | Bildirim job'ları            |
| `SMTP_PORT`     | `587`                                                                               | hayır    | ✓             |                              |
| `SMTP_USER`     | `<Mailgun user>`                                                                    | **evet** | ✓             |                              |
| `SMTP_PASSWORD` | `<Mailgun pwd>`                                                                     | **evet** | ✓             |                              |
| `SMTP_FROM`     | `no-reply@pilot.klinik.com.tr`                                                      | hayır    | ✓             |                              |

> **Worker healthcheck notu:** Mevcut `apps/worker/Dockerfile` fs
> access tabanlı bir healthcheck kullanır (process canlılığını
> dolaylı kontrol eder). Worker'ın gerçek bir HTTP health endpoint'i
> yoktur; uzun ömürlü process olarak kabul edilir. Coolify restart
> policy (`unless-stopped`) yeterli olur; 3 fs-check başarısızlığında
> container restart edilir.

## 3. Servisler

### 3.1 PostgreSQL 15 (Coolify One-Click Database)

| Alan                | Değer                                                      |
| ------------------- | ---------------------------------------------------------- |
| Coolify Resource    | `vetniva-postgres`                                         |
| Tip                 | Service → Database → PostgreSQL                            |
| Versiyon            | `15-alpine`                                                |
| DB adı              | `vetniva`                                                  |
| Kullanıcı (owner)   | `vetniva` (Coolify default)                                |
| **Kullanıcı (app)** | `vetniva_app` (BYPASSRLS yok — ek roller için Bölüm 3.1.1) |
| Password            | Coolify Secret                                             |
| Persistent volume   | `vetniva-postgres-data`                                    |
| Port                | 5432 (internal)                                            |
| Backup retention    | Coolify backup schedule (Bölüm 7)                          |

**Coolify UI adımları:**

1. `+ New Resource` → `Database` → `PostgreSQL`
2. Name: `vetniva-postgres`
3. Image: `postgres:15-alpine`
4. Database Name: `vetniva`
5. Username: `vetniva` (superuser; Coolify bunu kullanır)
6. Password: Coolify Secret ile üretin
7. Resource Limits: Memory 512 MB, CPU 1
8. Persistent Volume: 20 GB
9. **Create**

#### 3.1.1 Non-superuser app rolü (GOAL-017 kanıtı)

Coolify Postgres service'i varsayılan olarak `vetniva` superuser ile
başlar. Pilot kapsamında ayrı bir `vetniva_app` non-superuser rolü
oluşturulur; API ve worker bu rol ile bağlanır. Prosedür:

1. Coolify UI → `vetniva-postgres` → **Terminal** sekmesi.
2. psql açılır:

   ```sql
   CREATE ROLE vetniva_app LOGIN PASSWORD '<GÜÇLÜ-PAROLA>';
   GRANT CONNECT ON DATABASE vetniva TO vetniva_app;
   GRANT USAGE ON SCHEMA public TO vetniva_app;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO vetniva_app;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public
     GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO vetniva_app;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public
     GRANT USAGE, SELECT ON SEQUENCES TO vetniva_app;
   -- BYPASSRLS YOK; tenant bağlamı set_config('app.tenant_id', ...) ile
   ```

3. `DATABASE_URL`'i `vetniva_app` rolü ile güncelle.

> **Pilot kısayolu:** Faz 0'da RLS henüz devrede olmadığı için
> `vetniva` superuser ile de başlanabilir. Faz 1+ (GOAL-017
> devreye girdiğinde) `vetniva_app` rolüne geçiş zorunludur.

#### 3.1.2 İlk migration (api başlamadan önce)

Migration ayrı bir adımdır; api container'ı `prisma migrate deploy`
çağırmaz (otomatik migration yapmaz). İlk deploy'da manuel olarak
uygulanır.

```bash
# Coolify UI → vetniva-postgres → Terminal
# veya ssh ile VPS'e girip:
docker exec -it <vetniva-postgres-container> psql -U vetniva -d vetniva

# schema oluştur
CREATE EXTENSION IF NOT EXISTS pgcrypto;

# migration'ı uygula
docker exec -it <vetniva-postgres-container> \
  psql -U vetniva -d vetniva -f /tmp/initial.sql
# (initial.sql içeriği için: tools/db/migrate-with-migrator.mjs'i VPS'te
# node ile çalıştırın, DATABASE_MIGRATOR_URL ile)
```

> **Not:** `apps/api/package.json` `db:migrate` script'i
> `tools/db/migrate-with-migrator.mjs` üzerinden Prisma'nın
> `migrate deploy` komutunu çalıştırır. VPS'te bu script node ile
> direkt çalıştırılabilir (container dışı, DATABASE_MIGRATOR_URL ile).

### 3.2 Redis 7 (Coolify One-Click Database)

| Alan              | Değer                              |
| ----------------- | ---------------------------------- |
| Coolify Resource  | `vetniva-redis`                    |
| Tip               | Service → Database → Redis         |
| Versiyon          | `redis:7-alpine`                   |
| Password          | Coolify Secret (önerilir)          |
| Persistent volume | `vetniva-redis-data`               |
| Memory limit      | 256 MB                             |
| maxmemory-policy  | `noeviction` (BullMQ için gerekli) |

**Coolify UI:**

1. `+ New Resource` → `Database` → `Redis`
2. Name: `vetniva-redis`
3. Image: `redis:7-alpine`
4. Resource Limits: Memory 256 MB
5. Persistent Volume: 5 GB
6. **Create**
7. **CLI argümanları:**

   ```
   --appendonly yes
   --maxmemory 256mb
   --maxmemory-policy noeviction
   ```

> **Password:** Pilot'ta internal network'te olduğu için parolasız
> bağlantı kabul edilebilir; ancak üretim ve prod-ready pilot için
> Coolify Secret ile parola tanımlanır ve `REDIS_URL`'e
> `redis://:<pwd>@<host>:6379` formunda eklenir.

### 3.3 Object Storage (Hetzner SBOX / Wasabi EU)

Hetzner Object Storage veya Wasabi EU; S3-uyumlu API. Coolify doğrudan
S3'ü yönetmez, uygulamalar erişir.

| Alan         | Değer                                         |
| ------------ | --------------------------------------------- |
| Sağlayıcı    | Hetzner Object Storage (FSN1, eu-central-1)   |
| Bucket       | `vetniva-pilot`                               |
| Access key   | Hetzner project → Access Tokens               |
| Secret key   | Hetzner project → Access Tokens               |
| Endpoint     | `https://fsn1.your-objectstorage.com`         |
| Region       | `eu-central-1`                                |
| Path style   | `true` (Hetzner için zorunlu)                 |
| SSL          | zorunlu                                       |
| Versiyonlama | açık (KVKK gereği, tenant dosyaları silinmez) |

> **Bucket oluşturma:** Hetzner Cloud Console → Object Storage →
> Bucket → `Create`. Access token'ı **Read/Write** scope ile
> üretin. **Coolify'a eklenmez** — sadece uygulama env'lerine
> `S3_*` değişkenleri olarak girilir.

### 3.4 SMTP (Mailgun EU)

| Alan           | Değer                                     |
| -------------- | ----------------------------------------- |
| Sağlayıcı      | Mailgun EU (`smtp.eu.mailgun.org`)        |
| Hesap          | Pilot klinik için sandbox domain          |
| User           | `postmaster@<sandbox>.mailgun.org`        |
| Password       | Mailgun SMTP credentials                  |
| Port           | 587 (STARTTLS)                            |
| From           | `no-reply@pilot.klinik.com.tr` (verified) |
| Sandbox limiti | 5.000/ay (pilot için yeterli)             |

> **Domain doğrulama:** `pilot.klinik.com.tr` için Mailgun'da SPF,
> DKIM, MX kayıtları DNS'e eklenir. Coolify'da bu kayıtları
> eklemek için DNS yönetim paneline gidilir; Coolify DNS değil,
> DNS'i dışarıdan yönetir.

## 4. Network & Domain

### 4.1 Coolify internal network

Coolify v4 her resource için otomatik bir Docker network oluşturur.
Tüm resource'lar (api, web, worker, postgres, redis) aynı projede
olmalı ve **Connected Networks**'te aynı `vetniva-net` (veya Coolify
default) ağına bağlanmalıdır.

Coolify UI:

1. Her resource → **Configuration** → **Connected Networks**
2. `+ Add Network` → `vetniva-net`
3. Her resource için tekrarla

Bu sayede container'lar birbirine DNS ile erişir:

- `<postgres-resource-uuid>-postgres:5432`
- `<redis-resource-uuid>-redis:6379`

> **Coolify v4 not:** v4'te servisler arası DNS, resource
> UUID'sinden türetilir. Test için bir container'dan
> `nslookup <hedef>` ile doğrulanabilir.

### 4.2 Domain ve SSL

| Domain                      | Yönlendirme                   | SSL           |
| --------------------------- | ----------------------------- | ------------- |
| `pilot.klinik.com.tr`       | web (port 3000)               | Let's Encrypt |
| `api.pilot.klinik.com.tr`   | api (port 3001)               | Let's Encrypt |
| `pilot-<uuid>.coolify.host` | geçici (ilk kurulum testleri) | Let's Encrypt |

**Coolify UI adımları (api için):**

1. `vetniva-api` → **Domains** → `+ Add`
2. Host: `api.pilot.klinik.com.tr`
3. **Generate Let's Encrypt Certificate**: ✓
4. **Force HTTPS**: ✓
5. **Save**

Aynısı `vetniva-web` → `pilot.klinik.com.tr` için tekrarlanır.

**DNS kayıtları (klinik domain yönetimi):**

| Tip   | Host                                | Value                  |
| ----- | ----------------------------------- | ---------------------- |
| A     | `pilot.klinik.com.tr`               | `<Hostinger KVM 4 IP>` |
| A     | `api.pilot.klinik.com.tr`           | `<Hostinger KVM 4 IP>` |
| CNAME | `*.pilot.klinik.com.tr` (opsiyonel) | `pilot.klinik.com.tr`  |

DNS yayılması 5-60 dakika sürebilir. Coolify Let's Encrypt
sertifikası DNS doğrulandıktan sonra otomatik alınır.

### 4.3 Portlar

| Port | Servis   | Dışarıya açık mı | Açıklama              |
| ---- | -------- | ---------------- | --------------------- |
| 80   | Traefik  | evet             | HTTP → HTTPS redirect |
| 443  | Traefik  | evet             | HTTPS terminaison     |
| 3000 | web      | hayır            | Sadece internal       |
| 3001 | api      | hayır            | Sadece internal       |
| 5432 | postgres | hayır            | Sadece internal       |
| 6379 | redis    | hayır            | Sadece internal       |

Coolify varsayılan olarak yalnızca 80/443'ü host'a bağlar. İç portlar
container'lar arasında paylaşılır.

## 5. İlk deploy adımları

Bu bölüm sıralı UI + komut adımlarını içerir. Toplam süre tahmini:
ilk kurulum 60-90 dakika.

### 5.1 Coolify'a giriş ve proje oluşturma

1. **Coolify UI'ya giriş:** `https://<coolify-hostinger-ip>:8000`
2. `Projects` → `+ Add Project` → Name: `VetNiva Pilot`
3. Production Environment: `production`
4. **Create**

### 5.2 Postgres servisi (Bölüm 3.1)

1. VetNiva Pilot projesi içinde `+ New Resource`
2. `Database` → `PostgreSQL`
3. Ayarları Bölüm 3.1'e göre doldur
4. **Deploy**
5. Deploy tamamlandıktan sonra **Terminal** sekmesinden `vetniva_app`
   rolünü oluştur (Bölüm 3.1.1)
6. **Domain bağlama:** Postgres service için domain atamayın, sadece
   internal kullanım.

### 5.3 Redis servisi (Bölüm 3.2)

1. `+ New Resource` → `Database` → `Redis`
2. Ayarları Bölüm 3.2'ye göre doldur
3. CLI args: `--appendonly yes --maxmemory 256mb --maxmemory-policy noeviction`
4. **Deploy**

### 5.4 İlk migration uygulama

Coolify UI üzerinden veya VPS'te SSH ile:

```powershell
# VPS'e SSH
ssh root@<hostinger-ip>

# Coolify Postgres container ID
docker ps | grep vetniva-postgres

# Migration script'ini çalıştır
cd /data/coolify/applications/<uuid>
# veya repo'yu VPS'e clone edip:
git clone https://github.com/vetniva/vetniva.git /opt/vetniva
cd /opt/vetniva
cp .env.example .env
# .env'i DATABASE_MIGRATOR_URL ile doldur
docker exec -it <postgres-container> bash
  # container içinde:
  psql -U vetniva -d vetniva -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
  exit

# Host'ta migration
DATABASE_MIGRATOR_URL=postgresql://vetniva:<PWD>@<postgres-host>:5432/vetniva?schema=public \
  pnpm --filter @vetniva/api db:migrate
```

> **Coolify one-liner alternatifi:** Postgres service → Terminal
> sekmesinden direkt psql açıp `CREATE EXTENSION` çalıştırılabilir.
> Prisma migration'ı için `node tools/db/migrate-with-migrator.mjs`
> VPS'te (container dışı) çalıştırılmalıdır.

### 5.5 API uygulaması (Bölüm 2.2)

1. `+ New Resource` → `Application` → `Public/Private Repository`
2. **Git URL:** `https://github.com/vetniva/vetniva` (veya private URL)
3. **Branch:** `main`
4. **Build Pack:** `Dockerfile`
5. **Dockerfile Location:** `apps/api/Dockerfile`
6. **Base Directory:** `/` (repo kökü, build context)
7. **Port:** `3001`
8. **Health Check:** Coolify Dockerfile HEALTHCHECK'i otomatik algılar
   (görünmüyorsa path: `/api/v1/health`, interval: 30s)
9. **Environment Variables:** Bölüm 2.2 tablosunu tek tek girin.
   **is_secret=true** işaretleyin:
   - `DATABASE_URL`, `DATABASE_SHADOW_URL`, `REDIS_URL`
   - `AUTH_JWT_SECRET`, `STORAGE_SIGNING_KEY`
   - `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
   - `SMTP_USER`, `SMTP_PASSWORD`, `SENTRY_DSN`
10. **Domains:** `api.pilot.klinik.com.tr` (Let's Encrypt ✓)
11. **Connected Networks:** `vetniva-net` ekle
12. **Deploy** (ilk build ~5-8 dakika; pnpm install + prisma generate + nest build)

### 5.6 Web uygulaması (Bölüm 2.3)

1. `+ New Resource` → `Application` → `Public/Private Repository`
2. Aynı repo, branch, build context
3. **Dockerfile Location:** `apps/web/Dockerfile`
4. **Port:** `3000`
5. **Build Time Variables:** `API_BASE_URL=https://api.pilot.klinik.com.tr`,
   `APP_VERSION=0.1.0`, `APP_NAME=vetniva`
6. **Runtime Environment Variables:** aynı
7. **Domains:** `pilot.klinik.com.tr` (Let's Encrypt ✓)
8. **Connected Networks:** `vetniva-net` ekle
9. **Deploy**

### 5.7 Worker uygulaması (Bölüm 2.4)

1. `+ New Resource` → `Application` → `Public/Private Repository`
2. **Dockerfile Location:** `apps/worker/Dockerfile`
3. **Port:** boş bırakılabilir veya `3002` (iç kullanım)
4. **Environment Variables:** Bölüm 2.4
5. **Domains:** yok
6. **Connected Networks:** `vetniva-net` ekle
7. **Deploy**

### 5.8 Object Storage bağlantısı

Coolify tarafında ek adım yok. Uygulama env'leri (Bölüm 2.2)
yeterli. Doğrulama:

```powershell
# API deploy olduktan sonra Coolify UI → vetniva-api → Terminal
wget -qO- "http://127.0.0.1:3001/api/v1/health"
# 200 + {"status":"ok",...}

# S3 bağlantı testi: API log'larında boot hatası yoksa OK.
# Alternatif: tools/tenant-export veya tools/rag-chunk-producer
# üzerinden test bucket erişimi.
```

### 5.9 SMTP bağlantısı

Coolify tarafında ek adım yok. Doğrulama:

```powershell
# Coolify UI → vetniva-api → Terminal
# SMTP testi için basit bir kullanıcı davet akışı tetikleyin:
curl -X POST http://127.0.0.1:3001/api/v1/auth/invite \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: <tenant-uuid>" \
  -d '{"email":"test@pilot.klinik.local","role":"VET"}'
# Başarılıysa SMTP log'u API'de "smtp sent" olarak görünür.
```

### 5.10 Domain ve SSL doğrulama

```powershell
# DNS yayılması
nslookup pilot.klinik.com.tr
nslookup api.pilot.klinik.com.tr

# SSL sertifika kontrolü
curl -I https://pilot.klinik.com.tr
curl -I https://api.pilot.klinik.com.tr
# HTTP/2 200, "server: Caddy" veya "Traefik" başlığı
```

## 6. Doğrulama

İlk deploy sonrası uçtan uca doğrulama adımları.

### 6.1 Smoke test (otomatik)

Coolify UI'da **vetniva-api** → **Terminal** sekmesinden veya dışarıdan
(`https://api.pilot.klinik.com.tr`):

```powershell
# Liveness
$resp = Invoke-RestMethod https://api.pilot.klinik.com.tr/api/v1/health
Write-Host "Liveness: $($resp.status)"  # "ok"

# Readiness (DB bağlantısı)
$ready = Invoke-RestMethod https://api.pilot.klinik.com.tr/api/v1/health/ready
Write-Host "Readiness: $($ready.status) - db: $($ready.components.db.status)"

# Web health
$web = Invoke-WebRequest https://pilot.klinik.com.tr -UseBasicParsing
Write-Host "Web status: $($web.StatusCode)"  # 200
```

### 6.2 Demo login

`tools/acceptance-test/uat-result.json` veya `temp/W2_*` raporlarındaki
demo kullanıcı bilgileri:

| Rol   | E-posta                     | Parola |
| ----- | --------------------------- | ------ |
| Admin | `admin@pilot.vetniva.local` | (seed) |
| Vet   | `vet@pilot.vetniva.local`   | (seed) |
| Staff | `staff@pilot.vetniva.local` | (seed) |
| Owner | `owner@pilot.vetniva.local` | (seed) |

> **Seed kullanıcı parolaları** Faz 0 kapsamında üretilmediği için
> ilk kurulumda manuel seed script çalıştırılır:
>
> ```bash
> pnpm --filter @vetniva/api exec node scripts/seed-pilot.mjs
> ```

### 6.3 Pilot kabul senaryoları

`docs/operations/PILOT_ACCEPTANCE.md`'deki 10 senaryo, klinik
tarafında pilot kullanıcılarla tekrarlanır. Öncesinde Serhan'ın
yapması gereken mini-smoke (her senaryo için 1 dakika):

| #   | Senaryo             | API endpoint örneği                            |
| --- | ------------------- | ---------------------------------------------- |
| 1   | Yeni müşteri/hayvan | `POST /api/v1/owners`, `POST /api/v1/patients` |
| 2   | Randevu             | `POST /api/v1/appointments`                    |
| 3   | Muayene (SOAP)      | `POST /api/v1/examinations/{id}/work`          |
| 4   | Aşı                 | `POST /api/v1/patients/{id}/vaccinations`      |
| 5   | Petshop satış       | `POST /api/v1/petshop/sales`                   |
| 6   | Tahsilat            | `POST /api/v1/payments`                        |
| 7   | Ameliyat            | `POST /api/v1/surgery-plans`                   |
| 8   | Yatış               | `POST /api/v1/hospitalizations`                |
| 9   | Lab                 | `POST /api/v1/lab-orders`                      |
| 10  | Portal              | `GET  /api/v1/portal/pets`                     |

### 6.4 Worker canlılık

```powershell
# Coolify UI → vetniva-worker → Logs
# "worker süreci hazır: sinyaller dinleniyor" mesajı görülmeli

# API üzerinden job tetikleyerek worker doğrulama
# (örn. portal parola sıfırlama → email job → worker consumer)
```

## 7. Backup / Restore

Pilot RPO/RTO hedefleri: **RPO ≤ 24 saat, RTO ≤ 4 saat**
(`docs/operations/BACKUP_RESTORE.md`).

### 7.1 Backup stratejisi

| Hedef          | Yöntem                    | Sıklık           | Saklama                   |
| -------------- | ------------------------- | ---------------- | ------------------------- |
| Postgres       | `pg_dump -Fc`             | Günlük 03:00 UTC | 7 gün hot, 30 gün cold    |
| Object storage | S3 versioning + lifecycle | sürekli          | tenant dosyaları silinmez |

### 7.2 Coolify otomatik backup (Postgres)

Coolify v4'te database service'leri için **Backup** sekmesi vardır.

1. Coolify UI → `vetniva-postgres` → **Backup**
2. **+ Add Schedule**
3. Frequency: `Daily`
4. Time: `03:00 UTC`
5. **Storage:** S3 Compatible
6. **S3 Endpoint:** `https://fsn1.your-objectstorage.com`
7. **Bucket:** `vetniva-pilot-backups`
8. **Access Key / Secret Key:** Coolify Secret
9. **Path:** `postgres/`
10. **Save**

Coolify, her gün 03:00'te `pg_dump` alır ve Hetzner Object
Storage'a yükler.

### 7.3 Manuel backup (PowerShell + Docker)

`tools/backup/backup-postgres.ps1` local `vetniva-postgres` container'ı
için yazılmıştır. Coolify Postgres service'i farklı bir container adı
kullanır. İki seçenek:

#### 7.3.1 Coolify Postgres service'e uyarlanmış script

VPS'te `/opt/vetniva/scripts/backup-coolify.sh` adıyla bir wrapper:

```bash
#!/usr/bin/env bash
# Coolify Postgres service için backup
# Kullanım: /opt/vetniva/scripts/backup-coolify.sh
set -euo pipefail

CONTAINER=$(docker ps --filter "label=coolify.applicationId=<POSTGRES-UUID>" -q | head -n1)
TIMESTAMP=$(date -u +%Y%m%d-%H%M%S)
DUMP_FILE="/tmp/vetniva-${TIMESTAMP}.dump"
S3_BUCKET="s3://vetniva-pilot-backups/postgres"

docker exec "$CONTAINER" pg_dump -U vetniva -Fc -d vetniva -f "$DUMP_FILE"
docker cp "$CONTAINER:$DUMP_FILE" "/tmp/$(basename $DUMP_FILE)"
aws --endpoint-url "$S3_ENDPOINT" s3 cp "/tmp/$(basename $DUMP_FILE)" "${S3_BUCKET}/$(basename $DUMP_FILE)"
rm -f "/tmp/$(basename $DUMP_FILE)"
docker exec "$CONTAINER" rm -f "$DUMP_FILE"
```

Coolify UI → `Settings` → `Scheduled Tasks` veya VPS'te crontab:

```cron
0 3 * * * /opt/vetniva/scripts/backup-coolify.sh >> /var/log/vetniva-backup.log 2>&1
```

#### 7.3.2 Coolify Postgres'in kendi S3 backup özelliği

Coolify v4 Postgres service'in **Backup** sekmesi yukarıdaki gibi S3'e
otomatik yedek alır. Ek script gerekmez; bu yöntem **tercih edilir**.

### 7.4 Restore prosedürü

Senaryo: veri bozulması, tenant hatası, disaster.

#### 7.4.1 Senaryo A: Coolify Postgres service üzerinden restore

1. **Yedek indir:** Hetzner Object Storage → `postgres/` klasöründen
   ilgili `.dump` dosyasını VPS'e indir.

   ```bash
   aws --endpoint-url "$S3_ENDPOINT" s3 cp \
     s3://vetniva-pilot-backups/postgres/vetniva-20260810-030000.dump \
     /tmp/restore.dump
   ```

2. **Mevcut DB'nin snapshot'ı:** Restore öncesi mevcut durumu yedekle
   (geri dönüş için).

   ```bash
   docker exec <postgres-container> \
     pg_dump -U vetniva -Fc -d vetniva -f /tmp/before-restore.dump
   docker cp <postgres-container>:/tmp/before-restore.dump /tmp/
   ```

3. **Geçici restore DB'ye yükle** (canlı DB'ye dokunmadan doğrulama):

   ```bash
   # tools/backup/restore-test.ps1 mantığı
   docker exec <postgres-container> createdb -U vetniva vetniva_restore_test
   docker cp /tmp/restore.dump <postgres-container>:/tmp/restore.dump
   docker exec <postgres-container> pg_restore -U vetniva -d vetniva_restore_test /tmp/restore.dump
   docker exec <postgres-container> psql -U vetniva -d vetniva_restore_test \
     -c "SELECT count(*) FROM tenants; SELECT count(*) FROM patients;"
   ```

4. **Doğrulama başarılıysa canlı restore:**

   ```bash
   # API ve worker'ı durdur
   docker stop <api-container> <worker-container>

   # Canlı DB'yi sil ve yeniden oluştur (DESTRUCTIVE!)
   docker exec <postgres-container> dropdb -U vetniva --if-exists vetniva
   docker exec <postgres-container> createdb -U vetniva
   docker exec <postgres-container> pg_restore -U vetniva -d vetniva /tmp/restore.dump

   # API ve worker'ı başlat
   docker start <api-container> <worker-container>
   ```

5. **Smoke test:** Bölüm 6.1 adımlarını tekrarla.

#### 7.4.2 Senaryo B: Yeni Coolify kurulumuna restore (disaster)

1. Yeni VPS'e Coolify kur.
2. Postgres service oluştur.
3. Yukarıdaki 3-4 adımları uygula.
4. `web` ve `worker` için `docker-compose.yml` veya Coolify resource
   olarak yeniden oluştur.
5. DNS'i yeni IP'ye yönlendir.

### 7.5 Restore testi (aylık)

`tools/backup/restore-test.ps1` local docker'ı varsayar. Coolify
ortamı için `restore-coolify.sh` script'i yazılabilir (gelecek
iyileştirme) veya Bölüm 7.4.1 adımları manuel uygulanır.

Ayda bir yapılacak test:

```bash
# VPS'te
aws --endpoint-url "$S3_ENDPOINT" s3 ls s3://vetniva-pilot-backups/postgres/ | tail -5
# Son yedek dosyasını seç ve yukarıdaki restore-test adımlarını uygula
```

Test sonucu `tools/backup/tests/` altına kayıt edilir.

## 8. Troubleshooting

### 8.1 API başlamıyor: "Ortam değişkeni doğrulaması başarısız"

**Sebep:** Coolify Secret'ı yanlış bağlanmış veya env değişkeni
eksik.

**Çözüm:**

```powershell
# Coolify UI → vetniva-api → Logs
# "Ortam değişkeni doğrulaması başarısız" mesajında eksik değişken listelenir

# Eksik değişkeni Environment Variables bölümüne ekle
# is_secret=true işaretle
# Deploy → Rebuild
```

### 8.2 API "ECONNREFUSED" postgres'e bağlanamıyor

**Sebep:** `DATABASE_URL`'deki host yanlış veya `vetniva-net` ağına
bağlı değil.

**Çözüm:**

```powershell
# Coolify UI → vetniva-api → Terminal
nslookup <postgres-host>
# Çözülmüyorsa:
# 1. Connected Networks → vetniva-net ekli mi kontrol et
# 2. postgres service'in bağlı olduğu network ile aynı mı kontrol et
# 3. postgres service ayakta mı: docker ps | grep postgres
```

### 8.3 Web 502 Bad Gateway

**Sebep:** Traefik web service'i bulamıyor veya domain yanlış.

**Çözüm:**

```powershell
# Coolify UI → vetniva-web → Logs
# "address already in use" veya crash log'larını kontrol et

# Domain kontrolü:
nslookup pilot.klinik.com.tr

# Traefik logları (VPS'te):
docker logs <traefik-container>
```

### 8.4 Web build sırasında "API_BASE_URL is undefined"

**Sebep:** Coolify v4'te build-time env değişkenleri runtime'dan
ayrı tanımlanır. `next.config.mjs` build sırasında bazı değerleri
okur.

**Çözüm:** Coolify UI → `vetniva-web` → **Build** sekmesi →
**Build Time Variables**: `API_BASE_URL`, `APP_VERSION`, `APP_NAME`
ekleyin.

### 8.5 Worker sürekli restart

**Sebep:** Worker `dist/main.js` mevcut değil (build hatası) veya
Redis/Postgres erişilemiyor.

**Çözüm:**

```powershell
# Coolify UI → vetniva-worker → Logs
# Hata mesajını oku

# dist/main.js mevcut mu?
docker exec <worker-container> ls -la /app/dist/main.js
# Yoksa: rebuild

# Redis erişimi:
docker exec <worker-container> sh -c "wget -qO- http://<redis-host>:6379 || exit 1"
```

### 8.6 Let's Encrypt sertifikası alınamıyor

**Sebep:** DNS henüz yayılmamış veya domain Coolify'da yanlış.

**Çözüm:**

```powershell
# DNS kontrol
nslookup api.pilot.klinik.com.tr
# Coolify sunucu IP'sini dönmeli

# Coolify → resource → Domains → "Force HTTPS" kapalı dene, sertifika alındıktan sonra tekrar aç
```

### 8.7 S3 bağlantı hatası (Hetzner)

**Sebep:** `S3_FORCE_PATH_STYLE` eksik veya endpoint yanlış.

**Çözüm:** Hetzner Object Storage için `S3_FORCE_PATH_STYLE=true`
zorunludur. `S3_ENDPOINT` tam URL olmalı (sonunda `/` olmadan).

### 8.8 SMTP "Authentication failed"

**Sebep:** Mailgun SMTP credentials yanlış veya domain doğrulanmamış.

**Çözüm:**

- Mailgun dashboard'dan `SMTP_USER` ve `SMTP_PASSWORD` kontrolü.
- `pilot.klinik.com.tr` için SPF/DKIM/MX kayıtları aktif mi?

## 9. Pilot → Production farkları

| Öğe                   | Pilot (Hostinger KVM 4 + Coolify) | Production (Hetzner Cloud + Caddy)         |
| --------------------- | --------------------------------- | ------------------------------------------ |
| **VPS**               | Hostinger KVM 4 (4 vCPU, 8 GB)    | Hetzner CCX13 (4 vCPU, 8 GB dedicated)     |
| **PaaS**              | Coolify v4 (self-hosted)          | Coolify v4 veya düz systemd (Caddy + Node) |
| **Postgres**          | Coolify Postgres service (single) | Hetzner Managed Postgres + standby         |
| **Redis**             | Coolify Redis service             | Hetzner Managed Redis (opsiyonel)          |
| **Object storage**    | Hetzner Object Storage            | Hetzner Object Storage + cross-region      |
| **Reverse proxy**     | Traefik (Coolify built-in)        | Caddy                                      |
| **Backup RPO**        | ≤ 24 saat (günlük pg_dump)        | ≤ 1 saat (WAL streaming + standby)         |
| **Backup RTO**        | ≤ 4 saat                          | ≤ 30 dakika                                |
| **Tier (RPO/RTO)**    | `pilot` (5dk / 1h hedef)          | `production` (1dk / 30dk)                  |
| **Tenant RLS**        | Faz 0'da superuser (kısayol)      | Faz 1+ `vetniva_app` non-superuser         |
| **ClamAV**            | opsiyonel (`SCAN_DRIVER=noop`)    | zorunlu (`SCAN_DRIVER=clamav`)             |
| **Monitoring**        | Sentry free + Coolify logs        | Sentry + Grafana Cloud + Prometheus        |
| **Domain**            | `pilot.klinik.com.tr`             | `app.klinik.com.tr`                        |
| **Maliyet (aylık)**   | ~€25-30 + domain                  | ~€40-50                                    |
| **SLA**               | yok (best-effort)                 | %99.5 uptime                               |
| **Disaster recovery** | Manuel S3 restore (4 saat)        | Otomatik standby failover (<5dk)           |

### 9.1 Coolify'dan Hetzner'a geçiş adımları

1. Hetzner Cloud hesabı aç, CCX13 + Postgres + Object Storage.
2. Hetzner DNS veya Cloudflare'da domain yönlendir.
3. Yeni VPS'e Coolify kur (veya direkt Caddy + Docker).
4. Bu runbook'un Bölüm 5 adımlarını yeni ortamda tekrarla.
5. `pg_dump` → `pg_restore` ile DB taşı.
6. Object Storage cross-region replication veya `aws s3 sync` ile
   bucket taşı.
7. DNS'te TTL'i kısa tutarak geçiş yap (eski IP'den yeni IP'ye).
8. Eski VPS'i 7 gün boyunca salt-readonly tut, sonra kapat.

### 9.2 Tier değişimi (RPO/RTO)

`tools/backup/src/backup-types.ts` tier matrisi pilot/production/
critical olarak tanımlı. Production'a geçerken:

```typescript
// apps/api/src/config/backup-tier.ts (örnek)
export const backupTier: "pilot" | "production" | "critical" = "production";
```

Bu tier'a göre:

- WAL streaming aktif olur
- Standby replika başlatılır
- Backup sıklığı 24 saatten 1 saate çıkar

## Ekler

### Ek A: Coolify Secret → .env.example eşleme

Bu tablo, runbook'taki Coolify Secret alanlarını `.env.example` anahtarları
ile birebir eşleştirir. Yeni env değişkeni eklenirse bu tablo
güncellenmelidir.

| Coolify Secret (is_secret=true) | .env.example anahtarı  |
| ------------------------------- | ---------------------- |
| `AUTH_JWT_SECRET`               | `AUTH_JWT_SECRET`      |
| `STORAGE_SIGNING_KEY`           | `STORAGE_SIGNING_KEY`  |
| `S3_ACCESS_KEY_ID`              | `S3_ACCESS_KEY_ID`     |
| `S3_SECRET_ACCESS_KEY`          | `S3_SECRET_ACCESS_KEY` |
| `SMTP_USER`                     | `SMTP_USER`            |
| `SMTP_PASSWORD`                 | `SMTP_PASSWORD`        |
| `SENTRY_DSN`                    | `SENTRY_DSN`           |
| `DATABASE_URL` (parola içeren)  | `DATABASE_URL`         |
| `REDIS_URL` (parola içeren)     | `REDIS_URL`            |
| `DATABASE_SHADOW_URL`           | `DATABASE_SHADOW_URL`  |

### Ek B: Komut satırı cheat sheet

```powershell
# VPS'e SSH
ssh root@<hostinger-ip>

# Container listesi
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# API loglarını canlı izleme
docker logs -f <api-container> --tail 100

# API terminal
docker exec -it <api-container> sh

# DB shell
docker exec -it <postgres-container> psql -U vetniva -d vetniva

# Redis CLI
docker exec -it <redis-container> redis-cli

# Migration durumu (VPS'te)
DATABASE_MIGRATOR_URL=postgresql://... pnpm --filter @vetniva/api db:migrate

# Manuel backup
docker exec <postgres-container> pg_dump -U vetniva -Fc -d vetniva -f /tmp/manual.dump
docker cp <postgres-container>:/tmp/manual.dump ./manual.dump
```

### Ek C: İlgili dokümanlar

- `docs/operations/CLOUD_ARCHITECTURE.md` — Mimari genel bakış
- `docs/operations/BACKUP_RESTORE.md` — Backup/restore prosedürü
- `docs/operations/PILOT_ACCEPTANCE.md` — 10 senaryo kabul testi
- `docs/operations/PRODUCTION_RELEASE.md` — Release gate ve rollback
- `tools/backup/README.md` — Backup araçları ve tier matrisi
- `docker-compose.yml` — Local development stack (referans)
- `apps/api/Dockerfile`, `apps/web/Dockerfile`, `apps/worker/Dockerfile` — Production imaj tanımları
- `.env.example` — Tüm env değişkenlerinin kaynağı
- `apps/api/src/env.ts` — API env validation şeması
- `apps/worker/src/env.ts` — Worker env validation şeması
