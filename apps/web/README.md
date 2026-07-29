# apps/web — VetNiva Müşteri Arayüzü

Next.js 14 (App Router) tabanlı müşteri arayüzü. Modüler monorepo içinde
`@vetniva/web` paketi olarak yayımlanır; API tüketimi `@vetniva/contracts`
şemaları, UI primitive'leri `@vetniva/ui`, dil kaynakları `@vetniva/i18n`
üzerinden sağlanır.

## Kapsam (GOAL-000)

- App Router iskeleti (`app/[locale]/...`)
- Middleware ile locale doğrulama
- `@vetniva/i18n` üzerinden i18next yapılandırması (server + client)
- API istemcisi (`src/lib/api-client.ts`) — `X-Request-Id` ve timeout
- Sağlık sayfası (`/api/v1/ready` çağrısı + Zod doğrulama)
- Vitest + Testing Library component testi
- Standalone Next.js build + multi-stage Dockerfile

## Çalıştırma

```bash
pnpm install
pnpm --filter @vetniva/web dev      # geliştirme
pnpm --filter @vetniva/web build    # üretim build
pnpm --filter @vetniva/web start    # üretim sunucu
pnpm --filter @vetniva/web test     # vitest
pnpm --filter @vetniva/web lint     # eslint
pnpm --filter @vetniva/web type-check
```

## Ortam değişkenleri

- `PORT_WEB` (varsayılan 3000)
- `API_BASE_URL` (varsayılan `http://localhost:3001`)
- `APP_VERSION` (metadata'da kullanılır)
- `DEFAULT_LOCALE` (varsayılan `tr-TR`)

## Dizin yapısı

```
app/
  layout.tsx               # kök layout (html lang dinamik)
  not-found.tsx
  [locale]/
    layout.tsx             # i18n provider
    page.tsx               # ana sayfa
    health/
      page.tsx             # sağlık bilgisi
      health.test.tsx
src/
  middleware.ts            # locale doğrulama
  i18n/config.ts           # createI18n sarmalayıcı
  lib/
    api-client.ts          # fetch wrapper
    cn.ts                  # @vetniva/ui re-export
  components/
    locale-switcher.tsx
    health-card.tsx
```

## Notlar

- Middleware matcher api ve statik dosyaları atlar.
- Server component'lerde `getT(locale)` kullanılır; `useTranslation`
  yalnızca client component'lerde çalışır.
- API tabanlı sayfalar `dynamic = 'force-dynamic'` ile işaretlenir.
