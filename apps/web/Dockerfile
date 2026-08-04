# syntax=docker/dockerfile:1.7
# =============================================================
# VetNiva web (apps/web) — Next.js 14 standalone build
# Multi-stage: deps -> builder -> runner
# =============================================================

# ---- 1. Bağımlılık katmanı (pnpm workspace) ----
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /repo

# pnpm workspace + paket manifest'leri
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* .npmrc ./
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY packages/i18n/package.json packages/i18n/
COPY packages/ui/package.json packages/ui/
COPY apps/web/package.json apps/web/

# Tüm monorepo workspace'i kurulur (api ile aynı strateji). Filtreli
# install (@vetniva/web...) build sırasında @vetniva/config/tsconfig.base.json
# çözümlemesini kırıyor; pnpm store'da eksik bağlantı oluşuyor ve
# `pnpm --filter @vetniva/contracts build` adımı "node_modules missing" hatası
# ile başarısız oluyor. Bu yüzden --prod=false ile tüm paketler kurulur.
RUN pnpm install --frozen-lockfile=false --ignore-scripts --prod=false

# ---- 2. Build katmanı ----
FROM deps AS builder
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Kaynak kodu kopyala
COPY packages/config packages/config
COPY packages/contracts packages/contracts
COPY packages/i18n packages/i18n
COPY packages/ui packages/ui
COPY apps/web apps/web
# Next.js public klasörü opsiyoneldir; runner aşamasındaki COPY'nin
# deterministik olması için boş olsa bile builder içinde bulunur.
RUN mkdir -p apps/web/public
# Önce workspace paketlerini derle (turbo yerine sıralı)
RUN pnpm --filter @vetniva/config build || true
RUN pnpm --filter @vetniva/contracts build
RUN pnpm --filter @vetniva/i18n build
RUN pnpm --filter @vetniva/ui build
# Hoisted pnpm yapılandırmasında Next kök node_modules üzerinden çözer.
# Builder Linux bağlarını açıkça kurar; Windows host node_modules imaja alınmaz.
RUN rm -rf node_modules/@vetniva/ui node_modules/@vetniva/contracts node_modules/@vetniva/i18n \
  && mkdir -p node_modules/@vetniva \
  && ln -sfn ../../packages/ui node_modules/@vetniva/ui \
  && ln -sfn ../../packages/contracts node_modules/@vetniva/contracts \
  && ln -sfn ../../packages/i18n node_modules/@vetniva/i18n
RUN test -f node_modules/@vetniva/ui/package.json \
  && test -f node_modules/@vetniva/ui/dist/index.js
# Next.js standalone build
RUN pnpm --filter @vetniva/web build

# ---- 3. Runner katmanı (yalnızca standalone çıktısı) ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Standalone çıktıdan runtime bağımlılıkları + server.js
COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /repo/apps/web/public ./apps/web/public

EXPOSE 3000

# Coolify ve genel orchestrator'lar için liveness kontrolü.
# Next.js 14 standalone server.js port 3000'de dinler; ana sayfa
# default locale (tr-TR) ile 200 döner. Busybox `wget` node:20-alpine
# imajında hazır geldiği için ek paket kurulumu gerekmez.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null 2>&1 || exit 1

# Non-root kullanıcı ile çalıştır
RUN addgroup -g 1001 -S nodejs && adduser -S -u 1001 -G nodejs nextjs
USER nextjs

CMD ["node", "apps/web/server.js"]
